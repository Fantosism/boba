# BaseHandler

BaseHandler is the foundational building block of the BOBA-T framework. It provides the core abstractions for creating workflow components that follow the **Graph + Shared Store** architecture pattern inspired by PocketFlow.

## Core Concept

BaseHandler models computation as **nodes in a directed graph** where:

- **Nodes** = BaseHandler instances that perform specific tasks
- **Edges** = Action-based connections between handlers
- **Shared Store** = Common data structure for inter-node communication

Every BaseHandler follows a strict **3-phase lifecycle** that enforces separation of concerns and enables powerful composition patterns.

## Architecture Overview

```typescript
interface SharedData {
  [key: string]: unknown;
}

abstract class BaseHandler<TInput, TOutput, TSharedData extends SharedData> {
  // Phase 1: Extract data from shared store
  protected prepareInputs(sharedData: Readonly<TSharedData>): TInput;

  // Phase 2: Pure computation (must be idempotent)
  protected abstract handleRequest(inputs: TInput): TOutput | Promise<TOutput>;

  // Phase 3: Update shared store and determine next action
  protected processResults(
    sharedData: TSharedData & SharedData,
    inputs: TInput,
    outputs: TOutput,
  ): ActionResult;
}
```

## Core Features

### 1. Parameter Management

Parameters act as configuration that travels with the handler:

```typescript
const handler = new MyHandler();
handler.setParams({
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 1000,
});

// Parameters are automatically merged into shared data during execution
const sharedData = { userQuery: 'Hello' };
await handler.run(sharedData);
// sharedData now contains: { userQuery: 'Hello', model: 'gpt-4', temperature: 0.7, maxTokens: 1000 }
```

### 2. Connection Management

Build workflows by connecting handlers with action-based routing:

```typescript
const validator = new ValidationHandler();
const processor = new ProcessingHandler();
const errorHandler = new ErrorHandler();

// Connect handlers based on validation results
validator.connectTo(processor, 'valid');
validator.connectTo(errorHandler, 'invalid');

// Chain successful processing
processor.connectTo(new OutputHandler(), 'success');
processor.connectTo(new RetryHandler(), 'retry');
```

### 3. Type-Safe Shared Data

Define typed interfaces for better developer experience:

```typescript
interface WorkflowData extends SharedData {
  readonly userQuery: string;
  context?: string;
  result?: ProcessedResult;
  metadata?: { timestamp: Date; userId: string };
}

class MyHandler extends BaseHandler<InputType, OutputType, WorkflowData> {
  protected prepareInputs(sharedData: Readonly<WorkflowData>): InputType {
    // TypeScript ensures userQuery exists and is string
    return { query: sharedData.userQuery };
  }
}
```

## Basic Usage

### Simple Handler

```typescript
interface SimpleData extends SharedData {
  input: string;
  output?: string;
}

class UppercaseHandler extends BaseHandler<string, string, SimpleData> {
  protected prepareInputs(sharedData: Readonly<SimpleData>): string {
    return sharedData.input;
  }

  protected handleRequest(input: string): string {
    return input.toUpperCase();
  }

  protected processResults(
    sharedData: SimpleData & SharedData,
    inputs: string,
    outputs: string,
  ): string {
    sharedData.output = outputs;
    return 'success';
  }
}

// Usage
const handler = new UppercaseHandler();
const data: SimpleData = { input: 'hello world' };

const action = await handler.run(data);
console.log(action); // 'success'
console.log(data.output); // 'HELLO WORLD'
```

### Handler with Parameters

```typescript
class ConfigurableHandler extends BaseHandler<
  ProcessingInput,
  string,
  WorkflowData
> {
  protected prepareInputs(sharedData: Readonly<WorkflowData>): ProcessingInput {
    return {
      text: sharedData.userQuery,
      // Access parameters merged into shared data
      model: sharedData.model as string,
      temperature: sharedData.temperature as number,
    };
  }

  protected handleRequest(input: ProcessingInput): string {
    return processWithLLM(input.text, {
      model: input.model,
      temperature: input.temperature,
    });
  }

  protected processResults(
    sharedData: WorkflowData & SharedData,
    inputs: ProcessingInput,
    outputs: string,
  ): string {
    sharedData.result = outputs;
    return outputs.length > 100 ? 'long_response' : 'short_response';
  }
}

// Configure and use
const handler = new ConfigurableHandler();
handler.setParams({
  model: 'gpt-4-turbo',
  temperature: 0.8,
});
```

### Connected Handlers

```typescript
// Create workflow components
const analyzer = new QueryAnalyzer();
const searcher = new WebSearchHandler();
const generator = new ResponseGenerator();
const formatter = new OutputFormatter();

// Build the workflow graph
analyzer.connectTo(searcher, 'needs_search');
analyzer.connectTo(generator, 'direct_answer');

searcher.connectTo(generator, 'search_complete');
generator.connectTo(formatter, 'success');

// Execute the workflow (this is what Pipeline does automatically)
const sharedData: WorkflowData = { userQuery: 'What is TypeScript?' };

let currentHandler = analyzer;
let action = 'start';

while (currentHandler) {
  action = await currentHandler.run(sharedData);
  currentHandler = currentHandler.getNextHandler(action);
}

console.log('Final action:', action);
console.log('Result:', sharedData.result);
```

## Connection Management API

### Basic Connections

```typescript
// Connect handler to next handler for specific action
handler.connectTo(nextHandler, 'action_name');

// Default action (if no action specified)
handler.connectTo(defaultHandler); // Uses 'default' action

// Chain multiple connections
handler.connectTo(handlerA, 'path_a').connectTo(handlerB, 'path_b'); // Returns handlerB for chaining
```

### Inspection Methods

```typescript
// Check if handler has any connections
if (handler.hasSuccessors()) {
  console.log('Handler has connections');
}

// Get all available actions
const actions = handler.getAvailableActions();
console.log('Available actions:', actions); // ['success', 'error', 'retry']

// Get specific next handler
const nextHandler = handler.getNextHandler('success');

// Get all connections
const successors = handler.getSuccessors();
for (const [action, nextHandler] of successors) {
  console.log(`Action "${action}" -> ${nextHandler.constructor.name}`);
}

// Debug connections
console.log(handler.toString());
// Output: "MyHandler --[success]--> NextHandler"
//         "MyHandler --[error]--> ErrorHandler"
```

## Advanced Patterns

### Conditional Routing

```typescript
class SmartRouter extends BaseHandler<UserQuery, AnalysisResult, WorkflowData> {
  protected handleRequest(query: UserQuery): AnalysisResult {
    return this.analyzeQuery(query);
  }

  protected processResults(
    sharedData: WorkflowData & SharedData,
    inputs: UserQuery,
    outputs: AnalysisResult,
  ): string {
    sharedData.analysis = outputs;

    // Complex routing logic
    if (outputs.confidence > 0.9) return 'high_confidence';
    if (outputs.requiresSearch) return 'web_search';
    if (outputs.requiresCalculation) return 'math_tool';
    if (outputs.isPersonal) return 'personalized_response';

    return 'general_response';
  }
}

// Connect to different handlers for each case
const router = new SmartRouter();
router.connectTo(new DirectAnswerHandler(), 'high_confidence');
router.connectTo(new WebSearchHandler(), 'web_search');
router.connectTo(new CalculatorHandler(), 'math_tool');
router.connectTo(new PersonalizedHandler(), 'personalized_response');
router.connectTo(new GeneralHandler(), 'general_response');
```

### Parameter Inheritance

```typescript
// Set global parameters that all handlers can access
const parentHandler = new BaseProcessingHandler();
parentHandler.setParams({
  apiKey: 'secret-key',
  timeout: 30000,
  retryPolicy: 'exponential',
});

// Child handlers inherit access to these parameters
class SpecificHandler extends BaseHandler<Input, Output, SharedData> {
  protected prepareInputs(sharedData: Readonly<SharedData>): Input {
    // Access inherited parameters
    const apiKey = sharedData.apiKey as string;
    const timeout = sharedData.timeout as number;

    return { apiKey, timeout, data: sharedData.input };
  }
}
```

### Utility Methods

```typescript
// Create reusable handler builders
function createLLMHandler(model: string, temperature: number = 0.7) {
  const handler = new LLMHandler();
  handler.setParams({ model, temperature });
  return handler;
}

// Build workflow templates
function createQAWorkflow() {
  const analyzer = new QueryAnalyzer();
  const searcher = new WebSearchHandler();
  const generator = createLLMHandler('gpt-4', 0.8);

  analyzer.connectTo(searcher, 'needs_search');
  analyzer.connectTo(generator, 'direct_answer');
  searcher.connectTo(generator, 'search_complete');

  return analyzer; // Return the starting handler
}
```

## Integration with Higher-Level Components

BaseHandler is designed to be the foundation for more specialized components:

- **Handler**: Adds retry logic, error handling, and fallback mechanisms
- **BatchHandler**: Processes collections of items
- **AsyncHandler**: Optimized for async/await patterns
- **Pipeline**: Orchestrates connected handlers automatically

```typescript
// BaseHandler provides the foundation
const baseHandler = new MyBaseHandler();

// Handler adds reliability features
const reliableHandler = new MyHandler({ maxRetries: 3, retryDelayMs: 1000 });

// Pipeline orchestrates the workflow
const pipeline = new Pipeline(startingHandler);
await pipeline.run(sharedData);
```

## Best Practices

### 1. Keep `handleRequest` Pure

```typescript
// ✅ Good - Pure function, no side effects
protected handleRequest(input: string): string {
  return processText(input);
}

// ❌ Bad - Side effects and shared data access
protected handleRequest(input: string): string {
  console.log('Processing...'); // Side effect
  this.sharedData.temp = 'value'; // Accessing shared data
  return processText(input);
}
```

### 2. Use Descriptive Action Names

```typescript
// ✅ Good - Clear intent
return 'validation_passed';
return 'needs_human_review';
return 'processing_complete';

// ❌ Bad - Unclear meaning
return 'ok';
return 'done';
return 'next';
```

### 3. Define Typed Interfaces

```typescript
// ✅ Good - Explicit types
interface ChatData extends SharedData {
  readonly userMessage: string;
  readonly conversationHistory: Message[];
  response?: string;
  confidence?: number;
}

// ❌ Bad - Generic SharedData
class ChatHandler extends BaseHandler<any, any, SharedData>
```

### 4. Document Your Connections

```typescript
class DocumentedHandler extends BaseHandler<Input, Output, Data> {
  protected processResults(/* ... */): string {
    // Possible return values:
    // - "success": Processing completed successfully -> OutputHandler
    // - "retry": Temporary failure, should retry -> RetryHandler
    // - "failed": Permanent failure -> ErrorHandler
    // - "escalate": Needs human review -> HumanReviewHandler

    if (outputs.confidence > 0.9) return 'success';
    if (outputs.isRetryable) return 'retry';
    if (outputs.requiresHuman) return 'escalate';
    return 'failed';
  }
}
```

## Zero Dependencies Philosophy

- **No external packages**: Only uses TypeScript/JavaScript standard library
- **Vendor agnostic**: No assumptions about LLM providers, databases, or services
- **AI-friendly**: Simple enough for AI assistants to understand and generate reliable code
- **Minimal footprint**: Lightweight, fast startup, easy to maintain

This makes BaseHandler ideal for "agentic coding" scenarios where AI assistants need to understand and work with the framework architecture.
