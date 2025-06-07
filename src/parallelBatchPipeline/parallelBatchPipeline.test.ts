import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParallelBatchPipeline } from './parallelBatchPipeline';
import { Pipeline } from '@/pipeline/pipeline';
import { Handler } from '@/handler/handler';
import { SharedData, HandlerParams } from '@/baseHandler/baseHandler';

// Mock handlers for testing
class MockHandler extends Handler<string, string> {
  protected async handleRequest(input: string): Promise<string> {
    return `processed-${input}`;
  }
}

class DelayedMockHandler extends Handler<string, string> {
  private delay: number;

  constructor(delay: number = 100) {
    super();
    this.delay = delay;
  }

  protected async handleRequest(input: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, this.delay));
    return `delayed-${input}`;
  }
}

// Test shared data interface
interface TestSharedData extends SharedData {
  items: string[];
  results?: string[];
  processedCount?: number;
}

// Concrete implementation for testing
class TestParallelBatchPipeline extends ParallelBatchPipeline<TestSharedData> {
  protected prepareBatchParams(
    sharedData: Readonly<TestSharedData>,
  ): HandlerParams[] {
    return sharedData.items.map((item) => ({ item }));
  }

  protected processBatchResults(
    sharedData: TestSharedData,
    inputs: HandlerParams[],
    outputs: void,
  ): string {
    sharedData.processedCount = inputs.length;
    return 'completed';
  }
}

describe('ParallelBatchPipeline', () => {
  let mockHandler: MockHandler;
  let pipeline: Pipeline;
  let parallelBatchPipeline: TestParallelBatchPipeline;

  beforeEach(() => {
    mockHandler = new MockHandler();
    pipeline = new Pipeline(mockHandler);
    parallelBatchPipeline = new TestParallelBatchPipeline(pipeline);
  });

  describe('constructor', () => {
    it('should store the template pipeline', () => {
      expect(parallelBatchPipeline.getTemplatePipeline()).toBe(pipeline);
    });
  });

  describe('prepareBatchParams', () => {
    it('should extract parameters from shared data', () => {
      const sharedData: TestSharedData = {
        items: ['item1', 'item2', 'item3'],
      };

      const params = parallelBatchPipeline['prepareBatchParams'](sharedData);

      expect(params).toEqual([
        { item: 'item1' },
        { item: 'item2' },
        { item: 'item3' },
      ]);
    });

    it('should handle empty arrays', () => {
      const sharedData: TestSharedData = {
        items: [],
      };

      const params = parallelBatchPipeline['prepareBatchParams'](sharedData);

      expect(params).toEqual([]);
    });
  });

  describe('processBatchResults', () => {
    it('should process batch results and update shared data', () => {
      const sharedData: TestSharedData = {
        items: ['item1', 'item2'],
      };

      const inputs = [{ item: 'item1' }, { item: 'item2' }];
      const action = parallelBatchPipeline['processBatchResults'](
        sharedData,
        inputs,
        undefined as void,
      );

      expect(sharedData.processedCount).toBe(2);
      expect(action).toBe('completed');
    });
  });

  describe('parallel execution', () => {
    it('should execute pipelines concurrently', async () => {
      // Create a testable version that exposes the method we need to mock
      class TestableParallelBatchPipeline extends TestParallelBatchPipeline {
        public async executePipelineWithParams(
          params: HandlerParams,
        ): Promise<void> {
          // Mock implementation
          return Promise.resolve();
        }
      }

      const delayedHandler = new DelayedMockHandler(100);
      const delayedPipeline = new Pipeline(delayedHandler);
      const parallelProcessor = new TestableParallelBatchPipeline(
        delayedPipeline,
      );

      const startTime = Date.now();

      // Mock the pipeline execution method
      const executeSpy = vi.spyOn(
        parallelProcessor,
        'executePipelineWithParams',
      );
      executeSpy.mockResolvedValue(undefined);

      await parallelProcessor['handleRequest']([
        { item: 'item1' },
        { item: 'item2' },
        { item: 'item3' },
      ]);

      const endTime = Date.now();

      // Verify all executions were called
      expect(executeSpy).toHaveBeenCalledTimes(3);
      expect(executeSpy).toHaveBeenCalledWith({ item: 'item1' });
      expect(executeSpy).toHaveBeenCalledWith({ item: 'item2' });
      expect(executeSpy).toHaveBeenCalledWith({ item: 'item3' });

      // Since we mocked the execution, this should be very fast
      expect(endTime - startTime).toBeLessThan(50);
    });

    it('should handle empty parameter arrays', async () => {
      class TestableParallelBatchPipeline extends TestParallelBatchPipeline {
        public async executePipelineWithParams(
          params: HandlerParams,
        ): Promise<void> {
          return Promise.resolve();
        }
      }

      const testableProcessor = new TestableParallelBatchPipeline(pipeline);
      const executeSpy = vi.spyOn(
        testableProcessor,
        'executePipelineWithParams',
      );
      executeSpy.mockResolvedValue(undefined);

      await testableProcessor['handleRequest']([]);

      expect(executeSpy).not.toHaveBeenCalled();
    });
  });

  describe('pipeline instance creation', () => {
    it('should create new pipeline instances', () => {
      const instance1 = parallelBatchPipeline['createPipelineInstance']();
      const instance2 = parallelBatchPipeline['createPipelineInstance']();

      expect(instance1).toBeInstanceOf(Pipeline);
      expect(instance2).toBeInstanceOf(Pipeline);
      expect(instance1).not.toBe(instance2);
    });

    it('should use the same start handler', () => {
      const instance = parallelBatchPipeline['createPipelineInstance']();
      expect(instance.getStartHandler()).toBe(mockHandler);
    });
  });

  describe('shared data isolation', () => {
    it('should create isolated copies of shared data', () => {
      const originalData: TestSharedData = {
        items: ['item1', 'item2'],
        results: ['result1'],
        processedCount: 1,
      };

      // Create a testable version that exposes getCurrentSharedData
      class TestableParallelBatchPipeline extends TestParallelBatchPipeline {
        public getCurrentSharedData(): TestSharedData {
          return originalData;
        }
      }

      const testableProcessor = new TestableParallelBatchPipeline(pipeline);
      const isolatedData = testableProcessor['createIsolatedSharedData']();

      // Should be a deep copy
      expect(isolatedData).toEqual(originalData);
      expect(isolatedData).not.toBe(originalData);
      expect(isolatedData.items).not.toBe(originalData.items);
      expect(isolatedData.results).not.toBe(originalData.results);
    });

    it('should handle shared data without optional properties', () => {
      const originalData: TestSharedData = {
        items: ['item1'],
      };

      class TestableParallelBatchPipeline extends TestParallelBatchPipeline {
        public getCurrentSharedData(): TestSharedData {
          return originalData;
        }
      }

      const testableProcessor = new TestableParallelBatchPipeline(pipeline);
      const isolatedData = testableProcessor['createIsolatedSharedData']();

      expect(isolatedData).toEqual(originalData);
      expect(isolatedData).not.toBe(originalData);
    });
  });

  describe('result merging', () => {
    it('should merge isolated results back to main shared data', () => {
      const mainData: TestSharedData = {
        items: ['item1', 'item2'],
        processedCount: 0,
      };

      const isolatedData: TestSharedData = {
        items: ['item1', 'item2'],
        results: ['result1', 'result2'],
        processedCount: 2,
      };

      const getCurrentSharedDataSpy = vi.spyOn(
        parallelBatchPipeline as any,
        'getCurrentSharedData',
      );
      getCurrentSharedDataSpy.mockReturnValue(mainData);

      parallelBatchPipeline['mergeSharedDataResults'](isolatedData);

      expect(mainData.results).toEqual(['result1', 'result2']);
      expect(mainData.processedCount).toBe(2);
    });

    it('should overwrite existing properties', () => {
      const mainData: TestSharedData = {
        items: ['item1'],
        results: ['old-result'],
        processedCount: 1,
      };

      const isolatedData: TestSharedData = {
        items: ['item1'],
        results: ['new-result'],
        processedCount: 2,
      };

      const getCurrentSharedDataSpy = vi.spyOn(
        parallelBatchPipeline as any,
        'getCurrentSharedData',
      );
      getCurrentSharedDataSpy.mockReturnValue(mainData);

      parallelBatchPipeline['mergeSharedDataResults'](isolatedData);

      expect(mainData.results).toEqual(['new-result']);
      expect(mainData.processedCount).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should throw error when getCurrentSharedData is not implemented', () => {
      expect(() => {
        parallelBatchPipeline['getCurrentSharedData']();
      }).toThrow(
        'getCurrentSharedData() needs to be implemented based on BaseHandler execution context',
      );
    });

    it('should propagate errors from pipeline executions', async () => {
      const errorHandler = new (class extends Handler<string, string> {
        protected async handleRequest(): Promise<string> {
          throw new Error('Pipeline execution failed');
        }
      })();

      const errorPipeline = new Pipeline(errorHandler);
      const errorProcessor = new TestParallelBatchPipeline(errorPipeline);

      const executeSpy = vi.spyOn(
        errorProcessor as any,
        'executePipelineWithParams',
      );
      executeSpy.mockRejectedValue(new Error('Pipeline execution failed'));

      await expect(
        errorProcessor['handleRequest']([{ item: 'item1' }]),
      ).rejects.toThrow('Pipeline execution failed');
    });
  });

  describe('integration with BaseHandler', () => {
    it('should implement BaseHandler interface correctly', () => {
      expect(parallelBatchPipeline).toBeInstanceOf(ParallelBatchPipeline);

      // Check that required methods exist
      expect(typeof parallelBatchPipeline['prepareInputs']).toBe('function');
      expect(typeof parallelBatchPipeline['handleRequest']).toBe('function');
      expect(typeof parallelBatchPipeline['processResults']).toBe('function');
    });

    it('should call prepareBatchParams from prepareInputs', () => {
      const sharedData: TestSharedData = {
        items: ['item1', 'item2'],
      };

      const prepareSpy = vi.spyOn(
        parallelBatchPipeline as any,
        'prepareBatchParams',
      );

      parallelBatchPipeline['prepareInputs'](sharedData);

      expect(prepareSpy).toHaveBeenCalledWith(sharedData);
    });

    it('should call processBatchResults from processResults', () => {
      const sharedData: TestSharedData = {
        items: ['item1', 'item2'],
      };

      const inputs = [{ item: 'item1' }, { item: 'item2' }];
      const processSpy = vi.spyOn(
        parallelBatchPipeline as any,
        'processBatchResults',
      );

      parallelBatchPipeline['processResults'](
        sharedData,
        inputs,
        undefined as void,
      );

      expect(processSpy).toHaveBeenCalledWith(
        sharedData,
        inputs,
        undefined as void,
      );
    });
  });
});
