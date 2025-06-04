import { describe, it, expect } from 'vitest';
import { BaseHandler, SharedData } from './baseHandler';

interface TestSharedData extends SharedData {
  input?: string;
  output?: string;
  count?: number;
  result?: string;
  preparedAt?: number;
  processedAt?: number;
}

interface EchoInput {
  message: string;
}

interface EchoOutput {
  echoed: string;
}

class TestEchoHandler extends BaseHandler<
  EchoInput,
  EchoOutput,
  TestSharedData
> {
  protected prepareInputs(sharedData: Readonly<TestSharedData>): EchoInput {
    return { message: sharedData.input || 'default' };
  }

  protected handleRequest(input: EchoInput): EchoOutput {
    return { echoed: `Echo: ${input.message}` };
  }

  protected processResults(
    sharedData: TestSharedData & SharedData,
    inputs: EchoInput,
    outputs: EchoOutput,
  ): string {
    sharedData.output = outputs.echoed;
    return 'success';
  }
}

class TestCounterHandler extends BaseHandler<void, number, TestSharedData> {
  protected prepareInputs(sharedData: Readonly<TestSharedData>): void {
    return undefined;
  }

  protected handleRequest(inputs: void): number {
    return (this.getParams().startValue as number) || 0;
  }

  protected processResults(
    sharedData: TestSharedData & SharedData,
    inputs: void,
    outputs: number,
  ): string {
    sharedData.count = outputs + 1;
    return outputs > 5 ? 'high' : 'low';
  }
}

class TestAsyncHandler extends BaseHandler<string, string, TestSharedData> {
  protected prepareInputs(sharedData: Readonly<TestSharedData>): string {
    sharedData.preparedAt = Date.now();
    return sharedData.input || 'async-input';
  }

  protected async handleRequest(inputs: string): Promise<string> {
    // Simulate async work
    await new Promise((resolve) => setTimeout(resolve, 10));
    return `Processed: ${inputs}`;
  }

  protected processResults(
    sharedData: TestSharedData & SharedData,
    inputs: string,
    outputs: string,
  ): string {
    sharedData.result = outputs;
    sharedData.processedAt = Date.now();
    return 'complete';
  }
}

class TestDefaultHandler extends BaseHandler<void, string, TestSharedData> {
  protected handleRequest(inputs: void): string {
    return 'default-result';
  }
  // Uses default implementations for prepareInputs and processResults
}

describe('BaseHandler', () => {
  describe('Parameter Management', () => {
    it('should set and get parameters', () => {
      const handler = new TestEchoHandler();
      const params = { key1: 'value1', key2: 42 };

      handler.setParams(params);
      const retrievedParams = handler.getParams();

      expect(retrievedParams).toEqual(params);
    });

    it('should merge parameters when setting multiple times', () => {
      const handler = new TestEchoHandler();

      handler.setParams({ key1: 'value1' });
      handler.setParams({ key2: 'value2' });

      const params = handler.getParams();

      expect(params).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should override existing parameters', () => {
      const handler = new TestEchoHandler();

      handler.setParams({ key1: 'original' });
      handler.setParams({ key1: 'updated' });

      const params = handler.getParams();

      expect(params.key1).toBe('updated');
    });

    it('should return a copy of parameters to prevent mutation', () => {
      const handler = new TestEchoHandler();
      handler.setParams({ key1: 'value1' });

      const params = handler.getParams();
      params.key1 = 'mutated';

      expect(handler.getParams().key1).toBe('value1');
    });
  });

  describe('Connection Management', () => {
    it('should connect handlers with default action', () => {
      const handler1 = new TestEchoHandler();
      const handler2 = new TestCounterHandler();

      const result = handler1.connectTo(handler2);

      expect(result).toBe(handler2);
      expect(handler1.getNextHandler('default')).toBe(handler2);
    });

    it('should connect handlers with custom action', () => {
      const handler1 = new TestEchoHandler();
      const handler2 = new TestCounterHandler();

      handler1.connectTo(handler2, 'custom');

      expect(handler1.getNextHandler('custom')).toBe(handler2);
      expect(handler1.getNextHandler('default')).toBeUndefined();
    });

    it('should return undefined for non-existent connections', () => {
      const handler = new TestEchoHandler();

      expect(handler.getNextHandler('nonexistent')).toBeUndefined();
    });

    it('should track multiple successors', () => {
      const handler = new TestEchoHandler();
      const handler1 = new TestCounterHandler();
      const handler2 = new TestAsyncHandler();

      handler.connectTo(handler1, 'action1');
      handler.connectTo(handler2, 'action2');

      const successors = handler.getSuccessors();

      expect(successors.get('action1')).toBe(handler1);
      expect(successors.get('action2')).toBe(handler2);
      expect(successors.size).toBe(2);
    });

    it('should indicate when handler has successors', () => {
      const handler = new TestEchoHandler();
      const nextHandler = new TestCounterHandler();

      expect(handler.hasSuccessors()).toBe(false);

      handler.connectTo(nextHandler);

      expect(handler.hasSuccessors()).toBe(true);
    });

    it('should get available actions', () => {
      const handler = new TestEchoHandler();
      const handler1 = new TestCounterHandler();
      const handler2 = new TestAsyncHandler();

      expect(handler.getAvailableActions()).toEqual([]);

      handler.connectTo(handler1, 'action1');
      handler.connectTo(handler2, 'action2');

      const actions = handler.getAvailableActions();

      expect(actions).toContain('action1');
      expect(actions).toContain('action2');
      expect(actions).toHaveLength(2);
    });

    it('should return a copy of successors map', () => {
      const handler = new TestEchoHandler();
      const nextHandler = new TestCounterHandler();

      handler.connectTo(nextHandler, 'test');
      const successors = handler.getSuccessors();

      // Attempting to modify the returned map should not affect the original
      successors.set('new', new TestAsyncHandler());

      expect(handler.getAvailableActions()).toEqual(['test']);
    });
  });

  describe('Lifecycle Execution', () => {
    it('should execute 3-phase lifecycle correctly', async () => {
      const handler = new TestEchoHandler();
      const sharedData: TestSharedData = { input: 'test message' };

      const action = await handler.run(sharedData);

      expect(action).toBe('success');
      expect(sharedData.output).toBe('Echo: test message');
    });

    it('should merge parameters into shared data before execution', async () => {
      const handler = new TestCounterHandler();
      handler.setParams({ startValue: 10 });

      const sharedData: TestSharedData = {};
      const action = await handler.run(sharedData);

      expect(sharedData.startValue).toBe(10);
      expect(sharedData.count).toBe(11);
      expect(action).toBe('high');
    });

    it('should handle async handleRequest method', async () => {
      const handler = new TestAsyncHandler();
      const sharedData: TestSharedData = { input: 'async-test' };

      const action = await handler.run(sharedData);

      expect(action).toBe('complete');
      expect(sharedData.result).toBe('Processed: async-test');
      expect(sharedData.preparedAt).toBeDefined();
      expect(sharedData.processedAt).toBeDefined();
      expect(sharedData.processedAt! >= sharedData.preparedAt!).toBe(true);
    });

    it('should use default implementations when not overridden', async () => {
      const handler = new TestDefaultHandler();
      const sharedData: TestSharedData = {};

      const action = await handler.run(sharedData);

      expect(action).toBe('default');
    });

    it('should handle conditional actions based on results', async () => {
      const handler = new TestCounterHandler();

      // Test low value
      handler.setParams({ startValue: 3 });
      let sharedData: TestSharedData = {};
      let action = await handler.run(sharedData);
      expect(action).toBe('low');

      // Test high value
      handler.setParams({ startValue: 8 });
      sharedData = {};
      action = await handler.run(sharedData);
      expect(action).toBe('high');
    });
  });

  describe('Utility Methods', () => {
    it('should return simple handler name when no connections', () => {
      const handler = new TestEchoHandler();

      const str = handler.toString();

      expect(str).toBe('TestEchoHandler');
    });

    it('should show single connection', () => {
      const handler1 = new TestEchoHandler();
      const handler2 = new TestCounterHandler();

      handler1.connectTo(handler2, 'success');
      const str = handler1.toString();

      expect(str).toBe('TestEchoHandler --[success]--> TestCounterHandler');
    });

    it('should show multiple connections', () => {
      const handler = new TestEchoHandler();
      const handler1 = new TestCounterHandler();
      const handler2 = new TestAsyncHandler();

      handler.connectTo(handler1, 'success');
      handler.connectTo(handler2, 'error');

      const str = handler.toString();
      const lines = str.split('\n');

      expect(lines).toHaveLength(2);
      expect(lines).toContain(
        'TestEchoHandler --[success]--> TestCounterHandler',
      );
      expect(lines).toContain('TestEchoHandler --[error]--> TestAsyncHandler');
    });

    it('should handle null connections in toString', () => {
      const handler = new TestEchoHandler();
      // Manually add a null connection (edge case)
      (handler as any).successors.set('broken', undefined);

      const str = handler.toString();

      expect(str).toContain('TestEchoHandler --[broken]--> null');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty shared data', async () => {
      const handler = new TestEchoHandler();
      const sharedData: TestSharedData = {};

      const action = await handler.run(sharedData);

      expect(action).toBe('success');
      expect(sharedData.output).toBe('Echo: default');
    });

    it('should preserve existing shared data properties', async () => {
      const handler = new TestEchoHandler();
      const sharedData: TestSharedData = {
        input: 'test',
        existingProp: 'should-remain',
      };

      await handler.run(sharedData);

      expect(sharedData.existingProp).toBe('should-remain');
      expect(sharedData.input).toBe('test');
      expect(sharedData.output).toBe('Echo: test');
    });

    it('should handle parameter override of shared data', async () => {
      const handler = new TestEchoHandler();
      handler.setParams({ input: 'param-input' });

      const sharedData: TestSharedData = { input: 'shared-input' };

      await handler.run(sharedData);

      // Parameters should override shared data
      expect(sharedData.input).toBe('param-input');
      expect(sharedData.output).toBe('Echo: param-input');
    });
  });
});
