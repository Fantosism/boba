import {
  BaseHandler,
  SharedData,
  ActionResult,
} from '@/baseHandler/baseHandler';

/**
 * BatchHandler processes collections of items through the same handler logic.
 *
 * Each item in the batch goes through the same processing logic sequentially.
 * This is the minimal, faithful recreation of the BatchNode pattern.
 */
export abstract class BatchHandler<
  TInput = void,
  TOutput = unknown,
  TSharedData extends SharedData = SharedData,
> extends BaseHandler<TInput[], TOutput[], TSharedData> {
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
    const results: TOutput[] = [];

    for (const item of inputs) {
      const result = await this.processSingleItem(item);
      results.push(result);
    }

    return results;
  }

  protected processResults(
    sharedData: TSharedData & SharedData,
    inputs: TInput[],
    outputs: TOutput[],
  ): ActionResult {
    return this.processBatchResults(sharedData, inputs, outputs);
  }
}
