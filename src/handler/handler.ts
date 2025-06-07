import {
  BaseHandler,
  SharedData,
  ActionResult,
} from '@/baseHandler/baseHandler';

export interface HandlerConfig {
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;
}

/**
 * Handler extends BaseHandler with retry logic and error handling capabilities.
 *
 * This is the enhanced version that provides:
 * - Configurable retry logic for handleRequest failures
 * - Custom error handling with fallback responses
 * - Retry delays for rate limiting scenarios
 *
 * For simpler use cases without retry logic, use BaseHandler directly.
 */
export abstract class Handler<
  TInput = void,
  TOutput = unknown,
  TSharedData extends SharedData = SharedData,
> extends BaseHandler<TInput, TOutput, TSharedData> {
  // ========================================
  // PROTECTED FIELDS (for testing access)
  // ========================================
  protected readonly config: Required<HandlerConfig>;
  protected currentRetry: number = 0;

  // ========================================
  // CONSTRUCTOR
  // ========================================
  constructor(config: HandlerConfig = {}) {
    super();
    this.config = {
      maxRetries: config.maxRetries ?? 1,
      retryDelayMs: config.retryDelayMs ?? 0,
    };
  }

  // ========================================
  // ERROR HANDLING
  // ========================================
  protected handleError(inputs: TInput, error: Error): TOutput {
    throw error;
  }

  // ========================================
  // ENHANCED EXECUTION WITH RETRY LOGIC
  // ========================================
  private async executeWithRetry(inputs: TInput): Promise<TOutput> {
    let lastError: Error | undefined;

    for (
      this.currentRetry = 0;
      this.currentRetry < this.config.maxRetries;
      this.currentRetry++
    ) {
      try {
        const result: TOutput = await this.handleRequest(inputs);
        this.currentRetry = 0; // Reset on success
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If this is the last attempt, use error handler
        if (this.currentRetry === this.config.maxRetries - 1) {
          const fallbackResult = this.handleError(inputs, lastError);
          this.currentRetry = 0; // Reset after final attempt
          return fallbackResult;
        }

        // Wait before retrying if configured
        if (this.config.retryDelayMs > 0) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, this.config.retryDelayMs),
          );
        }
      }
    }

    // This should never be reached due to the loop logic, but TypeScript needs it
    this.currentRetry = 0; // Reset on unexpected exit
    throw (
      lastError ?? new Error('Unknown error occurred during retry execution')
    );
  }

  // ========================================
  // OVERRIDE LIFECYCLE EXECUTION WITH RETRY
  // ========================================
  protected async executeLifecycle(
    sharedData: TSharedData & SharedData,
  ): Promise<ActionResult> {
    const inputs: TInput = this.prepareInputs(sharedData);
    const outputs: TOutput = await this.executeWithRetry(inputs);
    const action: ActionResult = this.processResults(
      sharedData,
      inputs,
      outputs,
    );
    return action;
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Get the handler configuration
   */
  public getConfig(): Readonly<HandlerConfig> {
    return { ...this.config };
  }
}
