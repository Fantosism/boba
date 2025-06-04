# Pipeline

Pipeline orchestrates a graph of Handlers through pure action-based transitions with radical simplicity.

## Philosophy: Radical Minimalism

Pipeline provides only the essential orchestration logic with no convenience methods, statistics, or utilities.

> "If you need additional features, build them yourself or use higher-level abstractions."

## Core Concept

Pipeline implements the **Graph + Shared Store** pattern:

- **Start** at designated handler
- **Execute** handler lifecycle
- **Follow** action string to next handler
- **Continue** until no successor found
- **Return** final action

## Basic Usage

### Simple Linear Workflow

```typescript
interface WorkflowData extends SharedData {
  input: string;
  output?: string;
}

class ValidateHandler extends Handler<string, boolean, WorkflowData> {
  protected prepareInputs(sharedData: Readonly<WorkflowData>): string {
    return sharedData.input;
  }

  protected handleRequest(input: string): boolean {
    return input.length > 0;
  }

  protected processResults(
    sharedData: WorkflowData,
    inputs: string,
    outputs: boolean,
  ): string {
    return outputs ? 'process' : 'error';
  }
}

class ProcessHandler extends Handler<string, string, WorkflowData> {
  protected prepareInputs(sharedData: Readonly<WorkflowData>): string {
    return sharedData.input;
  }

  protected handleRequest(input: string): string {
    return input.toUpperCase();
  }

  protected processResults(
    sharedData: WorkflowData,
    inputs: string,
    outputs: string,
  ): string {
    sharedData.output = outputs;
    return 'complete';
  }
}

// Build the graph manually (no convenience methods)
const validator = new ValidateHandler();
const processor = new ProcessHandler();
const errorHandler = new ErrorHandler();

validator.connectTo(processor, 'process');
validator.connectTo(errorHandler, 'error');

// Create and run pipeline
const pipeline = new Pipeline(validator);
const sharedData: WorkflowData = { input: 'hello' };

const finalAction = await pipeline.run(sharedData);
console.log('Result:', sharedData.output); // "HELLO"
```

### Conditional Branching

```typescript
interface DecisionData extends SharedData {
  userType: 'admin' | 'user' | 'guest';
}

class RouteHandler extends Handler<string, string, DecisionData> {
  protected prepareInputs(sharedData: Readonly<DecisionData>): string {
    return sharedData.userType;
  }

  protected handleRequest(userType: string): string {
    return `Routing ${userType}`;
  }

  protected processResults(
    sharedData: DecisionData,
    inputs: string,
    outputs: string,
  ): string {
    // Return different actions based on user type
    switch (inputs) {
      case 'admin':
        return 'admin_flow';
      case 'user':
        return 'user_flow';
      case 'guest':
        return 'guest_flow';
      default:
        return 'error';
    }
  }
}

const router = new RouteHandler();
const adminHandler = new AdminHandler();
const userHandler = new UserHandler();
const guestHandler = new GuestHandler();

// Manually connect all paths
router.connectTo(adminHandler, 'admin_flow');
router.connectTo(userHandler, 'user_flow');
router.connectTo(guestHandler, 'guest_flow');

const pipeline = new Pipeline(router);
```

## Pipeline-as-Handler Pattern

Pipelines can be used as Handlers within other pipelines:

```typescript
// Create sub-pipeline
const authStep1 = new ValidateCredentialsHandler();
const authStep2 = new CheckPermissionsHandler();
authStep1.connectTo(authStep2, 'valid');

const authPipeline = new Pipeline(authStep1);

// Use sub-pipeline as handler in main pipeline
const requestHandler = new RequestHandler();
const responseHandler = new ResponseHandler();

requestHandler.connectTo(authPipeline, 'authenticate');
authPipeline.connectTo(responseHandler, 'authorized');

const mainPipeline = new Pipeline(requestHandler);

// The main pipeline orchestrates the sub-pipeline
await mainPipeline.run(sharedData);
```

## Advanced Patterns

### Loop with Break Condition

```typescript
class LoopController extends Handler<void, string, LoopData> {
  protected prepareInputs(): void {
    return undefined;
  }

  protected handleRequest(): string {
    return 'controlling loop';
  }

  protected processResults(
    sharedData: LoopData,
    inputs: void,
    outputs: string,
  ): string {
    const count = (sharedData.count || 0) + 1;
    sharedData.count = count;

    // Break condition
    return count >= 3 ? 'break' : 'continue';
  }
}

const controller = new LoopController();
const worker = new WorkerHandler();
const finalizer = new FinalizerHandler();

// Build loop manually
controller.connectTo(worker, 'continue');
controller.connectTo(finalizer, 'break');
worker.connectTo(controller, 'loop_back');

const loopPipeline = new Pipeline(controller);
```

### Branching and Rejoining

```typescript
const splitter = new SplitterHandler();
const pathA = new PathAHandler();
const pathB = new PathBHandler();
const joiner = new JoinerHandler();

// Build branching workflow manually
splitter.connectTo(pathA, 'path_a');
splitter.connectTo(pathB, 'path_b');
pathA.connectTo(joiner, 'rejoin');
pathB.connectTo(joiner, 'rejoin');

const branchingPipeline = new Pipeline(splitter);
```

## Error Handling

Pipeline propagates errors naturally - no special error handling logic:

```typescript
class RiskyHandler extends Handler<string, string, SharedData> {
  protected handleRequest(input: string): string {
    if (input === 'fail') {
      throw new Error('Processing failed');
    }
    return `Processed: ${input}`;
  }
}

const risky = new RiskyHandler();
const pipeline = new Pipeline(risky);

try {
  await pipeline.run({ input: 'fail' });
} catch (error) {
  console.log('Pipeline failed:', error.message);
}
```

For error recovery, build it into your handlers:

```typescript
class RecoveryHandler extends Handler<string, string, SharedData> {
  constructor() {
    super({ maxRetries: 3, retryDelayMs: 1000 });
  }

  protected handleRequest(input: string): string {
    // Might fail and trigger retries
    return processWithRetries(input);
  }

  protected handleError(inputs: string, error: Error): string {
    // Fallback after retries exhausted
    return `Fallback for: ${inputs}`;
  }

  protected processResults(
    sharedData: SharedData,
    inputs: string,
    outputs: string,
  ): string {
    return outputs.includes('Fallback') ? 'recovery_path' : 'success_path';
  }
}
```

## Parameter Management

Pipeline inherits parameter functionality from BaseHandler:

```typescript
const pipeline = new Pipeline(startHandler);

// Set pipeline-level parameters
pipeline.setParams({
  apiKey: 'secret',
  timeout: 5000,
  debug: true,
});

// Parameters are merged into shared data
const sharedData = { userInput: 'hello' };
await pipeline.run(sharedData);

// All handlers can access the parameters
console.log('API Key:', sharedData.apiKey); // "secret"
```

## Real-World Example

```typescript
interface LLMWorkflowData extends SharedData {
  userQuery: string;
  searchResults?: any[];
  response?: string;
}

class AnalyzeQuery extends Handler<string, AnalysisResult, LLMWorkflowData> {
  protected prepareInputs(sharedData: Readonly<LLMWorkflowData>): string {
    return sharedData.userQuery;
  }

  protected async handleRequest(query: string): Promise<AnalysisResult> {
    const analysis = await callLLM(`Analyze: ${query}`);
    return {
      needsSearch: analysis.confidence < 0.8,
      intent: analysis.intent,
    };
  }

  protected processResults(
    sharedData: LLMWorkflowData,
    inputs: string,
    outputs: AnalysisResult,
  ): string {
    return outputs.needsSearch ? 'search' : 'direct_answer';
  }
}

class WebSearch extends Handler<string, any[], LLMWorkflowData> {
  protected prepareInputs(sharedData: Readonly<LLMWorkflowData>): string {
    return sharedData.userQuery;
  }

  protected async handleRequest(query: string): Promise<any[]> {
    return await searchWeb(query);
  }

  protected processResults(
    sharedData: LLMWorkflowData,
    inputs: string,
    outputs: any[],
  ): string {
    sharedData.searchResults = outputs;
    return 'generate_answer';
  }
}

class GenerateAnswer extends Handler<GenerateInput, string, LLMWorkflowData> {
  protected prepareInputs(
    sharedData: Readonly<LLMWorkflowData>,
  ): GenerateInput {
    return {
      query: sharedData.userQuery,
      searchResults: sharedData.searchResults,
    };
  }

  protected async handleRequest(inputs: GenerateInput): Promise<string> {
    const context = inputs.searchResults
      ? `Context: ${JSON.stringify(inputs.searchResults)}\n`
      : '';

    return await callLLM(`${context}Question: ${inputs.query}\nAnswer:`);
  }

  protected processResults(
    sharedData: LLMWorkflowData,
    inputs: GenerateInput,
    outputs: string,
  ): string {
    sharedData.response = outputs;
    return 'complete';
  }
}

// Build the LLM workflow manually
const analyzer = new AnalyzeQuery();
const searcher = new WebSearch();
const generator = new GenerateAnswer();

analyzer.connectTo(generator, 'direct_answer');
analyzer.connectTo(searcher, 'search');
searcher.connectTo(generator, 'generate_answer');

const llmWorkflow = new Pipeline(analyzer);

// Use it
const result = await llmWorkflow.run({
  userQuery: "What's new in TypeScript 5.0?",
});
```

## What Pipeline Does NOT Provide

In keeping with PocketFlow's minimalism, Pipeline intentionally omits:

- ❌ **Statistics or monitoring** - Build your own if needed
- ❌ **Visualization tools** - Manual graph inspection only
- ❌ **Convenience methods** - Build graphs manually using `connectTo()`
- ❌ **Built-in error recovery** - Handle errors in your handlers
- ❌ **State management** - Shared data is your state
- ❌ **Validation or debugging** - Keep it simple
- ❌ **Complex orchestration patterns** - Compose simple patterns yourself

## Core API

Pipeline provides only the essential methods:

```typescript
class Pipeline extends BaseHandler {
  constructor(startHandler: BaseHandler); // Create pipeline
  getStartHandler(): BaseHandler; // Access start handler
  async run(sharedData: SharedData): ActionResult; // Execute pipeline

  // Inherited from BaseHandler:
  setParams(params: HandlerParams): void; // Set parameters
  connectTo(handler: BaseHandler, action: string); // Connect as handler
}
```

## Best Practices

### 1. Build Graphs Explicitly

```typescript
// ✅ Good - Clear, explicit connections
handlerA.connectTo(handlerB, 'success');
handlerA.connectTo(errorHandler, 'error');

// ❌ Avoid - No convenience methods in minimal Pipeline
// Pipeline.chain(a, b, c) // Not available
```

### 2. Use Descriptive Actions

```typescript
// ✅ Good - Clear intentions
return 'validation_passed';
return 'needs_human_review';
return 'processing_complete';

// ❌ Bad - Unclear
return 'ok';
return 'next';
```

### 3. Handle Errors in Handlers

```typescript
// ✅ Good - Error handling in handlers, not pipeline
class RobustHandler extends Handler {
  protected handleError(inputs: any, error: Error): any {
    return this.getFallbackResult(inputs);
  }
}
```

### 4. Keep Shared Data Simple

```typescript
// ✅ Good - Simple, flat shared data
interface WorkflowData extends SharedData {
  input: string;
  result?: string;
  error?: string;
}

// ❌ Avoid - Complex nested structures
interface ComplexData extends SharedData {
  deeply: { nested: { complex: { structure: any } } };
}
```

## Integration with BOBA-T

Pipeline works seamlessly with all BOBA-T components:

- **BaseHandler**: Pipeline extends BaseHandler, inherits all functionality
- **Handler**: Full compatibility with retry logic and error handling
- **Parameter System**: Pipeline parameters merge with shared data
- **Type Safety**: Full TypeScript support with generic shared data

By providing only essential orchestration logic, it forces you to build exactly what you need, resulting in more maintainable and understandable workflows.
