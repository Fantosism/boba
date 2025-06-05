import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AsyncHandler, AsyncHandlerConfig } from '@/asyncHandler/asyncHandler';
import { SharedData, ActionResult } from '@/baseHandler/baseHandler';

class TestAsyncHandler extends AsyncHandler<string, string, SharedData> {
  public prepareInputsAsyncSpy = vi.fn();
  public handleRequestAsyncSpy = vi.fn();
  public processResultsAsyncSpy = vi.fn();
  public handleErrorAsyncSpy = vi.fn();

  constructor(config?: AsyncHandlerConfig) {
    super(config);
  }

  protected async prepareInputsAsync(
    sharedData: Readonly<SharedData>,
  ): Promise<string> {
    this.prepareInputsAsyncSpy(sharedData);
    return sharedData.input as string;
  }

  protected async handleRequestAsync(input: string): Promise<string> {
    this.handleRequestAsyncSpy(input);

    if (input === 'fail' || input === 'fallback') {
      throw new Error(input);
    }

    if (input === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return `async:${input}`;
  }

  protected async processResultsAsync(
    sharedData: SharedData,
    inputs: string,
    outputs: string,
  ): Promise<ActionResult> {
    this.processResultsAsyncSpy(sharedData, inputs, outputs);

    if (inputs === 'fallback' && outputs === 'fallback') {
      sharedData.output = 'fallback';
    } else {
      sharedData.output = outputs;
    }

    return 'default';
  }

  protected async handleErrorAsync(
    inputs: string,
    error: Error,
  ): Promise<string> {
    this.handleErrorAsyncSpy(inputs, error);

    if (inputs === 'fallback') {
      return 'fallback';
    }

    throw error;
  }
}

describe('AsyncHandler', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should use default config if none provided', () => {
      const handler = new TestAsyncHandler();
      const config = handler.getAsyncConfig();

      expect(config).toEqual({
        maxRetries: 1,
        retryDelayMs: 0,
      });
    });

    it('should use provided config', () => {
      const handler = new TestAsyncHandler({
        maxRetries: 3,
        retryDelayMs: 100,
      });

      const config = handler.getAsyncConfig();
      expect(config.maxRetries).toBe(3);
      expect(config.retryDelayMs).toBe(100);
    });
  });

  describe('Async Lifecycle Execution', () => {
    it('should execute async lifecycle successfully', async () => {
      const handler = new TestAsyncHandler();
      const sharedData: SharedData = { input: 'test' };

      const result = await handler.run(sharedData);

      expect(result).toBe('default');
      expect(sharedData.output).toBe('async:test');

      // Verify all lifecycle methods were called
      expect(handler.prepareInputsAsyncSpy).toHaveBeenCalledWith(sharedData);
      expect(handler.handleRequestAsyncSpy).toHaveBeenCalledWith('test');
      expect(handler.processResultsAsyncSpy).toHaveBeenCalledWith(
        sharedData,
        'test',
        'async:test',
      );
    });

    it('should handle async operations correctly', async () => {
      const handler = new TestAsyncHandler();
      const sharedData: SharedData = { input: 'slow' };

      const startTime = Date.now();
      const result = await handler.run(sharedData);
      const endTime = Date.now();

      expect(result).toBe('default');
      expect(sharedData.output).toBe('async:slow');
      expect(endTime - startTime).toBeGreaterThanOrEqual(40); // Should take at least 50ms
    });

    it('should handle async preparation phase', async () => {
      class AsyncPrepHandler extends TestAsyncHandler {
        protected async prepareInputsAsync(
          sharedData: Readonly<SharedData>,
        ): Promise<string> {
          // Simulate async preparation (e.g., database lookup)
          await new Promise((resolve) => setTimeout(resolve, 20));
          return `prepared:${sharedData.input}`;
        }
      }

      const handler = new AsyncPrepHandler();
      const sharedData: SharedData = { input: 'data' };

      await handler.run(sharedData);

      expect(sharedData.output).toBe('async:prepared:data');
    });

    it('should handle async results processing', async () => {
      class AsyncPostHandler extends TestAsyncHandler {
        protected async processResultsAsync(
          sharedData: SharedData,
          inputs: string,
          outputs: string,
        ): Promise<ActionResult> {
          // Simulate async post-processing (e.g., saving to database)
          await new Promise((resolve) => setTimeout(resolve, 20));
          sharedData.output = `saved:${outputs}`;
          return 'default';
        }
      }

      const handler = new AsyncPostHandler();
      const sharedData: SharedData = { input: 'data' };

      const result = await handler.run(sharedData);

      expect(result).toBe('default');
      expect(sharedData.output).toBe('saved:async:data');
    });
  });

  describe('Async Retry Logic', () => {
    it('should retry async requests up to maxRetries', async () => {
      let attempts = 0;

      class RetryAsyncHandler extends TestAsyncHandler {
        protected async handleRequestAsync(input: string): Promise<string> {
          attempts++;
          if (attempts < 3) {
            throw new Error('Retry needed');
          }
          return `async:${input}`;
        }
      }

      const handler = new RetryAsyncHandler({ maxRetries: 3 });
      const sharedData: SharedData = { input: 'retry-test' };

      const result = await handler.run(sharedData);

      expect(result).toBe('default');
      expect(attempts).toBe(3);
      expect(sharedData.output).toBe('async:retry-test');
    });

    it('should delay between async retries if configured', async () => {
      vi.useFakeTimers();
      let attempts = 0;

      class DelayRetryHandler extends TestAsyncHandler {
        protected async handleRequestAsync(input: string): Promise<string> {
          attempts++;
          if (attempts < 2) {
            throw new Error('Delay retry');
          }
          return `async:${input}`;
        }
      }

      const handler = new DelayRetryHandler({
        maxRetries: 2,
        retryDelayMs: 100,
      });
      const sharedData: SharedData = { input: 'delay-test' };

      const promise = handler.run(sharedData);

      // First attempt should happen immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(attempts).toBe(1);

      // Second attempt after delay
      await vi.advanceTimersByTimeAsync(100);
      await promise;

      expect(attempts).toBe(2);
      expect(sharedData.output).toBe('async:delay-test');

      vi.useRealTimers();
    });

    it('should respect maxRetries limit for async operations', async () => {
      let attempts = 0;

      class AlwaysFailAsyncHandler extends TestAsyncHandler {
        protected async handleRequestAsync(input: string): Promise<string> {
          attempts++;
          throw new Error('Always fails');
        }
      }

      const handler = new AlwaysFailAsyncHandler({ maxRetries: 3 });
      const sharedData: SharedData = { input: 'fail-test' };

      await expect(handler.run(sharedData)).rejects.toThrow('Always fails');
      expect(attempts).toBe(3);
    });
  });

  describe('Async Error Handling', () => {
    it('should call async error handler on final retry failure', async () => {
      const handler = new TestAsyncHandler({ maxRetries: 2 });
      const sharedData: SharedData = { input: 'fail' };

      await expect(handler.run(sharedData)).rejects.toThrow('fail');

      expect(handler.handleErrorAsyncSpy).toHaveBeenCalledWith(
        'fail',
        expect.any(Error),
      );
      expect(handler.handleRequestAsyncSpy).toHaveBeenCalledTimes(2);
    });

    it('should use async error handler fallback if provided', async () => {
      const handler = new TestAsyncHandler({ maxRetries: 2 });
      const sharedData: SharedData = { input: 'fallback' };

      const result = await handler.run(sharedData);

      expect(result).toBe('default');
      expect(sharedData.output).toBe('fallback');
      expect(handler.handleErrorAsyncSpy).toHaveBeenCalledWith(
        'fallback',
        expect.any(Error),
      );
    });

    it('should handle async errors in preparation phase', async () => {
      class ErrorPrepHandler extends TestAsyncHandler {
        protected async prepareInputsAsync(
          _sharedData: Readonly<SharedData>,
        ): Promise<string> {
          throw new Error('Preparation failed');
        }
      }

      const handler = new ErrorPrepHandler();
      const sharedData: SharedData = { input: 'test' };

      await expect(handler.run(sharedData)).rejects.toThrow(
        'Preparation failed',
      );
    });

    it('should handle async errors in results processing', async () => {
      class ErrorPostHandler extends TestAsyncHandler {
        protected async processResultsAsync(
          _sharedData: SharedData,
          _inputs: string,
          _outputs: string,
        ): Promise<ActionResult> {
          throw new Error('Post-processing failed');
        }
      }

      const handler = new ErrorPostHandler();
      const sharedData: SharedData = { input: 'test' };

      await expect(handler.run(sharedData)).rejects.toThrow(
        'Post-processing failed',
      );
    });
  });

  describe('Parameter Management', () => {
    it('should merge async handler parameters into shared data', async () => {
      const handler = new TestAsyncHandler();
      handler.setParams({
        apiKey: 'secret-key',
        timeout: 5000,
        asyncMode: true,
      });

      const sharedData: SharedData = { input: 'test' };
      await handler.run(sharedData);

      expect(sharedData.apiKey).toBe('secret-key');
      expect(sharedData.timeout).toBe(5000);
      expect(sharedData.asyncMode).toBe(true);
    });
  });

  describe('Integration Patterns', () => {
    it('should work with different async input/output types', async () => {
      interface AsyncData extends SharedData {
        requests: APIRequest[];
        responses?: APIResponse[];
      }

      interface APIRequest {
        url: string;
        method: string;
      }

      interface APIResponse {
        status: number;
        data: unknown;
      }

      class AsyncAPIHandler extends AsyncHandler<
        APIRequest[],
        APIResponse[],
        AsyncData
      > {
        protected async prepareInputsAsync(
          sharedData: Readonly<AsyncData>,
        ): Promise<APIRequest[]> {
          return sharedData.requests;
        }

        protected async handleRequestAsync(
          requests: APIRequest[],
        ): Promise<APIResponse[]> {
          // Simulate async API calls
          const responses: APIResponse[] = [];
          for (const request of requests) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            responses.push({
              status: 200,
              data: `Response for ${request.url}`,
            });
          }
          return responses;
        }

        protected async processResultsAsync(
          sharedData: AsyncData,
          _inputs: APIRequest[],
          outputs: APIResponse[],
        ): Promise<ActionResult> {
          sharedData.responses = outputs;
          return 'default';
        }
      }

      const handler = new AsyncAPIHandler();
      const sharedData: AsyncData = {
        requests: [
          { url: '/api/users', method: 'GET' },
          { url: '/api/posts', method: 'GET' },
        ],
      };

      const result = await handler.run(sharedData);

      expect(result).toBe('default');
      expect(sharedData.responses).toHaveLength(2);
      expect(sharedData.responses![0].data).toBe('Response for /api/users');
    });

    it('should support conditional async routing', async () => {
      class ConditionalAsyncHandler extends TestAsyncHandler {
        protected async processResultsAsync(
          sharedData: SharedData,
          _inputs: string,
          outputs: string,
        ): Promise<ActionResult> {
          sharedData.output = outputs;

          // Simulate async condition checking
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Use standard ActionResult values
          return 'default';
        }
      }

      const handler = new ConditionalAsyncHandler();

      // Test with different inputs
      const normalData: SharedData = { input: 'normal' };
      expect(await handler.run(normalData)).toBe('default');

      const slowData: SharedData = { input: 'slow' };
      expect(await handler.run(slowData)).toBe('default');
    });
  });

  describe('Pipeline Integration', () => {
    it('should work as async handler in pipeline', async () => {
      const handler = new TestAsyncHandler();
      const sharedData: SharedData = { input: 'pipeline-test' };

      const result = await handler.run(sharedData);

      expect(result).toBe('default');
      expect(sharedData.output).toBe('async:pipeline-test');
    });
  });
});
