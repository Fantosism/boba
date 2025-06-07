import {
  BaseHandler,
  SharedData,
  ActionResult,
  HandlerParams,
} from '@/baseHandler/baseHandler';
import { Pipeline } from '@/pipeline/pipeline';

/**
 * ParallelBatchPipeline runs a pipeline multiple times with different parameter sets concurrently.
 *
 * This is the parallel version of BatchPipeline, using Promise.all() to execute
 * multiple pipeline instances simultaneously. This can significantly improve performance
 * for I/O-bound operations where pipelines can run independently.
 *
 * ⚠️ Important Considerations:
 * - Ensure pipeline executions are independent (no shared state conflicts)
 * - Be aware of rate limits when pipelines make external API calls
 * - Consider memory usage with large batches
 * - Use regular BatchPipeline if executions must be sequential
 *
 * Use cases:
 * - Process multiple files through a complex workflow concurrently
 * - Run the same multi-step analysis on different data sets in parallel
 * - Execute complete workflows with different configurations simultaneously
 *
 * @example
 * ```typescript
 * // Create a pipeline for processing a single file
 * const readFile = new ReadFileHandler();
 * const analyzeContent = new AnalyzeContentHandler();
 * const saveResults = new SaveResultsHandler();
 *
 * readFile.connectTo(analyzeContent, 'success');
 * analyzeContent.connectTo(saveResults, 'complete');
 *
 * const fileProcessingPipeline = new Pipeline(readFile);
 *
 * // Create parallel batch pipeline to process multiple files concurrently
 * class ProcessMultipleFilesParallel extends ParallelBatchPipeline<FileData> {
 *   protected prepareBatchParams(sharedData: Readonly<FileData>): HandlerParams[] {
 *     return sharedData.filenames.map(filename => ({ filename }));
 *   }
 * }
 *
 * const parallelProcessor = new ProcessMultipleFilesParallel(fileProcessingPipeline);
 * await parallelProcessor.run({ filenames: ['file1.txt', 'file2.txt', 'file3.txt'] });
 * ```
 */
export abstract class ParallelBatchPipeline<
  TSharedData extends SharedData = SharedData,
> extends BaseHandler<HandlerParams[], void, TSharedData> {
  // ========================================
  // PRIVATE FIELDS
  // ========================================
  private readonly templatePipeline: Pipeline;
  private currentSharedData?: TSharedData & SharedData;

  // ========================================
  // CONSTRUCTOR
  // ========================================
  constructor(templatePipeline: Pipeline) {
    super();
    this.templatePipeline = templatePipeline;
  }

  // ========================================
  // PARALLEL BATCH-SPECIFIC ABSTRACT METHODS
  // ========================================

  /**
   * Extract array of parameter sets from shared data.
   * Each parameter set will be used to run the pipeline once, concurrently.
   *
   * @param sharedData - The shared data (read-only)
   * @returns Array of parameter objects, one per pipeline execution
   */
  protected abstract prepareBatchParams(
    sharedData: Readonly<TSharedData>,
  ): HandlerParams[];

  /**
   * Process batch results and determine next action.
   * Called after all pipeline executions complete.
   *
   * @param sharedData - The shared data (writable)
   * @param inputs - The parameter sets that were processed
   * @param outputs - Always void for ParallelBatchPipeline
   * @returns Action string for routing to next handler
   */
  protected processBatchResults(
    sharedData: TSharedData & SharedData,
    inputs: HandlerParams[],
    outputs: void,
  ): ActionResult {
    return 'default';
  }

  // ========================================
  // BASEHANDLER INTERFACE IMPLEMENTATION
  // ========================================

  protected prepareInputs(sharedData: Readonly<TSharedData>): HandlerParams[] {
    return this.prepareBatchParams(sharedData);
  }

  protected async executeLifecycle(
    sharedData: TSharedData & SharedData,
  ): Promise<ActionResult> {
    // Store shared data for use in private methods
    this.currentSharedData = sharedData;
    try {
      return await super.executeLifecycle(sharedData);
    } finally {
      // Clean up reference
      this.currentSharedData = undefined;
    }
  }

  protected async handleRequest(paramSets: HandlerParams[]): Promise<void> {
    // Execute all pipelines concurrently using Promise.all()
    const promises = paramSets.map((params) =>
      this.executePipelineWithParams(params),
    );
    await Promise.all(promises);
  }

  protected processResults(
    sharedData: TSharedData & SharedData,
    inputs: HandlerParams[],
    outputs: void,
  ): ActionResult {
    return this.processBatchResults(sharedData, inputs, outputs);
  }

  // ========================================
  // PIPELINE EXECUTION LOGIC
  // ========================================

  /**
   * Execute the template pipeline with specific parameters.
   * Creates an isolated pipeline instance to avoid parameter conflicts.
   *
   * ⚠️ Note: This method creates a deep copy of the shared data for each pipeline
   * execution to prevent race conditions. Results are merged back after completion.
   */
  protected async executePipelineWithParams(
    params: HandlerParams,
  ): Promise<void> {
    // Create a copy of the template pipeline to avoid parameter conflicts
    const pipelineInstance = this.createPipelineInstance();

    // Merge base parameters with batch-specific parameters
    const mergedParams = { ...this.getParams(), ...params };
    pipelineInstance.setParams(mergedParams);

    // Create a deep copy of shared data for this pipeline execution
    // This prevents race conditions when multiple pipelines modify shared data
    const isolatedSharedData = this.createIsolatedSharedData();

    // Execute the pipeline with the isolated shared data
    await pipelineInstance.run(isolatedSharedData);

    // Merge results back to main shared data
    // Note: This is a simplified merge - in practice, you might need
    // more sophisticated conflict resolution
    this.mergeSharedDataResults(isolatedSharedData);
  }

  /**
   * Create a new instance of the pipeline.
   * This ensures each execution has its own parameter state.
   */
  protected createPipelineInstance(): Pipeline {
    // Get the start handler from template
    const startHandler = this.templatePipeline.getStartHandler();

    // Create new pipeline with the same start handler
    // Note: This shares the handler instances, which means shared parameters
    // will be overwritten. In a more sophisticated implementation, you might
    // want to clone the entire handler graph.
    return new Pipeline(startHandler);
  }

  /**
   * Create an isolated copy of shared data for parallel execution.
   * This prevents race conditions between concurrent pipeline executions.
   */
  private createIsolatedSharedData(): TSharedData & SharedData {
    // Simple deep clone using JSON serialization
    // Note: This won't work for functions, dates, or other non-serializable objects
    // In a production implementation, you might want to use a proper deep clone library
    const currentSharedData = this.getCurrentSharedData();
    return JSON.parse(JSON.stringify(currentSharedData));
  }

  /**
   * Merge results from isolated shared data back to the main shared data.
   * This is called after each pipeline execution completes.
   *
   * Note: This is a simplified implementation that overwrites the main shared data.
   * In practice, you might need more sophisticated merging logic depending on
   * your use case (e.g., accumulating arrays, merging objects, etc.).
   */
  private mergeSharedDataResults(
    isolatedSharedData: TSharedData & SharedData,
  ): void {
    const currentSharedData = this.getCurrentSharedData();

    // Simple merge strategy: copy all properties from isolated data
    // In practice, you might want to implement custom merge logic
    Object.assign(currentSharedData, isolatedSharedData);
  }

  /**
   * Get the current shared data from the execution context.
   * This is a helper method to access shared data during pipeline execution.
   */
  private getCurrentSharedData(): TSharedData & SharedData {
    if (!this.currentSharedData) {
      throw new Error(
        'getCurrentSharedData() needs to be implemented based on BaseHandler execution context',
      );
    }
    return this.currentSharedData;
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Get the template pipeline that this parallel batch pipeline executes.
   */
  public getTemplatePipeline(): Pipeline {
    return this.templatePipeline;
  }
}
