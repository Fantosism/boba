export interface SharedData {
  [key: string]: unknown;
}

export interface HandlerParams {
  readonly [key: string]: unknown;
}

export type ActionResult = string;
export type SuccessorMap = Map<
  ActionResult,
  BaseHandler<unknown, unknown, SharedData>
>;

// Type-only import to avoid circular dependency
export interface ConditionalTransition {
  then(
    targetHandler: BaseHandler<unknown, unknown, SharedData>,
  ): BaseHandler<unknown, unknown, SharedData>;
}

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
    BaseHandler<unknown, unknown, SharedData>
  >();

  // ========================================
  // PARAMETER MANAGEMENT
  // ========================================
  public setParams(newParams: HandlerParams): this {
    Object.assign(this.params as Record<string, unknown>, newParams);
    return this;
  }

  public getParams(): Readonly<HandlerParams> {
    return { ...this.params };
  }

  // ========================================
  // CONNECTION MANAGEMENT
  // ========================================
  public connectTo(
    handler: BaseHandler<unknown, unknown, SharedData>,
    action: ActionResult = 'default',
  ): BaseHandler<unknown, unknown, SharedData> {
    this.successors.set(action, handler);
    return handler;
  }

  /**
   * Fluent interface for chaining - connects and returns this handler for further chaining
   */
  public chain(
    handler: BaseHandler<unknown, unknown, SharedData>,
    action: ActionResult = 'default',
  ): this {
    this.connectTo(handler, action);
    return this;
  }

  /**
   * Pipeline-style chaining operator for connecting handlers sequentially
   * Connects this handler to the target handler with default action
   */
  public pipe(
    handler: BaseHandler<unknown, unknown, SharedData>,
  ): BaseHandler<unknown, unknown, SharedData> {
    return this.connectTo(handler, 'default');
  }

  /**
   * Conditional chaining - creates a conditional transition for the specified action
   */
  public when(action: ActionResult): ConditionalTransition {
    return {
      then: (targetHandler: BaseHandler<unknown, unknown, SharedData>) => {
        return this.connectTo(targetHandler, action);
      },
    };
  }

  public getNextHandler(
    action: ActionResult,
  ): BaseHandler<unknown, unknown, SharedData> | undefined {
    return this.successors.get(action);
  }

  public getSuccessors(): ReadonlyMap<
    ActionResult,
    BaseHandler<unknown, unknown, SharedData>
  > {
    return new Map(this.successors);
  }

  public hasSuccessors(): boolean {
    return this.successors.size > 0;
  }

  public getAvailableActions(): readonly ActionResult[] {
    return Array.from(this.successors.keys());
  }

  public next(
    handler: BaseHandler<unknown, unknown, SharedData>,
  ): BaseHandler<unknown, unknown, SharedData> {
    this.connectTo(handler);
    return handler;
  }

  public on(
    action: ActionResult,
    handler: BaseHandler<unknown, unknown, SharedData>,
  ): this {
    if (this.successors.has(action)) {
      console.warn(`Overwriting successor for action '${action}'`);
    }
    this.connectTo(handler, action);
    return this;
  }

  public clone(): this {
    const clonedHandler = Object.create(Object.getPrototypeOf(this));
    Object.assign(clonedHandler, this);

    // Deep clone the parameters and successors
    clonedHandler.params = { ...this.params };
    clonedHandler.successors = new Map(this.successors);

    return clonedHandler;
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
    isOrchestrated = false,
  ): Promise<ActionResult> {
    // Warn if handler has successors but is being run standalone (not orchestrated)
    if (this.hasSuccessors() && !isOrchestrated) {
      console.warn("Handler won't run successors. Use Pipeline.");
    }

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
