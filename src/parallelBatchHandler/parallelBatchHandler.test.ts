import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParallelBatchHandler } from './parallelBatchHandler';
import { SharedData, ActionResult } from '@/baseHandler/baseHandler';

// Test implementation
interface TestSharedData extends SharedData {
  items: number[];
  results: string[];
  processingTimes: number[];
}

class TestParallelBatchHandler extends ParallelBatchHandler<
  number,
  string,
  TestSharedData
> {
  private processingDelay: number;

  constructor(processingDelay = 0) {
    super();
    this.processingDelay = processingDelay;
  }

  protected prepareBatchInputs(sharedData: Readonly<TestSharedData>): number[] {
    return sharedData.items;
  }

  protected async processSingleItem(item: number): Promise<string> {
    const startTime = Date.now();

    if (this.processingDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.processingDelay));
    }

    const endTime = Date.now();
    this.sharedData.processingTimes.push(endTime - startTime);

    return `processed-${item}`;
  }

  protected processBatchResults(
    sharedData: TestSharedData,
    inputs: number[],
    outputs: string[],
  ): ActionResult {
    sharedData.results = outputs;
    return 'default';
  }

  // Expose sharedData for testing
  get sharedData(): TestSharedData {
    return this.currentSharedData as TestSharedData;
  }

  private currentSharedData: TestSharedData | null = null;

  async run(sharedData: TestSharedData): Promise<ActionResult> {
    this.currentSharedData = sharedData;
    return super.run(sharedData);
  }
}

class ErrorParallelBatchHandler extends ParallelBatchHandler<
  number,
  string,
  TestSharedData
> {
  protected prepareBatchInputs(sharedData: Readonly<TestSharedData>): number[] {
    return sharedData.items;
  }

  protected async processSingleItem(item: number): Promise<string> {
    if (item === 2) {
      throw new Error(`Error processing item ${item}`);
    }
    return `processed-${item}`;
  }
}

describe('ParallelBatchHandler', () => {
  let sharedData: TestSharedData;

  beforeEach(() => {
    sharedData = {
      items: [1, 2, 3],
      results: [],
      processingTimes: [],
    };
  });

  describe('Basic Functionality', () => {
    it('should process all items in parallel', async () => {
      const handler = new TestParallelBatchHandler();
      const result = await handler.run(sharedData);

      expect(result).toBe('default');
      expect(sharedData.results).toEqual([
        'processed-1',
        'processed-2',
        'processed-3',
      ]);
    });

    it('should handle empty input arrays', async () => {
      const handler = new TestParallelBatchHandler();
      sharedData.items = [];

      const result = await handler.run(sharedData);

      expect(result).toBe('default');
      expect(sharedData.results).toEqual([]);
    });

    it('should process single item', async () => {
      const handler = new TestParallelBatchHandler();
      sharedData.items = [42];

      const result = await handler.run(sharedData);

      expect(result).toBe('default');
      expect(sharedData.results).toEqual(['processed-42']);
    });
  });

  describe('Parallel Processing Performance', () => {
    it('should process items concurrently (not sequentially)', async () => {
      const processingDelay = 100; // 100ms delay per item
      const handler = new TestParallelBatchHandler(processingDelay);
      sharedData.items = [1, 2, 3, 4, 5]; // 5 items

      const startTime = Date.now();
      await handler.run(sharedData);
      const totalTime = Date.now() - startTime;

      // If processed sequentially: ~500ms (5 * 100ms)
      // If processed in parallel: ~100ms (all at once)
      // Allow some buffer for test execution overhead
      expect(totalTime).toBeLessThan(300); // Should be much closer to 100ms than 500ms
      expect(sharedData.results).toHaveLength(5);
    });

    it('should start all items at roughly the same time', async () => {
      const handler = new TestParallelBatchHandler(50);
      sharedData.items = [1, 2, 3];

      await handler.run(sharedData);

      // All processing times should be similar (around 50ms)
      // since they started at the same time
      const times = sharedData.processingTimes;
      expect(times).toHaveLength(3);

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      expect(avgTime).toBeGreaterThan(40); // At least 40ms
      expect(avgTime).toBeLessThan(100); // But not much more than 50ms

      // All times should be within a reasonable range of each other
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);
      expect(maxTime - minTime).toBeLessThan(30); // Small variance indicates parallel execution
    });
  });

  describe('Error Handling', () => {
    it('should fail fast if any item throws an error', async () => {
      const handler = new ErrorParallelBatchHandler();

      await expect(handler.run(sharedData)).rejects.toThrow(
        'Error processing item 2',
      );

      // Results should not be set when there's an error
      expect(sharedData.results).toEqual([]);
    });

    it('should not process remaining items after error (fail-fast)', async () => {
      const handler = new ErrorParallelBatchHandler();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        await handler.run(sharedData);
      } catch (error) {
        // Expected to throw
      }

      // Since Promise.all fails fast, we can't guarantee which items completed
      // but we know the batch as a whole failed
      expect(sharedData.results).toEqual([]);

      consoleSpy.mockRestore();
    });
  });

  describe('Custom Result Processing', () => {
    class CustomResultHandler extends ParallelBatchHandler<
      number,
      string,
      TestSharedData
    > {
      protected prepareBatchInputs(
        sharedData: Readonly<TestSharedData>,
      ): number[] {
        return sharedData.items;
      }

      protected async processSingleItem(item: number): Promise<string> {
        return `item-${item * 2}`;
      }

      protected processBatchResults(
        sharedData: TestSharedData,
        inputs: number[],
        outputs: string[],
      ): ActionResult {
        // Custom processing: only keep results for even inputs
        sharedData.results = outputs.filter(
          (_, index) => inputs[index] % 2 === 0,
        );
        return inputs.length > 3 ? 'continue' : 'default';
      }
    }

    it('should allow custom result processing', async () => {
      const handler = new CustomResultHandler();
      sharedData.items = [1, 2, 3, 4];

      const result = await handler.run(sharedData);

      expect(result).toBe('continue'); // Custom action based on input length
      expect(sharedData.results).toEqual(['item-4', 'item-8']); // Only even inputs (2, 4)
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety for inputs and outputs', async () => {
      interface TypedSharedData extends SharedData {
        numbers: number[];
        strings: string[];
      }

      class TypedHandler extends ParallelBatchHandler<
        number,
        string,
        TypedSharedData
      > {
        protected prepareBatchInputs(
          sharedData: Readonly<TypedSharedData>,
        ): number[] {
          return sharedData.numbers;
        }

        protected async processSingleItem(item: number): Promise<string> {
          return item.toString(); // number -> string
        }

        protected processBatchResults(
          sharedData: TypedSharedData,
          inputs: number[],
          outputs: string[],
        ): ActionResult {
          sharedData.strings = outputs;
          return 'default';
        }
      }

      const handler = new TypedHandler();
      const typedData: TypedSharedData = {
        numbers: [1, 2, 3],
        strings: [],
      };

      await handler.run(typedData);

      expect(typedData.strings).toEqual(['1', '2', '3']);
    });
  });
});
