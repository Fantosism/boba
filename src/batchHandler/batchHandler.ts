import {
  BaseHandler,
  SharedData,
  ActionResult,
} from '@/baseHandler/baseHandler';

export interface BatchConfig {
  readonly maxConcurrency?: number; // Default: 1 (sequential)
  readonly failFast?: boolean; // Default: true (stop on first error)
  readonly retryDelayMs?: number; // Default: 0 (no delay between retries)
  readonly maxRetries?: number; // Default: 1 (no retries)
}

export interface BatchResult<TOutput> {
  readonly results: TOutput[];
  readonly errors: Error[];
  readonly successful: number;
  readonly failed: number;
  readonly totalItems: number;
}

/**
 * BatchHandler processes collections of items through the same handler logic.
 *
 * Each item in the batch goes through the same prepareInputs → handleRequest → processResults lifecycle.
 *
 * Key features:
 * - Sequential or concurrent processing
 * - Individual item error handling
 * - Configurable retry behavior per item
 * - Fail-fast or continue-on-error modes
 */
export abstract class BatchHandler<
  TInput = void,
  TOutput = unknown,
  TSharedData extends SharedData = SharedData,
> extends BaseHandler<TInput[], BatchResult<TOutput>, TSharedData> {
  // ========================================
  // PRIVATE FIELDS
  // ========================================
  private readonly config: Required<BatchConfig>;

  // ========================================
  // CONSTRUCTOR
  // ========================================
  constructor(config: BatchConfig = {}) {
    super();

    this.config = {
      maxConcurrency: config.maxConcurrency ?? 1,
      failFast: config.failFast ?? true,
      retryDelayMs: config.retryDelayMs ?? 0,
      maxRetries: config.maxRetries ?? 1,
    };
  }

  // ========================================
  // BATCH-SPECIFIC ABSTRACT METHODS
  // ========================================

  /**
   * Extract array of items to process from shared data
   */
  protected abstract prepareBatchInputs(
    sharedData: Readonly<TSharedData>,
  ): TInput[];

  /**
   * Process a single item (core batch logic)
   * This method will be called for each item in the batch
   */
  protected abstract handleSingleItem(item: TInput): TOutput | Promise<TOutput>;

  /**
   * Process batch results and determine next action
   * Called once after all items are processed (or batch fails)
   */
  protected processBatchResults(
    sharedData: TSharedData & SharedData,
    inputs: TInput[],
    outputs: BatchResult<TOutput>,
  ): ActionResult {
    return 'default';
  }

  /**
   * Handle errors for individual items
   * Return a fallback result or re-throw to fail the item
   */
  protected handleItemError(item: TInput, error: Error): TOutput {
    throw error; // Default: re-throw (item fails)
  }

  // ========================================
  // BASEHANDLER INTERFACE IMPLEMENTATION
  // ========================================

  protected prepareInputs(sharedData: Readonly<TSharedData>): TInput[] {
    return this.prepareBatchInputs(sharedData);
  }

  protected async handleRequest(
    inputs: TInput[],
  ): Promise<BatchResult<TOutput>> {
    if (inputs.length === 0) {
      return {
        results: [],
        errors: [],
        successful: 0,
        failed: 0,
        totalItems: 0,
      };
    }

    if (this.config.maxConcurrency === 1) {
      return this.processSequentially(inputs);
    } else {
      return this.processConcurrently(inputs);
    }
  }

  protected processResults(
    sharedData: TSharedData & SharedData,
    inputs: TInput[],
    outputs: BatchResult<TOutput>,
  ): ActionResult {
    return this.processBatchResults(sharedData, inputs, outputs);
  }

  // ========================================
  // BATCH PROCESSING IMPLEMENTATION
  // ========================================

  private async processSequentially(
    inputs: TInput[],
  ): Promise<BatchResult<TOutput>> {
    const results: TOutput[] = [];
    const errors: Error[] = [];

    for (const item of inputs) {
      try {
        const result = await this.processItemWithRetries(item);
        results.push(result);
      } catch (error) {
        errors.push(error as Error);

        if (this.config.failFast) {
          break;
        }
      }
    }

    return {
      results,
      errors,
      successful: results.length,
      failed: errors.length,
      totalItems: inputs.length,
    };
  }

  private async processConcurrently(
    inputs: TInput[],
  ): Promise<BatchResult<TOutput>> {
    const chunks = this.chunkArray(inputs, this.config.maxConcurrency);
    const allResults: TOutput[] = [];
    const allErrors: Error[] = [];

    for (const chunk of chunks) {
      const promises = chunk.map(async (item) => {
        try {
          const result = await this.processItemWithRetries(item);
          return { success: true, result, error: null };
        } catch (error) {
          return { success: false, result: null, error: error as Error };
        }
      });

      const chunkResults = await Promise.all(promises);

      for (const chunkResult of chunkResults) {
        if (chunkResult.success) {
          allResults.push(chunkResult.result!);
        } else {
          allErrors.push(chunkResult.error!);

          if (this.config.failFast) {
            return {
              results: allResults,
              errors: allErrors,
              successful: allResults.length,
              failed: allErrors.length,
              totalItems: inputs.length,
            };
          }
        }
      }
    }

    return {
      results: allResults,
      errors: allErrors,
      successful: allResults.length,
      failed: allErrors.length,
      totalItems: inputs.length,
    };
  }

  private async processItemWithRetries(item: TInput): Promise<TOutput> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.handleSingleItem(item);
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.config.maxRetries) {
          break;
        }

        if (this.config.retryDelayMs > 0) {
          await this.delay(this.config.retryDelayMs);
        }
      }
    }

    try {
      return this.handleItemError(item, lastError!);
    } catch (error) {
      throw error;
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ========================================
  // CONFIGURATION ACCESS
  // ========================================

  public getBatchConfig(): Readonly<BatchConfig> {
    return { ...this.config };
  }
}
