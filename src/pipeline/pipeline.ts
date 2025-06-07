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
export class Pipeline<
  TStartHandler extends BaseHandler<unknown, unknown, SharedData> = BaseHandler<
    unknown,
    unknown,
    SharedData
  >,
> extends BaseHandler<void, ActionResult, SharedData> {
  // ========================================
  // PRIVATE FIELDS
  // ========================================
  private readonly startHandler: TStartHandler;

  // ========================================
  // CONSTRUCTOR
  // ========================================
  constructor(startHandler: TStartHandler) {
    super();

    if (!startHandler) {
      throw new Error('Start handler is required');
    }

    this.startHandler = startHandler;
  }

  // ========================================
  // PIPELINE-SPECIFIC METHODS
  // ========================================
  public getStartHandler(): BaseHandler<unknown, unknown, SharedData> {
    return this.startHandler;
  }

  // ========================================
  // METHOD CHAINING SUPPORT
  // ========================================

  /**
   * Connect this pipeline to another handler with a specific action.
   * Returns the target handler for further chaining.
   *
   * This enables: pipeline.on("success", nextHandler).on("failure", errorHandler)
   */
  public on(
    action: ActionResult,
    handler: BaseHandler<unknown, unknown, SharedData>,
  ): this {
    super.on(action, handler);
    return this;
  }

  /**
   * Connect this pipeline to another handler with default action.
   * Returns the target handler for linear chaining.
   *
   * This enables: pipeline.next(handlerB).next(handlerC)
   */
  public next(
    handler: BaseHandler<unknown, unknown, SharedData>,
  ): BaseHandler<unknown, unknown, SharedData> {
    return super.next(handler);
  }

  /**
   * Pipeline-style chaining operator for connecting pipelines sequentially.
   * Returns the target handler for further chaining.
   *
   * This enables: pipelineA.pipe(pipelineB).pipe(handlerC)
   */
  public pipe(
    handler: BaseHandler<unknown, unknown, SharedData>,
  ): BaseHandler<unknown, unknown, SharedData> {
    return super.pipe(handler);
  }

  /**
   * Conditional chaining - creates a conditional transition for the specified action.
   *
   * This enables: pipeline.when("approved").then(approvalHandler)
   */
  public when(action: ActionResult) {
    return super.when(action);
  }

  // ========================================
  // CORE ORCHESTRATION LOGIC
  // ========================================
  private async orchestrate(sharedData: SharedData): Promise<ActionResult> {
    let currentHandler: BaseHandler<unknown, unknown, SharedData> | undefined =
      this.startHandler;
    let lastAction: ActionResult = 'default';

    while (currentHandler) {
      lastAction = await currentHandler.run(sharedData);
      const nextHandler = currentHandler.getNextHandler(lastAction);

      // Warn if action not found but handler has successors
      if (!nextHandler && currentHandler.hasSuccessors()) {
        const availableActions = currentHandler.getAvailableActions();
        console.warn(
          `Flow ends: '${lastAction}' not found in [${availableActions.join(', ')}]`,
        );
      }

      currentHandler = nextHandler;
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
