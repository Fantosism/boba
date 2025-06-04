# BatchHandler

BatchHandler processes collections of items through the same handler logic. It's BOBA-T's faithful recreation of PocketFlow's BatchNode pattern, enabling powerful data processing pipelines.

## Core Concept

BatchHandler applies the **same processing logic to every item** in a collection:

- **Extract** array of items from shared data
- **Process** each item through identical logic
- **Collect** results and errors
- **Route** based on batch outcome

## Basic Usage

### Simple Batch Processing

```typescript
interface FileData extends SharedData {
  filenames: string[];
  processedFiles?: string[];
  failedFiles?: string[];
}

class FileProcessor extends BatchHandler<string, ProcessedFile, FileData> {
  protected prepareBatchInputs(sharedData: Readonly<FileData>): string[] {
    return sharedData.filenames;
  }

  protected async handleSingleItem(filename: string): Promise<ProcessedFile> {
    const content = await readFile(filename);
    const processed = await processFileContent(content);

    return {
      filename,
      size: content.length,
      processedContent: processed,
      timestamp: new Date(),
    };
  }

  protected processBatchResults(
    sharedData: FileData,
    inputs: string[],
    outputs: BatchResult<ProcessedFile>,
  ): string {
    sharedData.processedFiles = outputs.results.map((r) => r.filename);
    sharedData.failedFiles = inputs.slice(outputs.successful); // Failed items

    if (outputs.failed === 0) return 'all_success';
    if (outputs.successful === 0) return 'all_failed';
    return 'partial_success';
  }
}

// Usage
const processor = new FileProcessor();
const data: FileData = {
  filenames: ['file1.txt', 'file2.txt', 'file3.txt'],
};

const action = await processor.run(data);
console.log('Action:', action); // 'all_success', 'partial_success', or 'all_failed'
console.log('Processed:', data.processedFiles);
```

## Configuration Options

### Sequential vs Concurrent Processing

```typescript
// Sequential processing (default)
const sequential = new FileProcessor({
  maxConcurrency: 1, // Process one item at a time
});

// Concurrent processing
const concurrent = new FileProcessor({
  maxConcurrency: 3, // Process up to 3 items simultaneously
});

// Fully parallel (no limit)
const parallel = new FileProcessor({
  maxConcurrency: Infinity, // Process all items concurrently
});
```

### Error Handling Strategies

```typescript
// Fail fast (default) - stop on first error
const failFast = new FileProcessor({
  failFast: true,
});

// Continue on error - process all items despite failures
const continueOnError = new FileProcessor({
  failFast: false,
});
```

### Retry Configuration

```typescript
// Retry failed items
const withRetries = new FileProcessor({
  maxRetries: 3, // Try each item up to 3 times
  retryDelayMs: 1000, // Wait 1 second between retries
});
```

## Error Handling and Recovery

### Individual Item Error Handling

```typescript
class RobustBatchProcessor extends BatchHandler<
  string,
  ProcessedResult,
  SharedData
> {
  protected prepareBatchInputs(sharedData: Readonly<SharedData>): string[] {
    return sharedData.items as string[];
  }

  protected async handleSingleItem(item: string): Promise<ProcessedResult> {
    if (item === 'corrupted') {
      throw new Error('Item is corrupted');
    }

    return { item, processed: true, result: `Processed ${item}` };
  }

  protected handleItemError(item: string, error: Error): ProcessedResult {
    console.warn(`Failed to process ${item}:`, error.message);

    // Provide fallback result instead of failing the item
    return {
      item,
      processed: false,
      result: `Fallback for ${item}`,
      error: error.message,
    };
  }

  protected processBatchResults(
    sharedData: SharedData,
    inputs: string[],
    outputs: BatchResult<ProcessedResult>,
  ): string {
    const fallbackCount = outputs.results.filter((r) => !r.processed).length;

    if (fallbackCount === 0) return 'all_success';
    if (fallbackCount === outputs.results.length) return 'all_fallback';
    return 'mixed_results';
  }
}
```

## Advanced Patterns

### Map-Reduce Pipeline

```typescript
interface MapReduceData extends SharedData {
  documents: Document[];
  wordCounts?: { [word: string]: number };
  topWords?: Array<{ word: string; count: number }>;
}

// Map phase: Extract words from each document
class WordMapper extends BatchHandler<Document, string[], MapReduceData> {
  protected prepareBatchInputs(
    sharedData: Readonly<MapReduceData>,
  ): Document[] {
    return sharedData.documents;
  }

  protected async handleSingleItem(doc: Document): Promise<string[]> {
    const words = doc.content
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3);

    return words;
  }

  protected processBatchResults(
    sharedData: MapReduceData,
    inputs: Document[],
    outputs: BatchResult<string[]>,
  ): string {
    // Flatten all words from all documents
    const allWords = outputs.results.flat();

    // Count word frequencies (reduce phase)
    const wordCounts: { [word: string]: number } = {};
    for (const word of allWords) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }

    sharedData.wordCounts = wordCounts;
    return 'mapping_complete';
  }
}

// Usage in pipeline
const mapper = new WordMapper({ maxConcurrency: 4 });
const reducer = new TopWordsHandler();

mapper.connectTo(reducer, 'mapping_complete');

const pipeline = new Pipeline(mapper);
```

### Batch Processing with Validation

```typescript
interface ValidationData extends SharedData {
  records: UserRecord[];
  validRecords?: UserRecord[];
  invalidRecords?: Array<{ record: UserRecord; reason: string }>;
}

class RecordValidator extends BatchHandler<
  UserRecord,
  ValidationResult,
  ValidationData
> {
  protected prepareBatchInputs(
    sharedData: Readonly<ValidationData>,
  ): UserRecord[] {
    return sharedData.records;
  }

  protected async handleSingleItem(
    record: UserRecord,
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!record.email || !record.email.includes('@')) {
      errors.push('Invalid email format');
    }

    if (!record.name || record.name.length < 2) {
      errors.push('Name too short');
    }

    if (record.age && (record.age < 0 || record.age > 150)) {
      errors.push('Invalid age');
    }

    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    return {
      record,
      valid: true,
      normalizedEmail: record.email.toLowerCase(),
    };
  }

  protected handleItemError(
    record: UserRecord,
    error: Error,
  ): ValidationResult {
    return {
      record,
      valid: false,
      errors: error.message.split(', '),
    };
  }

  protected processBatchResults(
    sharedData: ValidationData,
    inputs: UserRecord[],
    outputs: BatchResult<ValidationResult>,
  ): string {
    const validResults = outputs.results.filter((r) => r.valid);
    const invalidResults = outputs.results.filter((r) => !r.valid);

    sharedData.validRecords = validResults.map((r) => r.record);
    sharedData.invalidRecords = invalidResults.map((r) => ({
      record: r.record,
      reason: r.errors?.join(', ') || 'Unknown error',
    }));

    const validPercentage =
      (validResults.length / outputs.results.length) * 100;

    if (validPercentage === 100) return 'all_valid';
    if (validPercentage >= 80) return 'mostly_valid';
    if (validPercentage >= 50) return 'partially_valid';
    return 'mostly_invalid';
  }
}

// Usage with different routing
const validator = new RecordValidator({ failFast: false });
const processValid = new ProcessValidRecordsHandler();
const handleInvalid = new HandleInvalidRecordsHandler();
const manualReview = new ManualReviewHandler();

validator.connectTo(processValid, 'all_valid');
validator.connectTo(processValid, 'mostly_valid');
validator.connectTo(manualReview, 'partially_valid');
validator.connectTo(handleInvalid, 'mostly_invalid');
```

### Concurrent File Processing

```typescript
interface FileProcessingData extends SharedData {
  filePaths: string[];
  results?: ProcessedFileResult[];
  totalSize?: number;
  processingTime?: number;
}

class ConcurrentFileProcessor extends BatchHandler<
  string,
  ProcessedFileResult,
  FileProcessingData
> {
  constructor() {
    super({
      maxConcurrency: 5, // Process 5 files simultaneously
      failFast: false, // Continue processing other files if one fails
      maxRetries: 2, // Retry failed files once
      retryDelayMs: 500, // Brief pause between retries
    });
  }

  protected prepareBatchInputs(
    sharedData: Readonly<FileProcessingData>,
  ): string[] {
    return sharedData.filePaths;
  }

  protected async handleSingleItem(
    filePath: string,
  ): Promise<ProcessedFileResult> {
    const startTime = Date.now();

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const processed = await this.processFileContent(content);
      const endTime = Date.now();

      return {
        filePath,
        success: true,
        size: content.length,
        processedData: processed,
        processingTime: endTime - startTime,
      };
    } catch (error) {
      throw new Error(`Failed to process ${filePath}: ${error.message}`);
    }
  }

  protected handleItemError(
    filePath: string,
    error: Error,
  ): ProcessedFileResult {
    console.warn(`File processing failed: ${filePath}`, error);

    return {
      filePath,
      success: false,
      size: 0,
      error: error.message,
      processingTime: 0,
    };
  }

  protected processBatchResults(
    sharedData: FileProcessingData,
    inputs: string[],
    outputs: BatchResult<ProcessedFileResult>,
  ): string {
    sharedData.results = outputs.results;
    sharedData.totalSize = outputs.results.reduce((sum, r) => sum + r.size, 0);
    sharedData.processingTime = Math.max(
      ...outputs.results.map((r) => r.processingTime),
    );

    const successRate = outputs.successful / outputs.totalItems;

    if (successRate === 1) return 'processing_complete';
    if (successRate >= 0.8) return 'mostly_successful';
    return 'many_failures';
  }

  private async processFileContent(content: string): Promise<any> {
    // Simulate complex file processing
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      lines: content.split('\n').length,
      words: content.split(/\s+/).length,
      processed: true,
    };
  }
}
```

### Batch API Calls with Rate Limiting

```typescript
interface APIBatchData extends SharedData {
  apiRequests: APIRequest[];
  responses?: APIResponse[];
  rateLimitHit?: boolean;
}

class RateLimitedAPIBatch extends BatchHandler<
  APIRequest,
  APIResponse,
  APIBatchData
> {
  constructor() {
    super({
      maxConcurrency: 2, // Respect API rate limits
      maxRetries: 3, // Retry rate-limited requests
      retryDelayMs: 2000, // Wait 2 seconds for rate limit reset
      failFast: false, // Continue with other requests
    });
  }

  protected prepareBatchInputs(
    sharedData: Readonly<APIBatchData>,
  ): APIRequest[] {
    return sharedData.apiRequests;
  }

  protected async handleSingleItem(request: APIRequest): Promise<APIResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.data),
    });

    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return {
      request,
      data: await response.json(),
      status: response.status,
      timestamp: new Date(),
    };
  }

  protected handleItemError(request: APIRequest, error: Error): APIResponse {
    if (error.message.includes('Rate limit')) {
      // Mark that we hit rate limits for reporting
      return {
        request,
        data: null,
        status: 429,
        error: 'Rate limited',
        timestamp: new Date(),
      };
    }

    throw error; // Re-throw non-rate-limit errors
  }

  protected processBatchResults(
    sharedData: APIBatchData,
    inputs: APIRequest[],
    outputs: BatchResult<APIResponse>,
  ): string {
    sharedData.responses = outputs.results;
    sharedData.rateLimitHit = outputs.results.some((r) => r.status === 429);

    if (outputs.failed === 0) return 'api_batch_complete';
    if (sharedData.rateLimitHit) return 'rate_limited';
    return 'api_errors';
  }
}
```

## Integration with Pipeline

BatchHandler works seamlessly in pipelines with conditional routing:

```typescript
interface DataPipelineData extends SharedData {
  rawData: any[];
  validatedData?: any[];
  processedData?: any[];
  errors?: any[];
}

// Build a data processing pipeline
const validator = new DataValidator({ failFast: false });
const processor = new DataProcessor({ maxConcurrency: 3 });
const errorHandler = new ErrorHandler();
const successHandler = new SuccessHandler();

// Route based on validation results
validator.connectTo(processor, 'all_valid');
validator.connectTo(processor, 'mostly_valid');
validator.connectTo(errorHandler, 'mostly_invalid');

// Route based on processing results
processor.connectTo(successHandler, 'processing_complete');
processor.connectTo(errorHandler, 'many_failures');

const dataPipeline = new Pipeline(validator);

// Process data through the pipeline
const result = await dataPipeline.run({
  rawData: [
    /* large dataset */
  ],
});
```

## Performance Considerations

### Choosing Concurrency Levels

```typescript
// For I/O-heavy operations (file reading, API calls)
const ioBound = new BatchHandler({ maxConcurrency: 10 });

// For CPU-heavy operations (data processing, compression)
const cpuBound = new BatchHandler({
  maxConcurrency: require('os').cpus().length,
});

// For memory-intensive operations (large data transformations)
const memoryBound = new BatchHandler({ maxConcurrency: 2 });

// For rate-limited services
const rateLimited = new BatchHandler({
  maxConcurrency: 1,
  retryDelayMs: 1000,
});
```

### Memory Management for Large Batches

```typescript
class MemoryEfficientBatch extends BatchHandler<
  LargeItem,
  ProcessedItem,
  SharedData
> {
  constructor() {
    super({
      maxConcurrency: 3, // Limit concurrent items to control memory usage
    });
  }

  protected async handleSingleItem(item: LargeItem): Promise<ProcessedItem> {
    // Process item and free memory explicitly
    const result = await processLargeItem(item);

    // Clear references to help GC
    item.largeData = null;

    return result;
  }

  protected processBatchResults(
    sharedData: SharedData,
    inputs: LargeItem[],
    outputs: BatchResult<ProcessedItem>,
  ): string {
    // Clear input data after processing
    inputs.length = 0;

    return 'batch_complete';
  }
}
```

## Best Practices

### 1. Design for Idempotency

```typescript
// ✅ Good - Idempotent processing
protected async handleSingleItem(item: DataItem): Promise<ProcessedItem> {
  // Check if already processed
  if (item.processedAt) {
    return { ...item, skipped: true };
  }

  const result = await processItem(item);
  return { ...result, processedAt: new Date() };
}

// ❌ Bad - Side effects without idempotency checks
protected async handleSingleItem(item: DataItem): Promise<ProcessedItem> {
  await sendEmail(item.email); // Might send duplicate emails on retry
  return processItem(item);
}
```

### 2. Handle Partial Failures Gracefully

```typescript
// ✅ Good - Clear routing based on batch outcome
protected processBatchResults(
  sharedData: SharedData,
  inputs: any[],
  outputs: BatchResult<any>
): string {
  const successRate = outputs.successful / outputs.totalItems;

  if (successRate === 1) return 'perfect_success';
  if (successRate >= 0.9) return 'acceptable_success';
  if (successRate >= 0.5) return 'partial_success';
  return 'mostly_failed';
}
```

### 3. Use Appropriate Error Strategies

```typescript
// ✅ Good - Choose strategy based on use case
class CriticalBatch extends BatchHandler {
  constructor() {
    super({ failFast: true }); // Stop immediately on any failure
  }
}

class DataProcessingBatch extends BatchHandler {
  constructor() {
    super({ failFast: false }); // Process all items, collect errors
  }
}
```

### 4. Monitor Batch Performance

```typescript
class MonitoredBatch extends BatchHandler<Item, Result, SharedData> {
  protected async handleSingleItem(item: Item): Promise<Result> {
    const startTime = Date.now();

    try {
      const result = await processItem(item);
      const duration = Date.now() - startTime;

      if (duration > 5000) {
        console.warn(`Slow item processing: ${item.id} took ${duration}ms`);
      }

      return result;
    } catch (error) {
      console.error(`Failed to process item ${item.id}:`, error);
      throw error;
    }
  }
}
```

## Common Use Cases

- **File Processing**: Process multiple files concurrently
- **Data Validation**: Validate large datasets with error collection
- **API Batch Operations**: Make multiple API calls with rate limiting
- **Image/Media Processing**: Transform multiple media files
- **Data Migration**: Move data between systems with error handling
- **ETL Pipelines**: Extract, transform, and load data in batches
- **Email/Notification Sending**: Send messages to multiple recipients
- **Report Generation**: Generate multiple reports concurrently

BatchHandler provides the foundation for scalable, reliable batch processing while maintaining the simplicity and composability of BOBA-T's architecture.
