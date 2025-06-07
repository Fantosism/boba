import { describe, it, expect } from 'vitest';
import { BatchPipeline } from './batchPipeline';
import { Handler } from '@/handler/handler';
import { Pipeline } from '@/pipeline/pipeline';
import { SharedData, HandlerParams } from '@/baseHandler/baseHandler';

interface FileProcessingData extends SharedData {
  filenames?: string[];
  processedFiles?: string[];
  currentFile?: string;
  content?: string;
  filename?: string;
}

interface MultiTaskData extends SharedData {
  tasks?: Array<{ id: string; type: string; data: unknown }>;
  results?: Array<{ id: string; result: unknown; status: string }>;
  currentTask?: { id: string; type: string; data: unknown };
}

class MockFileReader extends Handler<string, string, FileProcessingData> {
  protected prepareInputs(sharedData: Readonly<FileProcessingData>): string {
    return (sharedData.filename as string) || 'default.txt';
  }

  protected async handleRequest(filename: string): Promise<string> {
    // Simulate file reading
    return `Content of ${filename}`;
  }

  protected processResults(
    sharedData: FileProcessingData,
    inputs: string,
    outputs: string,
  ): string {
    sharedData.currentFile = inputs;
    sharedData.content = outputs;
    return 'read_complete';
  }
}

class MockFileProcessor extends Handler<string, string, FileProcessingData> {
  protected prepareInputs(sharedData: Readonly<FileProcessingData>): string {
    return sharedData.content || '';
  }

  protected async handleRequest(content: string): Promise<string> {
    // Simulate processing
    return content.toUpperCase();
  }

  protected processResults(
    sharedData: FileProcessingData,
    inputs: string,
    outputs: string,
  ): string {
    // Add to processed files list
    if (!sharedData.processedFiles) {
      sharedData.processedFiles = [];
    }
    sharedData.processedFiles.push(outputs);
    return 'process_complete';
  }
}

class MockTaskHandler extends Handler<
  { id: string; type: string; data: unknown },
  { result: unknown },
  MultiTaskData
> {
  protected prepareInputs(sharedData: Readonly<MultiTaskData>): {
    id: string;
    type: string;
    data: unknown;
  } {
    return sharedData.currentTask as {
      id: string;
      type: string;
      data: unknown;
    };
  }

  protected async handleRequest(task: {
    id: string;
    type: string;
    data: unknown;
  }): Promise<{ result: unknown }> {
    // Simulate task processing based on type
    switch (task.type) {
      case 'math':
        return {
          result:
            (task.data as { a: number; b: number }).a +
            (task.data as { a: number; b: number }).b,
        };
      case 'string':
        return { result: (task.data as { text: string }).text.length };
      default:
        return { result: 'unknown' };
    }
  }

  protected processResults(
    sharedData: MultiTaskData,
    inputs: { id: string; type: string; data: unknown },
    outputs: { result: unknown },
  ): string {
    if (!sharedData.results) {
      sharedData.results = [];
    }
    sharedData.results.push({
      id: inputs.id,
      result: outputs.result,
      status: 'completed',
    });
    return 'task_complete';
  }
}

// Test BatchPipeline implementations
class FileProcessingBatch extends BatchPipeline<FileProcessingData> {
  protected prepareBatchParams(
    sharedData: Readonly<FileProcessingData>,
  ): HandlerParams[] {
    return (sharedData.filenames || []).map((filename) => ({ filename }));
  }

  protected processBatchResults(
    sharedData: FileProcessingData,
    inputs: HandlerParams[],
    _outputs: void,
  ): string {
    const processedCount = sharedData.processedFiles?.length || 0;
    return processedCount === inputs.length
      ? 'all_processed'
      : 'partial_processed';
  }
}

class TaskProcessingBatch extends BatchPipeline<MultiTaskData> {
  protected prepareBatchParams(
    sharedData: Readonly<MultiTaskData>,
  ): HandlerParams[] {
    return (sharedData.tasks || []).map((task) => ({ currentTask: task }));
  }

  protected processBatchResults(
    sharedData: MultiTaskData,
    _inputs: HandlerParams[],
    _outputs: void,
  ): string {
    const completedCount =
      sharedData.results?.filter((r) => r.status === 'completed').length || 0;
    return completedCount > 0 ? 'batch_success' : 'batch_failed';
  }
}

describe('BatchPipeline', () => {
  describe('Basic Functionality', () => {
    it('should process multiple parameter sets through pipeline', async () => {
      // Create a simple pipeline: read file -> process file
      const reader = new MockFileReader();
      const processor = new MockFileProcessor();
      reader.connectTo(processor, 'read_complete');

      const pipeline = new Pipeline(reader);
      const batchPipeline = new FileProcessingBatch(pipeline);

      const sharedData: FileProcessingData = {
        filenames: ['file1.txt', 'file2.txt', 'file3.txt'],
      };

      const result = await batchPipeline.run(sharedData);

      expect(result).toBe('all_processed');
      expect(sharedData.processedFiles).toHaveLength(3);
      expect(sharedData.processedFiles).toContain('CONTENT OF FILE1.TXT');
      expect(sharedData.processedFiles).toContain('CONTENT OF FILE2.TXT');
      expect(sharedData.processedFiles).toContain('CONTENT OF FILE3.TXT');
    });

    it('should handle empty parameter sets', async () => {
      const reader = new MockFileReader();
      const pipeline = new Pipeline(reader);
      const batchPipeline = new FileProcessingBatch(pipeline);

      const sharedData: FileProcessingData = {
        filenames: [],
      };

      const result = await batchPipeline.run(sharedData);

      expect(result).toBe('all_processed'); // 0 === 0, so all processed
      expect(sharedData.processedFiles).toBeUndefined();
    });

    it('should process different types of tasks', async () => {
      const taskHandler = new MockTaskHandler();
      const pipeline = new Pipeline(taskHandler);
      const batchPipeline = new TaskProcessingBatch(pipeline);

      const sharedData: MultiTaskData = {
        tasks: [
          { id: '1', type: 'math', data: { a: 5, b: 3 } },
          { id: '2', type: 'string', data: { text: 'hello world' } },
          { id: '3', type: 'unknown', data: {} },
        ],
      };

      const result = await batchPipeline.run(sharedData);

      expect(result).toBe('batch_success');
      expect(sharedData.results).toHaveLength(3);

      const mathResult = sharedData.results?.find((r) => r.id === '1');
      expect(mathResult?.result).toBe(8);

      const stringResult = sharedData.results?.find((r) => r.id === '2');
      expect(stringResult?.result).toBe(11);

      const unknownResult = sharedData.results?.find((r) => r.id === '3');
      expect(unknownResult?.result).toBe('unknown');
    });
  });

  describe('Parameter Isolation', () => {
    it('should isolate parameters between pipeline executions', async () => {
      const reader = new MockFileReader();
      const processor = new MockFileProcessor();
      reader.connectTo(processor, 'read_complete');

      const pipeline = new Pipeline(reader);
      const batchPipeline = new FileProcessingBatch(pipeline);

      const sharedData: FileProcessingData = {
        filenames: ['file1.txt', 'file2.txt'],
      };

      await batchPipeline.run(sharedData);

      // Verify that the files were processed correctly with isolated parameters
      // Each file should have been processed independently
      expect(sharedData.processedFiles).toHaveLength(2);
      expect(sharedData.processedFiles).toContain('CONTENT OF FILE1.TXT');
      expect(sharedData.processedFiles).toContain('CONTENT OF FILE2.TXT');

      // The final currentFile should be from the last execution
      expect(sharedData.currentFile).toBe('file2.txt');
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors from pipeline executions', async () => {
      class FailingHandler extends Handler<void, void, SharedData> {
        protected prepareInputs(): void {
          return undefined;
        }

        protected async handleRequest(): Promise<void> {
          throw new Error('Pipeline execution failed');
        }

        protected processResults(): string {
          return 'default';
        }
      }

      const failingPipeline = new Pipeline(new FailingHandler());

      class ErrorBatch extends BatchPipeline<SharedData> {
        protected prepareBatchParams(): HandlerParams[] {
          return [{ id: 1 }, { id: 2 }];
        }
      }

      const batchPipeline = new ErrorBatch(failingPipeline);
      const sharedData: SharedData = {};

      await expect(batchPipeline.run(sharedData)).rejects.toThrow(
        'Pipeline execution failed',
      );
    });
  });

  describe('Complex Workflows', () => {
    it('should handle multi-step pipelines with branching', async () => {
      class ConditionalHandler extends Handler<
        string,
        string,
        FileProcessingData
      > {
        protected prepareInputs(
          sharedData: Readonly<FileProcessingData>,
        ): string {
          return sharedData.content || '';
        }

        protected async handleRequest(content: string): Promise<string> {
          return content;
        }

        protected processResults(
          sharedData: FileProcessingData,
          inputs: string,
          outputs: string,
        ): string {
          // Route based on content length
          return outputs.length > 20 ? 'long_content' : 'short_content';
        }
      }

      class LongContentHandler extends Handler<
        string,
        string,
        FileProcessingData
      > {
        protected prepareInputs(
          sharedData: Readonly<FileProcessingData>,
        ): string {
          return sharedData.content || '';
        }

        protected async handleRequest(content: string): Promise<string> {
          return content.substring(0, 10) + '...'; // Truncate
        }

        protected processResults(
          sharedData: FileProcessingData,
          inputs: string,
          outputs: string,
        ): string {
          if (!sharedData.processedFiles) sharedData.processedFiles = [];
          sharedData.processedFiles.push(outputs);
          return 'complete';
        }
      }

      class ShortContentHandler extends Handler<
        string,
        string,
        FileProcessingData
      > {
        protected prepareInputs(
          sharedData: Readonly<FileProcessingData>,
        ): string {
          return sharedData.content || '';
        }

        protected async handleRequest(content: string): Promise<string> {
          return content.toUpperCase();
        }

        protected processResults(
          sharedData: FileProcessingData,
          inputs: string,
          outputs: string,
        ): string {
          if (!sharedData.processedFiles) sharedData.processedFiles = [];
          sharedData.processedFiles.push(outputs);
          return 'complete';
        }
      }

      // Build the branching pipeline
      const reader = new MockFileReader();
      const conditional = new ConditionalHandler();
      const longHandler = new LongContentHandler();
      const shortHandler = new ShortContentHandler();

      reader.connectTo(conditional, 'read_complete');
      conditional.connectTo(longHandler, 'long_content');
      conditional.connectTo(shortHandler, 'short_content');

      const complexPipeline = new Pipeline(reader);
      const batchPipeline = new FileProcessingBatch(complexPipeline);

      const sharedData: FileProcessingData = {
        filenames: ['short.txt', 'very-long-filename.txt'],
      };

      const result = await batchPipeline.run(sharedData);

      expect(result).toBe('all_processed');
      expect(sharedData.processedFiles).toHaveLength(2);

      // Short file should be uppercased
      expect(sharedData.processedFiles).toContain('CONTENT OF SHORT.TXT');

      // Long file should be truncated
      expect(sharedData.processedFiles?.some((p) => p.endsWith('...'))).toBe(
        true,
      );
    });
  });

  describe('Utility Methods', () => {
    it('should provide access to template pipeline', () => {
      const reader = new MockFileReader();
      const pipeline = new Pipeline(reader);
      const batchPipeline = new FileProcessingBatch(pipeline);

      expect(batchPipeline.getTemplatePipeline()).toBe(pipeline);
    });
  });
});
