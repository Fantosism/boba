import {
  BaseHandler,
  SharedData,
  ActionResult,
} from '@/baseHandler/baseHandler';

/**
 * Pipeline orchestrates a graph of Handlers, executing them based on action transitions.
 *
 * Core responsibilities:
 * - Start at designated handler
 * - Follow action strings to transition between handlers
 * - Continue until no successor is found
 * - Can be used as a Handler itself (Pipeline-as-Handler pattern)
 * - Maintain shared data throughout execution
 *
 */
export class Pipeline extends BaseHandler<void, ActionResult, SharedData> {
  // ========================================
  // PRIVATE FIELDS
  // ========================================
  private readonly startHandler: BaseHandler;

  // ========================================
  // CONSTRUCTOR
  // ========================================
  constructor(startHandler: BaseHandler) {
    super();

    if (!startHandler) {
      throw new Error('Start handler is required');
    }

    this.startHandler = startHandler;
  }

  // ========================================
  // PIPELINE-SPECIFIC METHODS
  // ========================================
  public getStartHandler(): BaseHandler {
    return this.startHandler;
  }

  // ========================================
  // CORE ORCHESTRATION LOGIC
  // ========================================
  private async orchestrate(sharedData: SharedData): Promise<ActionResult> {
    let currentHandler: BaseHandler | undefined = this.startHandler;
    let lastAction: ActionResult = 'default';

    while (currentHandler) {
      lastAction = await currentHandler.run(sharedData);
      currentHandler = currentHandler.getNextHandler(lastAction);
    }

    return lastAction;
  }

  // ========================================
  // BASEHANDLER INTERFACE IMPLEMENTATION
  // When Pipeline is used as a Handler (Pipeline-as-Handler)
  // ========================================
  protected prepareInputs(sharedData: Readonly<SharedData>): void {
    // Pipeline doesn't need to prepare inputs - it orchestrates other handlers
    return undefined;
  }

  protected async handleRequest(inputs: void): Promise<ActionResult> {
    // This shouldn't be called when Pipeline is used standalone
    // But it's required by the BaseHandler interface
    throw new Error(
      'Pipeline.handleRequest() should not be called directly. Use run() instead.',
    );
  }

  protected processResults(
    sharedData: SharedData,
    inputs: void,
    outputs: ActionResult,
  ): ActionResult {
    // When Pipeline is used as a Handler, just pass through the orchestration result
    return outputs;
  }

  // ========================================
  // PUBLIC API
  // ========================================

  /**
   * Execute this pipeline with the given shared data.
   *
   * Pipeline can be used in two ways:
   * 1. Standalone: pipeline.run(sharedData) - direct orchestration
   * 2. As Handler: parentPipeline contains this pipeline - uses BaseHandler.run()
   */
  public async run(sharedData: SharedData): Promise<ActionResult> {
    Object.assign(sharedData, this.getParams());

    return this.orchestrate(sharedData);
  }
}
