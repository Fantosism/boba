import { describe, it, expect, vi } from 'vitest';
import { BatchHandler } from '@/batchHandler/batchHandler';
import { SharedData } from '@/baseHandler/baseHandler';

interface TestBatchData extends SharedData {
  items?: string[];
  results?: string[];
  processedCount?: number;
}

class TestBatchHandler extends BatchHandler<string, string, TestBatchData> {
  public processSingleItemSpy = vi.fn();

  protected prepareBatchInputs(sharedData: Readonly<TestBatchData>): string[] {
    return sharedData.items || [];
  }

  protected async processSingleItem(item: string): Promise<string> {
    this.processSingleItemSpy(item);

    if (item === 'fail') {
      throw new Error(`Failed to process: ${item}`);
    }

    return `processed:${item}`;
  }

  protected processBatchResults(
    sharedData: TestBatchData & SharedData,
    inputs: string[],
    outputs: string[],
  ): string {
    sharedData.results = outputs;
    sharedData.processedCount = outputs.length;
    return 'complete';
  }
}

describe('BatchHandler', () => {
  describe('Basic Batch Processing', () => {
    it('should process empty batch', async () => {
      const handler = new TestBatchHandler();
      const sharedData: TestBatchData = { items: [] };

      const action = await handler.run(sharedData);

      expect(action).toBe('complete');
      expect(sharedData.results).toEqual([]);
      expect(sharedData.processedCount).toBe(0);
    });

    it('should process single item', async () => {
      const handler = new TestBatchHandler();
      const sharedData: TestBatchData = { items: ['item1'] };

      const action = await handler.run(sharedData);

      expect(action).toBe('complete');
      expect(sharedData.results).toEqual(['processed:item1']);
      expect(sharedData.processedCount).toBe(1);
      expect(handler.processSingleItemSpy).toHaveBeenCalledWith('item1');
    });

    it('should process multiple items sequentially', async () => {
      const handler = new TestBatchHandler();
      const sharedData: TestBatchData = { items: ['item1', 'item2', 'item3'] };

      const action = await handler.run(sharedData);

      expect(action).toBe('complete');
      expect(sharedData.results).toEqual([
        'processed:item1',
        'processed:item2',
        'processed:item3',
      ]);
      expect(sharedData.processedCount).toBe(3);
      expect(handler.processSingleItemSpy).toHaveBeenCalledTimes(3);
    });

    it('should handle undefined items array', async () => {
      const handler = new TestBatchHandler();
      const sharedData: TestBatchData = {}; // No items array

      const action = await handler.run(sharedData);

      expect(action).toBe('complete');
      expect(sharedData.results).toEqual([]);
      expect(sharedData.processedCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors from individual items', async () => {
      const handler = new TestBatchHandler();
      const sharedData: TestBatchData = { items: ['item1', 'fail', 'item3'] };

      await expect(handler.run(sharedData)).rejects.toThrow(
        'Failed to process: fail',
      );
    });

    it('should stop processing on first error', async () => {
      const handler = new TestBatchHandler();
      const sharedData: TestBatchData = { items: ['item1', 'fail', 'item3'] };

      try {
        await handler.run(sharedData);
      } catch (error) {
        expect(handler.processSingleItemSpy).toHaveBeenCalledWith('item1');
        expect(handler.processSingleItemSpy).toHaveBeenCalledWith('fail');
        expect(handler.processSingleItemSpy).not.toHaveBeenCalledWith('item3');
      }
    });
  });

  describe('Conditional Routing', () => {
    it('should support routing based on batch results', async () => {
      class RoutingBatchHandler extends TestBatchHandler {
        protected processBatchResults(
          sharedData: TestBatchData & SharedData,
          inputs: string[],
          outputs: string[],
        ): string {
          sharedData.results = outputs;
          sharedData.processedCount = outputs.length;

          if (outputs.length === 0) return 'empty';
          if (outputs.length === 1) return 'single';
          return 'multiple';
        }
      }

      const handler = new RoutingBatchHandler();

      const emptyData: TestBatchData = { items: [] };
      expect(await handler.run(emptyData)).toBe('empty');

      const singleData: TestBatchData = { items: ['item1'] };
      expect(await handler.run(singleData)).toBe('single');

      const multipleData: TestBatchData = { items: ['item1', 'item2'] };
      expect(await handler.run(multipleData)).toBe('multiple');
    });
  });

  describe('Async Processing', () => {
    it('should handle async item processing', async () => {
      class AsyncBatchHandler extends TestBatchHandler {
        protected async processSingleItem(item: string): Promise<string> {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return `async:${item}`;
        }
      }

      const handler = new AsyncBatchHandler();
      const sharedData: TestBatchData = { items: ['item1', 'item2'] };

      const action = await handler.run(sharedData);

      expect(action).toBe('complete');
      expect(sharedData.results).toEqual(['async:item1', 'async:item2']);
    });
  });

  describe('Parameter Management', () => {
    it('should merge parameters into shared data', async () => {
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

  describe('Integration Patterns', () => {
    it('should work with different input/output types', async () => {
      interface NumberBatchData extends SharedData {
        numbers: number[];
        squares?: number[];
      }

      class SquareBatchHandler extends BatchHandler<
        number,
        number,
        NumberBatchData
      > {
        protected prepareBatchInputs(
          sharedData: Readonly<NumberBatchData>,
        ): number[] {
          return sharedData.numbers;
        }

        protected processSingleItem(num: number): number {
          return num * num;
        }

        protected processBatchResults(
          sharedData: NumberBatchData & SharedData,
          inputs: number[],
          outputs: number[],
        ): string {
          sharedData.squares = outputs;
          return 'squared';
        }
      }

      const handler = new SquareBatchHandler();
      const sharedData: NumberBatchData = { numbers: [1, 2, 3, 4] };

      const action = await handler.run(sharedData);

      expect(action).toBe('squared');
      expect(sharedData.squares).toEqual([1, 4, 9, 16]);
    });

    it('should support complex object transformations', async () => {
      interface User {
        id: number;
        name: string;
        email: string;
      }

      interface ProcessedUser {
        id: number;
        displayName: string;
        emailDomain: string;
      }

      interface UserBatchData extends SharedData {
        users: User[];
        processedUsers?: ProcessedUser[];
      }

      class UserProcessor extends BatchHandler<
        User,
        ProcessedUser,
        UserBatchData
      > {
        protected prepareBatchInputs(
          sharedData: Readonly<UserBatchData>,
        ): User[] {
          return sharedData.users;
        }

        protected processSingleItem(user: User): ProcessedUser {
          return {
            id: user.id,
            displayName: user.name.toUpperCase(),
            emailDomain: user.email.split('@')[1],
          };
        }

        protected processBatchResults(
          sharedData: UserBatchData & SharedData,
          inputs: User[],
          outputs: ProcessedUser[],
        ): string {
          sharedData.processedUsers = outputs;
          return 'users_processed';
        }
      }

      const handler = new UserProcessor();
      const sharedData: UserBatchData = {
        users: [
          { id: 1, name: 'John', email: 'john@example.com' },
          { id: 2, name: 'Jane', email: 'jane@test.org' },
        ],
      };

      const action = await handler.run(sharedData);

      expect(action).toBe('users_processed');
      expect(sharedData.processedUsers).toEqual([
        { id: 1, displayName: 'JOHN', emailDomain: 'example.com' },
        { id: 2, displayName: 'JANE', emailDomain: 'test.org' },
      ]);
    });
  });
});
