import {
  BaseHandler,
  SharedData,
  ActionResult,
} from '@/baseHandler/baseHandler';

/**
 * ParallelBatchHandler processes collections of items concurrently using Promise.all().
 *
 * This is ideal for I/O-bound operations where items can be processed independently.
 * All items in the batch are processed simultaneously, which can significantly improve
 * performance for operations like API calls, database queries, or file I/O.
 *
 * ⚠️ Important Considerations:
 * - Ensure tasks are independent (no dependencies between items)
 * - Be aware of rate limits when making external API calls
 * - Consider memory usage with large batches
 * - Use regular BatchHandler if items must be processed sequentially
 */
export abstract class ParallelBatchHandler<
  TInput = void,
  TOutput = unknown,
  TSharedData extends SharedData = SharedData,
> extends BaseHandler<TInput[], TOutput[], TSharedData> {
  // ========================================
  // PARALLEL BATCH-SPECIFIC ABSTRACT METHODS
  // ========================================

  /**
   * Extract array of items to process from shared data
   */
  protected abstract prepareBatchInputs(
    sharedData: Readonly<TSharedData>,
  ): TInput[];

  /**
   * Process a single item (core batch logic)
   * This will be called concurrently for all items
   */
  protected abstract processSingleItem(
    item: TInput,
  ): TOutput | Promise<TOutput>;

  /**
   * Process batch results and determine next action
   */
  protected processBatchResults(
    sharedData: TSharedData & SharedData,
    inputs: TInput[],
    outputs: TOutput[],
  ): ActionResult {
    return 'default';
  }

  // ========================================
  // BASEHANDLER INTERFACE IMPLEMENTATION
  // ========================================

  protected prepareInputs(sharedData: Readonly<TSharedData>): TInput[] {
    return this.prepareBatchInputs(sharedData);
  }

  protected async handleRequest(inputs: TInput[]): Promise<TOutput[]> {
    const promises = inputs.map((item) => this.processSingleItem(item));
    return Promise.all(promises);
  }

  protected processResults(
    sharedData: TSharedData & SharedData,
    inputs: TInput[],
    outputs: TOutput[],
  ): ActionResult {
    return this.processBatchResults(sharedData, inputs, outputs);
  }
}
