# ParallelBatchPipeline

ParallelBatchPipeline runs a pipeline multiple times with different parameter sets **concurrently** using Promise.all(). This is the parallel version of BatchPipeline, designed for I/O-bound operations where pipelines can run independently.

## Key Features

- **Concurrent Execution**: All pipeline instances run simultaneously using Promise.all()
- **Parameter Isolation**: Each pipeline execution gets its own parameter set
- **Shared Data Management**: Handles concurrent access to shared data safely
- **Performance Optimization**: Ideal for I/O-bound operations like API calls, file processing, or database operations

## When to Use ParallelBatchPipeline

✅ **Good Use Cases:**
- Processing multiple files through a complex workflow concurrently
- Running the same multi-step analysis on different data sets in parallel
- Executing complete workflows with different configurations simultaneously
- API calls that can be made independently

⚠️ **Important Considerations:**
- Ensure pipeline executions are independent (no shared state conflicts)
- Be aware of rate limits when pipelines make external API calls
- Consider memory usage with large batches
- Use regular BatchPipeline if executions must be sequential

## Basic Usage

```typescript
interface FileData extends SharedData {
  filenames: string[];
  results: Record<string, any>;
}

// Create a pipeline for processing a single file
const readFile = new ReadFileHandler();
const analyzeContent = new AnalyzeContentHandler();
const saveResults = new SaveResultsHandler();

readFile.connectTo(analyzeContent, 'success');
analyzeContent.connectTo(saveResults, 'complete');

const fileProcessingPipeline = new Pipeline(readFile);

// Create parallel batch pipeline to process multiple files concurrently
class ProcessMultipleFilesParallel extends ParallelBatchPipeline<FileData> {
  protected prepareBatchParams(sharedData: Readonly<FileData>): HandlerParams[] {
    return sharedData.filenames.map(filename => ({ filename }));
  }

  protected processBatchResults(
    sharedData: FileData & SharedData,
    inputs: HandlerParams[],
    outputs: void,
  ): string {
    console.log(`Processed ${inputs.length} files concurrently`);
    return 'all_files_processed';
  }
}

// Usage
const parallelProcessor = new ProcessMultipleFilesParallel(fileProcessingPipeline);
await parallelProcessor.run({ 
  filenames: ['file1.txt', 'file2.txt', 'file3.txt'],
  results: {}
});
```

## Advanced Examples

### Web Scraping with Rate Limiting

```typescript
interface ScrapingData extends SharedData {
  urls: string[];
  scrapedData: Record<string, any>;
  errors: string[];
}

class WebScrapingHandler extends Handler<{ url: string }, ScrapingResult, ScrapingData> {
  protected prepareInputs(sharedData: Readonly<ScrapingData>): { url: string } {
    return { url: this.getParams().url as string };
  }

  protected async handleRequest(inputs: { url: string }): Promise<ScrapingResult> {
    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const response = await fetch(inputs.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${inputs.url}: ${response.status}`);
    }
    
    const html = await response.text();
    return {
      url: inputs.url,
      title: this.extractTitle(html),
      content: this.extractContent(html),
      timestamp: new Date().toISOString(),
    };
  }

  protected processResults(
    sharedData: ScrapingData & SharedData,
    inputs: { url: string },
    outputs: ScrapingResult,
  ): string {
    sharedData.scrapedData[outputs.url] = outputs;
    return 'scraped';
  }

  protected handleError(inputs: { url: string }, error: Error): ScrapingResult {
    return {
      url: inputs.url,
      title: 'Error',
      content: `Failed to scrape: ${error.message}`,
      timestamp: new Date().toISOString(),
      error: true,
    };
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title>(.*?)<\/title>/i);
    return match ? match[1] : 'No title found';
  }

  private extractContent(html: string): string {
    // Simplified content extraction
    return html.replace(/<[^>]*>/g, '').slice(0, 500);
  }
}

class ParallelWebScraper extends ParallelBatchPipeline<ScrapingData> {
  protected prepareBatchParams(sharedData: Readonly<ScrapingData>): HandlerParams[] {
    return sharedData.urls.map(url => ({ url }));
  }

  protected processBatchResults(
    sharedData: ScrapingData & SharedData,
    inputs: HandlerParams[],
    outputs: void,
  ): string {
    const successCount = Object.values(sharedData.scrapedData)
      .filter(result => !result.error).length;
    
    console.log(`Scraped ${successCount}/${inputs.length} URLs successfully`);
    
    return successCount === inputs.length ? 'all_success' : 'partial_success';
  }
}

// Usage
const scraper = new WebScrapingHandler();
const scrapingPipeline = new Pipeline(scraper);
const parallelScraper = new ParallelWebScraper(scrapingPipeline);

await parallelScraper.run({
  urls: [
    'https://example.com/page1',
    'https://example.com/page2',
    'https://example.com/page3',
  ],
  scrapedData: {},
  errors: []
});
```

### API Data Processing Pipeline

```typescript
interface APIProcessingData extends SharedData {
  apiEndpoints: string[];
  processedResults: any[];
  failedEndpoints: string[];
}

// Step 1: Fetch data from API
class FetchAPIDataHandler extends Handler<APIRequest, APIResponse, APIProcessingData> {
  protected prepareInputs(sharedData: Readonly<APIProcessingData>): APIRequest {
    return {
      endpoint: this.getParams().endpoint as string,
      apiKey: sharedData.apiKey as string,
    };
  }

  protected async handleRequest(inputs: APIRequest): Promise<APIResponse> {
    const response = await fetch(inputs.endpoint, {
      headers: {
        'Authorization': `Bearer ${inputs.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }

    return response.json();
  }

  protected processResults(
    sharedData: APIProcessingData & SharedData,
    inputs: APIRequest,
    outputs: APIResponse,
  ): string {
    return 'data_fetched';
  }
}

// Step 2: Transform the data
class TransformDataHandler extends Handler<APIResponse, TransformedData, APIProcessingData> {
  protected prepareInputs(sharedData: Readonly<APIProcessingData>): APIResponse {
    // Get the data from the previous step (stored in shared data)
    return sharedData.currentAPIResponse as APIResponse;
  }

  protected async handleRequest(inputs: APIResponse): Promise<TransformedData> {
    // Transform the API response data
    return {
      id: inputs.id,
      processedAt: new Date().toISOString(),
      summary: this.generateSummary(inputs.data),
      metrics: this.calculateMetrics(inputs.data),
    };
  }

  protected processResults(
    sharedData: APIProcessingData & SharedData,
    inputs: APIResponse,
    outputs: TransformedData,
  ): string {
    sharedData.processedResults.push(outputs);
    return 'data_transformed';
  }

  private generateSummary(data: any): string {
    // Simplified summary generation
    return `Processed ${Object.keys(data).length} fields`;
  }

  private calculateMetrics(data: any): Record<string, number> {
    // Simplified metrics calculation
    return {
      fieldCount: Object.keys(data).length,
      dataSize: JSON.stringify(data).length,
    };
  }
}

// Create the processing pipeline
const fetchHandler = new FetchAPIDataHandler();
const transformHandler = new TransformDataHandler();

fetchHandler.connectTo(transformHandler, 'data_fetched');
const apiProcessingPipeline = new Pipeline(fetchHandler);

// Parallel batch processor
class ParallelAPIProcessor extends ParallelBatchPipeline<APIProcessingData> {
  protected prepareBatchParams(sharedData: Readonly<APIProcessingData>): HandlerParams[] {
    return sharedData.apiEndpoints.map(endpoint => ({ endpoint }));
  }

  protected processBatchResults(
    sharedData: APIProcessingData & SharedData,
    inputs: HandlerParams[],
    outputs: void,
  ): string {
    const processedCount = sharedData.processedResults.length;
    const failedCount = sharedData.failedEndpoints.length;
    
    console.log(`API Processing complete: ${processedCount} success, ${failedCount} failed`);
    
    if (failedCount === 0) return 'all_apis_processed';
    if (processedCount > 0) return 'partial_success';
    return 'all_failed';
  }
}

// Usage
const processor = new ParallelAPIProcessor(apiProcessingPipeline);
await processor.run({
  apiEndpoints: [
    'https://api.service1.com/data',
    'https://api.service2.com/data',
    'https://api.service3.com/data',
  ],
  apiKey: 'your-api-key',
  processedResults: [],
  failedEndpoints: []
});
```

## Performance Considerations

### Batch Size Management

```typescript
class ChunkedParallelProcessor extends ParallelBatchPipeline<ProcessingData> {
  private readonly chunkSize: number;

  constructor(pipeline: Pipeline, chunkSize: number = 10) {
    super(pipeline);
    this.chunkSize = chunkSize;
  }

  protected prepareBatchParams(sharedData: Readonly<ProcessingData>): HandlerParams[] {
    const allParams = sharedData.items.map(item => ({ item }));
    
    // Process in chunks to avoid overwhelming the system
    return allParams.slice(0, this.chunkSize);
  }

  protected async executeLifecycle(
    sharedData: ProcessingData & SharedData,
  ): Promise<string> {
    const allItems = [...sharedData.items];
    let processedCount = 0;

    // Process items in chunks
    while (processedCount < allItems.length) {
      const chunk = allItems.slice(processedCount, processedCount + this.chunkSize);
      sharedData.items = chunk;
      
      await super.executeLifecycle(sharedData);
      
      processedCount += chunk.length;
      console.log(`Processed ${processedCount}/${allItems.length} items`);
      
      // Optional: Add delay between chunks
      if (processedCount < allItems.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return 'all_chunks_processed';
  }
}
```

### Memory Management

```typescript
class MemoryEfficientProcessor extends ParallelBatchPipeline<LargeDataSet> {
  protected async handleRequest(paramSets: HandlerParams[]): Promise<void> {
    // Process in smaller concurrent batches to manage memory
    const batchSize = 5;
    
    for (let i = 0; i < paramSets.length; i += batchSize) {
      const batch = paramSets.slice(i, i + batchSize);
      const promises = batch.map(params => this.executePipelineWithParams(params));
      
      await Promise.all(promises);
      
      // Force garbage collection between batches (if available)
      if (global.gc) {
        global.gc();
      }
      
      console.log(`Completed batch ${Math.floor(i / batchSize) + 1}`);
    }
  }
}
```

## Error Handling in Parallel Execution

### Fail-Fast vs. Fail-Safe

```typescript
// Fail-Fast: Stop all processing if any pipeline fails
class FailFastParallelProcessor extends ParallelBatchPipeline<ProcessingData> {
  protected async handleRequest(paramSets: HandlerParams[]): Promise<void> {
    // Promise.all will reject if any promise rejects
    const promises = paramSets.map(params => this.executePipelineWithParams(params));
    await Promise.all(promises);
  }
}

// Fail-Safe: Continue processing even if some pipelines fail
class FailSafeParallelProcessor extends ParallelBatchPipeline<ProcessingData> {
  protected async handleRequest(paramSets: HandlerParams[]): Promise<void> {
    const promises = paramSets.map(async (params) => {
      try {
        await this.executePipelineWithParams(params);
        return { success: true, params };
      } catch (error) {
        console.error(`Pipeline failed for params:`, params, error);
        return { success: false, params, error: error.message };
      }
    });

    const results = await Promise.all(promises);
    
    // Store results in shared data for analysis
    const sharedData = this.getCurrentSharedData();
    sharedData.results = results;
    sharedData.successCount = results.filter(r => r.success).length;
    sharedData.failureCount = results.filter(r => !r.success).length;
  }
}
```

## Testing ParallelBatchPipeline

```typescript
describe('ParallelBatchPipeline', () => {
  it('should process multiple parameter sets concurrently', async () => {
    const executionOrder: number[] = [];
    
    class TestHandler extends Handler<{ id: number }, string, SharedData> {
      protected async handleRequest(inputs: { id: number }): Promise<string> {
        // Simulate async work with random delay
        const delay = Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        executionOrder.push(inputs.id);
        return `processed-${inputs.id}`;
      }
    }

    class TestParallelBatch extends ParallelBatchPipeline<SharedData> {
      protected prepareBatchParams(sharedData: Readonly<SharedData>): HandlerParams[] {
        return [{ id: 1 }, { id: 2 }, { id: 3 }];
      }
    }

    const handler = new TestHandler();
    const pipeline = new Pipeline(handler);
    const batchProcessor = new TestParallelBatch(pipeline);

    const startTime = Date.now();
    await batchProcessor.run({});
    const endTime = Date.now();

    // All items should be processed
    expect(executionOrder).toHaveLength(3);
    expect(executionOrder).toContain(1);
    expect(executionOrder).toContain(2);
    expect(executionOrder).toContain(3);

    // Should complete faster than sequential processing
    // (This is a rough test - in practice, you'd need more sophisticated timing)
    expect(endTime - startTime).toBeLessThan(300); // Less than 3 * 100ms
  });

  it('should handle errors gracefully in fail-safe mode', async () => {
    class FailingHandler extends Handler<{ shouldFail: boolean }, string, SharedData> {
      protected async handleRequest(inputs: { shouldFail: boolean }): Promise<string> {
        if (inputs.shouldFail) {
          throw new Error('Intentional failure');
        }
        return 'success';
      }

      protected handleError(inputs: { shouldFail: boolean }, error: Error): string {
        return 'fallback';
      }
    }

    class TestParallelBatch extends ParallelBatchPipeline<SharedData> {
      protected prepareBatchParams(sharedData: Readonly<SharedData>): HandlerParams[] {
        return [
          { shouldFail: false },
          { shouldFail: true },
          { shouldFail: false },
        ];
      }
    }

    const handler = new FailingHandler();
    const pipeline = new Pipeline(handler);
    const batchProcessor = new TestParallelBatch(pipeline);

    // Should not throw despite one failure
    await expect(batchProcessor.run({})).resolves.toBeDefined();
  });
});
```

## Migration from BatchPipeline

ParallelBatchPipeline is a drop-in replacement for BatchPipeline:

```typescript
// Before (Sequential)
class SequentialProcessor extends BatchPipeline<Data> {
  protected prepareBatchParams(sharedData: Readonly<Data>): HandlerParams[] {
    return sharedData.items.map(item => ({ item }));
  }
}

// After (Parallel)
class ParallelProcessor extends ParallelBatchPipeline<Data> {
  protected prepareBatchParams(sharedData: Readonly<Data>): HandlerParams[] {
    return sharedData.items.map(item => ({ item }));
  }
}
```

The API is identical - only the execution model changes from sequential to parallel.

## Best Practices

1. **Start Small**: Begin with small batch sizes and increase gradually
2. **Monitor Resources**: Watch memory and CPU usage during parallel execution
3. **Respect Rate Limits**: Add delays or use smaller batches for external APIs
4. **Error Isolation**: Ensure one failing pipeline doesn't affect others
5. **Logging**: Add comprehensive logging to track parallel execution progress
6. **Testing**: Test with various batch sizes and failure scenarios

ParallelBatchPipeline provides powerful concurrent processing capabilities while maintaining the same simple API as BatchPipeline. Use it when you need to maximize throughput for I/O-bound operations.
