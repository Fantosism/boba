# ParallelBatchHandler

The `ParallelBatchHandler` processes collections of items concurrently using `Promise.all()`. This is ideal for I/O-bound operations where items can be processed independently.

## Key Features

- **Concurrent Processing**: All items are processed simultaneously
- **Performance Optimization**: Significant speedup for I/O-bound operations
- **Same Interface**: Extends `BaseHandler` with familiar 3-phase lifecycle
- **Error Handling**: If any item fails, the entire batch fails (fail-fast behavior)

## When to Use

✅ **Good for:**
- API calls to external services
- Database queries
- File I/O operations
- Independent computations
- Network requests

❌ **Not good for:**
- Sequential dependencies between items
- Rate-limited APIs (without throttling)
- Memory-intensive operations with large batches
- Operations requiring specific ordering

## Basic Usage

```typescript
import { ParallelBatchHandler } from '@/parallelBatchHandler/parallelBatchHandler';

interface ImageData {
  url: string;
  filename: string;
}

interface ProcessedImage {
  filename: string;
  size: number;
  processed: boolean;
}

interface SharedData {
  images: ImageData[];
  results: ProcessedImage[];
}

class ImageProcessor extends ParallelBatchHandler<ImageData, ProcessedImage, SharedData> {
  protected prepareBatchInputs(sharedData: Readonly<SharedData>): ImageData[] {
    return sharedData.images;
  }

  protected async processSingleItem(image: ImageData): Promise<ProcessedImage> {
    // Simulate async image processing
    const response = await fetch(image.url);
    const buffer = await response.arrayBuffer();
    
    return {
      filename: image.filename,
      size: buffer.byteLength,
      processed: true,
    };
  }

  protected processBatchResults(
    sharedData: SharedData,
    inputs: ImageData[],
    outputs: ProcessedImage[],
  ): ActionResult {
    sharedData.results = outputs;
    console.log(`Processed ${outputs.length} images concurrently`);
    return 'default';
  }
}

// Usage
const processor = new ImageProcessor();
const sharedData: SharedData = {
  images: [
    { url: 'https://example.com/image1.jpg', filename: 'image1.jpg' },
    { url: 'https://example.com/image2.jpg', filename: 'image2.jpg' },
    { url: 'https://example.com/image3.jpg', filename: 'image3.jpg' },
  ],
  results: [],
};

await processor.run(sharedData);
console.log(sharedData.results); // All images processed concurrently
```

## Performance Comparison

```typescript
// Sequential processing (BatchHandler)
// Time: ~3 seconds for 3 items (1 second each)
class SequentialProcessor extends BatchHandler<string, string> {
  protected async processSingleItem(item: string): Promise<string> {
    await delay(1000); // 1 second delay
    return `processed-${item}`;
  }
}

// Parallel processing (ParallelBatchHandler)  
// Time: ~1 second for 3 items (all processed simultaneously)
class ParallelProcessor extends ParallelBatchHandler<string, string> {
  protected async processSingleItem(item: string): Promise<string> {
    await delay(1000); // 1 second delay
    return `processed-${item}`;
  }
}
```

## Best Practices

1. **Independent Items**: Ensure items can be processed independently
2. **Error Handling**: Consider wrapping individual items in try-catch if you want partial success
3. **Memory Management**: Be mindful of memory usage with large batches
4. **Rate Limiting**: Implement throttling for external APIs
5. **Monitoring**: Log progress and performance metrics
