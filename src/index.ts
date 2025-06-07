/**
 * BOBA-T
 *
 * A minimal, TypeScript-first framework for building LLM workflows.
 * Zero dependencies, maximum flexibility.
 */

// Core handlers
export { BaseHandler } from './baseHandler/baseHandler';
export { Handler } from './handler/handler';
export { AsyncHandler } from './asyncHandler/asyncHandler';
export { BatchHandler } from './batchHandler/batchHandler';
export { ParallelBatchHandler } from './parallelBatchHandler/parallelBatchHandler';
export { Pipeline } from './pipeline/pipeline';
export { BatchPipeline } from './batchPipeline/batchPipeline';
export { ParallelBatchPipeline } from './parallelBatchPipeline/parallelBatchPipeline';
export { ConditionalTransition } from './conditionalTransition/conditionalTransition';

// Types and interfaces
export type {
  SharedData,
  HandlerParams,
  ActionResult,
} from './baseHandler/baseHandler';

export type { HandlerConfig } from './handler/handler';

export type { AsyncHandlerConfig } from './asyncHandler/asyncHandler';

// Re-export everything for convenience
export * from './baseHandler/baseHandler';
export * from './handler/handler';
export * from './asyncHandler/asyncHandler';
export * from './batchHandler/batchHandler';
export * from './parallelBatchHandler/parallelBatchHandler';
export * from './pipeline/pipeline';
