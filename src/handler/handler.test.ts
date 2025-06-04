import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Handler } from './handler';
import { SharedData } from '@/baseHandler/baseHandler';

type ActionResult = 'success' | 'failure';

class TestHandler extends Handler<string, string, SharedData> {
  public handleRequestSpy = vi.fn();
  public handleErrorSpy = vi.fn();

  protected prepareInputs(sharedData: SharedData): string {
    return sharedData.input as string;
  }

  protected async handleRequest(input: string): Promise<string> {
    this.handleRequestSpy(input);
    if (input === 'fail' || input === 'fallback') throw new Error(input);
    return `ok:${input}`;
  }

  protected processResults(
    sharedData: SharedData,
    input: string,
    output: string,
  ): ActionResult {
    if (input === 'fallback' && output === 'fallback') {
      sharedData.output = 'fallback';
    } else {
      sharedData.output = output;
    }
    return 'success';
  }

  protected handleError(input: string, error: Error): string {
    this.handleErrorSpy(input, error);
    if (input === 'fallback') return 'fallback';
    throw error;
  }
}

describe('Handler', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use default config if none provided', () => {
    const handler = new TestHandler();
    expect(handler['config']).toEqual({ maxRetries: 1, retryDelayMs: 0 });
  });

  it('should use provided config', () => {
    const handler = new TestHandler({ maxRetries: 3, retryDelayMs: 50 });
    expect(handler['config']).toEqual({ maxRetries: 3, retryDelayMs: 50 });
  });

  it('should execute basic lifecycle successfully', async () => {
    const handler = new TestHandler();
    const sharedData: SharedData = { input: 'test' };

    const result = await handler.run(sharedData);

    expect(result).toBe('success');
    expect(sharedData.output).toBe('ok:test');
    expect(handler.handleRequestSpy).toHaveBeenCalledWith('test');
  });

  it('should retry handleRequest up to maxRetries', async () => {
    let attempts = 0;
    class RetryHandler extends TestHandler {
      protected async handleRequest(input: string): Promise<string> {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return `ok:${input}`;
      }
    }

    const handler = new RetryHandler({ maxRetries: 3 });
    const sharedData: SharedData = { input: 'foo' };

    const result = await handler.run(sharedData);

    expect(result).toBe('success');
    expect(sharedData.output).toBe('ok:foo');
    expect(attempts).toBe(3);
  });

  it('should delay between retries if retryDelayMs > 0', async () => {
    vi.useFakeTimers();
    let attempts = 0;

    class DelayHandler extends TestHandler {
      protected async handleRequest(input: string): Promise<string> {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return `ok:${input}`;
      }
    }

    const handler = new DelayHandler({ maxRetries: 2, retryDelayMs: 100 });
    const sharedData: SharedData = { input: 'bar' };

    const promise = handler.run(sharedData);

    // First attempt should happen immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1);

    // Second attempt should happen after delay
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(attempts).toBe(2);
    expect(sharedData.output).toBe('ok:bar');

    vi.useRealTimers();
  });

  it('should call handleError on final retry failure and throw if not handled', async () => {
    const handler = new TestHandler({ maxRetries: 2 });
    const sharedData: SharedData = { input: 'fail' };

    await expect(handler.run(sharedData)).rejects.toThrow('fail');

    expect(handler.handleErrorSpy).toHaveBeenCalledWith(
      'fail',
      expect.any(Error),
    );
    expect(handler.handleRequestSpy).toHaveBeenCalledTimes(2);
  });

  it('should use handleError fallback if provided', async () => {
    const handler = new TestHandler({ maxRetries: 2 });
    const sharedData: SharedData = { input: 'fallback' };

    const result = await handler.run(sharedData);

    expect(result).toBe('success');
    expect(sharedData.output).toBe('fallback');
    expect(handler.handleErrorSpy).toHaveBeenCalledWith(
      'fallback',
      expect.any(Error),
    );
  });

  it('should merge parameters into shared data before execution', async () => {
    class ParameterHandler extends TestHandler {
      protected prepareInputs(sharedData: SharedData): string {
        expect(sharedData.model).toBe('gpt-4');
        expect(sharedData.temperature).toBe(0.7);
        return sharedData.input as string;
      }
    }

    const handler = new ParameterHandler();
    handler.setParams({ model: 'gpt-4', temperature: 0.7 });

    const sharedData: SharedData = { input: 'test' };
    await handler.run(sharedData);

    expect(sharedData.model).toBe('gpt-4');
    expect(sharedData.temperature).toBe(0.7);
  });

  it('should handle async handleRequest correctly', async () => {
    class AsyncHandler extends TestHandler {
      protected async handleRequest(input: string): Promise<string> {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return `async:${input}`;
      }
    }

    const handler = new AsyncHandler();
    const sharedData: SharedData = { input: 'async-test' };

    const result = await handler.run(sharedData);

    expect(result).toBe('success');
    expect(sharedData.output).toBe('async:async-test');
  });

  it('should respect maxRetries limit', async () => {
    let attempts = 0;
    class AlwaysFailHandler extends TestHandler {
      protected async handleRequest(input: string): Promise<string> {
        attempts++;
        throw new Error('always fails');
      }
    }

    const handler = new AlwaysFailHandler({ maxRetries: 3 });
    const sharedData: SharedData = { input: 'fail' };

    await expect(handler.run(sharedData)).rejects.toThrow('always fails');
    expect(attempts).toBe(3);
  });
});
