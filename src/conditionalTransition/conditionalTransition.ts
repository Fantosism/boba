import {
  BaseHandler,
  SharedData,
  ActionResult,
} from '@/baseHandler/baseHandler';

/**
 * ConditionalTransition provides a fluent interface for conditional handler connections.
 *
 * // Becomes
 * handler.when("action").then(nextHandler)
 */
export class ConditionalTransition {
  private readonly sourceHandler: BaseHandler<unknown, unknown, SharedData>;
  private readonly action: ActionResult;

  constructor(
    sourceHandler: BaseHandler<unknown, unknown, SharedData>,
    action: ActionResult,
  ) {
    this.sourceHandler = sourceHandler;
    this.action = action;
  }

  /**
   * Complete the conditional connection by specifying the target handler.
   *
   * @param targetHandler - The handler to connect to for this action
   * @returns The target handler for method chaining
   */
  public then(
    targetHandler: BaseHandler<unknown, unknown, SharedData>,
  ): BaseHandler<unknown, unknown, SharedData> {
    return this.sourceHandler.connectTo(targetHandler, this.action);
  }
}
