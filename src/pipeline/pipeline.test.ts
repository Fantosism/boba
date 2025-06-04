import { describe, it, expect } from 'vitest';
import { Handler } from '@/handler/handler';
import { Pipeline } from '@/pipeline/pipeline';
import { SharedData } from '@/baseHandler/baseHandler';

interface TestPipelineData extends SharedData {
  step?: string;
  count?: number;
  result?: string;
  path?: string[];
}

class StepHandler extends Handler<void, string, TestPipelineData> {
  constructor(
    private stepName: string,
    private nextAction: string = 'default',
  ) {
    super();
  }

  protected prepareInputs(sharedData: Readonly<TestPipelineData>): void {
    return undefined;
  }

  protected handleRequest(inputs: void): string {
    return `Step ${this.stepName} executed`;
  }

  protected processResults(
    sharedData: TestPipelineData & SharedData,
    inputs: void,
    outputs: string,
  ): string {
    sharedData.step = this.stepName;

    if (!sharedData.path) sharedData.path = [];
    sharedData.path.push(this.stepName);

    return this.nextAction;
  }
}

class CounterHandler extends Handler<void, number, TestPipelineData> {
  constructor(private increment: number = 1) {
    super();
  }

  protected prepareInputs(sharedData: Readonly<TestPipelineData>): void {
    return undefined;
  }

  protected handleRequest(inputs: void): number {
    return this.increment;
  }

  protected processResults(
    sharedData: TestPipelineData & SharedData,
    inputs: void,
    outputs: number,
  ): string {
    sharedData.count = (sharedData.count || 0) + outputs;
    return 'continue';
  }
}

class ConditionalHandler extends Handler<number, string, TestPipelineData> {
  protected prepareInputs(sharedData: Readonly<TestPipelineData>): number {
    return sharedData.count || 0;
  }

  protected handleRequest(inputs: number): string {
    return `Count is ${inputs}`;
  }

  protected processResults(
    sharedData: TestPipelineData & SharedData,
    inputs: number,
    outputs: string,
  ): string {
    sharedData.result = outputs;

    if (inputs === 0) return 'zero';
    if (inputs > 0 && inputs <= 5) return 'low';
    if (inputs > 5) return 'high';
    return 'default';
  }
}

describe('Pipeline', () => {
  describe('Constructor', () => {
    it('should create pipeline with start handler', () => {
      const handler = new StepHandler('TEST');
      const pipeline = new Pipeline(handler);

      expect(pipeline.getStartHandler()).toBe(handler);
    });

    it('should throw error if start handler is null or undefined', () => {
      expect(() => new Pipeline(null)).toThrow('Start handler is required');
      expect(() => new Pipeline(undefined)).toThrow(
        'Start handler is required',
      );
    });
  });

  describe('Basic Orchestration', () => {
    it('should execute a single handler', async () => {
      const handler = new StepHandler('A');
      const pipeline = new Pipeline(handler);
      const sharedData: TestPipelineData = {};

      const finalAction = await pipeline.run(sharedData);

      expect(finalAction).toBe('default');
      expect(sharedData.step).toBe('A');
      expect(sharedData.path).toEqual(['A']);
    });

    it('should execute a linear chain of handlers', async () => {
      const handlerA = new StepHandler('A', 'next');
      const handlerB = new StepHandler('B', 'continue');
      const handlerC = new StepHandler('C');

      handlerA.connectTo(handlerB, 'next');
      handlerB.connectTo(handlerC, 'continue');

      const pipeline = new Pipeline(handlerA);
      const sharedData: TestPipelineData = {};

      const finalAction = await pipeline.run(sharedData);

      expect(finalAction).toBe('default');
      expect(sharedData.path).toEqual(['A', 'B', 'C']);
    });

    it('should stop when no successor is found', async () => {
      const handlerA = new StepHandler('A', 'unknown_action');
      const handlerB = new StepHandler('B');

      handlerA.connectTo(handlerB, 'default');

      const pipeline = new Pipeline(handlerA);
      const sharedData: TestPipelineData = {};

      const finalAction = await pipeline.run(sharedData);

      expect(finalAction).toBe('unknown_action');
      expect(sharedData.path).toEqual(['A']);
    });
  });

  describe('Conditional Routing', () => {
    it('should follow different paths based on handler actions', async () => {
      const counter = new CounterHandler(3);
      const decision = new ConditionalHandler();
      const lowHandler = new StepHandler('LOW');
      const highHandler = new StepHandler('HIGH');

      counter.connectTo(decision, 'continue');
      decision.connectTo(lowHandler, 'low');
      decision.connectTo(highHandler, 'high');

      const pipeline = new Pipeline(counter);
      const sharedData: TestPipelineData = {};

      const finalAction = await pipeline.run(sharedData);

      expect(sharedData.count).toBe(3);
      expect(sharedData.result).toBe('Count is 3');
      expect(finalAction).toBe('default');
      expect(sharedData.path).toEqual(['LOW']);
    });

    it('should handle zero case routing', async () => {
      const decision = new ConditionalHandler();
      const zeroHandler = new StepHandler('ZERO');

      decision.connectTo(zeroHandler, 'zero');

      const pipeline = new Pipeline(decision);
      const sharedData: TestPipelineData = { count: 0 };

      const finalAction = await pipeline.run(sharedData);

      expect(finalAction).toBe('default');
      expect(sharedData.path).toEqual(['ZERO']);
    });

    it('should handle high count routing', async () => {
      const decision = new ConditionalHandler();
      const highHandler = new StepHandler('HIGH');

      decision.connectTo(highHandler, 'high');

      const pipeline = new Pipeline(decision);
      const sharedData: TestPipelineData = { count: 10 };

      const finalAction = await pipeline.run(sharedData);

      expect(finalAction).toBe('default');
      expect(sharedData.path).toEqual(['HIGH']);
    });
  });

  describe('Pipeline-as-Handler Pattern', () => {
    it('should allow pipeline to be used as handler in another pipeline', async () => {
      const subHandlerA = new StepHandler('SUB-A', 'next');
      const subHandlerB = new StepHandler('SUB-B');
      subHandlerA.connectTo(subHandlerB, 'next');
      const subPipeline = new Pipeline(subHandlerA);

      const mainHandler = new StepHandler('MAIN');
      mainHandler.connectTo(subPipeline, 'default');

      const mainPipeline = new Pipeline(mainHandler);
      const sharedData: TestPipelineData = {};

      const finalAction = await mainPipeline.run(sharedData);

      expect(finalAction).toBe('default');
      expect(sharedData.path).toEqual(['MAIN', 'SUB-A', 'SUB-B']);
    });

    it('should throw error when handleRequest is called directly on pipeline', async () => {
      const handler = new StepHandler('TEST');
      const pipeline = new Pipeline(handler);

      await expect(pipeline['handleRequest'](undefined)).rejects.toThrow(
        'Pipeline.handleRequest() should not be called directly. Use run() instead.',
      );
    });
  });

  describe('Parameter Management', () => {
    it('should merge pipeline parameters into shared data', async () => {
      const handler = new StepHandler('PARAM_TEST');
      const pipeline = new Pipeline(handler);

      pipeline.setParams({
        testParam: 'test-value',
        numericParam: 42,
      });

      const sharedData: TestPipelineData = { count: 1 };
      await pipeline.run(sharedData);

      expect(sharedData.testParam).toBe('test-value');
      expect(sharedData.numericParam).toBe(42);
      expect(sharedData.count).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors from handlers', async () => {
      class ErrorHandler extends Handler<void, never, TestPipelineData> {
        protected prepareInputs(): void {
          return undefined;
        }

        protected handleRequest(): never {
          throw new Error('Handler error');
        }
      }

      const errorHandler = new ErrorHandler();
      const pipeline = new Pipeline(errorHandler);
      const sharedData: TestPipelineData = {};

      await expect(pipeline.run(sharedData)).rejects.toThrow('Handler error');
    });

    it('should handle errors in nested pipelines', async () => {
      class ErrorSubHandler extends Handler<void, never, TestPipelineData> {
        protected prepareInputs(): void {
          return undefined;
        }

        protected handleRequest(): never {
          throw new Error('Sub-pipeline error');
        }
      }

      const errorHandler = new ErrorSubHandler();
      const subPipeline = new Pipeline(errorHandler);

      const mainHandler = new StepHandler('MAIN');
      mainHandler.connectTo(subPipeline, 'default');

      const mainPipeline = new Pipeline(mainHandler);
      const sharedData: TestPipelineData = {};

      await expect(mainPipeline.run(sharedData)).rejects.toThrow(
        'Sub-pipeline error',
      );
    });
  });

  describe('Complex Workflows', () => {
    it('should handle branching and rejoining', async () => {
      const start = new ConditionalHandler();
      const pathA = new StepHandler('PATH-A', 'rejoin');
      const pathB = new StepHandler('PATH-B', 'rejoin');
      const rejoin = new StepHandler('REJOIN');

      start.connectTo(pathA, 'low');
      start.connectTo(pathB, 'high');
      pathA.connectTo(rejoin, 'rejoin');
      pathB.connectTo(rejoin, 'rejoin');

      const pipeline = new Pipeline(start);

      const lowData: TestPipelineData = { count: 3 };
      await pipeline.run(lowData);
      expect(lowData.path).toEqual(['PATH-A', 'REJOIN']);

      const highData: TestPipelineData = { count: 10 };
      await pipeline.run(highData);
      expect(highData.path).toEqual(['PATH-B', 'REJOIN']);
    });

    it('should handle loops with break condition', async () => {
      class LoopController extends Handler<void, string, TestPipelineData> {
        protected prepareInputs(): void {
          return undefined;
        }

        protected handleRequest(): string {
          return 'loop control';
        }

        protected processResults(
          sharedData: TestPipelineData & SharedData,
          inputs: void,
          outputs: string,
        ): string {
          const count = (sharedData.count || 0) + 1;
          sharedData.count = count;

          if (!sharedData.path) sharedData.path = [];
          sharedData.path.push(`LOOP-${count}`);

          return count >= 3 ? 'break' : 'repeat';
        }
      }

      const controller = new LoopController();
      const loopHandler = new StepHandler('LOOP', 'repeat');
      const breakHandler = new StepHandler('BREAK');

      controller.connectTo(loopHandler, 'repeat');
      controller.connectTo(breakHandler, 'break');
      loopHandler.connectTo(controller, 'repeat');

      const pipeline = new Pipeline(controller);
      const sharedData: TestPipelineData = {};

      const finalAction = await pipeline.run(sharedData);

      expect(sharedData.count).toBe(3);
      expect(finalAction).toBe('default');
      expect(sharedData.path).toEqual([
        'LOOP-1',
        'LOOP',
        'LOOP-2',
        'LOOP',
        'LOOP-3',
        'BREAK',
      ]);
    });
  });
});
