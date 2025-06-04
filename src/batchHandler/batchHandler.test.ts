import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BatchHandler,
  BatchConfig,
  BatchResult,
} from '@/batchHandler/batchHandler';
import { SharedData } from '@/baseHandler/baseHandler';

interface TestBatchData extends SharedData {
  items?: string[];
  results?: string[];
  processedCount?: number;
  errorCount?: number;
}

class TestBatchHandler extends BatchHandler<string, string, TestBatchData> {
  public handleSingleItemSpy = vi.fn();
  public handleItemErrorSpy = vi.fn();

  constructor(config?: BatchConfig) {
    super(config);
  }

  protected prepareBatchInputs(sharedData: Readonly<TestBatchData>): string[] {
    return sharedData.items || [];
  }

  protected async handleSingleItem(item: string): Promise<string> {
    this.handleSingleItemSpy(item);

    if (item === 'fail') {
      throw new Error(`Failed to process: ${item}`);
    }

    if (item === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return `processed:${item}`;
  }

  protected processBatchResults(
    sharedData: TestBatchData & SharedData,
    inputs: string[],
    outputs: BatchResult<string>,
  ): string {
    sharedData.results = outputs.results;
    sharedData.processedCount = outputs.successful;
    sharedData.errorCount = outputs.failed;

    if (outputs.failed === 0) return 'all_success';
    if (outputs.successful === 0) return 'all_failed';
    return 'partial_success';
  }

  protected handleItemError(item: string, error: Error): string {
    this.handleItemErrorSpy(item, error);

    if (item === 'recoverable') {
      return `fallback:${item}`;
    }

    throw error;
  }
}

describe('BatchHandler', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should use default config if none provided', () => {
      const handler = new TestBatchHandler();
      const config = handler.getBatchConfig();

      expect(config).toEqual({
        maxConcurrency: 1,
        failFast: true,
        retryDelayMs: 0,
        maxRetries: 1,
      });
    });

    it('should use provided config', () => {
      const handler = new TestBatchHandler({
        maxConcurrency: 3,
        failFast: false,
        retryDelayMs: 100,
        maxRetries: 2,
      });

      const config = handler.getBatchConfig();
      expect(config.maxConcurrency).toBe(3);
      expect(config.failFast).toBe(false);
      expect(config.retryDelayMs).toBe(100);
      expect(config.maxRetries).toBe(2);
    });
  });

  describe('Basic Batch Processing', () => {
    it('should process empty batch', async () => {
      const handler = new TestBatchHandler();
      const sharedData: TestBatchData = { items: [] };

      const action = await handler.run(sharedData);

      expect(action).toBe('all_success');
      expect(sharedData.results).toEqual([]);
      expect(sharedData.processedCount).toBe(0);
      expect(sharedData.errorCount).toBe(0);
    });

    it('should process single item successfully', async () => {
      const handler = new TestBatchHandler();
      const sharedData: TestBatchData = { items: ['item1'] };

      const action = await handler.run(sharedData);

      expect(action).toBe('all_success');
      expect(sharedData.results).toEqual(['processed:item1']);
      expect(sharedData.processedCount).toBe(1);
      expect(sharedData.errorCount).toBe(0);
      expect(handler.handleSingleItemSpy).toHaveBeenCalledWith('item1');
    });

    it('should process multiple items sequentially', async () => {
      const handler = new TestBatchHandler();
      const sharedData: TestBatchData = { items: ['item1', 'item2', 'item3'] };

      const action = await handler.run(sharedData);

      expect(action).toBe('all_success');
      expect(sharedData.results).toEqual([
        'processed:item1',
        'processed:item2',
        'processed:item3',
      ]);
      expect(sharedData.processedCount).toBe(3);
      expect(sharedData.errorCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle single item failure with failFast=true', async () => {
      const handler = new TestBatchHandler({ failFast: true });
      const sharedData: TestBatchData = { items: ['item1', 'fail', 'item3'] };

      const action = await handler.run(sharedData);

      expect(action).toBe('partial_success');
      expect(sharedData.results).toEqual(['processed:item1']); // Stopped after failure
      expect(sharedData.processedCount).toBe(1);
      expect(sharedData.errorCount).toBe(1);
    });

    it('should continue processing with failFast=false', async () => {
      const handler = new TestBatchHandler({ failFast: false });
      const sharedData: TestBatchData = { items: ['item1', 'fail', 'item3'] };

      const action = await handler.run(sharedData);

      expect(action).toBe('partial_success');
      expect(sharedData.results).toEqual([
        'processed:item1',
        'processed:item3',
      ]);
      expect(sharedData.processedCount).toBe(2);
      expect(sharedData.errorCount).toBe(1);
    });

    it('should use error handler fallback when available', async () => {
      const handler = new TestBatchHandler({ failFast: false });
      const sharedData: TestBatchData = {
        items: ['item1', 'recoverable', 'item3'],
      };

      const action = await handler.run(sharedData);

      expect(action).toBe('all_success');
      expect(sharedData.results).toEqual([
        'processed:item1',
        'fallback:recoverable',
        'processed:item3',
      ]);
      expect(sharedData.processedCount).toBe(3);
      expect(sharedData.errorCount).toBe(0);
      expect(handler.handleItemErrorSpy).toHaveBeenCalledWith(
        'recoverable',
        expect.any(Error),
      );
    });

    it('should return all_failed when all items fail', async () => {
      const handler = new TestBatchHandler({ failFast: false });
      const sharedData: TestBatchData = { items: ['fail', 'fail', 'fail'] };

      const action = await handler.run(sharedData);

      expect(action).toBe('all_failed');
      expect(sharedData.results).toEqual([]);
      expect(sharedData.processedCount).toBe(0);
      expect(sharedData.errorCount).toBe(3);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed items up to maxRetries', async () => {
      let attempts = 0;

      class RetryBatchHandler extends TestBatchHandler {
        protected async handleSingleItem(item: string): Promise<string> {
          if (item === 'retry-item') {
            attempts++;
            if (attempts < 3) throw new Error('Retry needed');
          }
          return `processed:${item}`;
        }
      }

      const handler = new RetryBatchHandler({ maxRetries: 3 });
      const sharedData: TestBatchData = { items: ['retry-item'] };

      const action = await handler.run(sharedData);

      expect(action).toBe('all_success');
      expect(attempts).toBe(3);
      expect(sharedData.results).toEqual(['processed:retry-item']);
    });

    it('should delay between retries if configured', async () => {
      vi.useFakeTimers();
      let attempts = 0;

      class DelayRetryHandler extends TestBatchHandler {
        protected async handleSingleItem(item: string): Promise<string> {
          if (item === 'delay-item') {
            attempts++;
            if (attempts < 2) throw new Error('Delay retry');
          }
          return `processed:${item}`;
        }
      }

      const handler = new DelayRetryHandler({
        maxRetries: 2,
        retryDelayMs: 100,
      });
      const sharedData: TestBatchData = { items: ['delay-item'] };

      const promise = handler.run(sharedData);

      // First attempt should happen immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(attempts).toBe(1);

      // Second attempt after delay
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(attempts).toBe(2);
      expect(sharedData.results).toEqual(['processed:delay-item']);

      vi.useRealTimers();
    });
  });

  describe('Concurrent Processing', () => {
    it('should process items concurrently when maxConcurrency > 1', async () => {
      const handler = new TestBatchHandler({ maxConcurrency: 2 });
      const sharedData: TestBatchData = { items: ['slow', 'slow', 'item3'] };

      const startTime = Date.now();
      const action = await handler.run(sharedData);
      const endTime = Date.now();

      expect(action).toBe('all_success');
      expect(sharedData.results).toEqual([
        'processed:slow',
        'processed:slow',
        'processed:item3',
      ]);

      // Should be faster than sequential (less than 150ms vs 150ms+ for sequential)
      expect(endTime - startTime).toBeLessThan(120);
    });

    it('should respect concurrency limits', async () => {
      const processing = new Set<string>();
      const maxConcurrent = { value: 0 };

      class ConcurrencyTestHandler extends TestBatchHandler {
        protected async handleSingleItem(item: string): Promise<string> {
          processing.add(item);
          maxConcurrent.value = Math.max(maxConcurrent.value, processing.size);

          await new Promise((resolve) => setTimeout(resolve, 50));

          processing.delete(item);
          return `processed:${item}`;
        }
      }

      const handler = new ConcurrencyTestHandler({ maxConcurrency: 2 });
      const sharedData: TestBatchData = {
        items: ['item1', 'item2', 'item3', 'item4'],
      };

      await handler.run(sharedData);

      expect(maxConcurrent.value).toBe(2); // Should never exceed maxConcurrency
    });

    it('should handle concurrent failures with failFast=true', async () => {
      const handler = new TestBatchHandler({
        maxConcurrency: 3,
        failFast: true,
      });
      const sharedData: TestBatchData = {
        items: ['item1', 'fail', 'item3', 'item4'],
      };

      const action = await handler.run(sharedData);

      expect(action).toBe('partial_success');
      expect(sharedData.errorCount).toBe(1);
      // Due to concurrency, some items might have been processed before failure was detected
      expect(sharedData.processedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Parameter Management', () => {
    it('should merge batch handler parameters into shared data', async () => {
      const handler = new TestBatchHandler();
      handler.setParams({
        batchSize: 100,
        processingMode: 'fast',
      });

      const sharedData: TestBatchData = { items: ['item1'] };
      await handler.run(sharedData);

      expect(sharedData.batchSize).toBe(100);
      expect(sharedData.processingMode).toBe('fast');
    });
  });

  describe('Integration with Pipeline', () => {
    it('should work as a handler in a pipeline', async () => {
      // This would be tested with actual Pipeline integration
      const handler = new TestBatchHandler();
      const sharedData: TestBatchData = { items: ['item1', 'item2'] };

      const action = await handler.run(sharedData);

      expect(action).toBe('all_success');
      expect(sharedData.results).toEqual([
        'processed:item1',
        'processed:item2',
      ]);
    });

    it('should support different routing based on batch results', async () => {
      const handler = new TestBatchHandler({ failFast: false });

      // Test all success
      const allSuccessData: TestBatchData = { items: ['item1', 'item2'] };
      expect(await handler.run(allSuccessData)).toBe('all_success');

      // Test partial success
      const partialSuccessData: TestBatchData = { items: ['item1', 'fail'] };
      expect(await handler.run(partialSuccessData)).toBe('partial_success');

      // Test all failed
      const allFailedData: TestBatchData = { items: ['fail', 'fail'] };
      expect(await handler.run(allFailedData)).toBe('all_failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined or null items array', async () => {
      const handler = new TestBatchHandler();
      const sharedData: TestBatchData = {}; // No items array

      const action = await handler.run(sharedData);

      expect(action).toBe('all_success');
      expect(sharedData.results).toEqual([]);
      expect(sharedData.processedCount).toBe(0);
    });

    it('should handle async errors in concurrent processing', async () => {
      class AsyncErrorHandler extends TestBatchHandler {
        protected async handleSingleItem(item: string): Promise<string> {
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (item === 'async-fail') {
            throw new Error('Async processing failed');
          }
          return `processed:${item}`;
        }
      }

      const handler = new AsyncErrorHandler({
        maxConcurrency: 2,
        failFast: false,
      });
      const sharedData: TestBatchData = {
        items: ['item1', 'async-fail', 'item3'],
      };

      const action = await handler.run(sharedData);

      expect(action).toBe('partial_success');
      expect(sharedData.processedCount).toBe(2);
      expect(sharedData.errorCount).toBe(1);
    });
  });
});
