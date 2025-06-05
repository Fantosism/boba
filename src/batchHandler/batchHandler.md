# BatchHandler

BatchHandler processes collections of items through the same handler logic. Each item in the batch goes through identical processing sequentially.

## Core Concept

BatchHandler applies **identical processing logic to every item** in a collection:

- **Extract** array of items from shared data
- **Process** each item sequentially through same logic
- **Collect** results into array
- **Route** based on final results

## Basic Usage

### Simple Batch Processing

```typescript
interface FileData extends SharedData {
  filenames: string[];
  processedFiles?: ProcessedFile[];
}

interface ProcessedFile {
  filename: string;
  size: number;
  content: string;
}

class FileProcessor extends BatchHandler<string, ProcessedFile, FileData> {
  protected prepareBatchInputs(sharedData: Readonly<FileData>): string[] {
    return sharedData.filenames;
  }

  protected async processSingleItem(filename: string): Promise<ProcessedFile> {
    const content = await readFile(filename);

    return {
      filename,
      size: content.length,
      content: content.substring(0, 100), // First 100 chars
    };
  }

  protected processBatchResults(
    sharedData: FileData,
    inputs: string[],
    outputs: ProcessedFile[],
  ): string {
    sharedData.processedFiles = outputs;
    return 'files_processed';
  }
}

// Usage
const processor = new FileProcessor();
const data: FileData = {
  filenames: ['file1.txt', 'file2.txt', 'file3.txt'],
};

const action = await processor.run(data);
console.log('Action:', action); // 'files_processed'
console.log('Results:', data.processedFiles);
```

### Data Transformation

```typescript
interface NumberData extends SharedData {
  numbers: number[];
  squares?: number[];
  cubes?: number[];
}

class MathProcessor extends BatchHandler<number, MathResult, NumberData> {
  protected prepareBatchInputs(sharedData: Readonly<NumberData>): number[] {
    return sharedData.numbers;
  }

  protected processSingleItem(num: number): MathResult {
    return {
      original: num,
      square: num * num,
      cube: num * num * num,
      isEven: num % 2 === 0,
    };
  }

  protected processBatchResults(
    sharedData: NumberData,
    inputs: number[],
    outputs: MathResult[],
  ): string {
    sharedData.squares = outputs.map((r) => r.square);
    sharedData.cubes = outputs.map((r) => r.cube);

    const allEven = outputs.every((r) => r.isEven);
    return allEven ? 'all_even' : 'mixed_numbers';
  }
}
```

## Error Handling

BatchHandler stops on the first error and propagates it:

```typescript
class ValidatingProcessor extends BatchHandler<
  string,
  ValidatedData,
  SharedData
> {
  protected prepareBatchInputs(sharedData: Readonly<SharedData>): string[] {
    return sharedData.items as string[];
  }

  protected processSingleItem(item: string): ValidatedData {
    if (item.length === 0) {
      throw new Error('Empty item not allowed');
    }

    if (item === 'invalid') {
      throw new Error(`Invalid item: ${item}`);
    }

    return {
      value: item,
      length: item.length,
      valid: true,
    };
  }

  protected processBatchResults(
    sharedData: SharedData,
    inputs: string[],
    outputs: ValidatedData[],
  ): string {
    return 'validation_complete';
  }
}

// Usage
const validator = new ValidatingProcessor();

try {
  await validator.run({ items: ['valid', 'invalid', 'more'] });
} catch (error) {
  console.log('Batch failed:', error.message); // "Invalid item: invalid"
  // Processing stopped at 'invalid', 'more' was not processed
}
```

## Conditional Routing

Route based on batch processing results:

```typescript
interface ProcessingData extends SharedData {
  records: DataRecord[];
  results?: ProcessedRecord[];
  summary?: BatchSummary;
}

class DataProcessor extends BatchHandler<
  DataRecord,
  ProcessedRecord,
  ProcessingData
> {
  protected prepareBatchInputs(
    sharedData: Readonly<ProcessingData>,
  ): DataRecord[] {
    return sharedData.records;
  }

  protected processSingleItem(record: DataRecord): ProcessedRecord {
    return {
      id: record.id,
      processed: true,
      value: record.value * 2,
      timestamp: new Date(),
    };
  }

  protected processBatchResults(
    sharedData: ProcessingData,
    inputs: DataRecord[],
    outputs: ProcessedRecord[],
  ): string {
    sharedData.results = outputs;
    sharedData.summary = {
      totalProcessed: outputs.length,
      averageValue:
        outputs.reduce((sum, r) => sum + r.value, 0) / outputs.length,
    };

    // Route based on batch size
    if (outputs.length === 0) return 'empty_batch';
    if (outputs.length <= 10) return 'small_batch';
    if (outputs.length <= 100) return 'medium_batch';
    return 'large_batch';
  }
}

// Connect to different handlers based on batch size
const processor = new DataProcessor();
const smallBatchHandler = new SmallBatchHandler();
const mediumBatchHandler = new MediumBatchHandler();
const largeBatchHandler = new LargeBatchHandler();

processor.connectTo(smallBatchHandler, 'small_batch');
processor.connectTo(mediumBatchHandler, 'medium_batch');
processor.connectTo(largeBatchHandler, 'large_batch');
```

## Advanced Patterns

### Map-Reduce Style Processing

```typescript
// Map phase: Extract words from documents
class WordExtractor extends BatchHandler<Document, string[], SharedData> {
  protected prepareBatchInputs(sharedData: Readonly<SharedData>): Document[] {
    return sharedData.documents as Document[];
  }

  protected processSingleItem(doc: Document): string[] {
    return doc.content
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3);
  }

  protected processBatchResults(
    sharedData: SharedData,
    inputs: Document[],
    outputs: string[][],
  ): string {
    // Flatten all word arrays
    const allWords = outputs.flat();

    // Count frequencies (reduce phase)
    const wordCounts: { [word: string]: number } = {};
    for (const word of allWords) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }

    sharedData.wordCounts = wordCounts;
    return 'words_extracted';
  }
}
```

### Data Validation Pipeline

```typescript
interface ValidationData extends SharedData {
  users: User[];
  validUsers?: User[];
  invalidUsers?: Array<{ user: User; reason: string }>;
}

class UserValidator extends BatchHandler<
  User,
  ValidationResult,
  ValidationData
> {
  protected prepareBatchInputs(sharedData: Readonly<ValidationData>): User[] {
    return sharedData.users;
  }

  protected processSingleItem(user: User): ValidationResult {
    const errors: string[] = [];

    if (!user.email || !user.email.includes('@')) {
      errors.push('Invalid email');
    }

    if (!user.name || user.name.length < 2) {
      errors.push('Name too short');
    }

    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    return {
      user,
      valid: true,
      normalizedEmail: user.email.toLowerCase(),
    };
  }

  protected processBatchResults(
    sharedData: ValidationData,
    inputs: User[],
    outputs: ValidationResult[],
  ): string {
    sharedData.validUsers = outputs.map((r) => r.user);
    return 'validation_complete';
  }
}
```

### Sequential API Calls

```typescript
interface APIData extends SharedData {
  requests: APIRequest[];
  responses?: APIResponse[];
}

class APIBatchProcessor extends BatchHandler<APIRequest, APIResponse, APIData> {
  protected prepareBatchInputs(sharedData: Readonly<APIData>): APIRequest[] {
    return sharedData.requests;
  }

  protected async processSingleItem(request: APIRequest): Promise<APIResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.data),
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }

    return {
      request,
      data: await response.json(),
      status: response.status,
    };
  }

  protected processBatchResults(
    sharedData: APIData,
    inputs: APIRequest[],
    outputs: APIResponse[],
  ): string {
    sharedData.responses = outputs;
    return 'api_batch_complete';
  }
}
```

## Integration with Pipeline

BatchHandler works seamlessly in pipelines:

```typescript
// Build a data processing pipeline
const validator = new DataValidator();
const processor = new DataProcessor();
const exporter = new DataExporter();

// Chain based on validation results
validator.connectTo(processor, 'validation_complete');
processor.connectTo(exporter, 'large_batch');
processor.connectTo(new SimpleExporter(), 'small_batch');

const dataPipeline = new Pipeline(validator);

// Process data through the pipeline
const result = await dataPipeline.run({
  records: [
    /* data to process */
  ],
});
```

## Best Practices

### 1. Keep Single Item Processing Pure

```typescript
// ✅ Good - Pure item processing
protected processSingleItem(item: string): ProcessedItem {
  return {
    value: item.toUpperCase(),
    length: item.length,
    processed: true
  };
}

// ❌ Bad - Side effects in item processing
protected processSingleItem(item: string): ProcessedItem {
  console.log('Processing:', item); // Side effect
  this.updateDatabase(item);        // Side effect
  return processItem(item);
}
```

### 2. Handle Empty Batches Gracefully

```typescript
// ✅ Good - Explicit empty handling
protected processBatchResults(
  sharedData: SharedData,
  inputs: any[],
  outputs: any[]
): string {
  if (outputs.length === 0) {
    return 'empty_batch';
  }

  return 'batch_complete';
}
```

### 3. Use Descriptive Action Names

```typescript
// ✅ Good - Clear routing intentions
protected processBatchResults(...): string {
  if (outputs.length === 0) return 'no_items_to_process';
  if (outputs.length < 10) return 'small_batch_processed';
  if (outputs.length < 100) return 'medium_batch_processed';
  return 'large_batch_processed';
}

// ❌ Bad - Unclear actions
protected processBatchResults(...): string {
  return outputs.length > 0 ? 'done' : 'empty';
}
```

### 4. Design for Error Recovery

```typescript
// If you need error recovery, build it into your handlers
class RobustBatchHandler extends BatchHandler<Item, Result, SharedData> {
  protected processSingleItem(item: Item): Result {
    try {
      return this.processItem(item);
    } catch (error) {
      // Log error but don't throw - return fallback result
      console.warn('Item processing failed:', item.id, error);
      return this.getFallbackResult(item);
    }
  }
}
```

## Core API

BatchHandler provides three abstract methods to implement:

```typescript
abstract class BatchHandler<TInput, TOutput, TSharedData> {
  // Extract items to process
  protected abstract prepareBatchInputs(
    sharedData: Readonly<TSharedData>,
  ): TInput[];

  // Process single item (core logic)
  protected abstract processSingleItem(
    item: TInput,
  ): TOutput | Promise<TOutput>;

  // Handle batch results and route (optional)
  protected processBatchResults(
    sharedData: TSharedData,
    inputs: TInput[],
    outputs: TOutput[],
  ): ActionResult {
    return 'default';
  }
}
```

## Common Use Cases

- **File Processing**: Process multiple files sequentially
- **Data Transformation**: Transform arrays of data objects
- **Validation**: Validate collections with early termination on errors
- **API Batch Calls**: Make sequential API calls (respects rate limits)
- **Report Generation**: Generate multiple reports from data sets
- **Data Migration**: Process records one by one with error handling
- **Content Processing**: Transform text, images, or other content sequentially

BatchHandler provides the essential pattern for processing collections while maintaining the simplicity and composability of BOBA-T's architecture.
