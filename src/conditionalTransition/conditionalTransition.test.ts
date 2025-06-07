import { describe, it, expect } from 'vitest';
import { ConditionalTransition } from './conditionalTransition';
import {
  BaseHandler,
  SharedData,
  ActionResult,
} from '@/baseHandler/baseHandler';

interface TestData extends SharedData {
  value: number;
  result?: string;
}

class TestHandler extends BaseHandler<number, string, TestData> {
  constructor(private name: string) {
    super();
  }

  protected prepareInputs(sharedData: Readonly<TestData>): number {
    return sharedData.value;
  }

  protected handleRequest(input: number): string {
    return `${this.name}:${input}`;
  }

  protected processResults(
    sharedData: TestData & SharedData,
    inputs: number,
    outputs: string,
  ): ActionResult {
    sharedData.result = outputs;
    return 'success';
  }
}

describe('ConditionalTransition', () => {
  describe('Constructor', () => {
    it('should create conditional transition with source handler and action', () => {
      const sourceHandler = new TestHandler('source');
      const action = 'test-action';

      const transition = new ConditionalTransition(sourceHandler, action);

      expect(transition).toBeInstanceOf(ConditionalTransition);
    });
  });

  describe('then() method', () => {
    it('should connect source handler to target handler with specified action', () => {
      const sourceHandler = new TestHandler('source');
      const targetHandler = new TestHandler('target');
      const action = 'custom-action';

      const transition = new ConditionalTransition(sourceHandler, action);
      const result = transition.then(targetHandler);

      expect(result).toBe(targetHandler);
      expect(sourceHandler.getNextHandler(action)).toBe(targetHandler);
    });

    it('should work with default action', () => {
      const sourceHandler = new TestHandler('source');
      const targetHandler = new TestHandler('target');

      const transition = new ConditionalTransition(sourceHandler, 'default');
      const result = transition.then(targetHandler);

      expect(result).toBe(targetHandler);
      expect(sourceHandler.getNextHandler('default')).toBe(targetHandler);
    });

    it('should work with multiple conditional transitions', () => {
      const sourceHandler = new TestHandler('source');
      const targetHandler1 = new TestHandler('target1');
      const targetHandler2 = new TestHandler('target2');

      const transition1 = new ConditionalTransition(sourceHandler, 'action1');
      const transition2 = new ConditionalTransition(sourceHandler, 'action2');

      const result1 = transition1.then(targetHandler1);
      const result2 = transition2.then(targetHandler2);

      expect(result1).toBe(targetHandler1);
      expect(result2).toBe(targetHandler2);
      expect(sourceHandler.getNextHandler('action1')).toBe(targetHandler1);
      expect(sourceHandler.getNextHandler('action2')).toBe(targetHandler2);
    });

    it('should return target handler for method chaining', () => {
      const sourceHandler = new TestHandler('source');
      const targetHandler = new TestHandler('target');
      const finalHandler = new TestHandler('final');

      const transition = new ConditionalTransition(sourceHandler, 'test');
      const result = transition.then(targetHandler);

      // Should be able to chain further operations on the returned handler
      result.connectTo(finalHandler);

      expect(result).toBe(targetHandler);
      expect(targetHandler.getNextHandler('default')).toBe(finalHandler);
    });
  });

  describe('Integration with BaseHandler.when()', () => {
    it('should work seamlessly with BaseHandler when() method', () => {
      const sourceHandler = new TestHandler('source');
      const targetHandler = new TestHandler('target');

      // This should create a ConditionalTransition internally
      const result = sourceHandler.when('conditional').then(targetHandler);

      expect(result).toBe(targetHandler);
      expect(sourceHandler.getNextHandler('conditional')).toBe(targetHandler);
    });

    it('should support fluent chaining with when().then()', () => {
      const sourceHandler = new TestHandler('source');
      const successHandler = new TestHandler('success');
      const errorHandler = new TestHandler('error');
      const warningHandler = new TestHandler('warning');

      // Chain multiple conditional connections
      sourceHandler.when('success').then(successHandler);
      sourceHandler.when('error').then(errorHandler);
      sourceHandler.when('warning').then(warningHandler);

      expect(sourceHandler.getNextHandler('success')).toBe(successHandler);
      expect(sourceHandler.getNextHandler('error')).toBe(errorHandler);
      expect(sourceHandler.getNextHandler('warning')).toBe(warningHandler);
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety with generic handlers', () => {
      const sourceHandler = new TestHandler('source');
      const targetHandler = new TestHandler('target');

      const transition = new ConditionalTransition(sourceHandler, 'test');
      const result = transition.then(targetHandler);

      // TypeScript should ensure these are the correct types
      expect(result).toBeInstanceOf(BaseHandler);
      expect(result).toBe(targetHandler);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty action strings', () => {
      const sourceHandler = new TestHandler('source');
      const targetHandler = new TestHandler('target');

      const transition = new ConditionalTransition(sourceHandler, '');
      const result = transition.then(targetHandler);

      expect(result).toBe(targetHandler);
      expect(sourceHandler.getNextHandler('')).toBe(targetHandler);
    });

    it('should handle special characters in action names', () => {
      const sourceHandler = new TestHandler('source');
      const targetHandler = new TestHandler('target');
      const specialAction = 'action-with-special_chars.123';

      const transition = new ConditionalTransition(
        sourceHandler,
        specialAction,
      );
      const result = transition.then(targetHandler);

      expect(result).toBe(targetHandler);
      expect(sourceHandler.getNextHandler(specialAction)).toBe(targetHandler);
    });

    it('should allow overwriting existing connections', () => {
      const sourceHandler = new TestHandler('source');
      const targetHandler1 = new TestHandler('target1');
      const targetHandler2 = new TestHandler('target2');
      const action = 'same-action';

      // First connection
      const transition1 = new ConditionalTransition(sourceHandler, action);
      transition1.then(targetHandler1);

      expect(sourceHandler.getNextHandler(action)).toBe(targetHandler1);

      // Second connection should overwrite the first
      const transition2 = new ConditionalTransition(sourceHandler, action);
      transition2.then(targetHandler2);

      expect(sourceHandler.getNextHandler(action)).toBe(targetHandler2);
    });
  });
});
