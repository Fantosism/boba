# Handler

Handler extends BaseHandler with **robust error handling**, **automatic retries**, and **fallback mechanisms**. It's the production-ready building block for reliable BOBA-T workflows.

## Key Features

- **Automatic Retries**: Configurable retry attempts with exponential backoff
- **Error Handling**: Custom fallback logic when requests fail
- **Production Ready**: Built-in reliability patterns for real-world applications
- **Zero Breaking Changes**: Fully compatible with BaseHandler API

## Core Enhancements Over BaseHandler

### 1. Retry Configuration

```typescript
interface HandlerConfig {
  maxRetries?: number;     // Default: 1 (no retries)
  retryDelayMs?: number;   // Default: 0 (no delay)
}

// Configure retry behavior
const handler = new LLMHandler({
  maxRetries: 3,      // Try up to 3 times total
  retryDelayMs: 1000  // Wait 1 second between retries
});
```

### 2. Custom Error Handling

Override `handleError` to provide fallback responses instead of crashing:

```typescript
class RobustLLMHandler extends Handler<LLMInput, LLMOutput, LLMData> {
  protected async handleRequest(inputs: LLMInput): Promise<LLMOutput> {
    const response = await callLLM(inputs.prompt); // Might fail due to rate limits
    return {
      text: response.text,
      tokensUsed: response.usage.total_tokens,
    };
  }

  protected handleError(inputs: LLMInput, error: Error): LLMOutput {
    // Provide fallback instead of crashing the entire workflow
    console.warn('LLM call failed, using fallback:', error.message);
    
    return {
      text: "I'm sorry, I'm having trouble processing your request right now. Please try again later.",
      tokensUsed: 0,
    };
  }

  protected processResults(
    sharedData: LLMData & SharedData,
    inputs: LLMInput,
    outputs: LLMOutput,
  ): string {
    sharedData.response = outputs.text;
    
    // Route differently if we used the fallback
    return outputs.tokensUsed > 0 ? 'success' : 'fallback_used';
  }
}
```

## Usage Examples

### Basic Handler with Retries

```typescript
interface ProcessingData extends SharedData {
  userInput: string;
  result?: string;
  attempts?: number;
}

class WebAPIHandler extends Handler<APIRequest, APIResponse, ProcessingData> {
  constructor() {
    super({
      maxRetries: 3,        // Retry API calls up to 3 times
      retryDelayMs: 2000    // Wait 2 seconds between retries (for rate limits)
    });
  }

  protected prepareInputs(sharedData: Readonly<ProcessingData>): APIRequest {
    return {
      query: sharedData.userInput,
      apiKey: sharedData.apiKey as string,
    };
  }

  protected async handleRequest(request: APIRequest): Promise<APIResponse> {
    // This might fail due to network issues, rate limits, etc.
    const response = await fetch(`https://api.example.com/search?q=${request.query}`, {
      headers: { 'Authorization': `Bearer ${request.apiKey}` }
    });
    
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }
    
    return response.json();
  }

  protected processResults(
    sharedData: ProcessingData & SharedData,
    inputs: APIRequest,
    outputs: APIResponse,
  ): string {
    sharedData.result = outputs.data;
    sharedData.attempts = (sharedData.attempts || 0) + 1;
    
    return outputs.data.length > 0 ? 'success' : 'no_results';
  }

  protected handleError(inputs: APIRequest, error: Error): APIResponse {
    // Log the error and provide a fallback
    console.error('API call failed after retries:', error.message);
    
    return {
      data: [],
      error: `Search service temporarily unavailable: ${error.message}`,
      fallback: true
    };
  }
}

// Usage
const handler = new WebAPIHandler();
const data: ProcessingData = {
  userInput: 'TypeScript tutorials',
  apiKey: 'your-api-key'
};

const action = await handler.run(data);
if (action === 'success') {
  console.log('Results:', data.result);
} else {
  console.log('No results or used fallback');
}
```

### LLM Handler with Smart Fallbacks

```typescript
interface LLMData extends SharedData {
  userQuery: string;
  context?: string;
  response?: string;
  model?: string;
  temperature?: number;
}

class SmartLLMHandler extends Handler<LLMInput, LLMOutput, LLMData> {
  constructor() {
    super({
      maxRetries: 2,         // Try twice before fallback
      retryDelayMs: 1500     // Wait for rate limit reset
    });
  }

  protected prepareInputs(sharedData: Readonly<LLMData>): LLMInput {
    const context = sharedData.context 
      ? `Context: ${sharedData.context}\n\n`
      : '';
      
    return {
      prompt: `${context}User: ${sharedData.userQuery}\nAssistant:`,
      model: sharedData.model || 'gpt-3.5-turbo',
      temperature: sharedData.temperature || 0.7,
    };
  }

  protected async handleRequest(inputs: LLMInput): Promise<LLMOutput> {
    const response = await callOpenAI({
      model: inputs.model,
      messages: [{ role: 'user', content: inputs.prompt }],
      temperature: inputs.temperature,
    });

    return {
      text: response.choices[0].message.content,
      tokensUsed: response.usage.total_tokens,
      model: inputs.model,
    };
  }

  protected processResults(
    sharedData: LLMData & SharedData,
    inputs: LLMInput,
    outputs: LLMOutput,
  ): string {
    sharedData.response = outputs.text;

    // Smart routing based on response content
    if (outputs.text.toLowerCase().includes("i don't know")) {
      return 'needs_search';
    }
    
    if (outputs.text.toLowerCase().includes("calculation") || 
        outputs.text.includes("math")) {
      return 'needs_calculator';
    }
    
    return 'success';
  }

  protected handleError(inputs: LLMInput, error: Error): LLMOutput {
    console.warn(`LLM call failed for model ${inputs.model}:`, error.message);
    
    // Try to provide a helpful fallback response
    if (error.message.includes('rate limit')) {
      return {
        text: "I'm currently experiencing high demand. Please try your question again in a moment.",
        tokensUsed: 0,
        model: inputs.model,
        fallback: true
      };
    }
    
    if (error.message.includes('context length')) {
      return {
        text: "Your question is quite complex. Could you try breaking it into smaller parts?",
        tokensUsed: 0,
        model: inputs.model,
        fallback: true
      };
    }
    
    return {
      text: "I'm sorry, I'm having technical difficulties right now. Please try again later.",
      tokensUsed: 0,
      model: inputs.model,
      fallback: true
    };
  }
}
```

### File Processing with Error Recovery

```typescript
interface FileData extends SharedData {
  filename: string;
  content?: string;
  summary?: string;
  processingErrors?: string[];
}

class FileProcessorHandler extends Handler<FileContent, ProcessingResult, FileData> {
  constructor() {
    super({
      maxRetries: 1,    // Don't retry file operations
      retryDelayMs: 0
    });
  }

  protected prepareInputs(sharedData: Readonly<FileData>): FileContent {
    if (!sharedData.content) {
      throw new Error(`File content is required for ${sharedData.filename}`);
    }
    
    return {
      text: sharedData.content,
      filename: sharedData.filename,
    };
  }

  protected async handleRequest(inputs: FileContent): Promise<ProcessingResult> {
    // Simulate processing that might fail
    if (inputs.text.length > 1000000) {
      throw new Error('File too large to process');
    }
    
    const wordCount = inputs.text.split(/\s+/).length;
    const summary = await this.generateSummary(inputs.text);
    
    return {
      summary,
      wordCount,
      processed: true,
    };
  }

  protected processResults(
    sharedData: FileData & SharedData,
    inputs: FileContent,
    outputs: ProcessingResult,
  ): string {
    sharedData.summary = outputs.summary;
    
    if (outputs.wordCount > 10000) return 'large_document';
    if (outputs.wordCount > 1000) return 'medium_document';
    return 'small_document';
  }

  protected handleError(inputs: FileContent, error: Error): ProcessingResult {
    console.error(`Failed to process ${inputs.filename}:`, error.message);
    
    // Provide basic fallback processing
    const wordCount = inputs.text.split(/\s+/).length;
    
    return {
      summary: `Unable to generate summary for ${inputs.filename}. Error: ${error.message}`,
      wordCount,
      processed: false,
      error: error.message,
    };
  }

  private async generateSummary(text: string): Promise<string> {
    // This could fail and trigger the error handler
    if (text.trim() === '') {
      throw new Error('Cannot summarize empty text');
    }
    
    return text.slice(0, 200) + '...';
  }
}

// Usage with error tracking
const processor = new FileProcessorHandler();
const data: FileData = {
  filename: 'document.txt',
  content: 'Large document content...',
  processingErrors: []
};

const action = await processor.run(data);
if (action === 'large_document') {
  console.log('Processing large document:', data.summary);
} else if (data.summary?.includes('Error:')) {
  console.log('Processing failed, but gracefully handled');
}
```

## Retry Behavior Deep Dive

### How Retries Work

1. **First Attempt**: `handleRequest` is called
2. **On Failure**: If `maxRetries > 1`, wait `retryDelayMs` and try again
3. **Final Failure**: After all retries exhausted, call `handleError`
4. **Fallback Success**: If `handleError` returns a value, continue normally
5. **Complete Failure**: If `handleError` throws, the entire handler fails

### Retry Timing

```typescript
// Example with exponential backoff
class ExponentialRetryHandler extends Handler<Input, Output, Data> {
  private retryCount = 0;

  constructor() {
    super({
      maxRetries: 4,
      retryDelayMs: 1000  // Base delay
    });
  }

  protected async handleRequest(inputs: Input): Promise<Output> {
    try {
      const result = await unreliableAPICall(inputs);
      this.retryCount = 0; // Reset on success
      return result;
    } catch (error) {
      this.retryCount++;
      
      // On retry, the framework will wait retryDelayMs
      // You can implement custom exponential backoff in handleError
      throw error;
    }
  }

  protected handleError(inputs: Input, error: Error): Output {
    const backoffDelay = Math.pow(2, this.retryCount) * 1000; // 1s, 2s, 4s, 8s
    console.log(`Attempt ${this.retryCount} failed, next retry in ${backoffDelay}ms`);
    
    // If this is the final retry, provide fallback
    if (this.retryCount >= this.config.maxRetries) {
      this.retryCount = 0;
      return this.getFallbackResponse(inputs, error);
    }
    
    throw error; // Continue retrying
  }
}
```

## Error Handling Patterns

### Pattern 1: Graceful Degradation

```typescript
class WeatherHandler extends Handler<LocationInput, WeatherOutput, WeatherData> {
  protected async handleRequest(inputs: LocationInput): Promise<WeatherOutput> {
    // Try primary weather service
    return await getPrimaryWeatherData(inputs.location);
  }

  protected handleError(inputs: LocationInput, error: Error): WeatherOutput {
    // Fall back to cached or simplified data
    console.warn('Primary weather service failed, using fallback');
    
    return {
      location: inputs.location,
      temperature: 'Unknown',
      conditions: 'Weather data temporarily unavailable',
      cached: true,
      error: error.message
    };
  }

  protected processResults(
    sharedData: WeatherData & SharedData,
    inputs: LocationInput,
    outputs: WeatherOutput,
  ): string {
    sharedData.weather = outputs;
    
    // Route based on data quality
    return outputs.cached ? 'degraded_mode' : 'full_data';
  }
}
```

### Pattern 2: Service Failover

```typescript
class MultiServiceHandler extends Handler<SearchQuery, SearchResults, SearchData> {
  private currentServiceIndex = 0;
  private readonly services = ['primary', 'secondary', 'tertiary'];

  protected async handleRequest(inputs: SearchQuery): Promise<SearchResults> {
    const service = this.services[this.currentServiceIndex];
    return await this.callSearchService(service, inputs);
  }

  protected handleError(inputs: SearchQuery, error: Error): SearchResults {
    console.warn(`Service ${this.services[this.currentServiceIndex]} failed:`, error.message);
    
    // Try next service
    this.currentServiceIndex++;
    
    if (this.currentServiceIndex < this.services.length) {
      console.log(`Failing over to ${this.services[this.currentServiceIndex]}`);
      // Return partial results to trigger retry with different service
      throw new Error(`Retrying with ${this.services[this.currentServiceIndex]}`);
    }
    
    // All services failed
    this.currentServiceIndex = 0; // Reset for next time
    return {
      query: inputs.query,
      results: [],
      error: 'All search services are currently unavailable'
    };
  }

  private async callSearchService(service: string, inputs: SearchQuery): Promise<SearchResults> {
    switch (service) {
      case 'primary': return await primarySearchAPI(inputs);
      case 'secondary': return await secondarySearchAPI(inputs);
      case 'tertiary': return await tertiarySearchAPI(inputs);
      default: throw new Error(`Unknown service: ${service}`);
    }
  }
}
```

### Pattern 3: Circuit Breaker

```typescript
class CircuitBreakerHandler extends Handler<APIRequest, APIResponse, ServiceData> {
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold = 5;
  private readonly resetTimeoutMs = 60000; // 1 minute

  protected async handleRequest(inputs: APIRequest): Promise<APIResponse> {
    // Check if circuit is open
    if (this.isCircuitOpen()) {
      throw new Error('Circuit breaker is open - service is currently unavailable');
    }

    try {
      const result = await externalAPICall(inputs);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  protected handleError(inputs: APIRequest, error: Error): APIResponse {
    if (this.isCircuitOpen()) {
      return {
        data: null,
        error: 'Service temporarily disabled due to repeated failures',
        circuitOpen: true
      };
    }

    // Regular error handling
    return {
      data: null,
      error: error.message,
      retryable: true
    };
  }

  private isCircuitOpen(): boolean {
    if (this.failureCount >= this.failureThreshold) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      return timeSinceLastFailure < this.resetTimeoutMs;
    }
    return false;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
  }
}
```

## Configuration Best Practices

### Choosing Retry Settings

```typescript
// For external API calls (rate limits, network issues)
const apiHandler = new APIHandler({
  maxRetries: 3,
  retryDelayMs: 2000  // Wait for rate limit reset
});

// For LLM calls (rate limits, temporary overload)
const llmHandler = new LLMHandler({
  maxRetries: 2,
  retryDelayMs: 1500
});

// For file operations (usually don't retry)
const fileHandler = new FileHandler({
  maxRetries: 1,  // No retries
  retryDelayMs: 0
});

// For database operations (connection issues)
const dbHandler = new DatabaseHandler({
  maxRetries: 4,
  retryDelayMs: 500  // Quick retry for connection recovery
});
```

### Environment-Based Configuration

```typescript
function createProductionHandler<T extends Handler<any, any, any>>(
  HandlerClass: new (config?: HandlerConfig) => T,
  customConfig?: Partial<HandlerConfig>
): T {
  const baseConfig: HandlerConfig = {
    maxRetries: process.env.NODE_ENV === 'production' ? 3 : 1,
    retryDelayMs: process.env.NODE_ENV === 'production' ? 1000 : 0,
    ...customConfig
  };
  
  return new HandlerClass(baseConfig);
}

// Usage
const handler = createProductionHandler(LLMHandler, { maxRetries: 5 });
```

## Testing Handlers with Retries

```typescript
// Test retry behavior
it('should retry on failure and succeed on second attempt', async () => {
  let attempts = 0;
  
  class TestRetryHandler extends Handler<string, string, SharedData> {
    protected async handleRequest(input: string): Promise<string> {
      attempts++;
      if (attempts === 1) throw new Error('First attempt fails');
      return `success:${input}`;
    }
  }

  const handler = new TestRetryHandler({ maxRetries: 2 });
  const data: SharedData = { input: 'test' };
  
  const result = await handler.run(data);
  
  expect(result).toBe('default');
  expect(attempts).toBe(2);
});

// Test fallback behavior
it('should use fallback when all retries fail', async () => {
  class FallbackHandler extends Handler<string, string, SharedData> {
    protected async handleRequest(input: string): Promise<string> {
      throw new Error('Always fails');
    }
    
    protected handleError(input: string, error: Error): string {
      return `fallback:${input}`;
    }
  }

  const handler = new FallbackHandler({ maxRetries: 2 });
  const data: SharedData = { input: 'test' };
  
  await handler.run(data);
  
  expect(data.output).toBe('fallback:test');
});
```

## Migration from BaseHandler

Handler is fully compatible with BaseHandler - just change the class name:

```typescript
// Before (BaseHandler)
class MyHandler extends BaseHandler<Input, Output, Data> {
  // ... your existing implementation
}

// After (Handler with reliability features)
class MyHandler extends Handler<Input, Output, Data> {
  constructor() {
    super({ maxRetries: 3, retryDelayMs: 1000 }); // Add retry config
  }
  
  // ... your existing implementation (unchanged)
  
  // Optionally add error handling
  protected handleError(inputs: Input, error: Error): Output {
    return this.getFallbackOutput(inputs, error);
  }
}
```

Handler preserves all BaseHandler functionality while adding production-ready reliability features.