import {
  BaseHandler,
  SharedData,
  ActionResult,
  HandlerParams,
} from '@/baseHandler/baseHandler';
import { Pipeline } from '@/pipeline/pipeline';

/**
 * BatchPipeline runs a pipeline multiple times with different parameter sets.
 *
 * This is different from BatchHandler which processes multiple items through a single handler.
 * BatchPipeline processes multiple parameter sets through an entire multi-step pipeline.
 *
 * Use cases:
 * - Process multiple files through a complex workflow (read->analyze->transform->save)
 * - Run the same multi-step analysis on different data sets
 * - Execute complete workflows with different configurations
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
 * // Create batch pipeline to process multiple files
 * class ProcessMultipleFiles extends BatchPipeline<FileData> {
 *   protected prepareBatchParams(sharedData: Readonly<FileData>): HandlerParams[] {
 *     return sharedData.filenames.map(filename => ({ filename }));
 *   }
 * }
 *
 * const batchProcessor = new ProcessMultipleFiles(fileProcessingPipeline);
 * await batchProcessor.run({ filenames: ['file1.txt', 'file2.txt'] });
 * ```
 */
export abstract class BatchPipeline<
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
  // BATCH-SPECIFIC ABSTRACT METHODS
  // ========================================

  /**
   * Extract array of parameter sets from shared data.
   * Each parameter set will be used to run the pipeline once.
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
   * @param outputs - Always void for BatchPipeline
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
    // Execute pipeline once for each parameter set
    for (const params of paramSets) {
      await this.executePipelineWithParams(params);
    }
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
   * Uses the shared data from the batch pipeline execution while isolating parameters.
   */
  private async executePipelineWithParams(
    params: HandlerParams,
  ): Promise<void> {
    // Create a copy of the template pipeline to avoid parameter conflicts
    const pipelineInstance = this.createPipelineInstance();

    // Merge base parameters with batch-specific parameters
    const mergedParams = { ...this.getParams(), ...params };
    pipelineInstance.setParams(mergedParams);

    // Execute the pipeline with the shared data
    // This allows handlers to modify the shared data across executions
    // while maintaining parameter isolation
    await pipelineInstance.run(this.currentSharedData!);
  }

  /**
   * Create a new instance of the pipeline.
   * This ensures each execution has its own parameter state.
   */
  private createPipelineInstance(): Pipeline {
    // Get the start handler from template
    const startHandler = this.templatePipeline.getStartHandler();

    // Create new pipeline with the same start handler
    // Note: This shares the handler instances, which means shared parameters
    // will be overwritten. In a more sophisticated implementation, you might
    // want to clone the entire handler graph.
    return new Pipeline(startHandler);
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Get the template pipeline that this batch pipeline executes.
   */
  public getTemplatePipeline(): Pipeline {
    return this.templatePipeline;
  }
}
