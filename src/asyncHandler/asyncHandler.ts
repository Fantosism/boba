import {
  BaseHandler,
  SharedData,
  ActionResult,
} from '@/baseHandler/baseHandler';

export interface AsyncHandlerConfig {
  readonly maxRetries?: number; // Default: 1 (no retries)
  readonly retryDelayMs?: number; // Default: 0 (no delay)
}

/**
 * AsyncHandler provides async-optimized handler lifecycle with retry logic and error handling.
 *
 * All lifecycle methods are async-first, designed for I/O-intensive operations.
 *
 * Key features:
 * - Async lifecycle methods throughout
 * - Configurable retry behavior with async delays
 * - Async error handling and fallback mechanisms
 * - Full compatibility with Pipeline orchestration
 */
export abstract class AsyncHandler<
  TInput = void,
  TOutput = unknown,
  TSharedData extends SharedData = SharedData,
> extends BaseHandler<TInput, TOutput, TSharedData> {
  // ========================================
  // PRIVATE FIELDS
  // ========================================
  private readonly config: Required<AsyncHandlerConfig>;

  // ========================================
  // CONSTRUCTOR
  // ========================================
  constructor(config: AsyncHandlerConfig = {}) {
    super();

    this.config = {
      maxRetries: config.maxRetries ?? 1,
      retryDelayMs: config.retryDelayMs ?? 0,
    };
  }

  // ========================================
  // ASYNC LIFECYCLE METHODS (Override these)
  // ========================================

  /**
   * Phase 1: Prepare inputs from shared data (async)
   * Extract and preprocess data needed for handleRequestAsync
   */
  protected async prepareInputsAsync(
    sharedData: Readonly<TSharedData>,
  ): Promise<TInput> {
    return undefined as TInput;
  }

  /**
   * Phase 2: Handle the core request (async)
   * Pure async computation - no shared data access, must be idempotent
   */
  protected abstract handleRequestAsync(inputs: TInput): Promise<TOutput>;

  /**
   * Phase 3: Process results and determine next action (async)
   * Update shared data and return action string for routing
   */
  protected async processResultsAsync(
    sharedData: TSharedData & SharedData,
    inputs: TInput,
    outputs: TOutput,
  ): Promise<ActionResult> {
    return 'default';
  }

  /**
   * Handle errors during async request processing
   * Return a fallback result or re-throw to fail the handler
   */
  protected async handleErrorAsync(
    inputs: TInput,
    error: Error,
  ): Promise<TOutput> {
    throw error; // Default: re-throw (handler fails)
  }

  // ========================================
  // BASEHANDLER INTERFACE IMPLEMENTATION
  // ========================================

  protected prepareInputs(sharedData: Readonly<TSharedData>): TInput {
    // BaseHandler expects sync prepareInputs, but we need async
    // This will be overridden by executeAsyncLifecycle
    return undefined as TInput;
  }

  protected async handleRequest(inputs: TInput): Promise<TOutput> {
    // BaseHandler expects sync handleRequest, but we need async
    // This will be overridden by executeAsyncLifecycle
    throw new Error(
      'AsyncHandler.handleRequest() should not be called directly. Use async lifecycle.',
    );
  }

  protected processResults(
    sharedData: TSharedData & SharedData,
    inputs: TInput,
    outputs: TOutput,
  ): ActionResult {
    // BaseHandler expects sync processResults, but we need async
    // This will be overridden by executeAsyncLifecycle
    return 'default';
  }

  // ========================================
  // ASYNC EXECUTION ORCHESTRATION
  // ========================================

  /**
   * Internal async execution method that orchestrates the 3-phase async lifecycle
   */
  private async executeAsyncLifecycle(
    sharedData: TSharedData & SharedData,
  ): Promise<ActionResult> {
    const inputs: TInput = await this.prepareInputsAsync(sharedData);
    const outputs: TOutput = await this.handleRequestAsyncWithRetries(inputs);
    const action: ActionResult = await this.processResultsAsync(
      sharedData,
      inputs,
      outputs,
    );
    return action;
  }

  /**
   * Handle async request with retry logic
   */
  private async handleRequestAsyncWithRetries(
    inputs: TInput,
  ): Promise<TOutput> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.handleRequestAsync(inputs);
      } catch (error) {
        lastError = error as Error;

        // Don't retry on last attempt
        if (attempt === this.config.maxRetries) {
          break;
        }

        // Wait before retry
        if (this.config.retryDelayMs > 0) {
          await this.delay(this.config.retryDelayMs);
        }
      }
    }

    // All retries exhausted, try error handler
    try {
      return await this.handleErrorAsync(inputs, lastError!);
    } catch (error) {
      throw error; // Final failure
    }
  }

  // ========================================
  // PUBLIC API
  // ========================================

  /**
   * Execute this async handler with the given shared data.
   * Merges parameters into shared data and runs the async lifecycle.
   */
  public async run(
    sharedData: TSharedData & SharedData,
  ): Promise<ActionResult> {
    Object.assign(sharedData, this.getParams());

    return this.executeAsyncLifecycle(sharedData);
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the handler configuration
   */
  public getAsyncConfig(): Readonly<AsyncHandlerConfig> {
    return { ...this.config };
  }
}
