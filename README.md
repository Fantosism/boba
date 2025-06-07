# Boba-T

A TypeScript framework for building composable LLM workflows with handlers. Inspired by the **Graph + Shared Store** architecture pattern and designed for type safety, modularity, and ease of use.

## Features

- **Type-safe**: Full TypeScript support with generic types
- **Workflow-based**: Build complex workflows from simple handlers using graph connections
- **Shared Data**: Handlers communicate through a shared data store
- **Action-based Routing**: Connect handlers using action strings for flexible control flow
- **Async-first**: Built-in support for asynchronous operations
- **Batch processing**: Handle large datasets efficiently
- **Parallel processing**: Execute operations concurrently
- **Error handling**: Robust error handling with fallback mechanisms
- **Zero dependencies**: Lightweight with no external dependencies

## Installation

```bash
npm install boba-t
```

## Quick Start

```typescript
import { Handler, Pipeline } from 'boba-t';

interface WorkflowData extends SharedData {
  input: string;
  output?: string;
}

// Create a simple handler
class DoubleHandler extends Handler<string, string, WorkflowData> {
  protected prepareInputs(sharedData: Readonly<WorkflowData>): string {
    return sharedData.input;
  }

  protected handleRequest(input: string): string {
    return input + input; // Double the string
  }

  protected processResults(
    sharedData: WorkflowData,
    inputs: string,
    outputs: string,
  ): string {
    sharedData.output = outputs;
    return 'success';
  }
}

// Create a pipeline
const handler = new DoubleHandler();
const pipeline = new Pipeline(handler);

// Execute
const sharedData: WorkflowData = { input: 'hello' };
const action = await pipeline.run(sharedData);
console.log(sharedData.output); // "hellohello"
```

## Core Concepts

### Handlers

Handlers are the building blocks of your workflow. They follow a **3-phase lifecycle**:

1. **prepareInputs**: Extract data from shared store
2. **handleRequest**: Pure computation (core logic)
3. **processResults**: Update shared store and determine next action

```typescript
import { Handler, SharedData } from 'boba-t';

interface UserData extends SharedData {
  userId: string;
  userData?: User;
}

class FetchUserHandler extends Handler<string, User, UserData> {
  protected prepareInputs(sharedData: Readonly<UserData>): string {
    return sharedData.userId;
  }

  protected async handleRequest(userId: string): Promise<User> {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  }

  protected processResults(
    sharedData: UserData,
    inputs: string,
    outputs: User,
  ): string {
    sharedData.userData = outputs;
    return 'user_fetched';
  }
}
```

### Pipelines

Pipelines orchestrate connected handlers through action-based transitions:

```typescript
import { Pipeline } from 'boba-t';

// Create handlers
const validator = new ValidationHandler();
const processor = new ProcessingHandler();
const formatter = new FormattingHandler();

// Connect handlers with actions
validator.connectTo(processor, 'valid');
validator.connectTo(new ErrorHandler(), 'invalid');
processor.connectTo(formatter, 'success');

// Create and run pipeline
const pipeline = new Pipeline(validator);
const result = await pipeline.run(sharedData);
```

### Shared Data

All handlers share a common data store for communication:

```typescript
interface WorkflowData extends SharedData {
  userQuery: string;
  searchResults?: any[];
  response?: string;
}

const sharedData: WorkflowData = {
  userQuery: 'What is TypeScript?'
};

// Handlers can read from and write to shared data
await pipeline.run(sharedData);
console.log(sharedData.response); // Final result
```

### Batch Processing

Process collections of items through the same handler logic:

```typescript
import { BatchHandler } from 'boba-t';

class FileBatchProcessor extends BatchHandler<string, ProcessedFile, FileData> {
  protected prepareBatchInputs(sharedData: Readonly<FileData>): string[] {
    return sharedData.filenames;
  }

  protected async processSingleItem(filename: string): Promise<ProcessedFile> {
    const content = await readFile(filename);
    return { filename, content, processed: true };
  }

  protected processBatchResults(
    sharedData: FileData,
    inputs: string[],
    outputs: ProcessedFile[],
  ): string {
    sharedData.processedFiles = outputs;
    return 'batch_complete';
  }
}
```

### Parallel Processing

Execute workflows concurrently for better performance:

```typescript
import { ParallelBatchPipeline } from 'boba-t';

// Create a workflow for processing a single file
const fileWorkflow = new Pipeline(readHandler);
readHandler.connectTo(processHandler, 'success');

// Process multiple files in parallel
class ParallelFileProcessor extends ParallelBatchPipeline<FileData> {
  protected prepareBatchParams(sharedData: Readonly<FileData>): HandlerParams[] {
    return sharedData.filenames.map(filename => ({ filename }));
  }
}

const parallelProcessor = new ParallelFileProcessor(fileWorkflow);
await parallelProcessor.run({ filenames: ['file1.txt', 'file2.txt'] });
```

### Async Handlers

Handle asynchronous operations with built-in retry logic:

```typescript
import { AsyncHandler } from 'boba-t';

class APIHandler extends AsyncHandler<APIRequest, APIResponse, APIData> {
  constructor() {
    super({ maxRetries: 3, retryDelayMs: 1000 });
  }

  protected async prepareInputsAsync(sharedData: Readonly<APIData>): Promise<APIRequest> {
    return { endpoint: sharedData.endpoint, apiKey: sharedData.apiKey };
  }

  protected async handleRequestAsync(request: APIRequest): Promise<APIResponse> {
    const response = await fetch(request.endpoint, {
      headers: { 'Authorization': `Bearer ${request.apiKey}` }
    });
    return response.json();
  }

  protected async processResultsAsync(
    sharedData: APIData,
    inputs: APIRequest,
    outputs: APIResponse,
  ): Promise<string> {
    sharedData.apiResponse = outputs;
    return 'api_success';
  }
}
```

## Advanced Usage

### Error Handling

Handlers support robust error handling with fallback mechanisms:

```typescript
class RobustHandler extends Handler<Input, Output, Data> {
  constructor() {
    super({ maxRetries: 3, retryDelayMs: 1000 });
  }

  protected handleRequest(input: Input): Output {
    // This might fail
    return processInput(input);
  }

  protected handleError(input: Input, error: Error): Output {
    console.warn('Processing failed, using fallback:', error.message);
    return getFallbackResult(input);
  }

  protected processResults(
    sharedData: Data,
    inputs: Input,
    outputs: Output,
  ): string {
    return outputs.isFallback ? 'fallback_used' : 'success';
  }
}
```

### Connection Management

Build complex workflows with flexible routing:

```typescript
// Conditional routing
const analyzer = new QueryAnalyzer();
const webSearch = new WebSearchHandler();
const calculator = new CalculatorHandler();
const generator = new ResponseGenerator();

// Connect based on analysis results
analyzer.connectTo(webSearch, 'needs_search');
analyzer.connectTo(calculator, 'needs_calculation');
analyzer.connectTo(generator, 'direct_answer');

// All paths lead to response generation
webSearch.connectTo(generator, 'search_complete');
calculator.connectTo(generator, 'calculation_complete');
```

### Parameter Management

Configure handlers with parameters:

```typescript
const handler = new LLMHandler();
handler.setParams({
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 1000
});

// Parameters are automatically merged into shared data
await handler.run(sharedData);
// sharedData now contains the parameters
```

## API Reference

### BaseHandler<TInput, TOutput, TSharedData>

The foundation class for all handlers.

**Key Methods:**
- `setParams(params: HandlerParams): this` - Set handler parameters
- `connectTo(handler: BaseHandler, action?: string): BaseHandler` - Connect to next handler
- `run(sharedData: TSharedData): Promise<ActionResult>` - Execute the handler

**Lifecycle Methods (Override these):**
- `prepareInputs(sharedData: Readonly<TSharedData>): TInput` - Extract inputs
- `handleRequest(inputs: TInput): TOutput | Promise<TOutput>` - Core logic
- `processResults(sharedData: TSharedData, inputs: TInput, outputs: TOutput): ActionResult` - Update shared data

### Handler<TInput, TOutput, TSharedData>

Enhanced handler with retry logic and error handling.

**Constructor:**
- `config?: { maxRetries?: number; retryDelayMs?: number }`

**Additional Methods:**
- `handleError(inputs: TInput, error: Error): TOutput` - Error fallback

### AsyncHandler<TInput, TOutput, TSharedData>

Async-optimized handler for I/O-intensive operations.

**Async Lifecycle Methods:**
- `prepareInputsAsync(sharedData: Readonly<TSharedData>): Promise<TInput>`
- `handleRequestAsync(inputs: TInput): Promise<TOutput>`
- `processResultsAsync(sharedData: TSharedData, inputs: TInput, outputs: TOutput): Promise<ActionResult>`
- `handleErrorAsync(inputs: TInput, error: Error): Promise<TOutput>`

### BatchHandler<TInput, TOutput, TSharedData>

Process collections of items sequentially.

**Abstract Methods:**
- `prepareBatchInputs(sharedData: Readonly<TSharedData>): TInput[]`
- `processSingleItem(item: TInput): TOutput | Promise<TOutput>`
- `processBatchResults(sharedData: TSharedData, inputs: TInput[], outputs: TOutput[]): ActionResult`

### Pipeline<TStartHandler>

Orchestrates connected handlers through action-based transitions.

**Constructor:**
- `startHandler: TStartHandler` - The first handler in the workflow

**Methods:**
- `run(sharedData: SharedData): Promise<ActionResult>` - Execute the pipeline
- `getStartHandler(): BaseHandler` - Get the starting handler

### BatchPipeline<TSharedData>

Runs a complete pipeline multiple times with different parameter sets.

**Abstract Methods:**
- `prepareBatchParams(sharedData: Readonly<TSharedData>): HandlerParams[]`
- `processBatchResults(sharedData: TSharedData, inputs: HandlerParams[], outputs: void): ActionResult`

### ParallelBatchPipeline<TSharedData>

Concurrent version of BatchPipeline using Promise.all().

Same API as BatchPipeline but executes pipeline instances in parallel.

## Examples

### LLM Workflow

```typescript
interface LLMWorkflowData extends SharedData {
  userQuery: string;
  searchResults?: any[];
  response?: string;
}

class QueryAnalyzer extends Handler<string, AnalysisResult, LLMWorkflowData> {
  protected prepareInputs(sharedData: Readonly<LLMWorkflowData>): string {
    return sharedData.userQuery;
  }

  protected async handleRequest(query: string): Promise<AnalysisResult> {
    // Analyze if query needs web search
    return { needsSearch: query.includes('latest') || query.includes('current') };
  }

  protected processResults(
    sharedData: LLMWorkflowData,
    inputs: string,
    outputs: AnalysisResult,
  ): string {
    return outputs.needsSearch ? 'search' : 'direct_answer';
  }
}

class WebSearchHandler extends Handler<string, any[], LLMWorkflowData> {
  protected prepareInputs(sharedData: Readonly<LLMWorkflowData>): string {
    return sharedData.userQuery;
  }

  protected async handleRequest(query: string): Promise<any[]> {
    // Perform web search
    return await searchWeb(query);
  }

  protected processResults(
    sharedData: LLMWorkflowData,
    inputs: string,
    outputs: any[],
  ): string {
    sharedData.searchResults = outputs;
    return 'generate_response';
  }
}

class ResponseGenerator extends Handler<GenerateInput, string, LLMWorkflowData> {
  protected prepareInputs(sharedData: Readonly<LLMWorkflowData>): GenerateInput {
    return {
      query: sharedData.userQuery,
      context: sharedData.searchResults
    };
  }

  protected async handleRequest(inputs: GenerateInput): Promise<string> {
    // Generate response using LLM
    return await generateResponse(inputs.query, inputs.context);
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

// Build the workflow
const analyzer = new QueryAnalyzer();
const searcher = new WebSearchHandler();
const generator = new ResponseGenerator();

analyzer.connectTo(generator, 'direct_answer');
analyzer.connectTo(searcher, 'search');
searcher.connectTo(generator, 'generate_response');

const llmWorkflow = new Pipeline(analyzer);

// Use the workflow
const result = await llmWorkflow.run({
  userQuery: "What's the latest news about TypeScript?"
});
```

### File Processing Workflow

```typescript
class FileProcessor extends BatchPipeline<FileProcessingData> {
  protected prepareBatchParams(sharedData: Readonly<FileProcessingData>): HandlerParams[] {
    return sharedData.filenames.map(filename => ({ filename }));
  }

  protected processBatchResults(
    sharedData: FileProcessingData,
    inputs: HandlerParams[],
    outputs: void,
  ): string {
    return 'all_files_processed';
  }
}

// Create file processing workflow
const readFile = new ReadFileHandler();
const analyzeContent = new AnalyzeContentHandler();
const saveResults = new SaveResultsHandler();

readFile.connectTo(analyzeContent, 'file_read');
analyzeContent.connectTo(saveResults, 'analysis_complete');

const fileWorkflow = new Pipeline(readFile);
const batchProcessor = new FileProcessor(fileWorkflow);

await batchProcessor.run({
  filenames: ['doc1.txt', 'doc2.txt', 'doc3.txt']
});
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Apache License - see the [LICENSE](LICENSE) file for details.
