export interface SharedData {
  [key: string]: unknown;
}

export interface HandlerParams {
  readonly [key: string]: unknown;
}

export type ActionResult = string;
export type SuccessorMap = Map<ActionResult, BaseHandler>;

/**
 * BaseHandler provides the minimal foundation for BOBA-T's workflow system.
 *
 * Core responsibilities:
 * - Parameter management for configuration
 * - Connection management for building graphs
 * - Basic 3-phase lifecycle (prepareInputs → handleRequest → processResults)
 * - Simple execution orchestration
 *
 * This is the base class that all workflow components extend.
 */
export abstract class BaseHandler<
  TInput = void,
  TOutput = unknown,
  TSharedData extends SharedData = SharedData,
> {
  // ========================================
  // PRIVATE FIELDS
  // ========================================
  private readonly params: HandlerParams = {};
  private readonly successors: SuccessorMap = new Map<
    ActionResult,
    BaseHandler
  >();

  // ========================================
  // PARAMETER MANAGEMENT
  // ========================================
  public setParams(newParams: HandlerParams): void {
    Object.assign(this.params as Record<string, unknown>, newParams);
  }

  public getParams(): Readonly<HandlerParams> {
    return { ...this.params };
  }

  // ========================================
  // CONNECTION MANAGEMENT
  // ========================================
  public connectTo(
    handler: BaseHandler,
    action: ActionResult = 'default',
  ): BaseHandler {
    this.successors.set(action, handler);
    return handler;
  }

  public getNextHandler(action: ActionResult): BaseHandler | undefined {
    return this.successors.get(action);
  }

  public getSuccessors(): ReadonlyMap<ActionResult, BaseHandler> {
    return new Map(this.successors);
  }

  public hasSuccessors(): boolean {
    return this.successors.size > 0;
  }

  public getAvailableActions(): readonly ActionResult[] {
    return Array.from(this.successors.keys());
  }

  // ========================================
  // CORE LIFECYCLE METHODS (Override these)
  // ========================================

  /**
   * Phase 1: Prepare inputs from shared data
   * Extract and preprocess data needed for handleRequest
   */
  protected prepareInputs(sharedData: Readonly<TSharedData>): TInput {
    return undefined as TInput;
  }

  /**
   * Phase 2: Handle the core request
   * Pure computation - no shared data access, must be idempotent
   */
  protected abstract handleRequest(inputs: TInput): TOutput | Promise<TOutput>;

  /**
   * Phase 3: Process results and determine next action
   * Update shared data and return action string for routing
   */
  protected processResults(
    sharedData: TSharedData & SharedData,
    inputs: TInput,
    outputs: TOutput,
  ): ActionResult {
    return 'default';
  }

  // ========================================
  // INTERNAL EXECUTION ORCHESTRATION
  // ========================================

  /**
   * Internal execution method that orchestrates the 3-phase lifecycle
   */
  protected async executeLifecycle(
    sharedData: TSharedData & SharedData,
  ): Promise<ActionResult> {
    const inputs: TInput = this.prepareInputs(sharedData);
    const outputs: TOutput = await this.handleRequest(inputs);
    const action: ActionResult = this.processResults(
      sharedData,
      inputs,
      outputs,
    );
    return action;
  }

  // ========================================
  // PUBLIC API
  // ========================================

  /**
   * Execute this handler with the given shared data.
   * Merges parameters into shared data and runs the lifecycle.
   */
  public async run(
    sharedData: TSharedData & SharedData,
  ): Promise<ActionResult> {
    Object.assign(sharedData, this.params);

    return this.executeLifecycle(sharedData);
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Get a string representation of this handler's connections
   */
  public toString(): string {
    const handlerName = this.constructor.name;
    const actions = this.getAvailableActions();

    if (actions.length === 0) {
      return handlerName;
    }

    const connections = actions.map((action) => {
      const next = this.getNextHandler(action);
      return `${handlerName} --[${action}]--> ${next?.constructor.name || 'null'}`;
    });

    return connections.join('\n');
  }
}
