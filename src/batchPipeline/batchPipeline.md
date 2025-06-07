# BatchPipeline

**BatchPipeline** runs an entire pipeline multiple times with different parameter sets. This is different from BatchHandler, which processes multiple items through a single handler.

## Core Concept

BatchPipeline takes a **complete multi-step workflow** and executes it multiple times:

- **Template Pipeline** → The workflow to execute repeatedly
- **Parameter Sets** → Different configurations for each execution
- **Isolation** → Each execution has its own parameter context
- **Aggregation** → Collect results after all executions complete

## Use Cases

- **File Processing**: Run a complex workflow (read→analyze→transform→save) on multiple files
- **Data Pipeline**: Process multiple datasets through the same analysis pipeline  
- **Configuration Testing**: Run the same workflow with different settings
- **Multi-Document Processing**: Apply complete document processing workflows to multiple documents

## Basic Usage

### Simple File Processing

```typescript
interface FileData extends SharedData {
  filenames: string[];
  processedFiles?: ProcessedFile[];
  currentFile?: string;
  content?: string;
}

// Step 1: Create handlers for your workflow
class ReadFileHandler extends Handler<string, string, FileData> {
  protected prepareInputs(sharedData: Readonly<FileData>): string {
    return sharedData.filename as string; // From parameters
  }

  protected async handleRequest(filename: string): Promise<string> {
    return await readFile(filename);
  }

  protected processResults(
    sharedData: FileData,
    inputs: string,
    outputs: string,
  ): string {
    sharedData.currentFile = inputs;
    sharedData.content = outputs;
    return 'file_read';
  }
}

class ProcessFileHandler extends Handler<string, ProcessedFile, FileData> {
  protected prepareInputs(sharedData: Readonly<FileData>): string {
    return sharedData.content || '';
  }

  protected async handleRequest(content: string): Promise<ProcessedFile> {
    // Complex processing logic
    const processed = await analyzeAndTransform(content);
    return {
      originalLength: content.length,
      processedContent: processed,
      timestamp: new Date(),
    };
  }

  protected processResults(
    sharedData: FileData,
    inputs: string,
    outputs: ProcessedFile,
  ): string {
    if (!sharedData.processedFiles) sharedData.processedFiles = [];
    sharedData.processedFiles.push(outputs);
    return 'processing_complete';
  }
}

// Step 2: Build the template pipeline
const readHandler = new ReadFileHandler();
const processHandler = new ProcessFileHandler();

readHandler.connectTo(processHandler, 'file_read');

const fileProcessingPipeline = new Pipeline(readHandler);

// Step 3: Create BatchPipeline
class ProcessMultipleFiles extends BatchPipeline<FileData> {
  protected prepareBatchParams(sharedData: Readonly<FileData>): HandlerParams[] {
    // Convert filenames to parameter sets
    return sharedData.filenames.map(filename => ({ filename }));
  }

  protected processBatchResults(
    sharedData: FileData,
    inputs: HandlerParams[],
    outputs: void,
  ): string {
    const processedCount = sharedData.processedFiles?.length || 0;
    const expectedCount = inputs.length;
    
    if (processedCount === expectedCount) return 'all_files_processed';
    if (processedCount > 0) return 'partial_success';
    return 'processing_failed';
  }
}

// Usage
const batchProcessor = new ProcessMultipleFiles(fileProcessingPipeline);
const result = await batchProcessor.run({
  filenames: ['doc1.txt', 'doc2.txt', 'doc3.txt']
});

console.log('Processed files:', result.processedFiles);
```

### Multi-Step Data Analysis

```typescript
interface AnalysisData extends SharedData {
  datasets: Dataset[];
  currentDataset?: Dataset;
  analysis?: AnalysisResult;
  reports?: Report[];
}

// Create analysis pipeline: load → clean → analyze → report
class LoadDataHandler extends Handler<Dataset, CleanData, AnalysisData> {
  protected prepareInputs(sharedData: Readonly<AnalysisData>): Dataset {
    return sharedData.currentDataset!; // From batch parameters
  }

  protected async handleRequest(dataset: Dataset): Promise<CleanData> {
    return await loadAndCleanData(dataset);
  }

  protected processResults(
    sharedData: AnalysisData,
    inputs: Dataset,
    outputs: CleanData,
  ): string {
    sharedData.cleanData = outputs;
    return 'data_loaded';
  }
}

class AnalyzeDataHandler extends Handler<CleanData, AnalysisResult, AnalysisData> {
  protected prepareInputs(sharedData: Readonly<AnalysisData>): CleanData {
    return sharedData.cleanData!;
  }

  protected async handleRequest(data: CleanData): Promise<AnalysisResult> {
    return await performStatisticalAnalysis(data);
  }

  protected processResults(
    sharedData: AnalysisData,
    inputs: CleanData,
    outputs: AnalysisResult,
  ): string {
    sharedData.analysis = outputs;
    return 'analysis_complete';
  }
}

class GenerateReportHandler extends Handler<AnalysisResult, Report, AnalysisData> {
  protected prepareInputs(sharedData: Readonly<AnalysisData>): AnalysisResult {
    return sharedData.analysis!;
  }

  protected async handleRequest(analysis: AnalysisResult): Promise<Report> {
    return await generateReport(analysis, sharedData.currentDataset!.name);
  }

  protected processResults(
    sharedData: AnalysisData,
    inputs: AnalysisResult,
    outputs: Report,
  ): string {
    if (!sharedData.reports) sharedData.reports = [];
    sharedData.reports.push(outputs);
    return 'report_generated';
  }
}

// Build analysis pipeline
const loader = new LoadDataHandler();
const analyzer = new AnalyzeDataHandler();
const reporter = new GenerateReportHandler();

loader.connectTo(analyzer, 'data_loaded');
analyzer.connectTo(reporter, 'analysis_complete');

const analysisPipeline = new Pipeline(loader);

// Batch process multiple datasets
class BatchAnalysis extends BatchPipeline<AnalysisData> {
  protected prepareBatchParams(sharedData: Readonly<AnalysisData>): HandlerParams[] {
    return sharedData.datasets.map(dataset => ({ currentDataset: dataset }));
  }

  protected processBatchResults(
    sharedData: AnalysisData,
    inputs: HandlerParams[],
    outputs: void,
  ): string {
    const reportCount = sharedData.reports?.length || 0;
    return reportCount === inputs.length ? 'analysis_complete' : 'analysis_partial';
  }
}

const batchAnalyzer = new BatchAnalysis(analysisPipeline);
```

## vs BatchHandler

| Aspect | BatchHandler | BatchPipeline |
|--------|--------------|---------------|
| **Scope** | Single handler logic | Complete multi-step workflow |
| **Processing** | Items through one operation | Parameter sets through entire pipeline |
| **Use Case** | Transform array of data | Run workflow multiple times |
| **Complexity** | Simple operations | Complex workflows |

### When to Use BatchHandler
```typescript
// Process multiple texts through single summarization step
class TextSummarizer extends BatchHandler<string, string, SummaryData> {
  protected prepareBatchInputs(sharedData: Readonly<SummaryData>): string[] {
    return sharedData.texts;
  }

  protected async processSingleItem(text: string): Promise<string> {
    return await summarizeText(text);
  }
}
```

### When to Use BatchPipeline
```typescript
// Process multiple documents through complete workflow:
// read → analyze → summarize → save → email notification
class DocumentWorkflow extends BatchPipeline<DocumentData> {
  protected prepareBatchParams(sharedData: Readonly<DocumentData>): HandlerParams[] {
    return sharedData.documents.map(doc => ({ documentId: doc.id }));
  }
}
```

## Advanced Patterns

### Conditional Batch Processing

```typescript
class ConditionalBatchProcessor extends BatchPipeline<ProcessingData> {
  protected prepareBatchParams(sharedData: Readonly<ProcessingData>): HandlerParams[] {
    // Only process items that meet certain criteria
    return sharedData.items
      .filter(item => item.status === 'pending')
      .map(item => ({ 
        itemId: item.id, 
        priority: item.priority 
      }));
  }

  protected processBatchResults(
    sharedData: ProcessingData,
    inputs: HandlerParams[],
    outputs: void,
  ): string {
    const processedCount = sharedData.processedItems?.length || 0;
    const totalEligible = inputs.length;
    
    if (processedCount === 0) return 'no_items_processed';
    if (processedCount === totalEligible) return 'all_eligible_processed';
    return 'partial_processing';
  }
}
```

### Error Recovery in Batch Processing

```typescript
class RobustBatchProcessor extends BatchPipeline<RobustData> {
  private failedItems: string[] = [];

  protected prepareBatchParams(sharedData: Readonly<RobustData>): HandlerParams[] {
    return sharedData.items.map(item => ({ 
      itemId: item.id,
      data: item.data 
    }));
  }

  // Override to handle individual pipeline failures
  private async executePipelineWithParams(params: HandlerParams): Promise<void> {
    try {
      await super.executePipelineWithParams(params);
    } catch (error) {
      console.warn(`Failed to process item ${params.itemId}:`, error);
      this.failedItems.push(params.itemId as string);
      // Continue with other items instead of failing entire batch
    }
  }

  protected processBatchResults(
    sharedData: RobustData,
    inputs: HandlerParams[],
    outputs: void,
  ): string {
    const successCount = inputs.length - this.failedItems.length;
    const failureRate = this.failedItems.length / inputs.length;
    
    // Store failed items for retry or manual review
    sharedData.failedItems = this.failedItems;
    
    if (failureRate === 0) return 'all_succeeded';
    if (failureRate < 0.1) return 'mostly_succeeded'; // < 10% failure
    if (successCount > 0) return 'partial_success';
    return 'batch_failed';
  }
}
```

### Dynamic Parameter Generation

```typescript
class DynamicBatchProcessor extends BatchPipeline<DynamicData> {
  protected prepareBatchParams(sharedData: Readonly<DynamicData>): HandlerParams[] {
    const baseParams = sharedData.baseConfiguration;
    const variations = sharedData.parameterVariations;
    
    // Generate all combinations of parameters
    const parameterSets: HandlerParams[] = [];
    
    for (const variation of variations) {
      parameterSets.push({
        ...baseParams,
        ...variation,
        executionId: `exec_${Date.now()}_${Math.random()}`
      });
    }
    
    return parameterSets;
  }

  protected processBatchResults(
    sharedData: DynamicData,
    inputs: HandlerParams[],
    outputs: void,
  ): string {
    // Analyze results across all parameter combinations
    const results = sharedData.experimentResults || [];
    const bestResult = results.reduce((best, current) => 
      current.score > best.score ? current : best
    );
    
    sharedData.bestConfiguration = bestResult.parameters;
    return 'experiment_complete';
  }
}
```

## Integration with Other Components

### Connecting to Other Handlers

```typescript
const batchProcessor = new FileBatchProcessor(fileWorkflow);
const reportGenerator = new ReportGenerator();
const emailNotifier = new EmailNotifier();

// Connect batch processing to downstream handlers
batchProcessor.connectTo(reportGenerator, 'all_files_processed');
batchProcessor.connectTo(emailNotifier, 'partial_success');
reportGenerator.connectTo(emailNotifier, 'report_generated');

const completePipeline = new Pipeline(batchProcessor);
```

### Nested Batch Processing

```typescript
// Process multiple projects, each containing multiple files
class ProjectBatch extends BatchPipeline<ProjectData> {
  protected prepareBatchParams(sharedData: Readonly<ProjectData>): HandlerParams[] {
    return sharedData.projects.map(project => ({ 
      projectId: project.id,
      files: project.files 
    }));
  }
}

// Each project uses a file batch processor
const fileBatch = new FileBatchProcessor(fileWorkflow);
const projectPipeline = new Pipeline(fileBatch);
const projectBatch = new ProjectBatch(projectPipeline);
```

## Best Practices

### 1. Keep Pipeline Templates Stateless

```typescript
// ✅ Good - handlers don't maintain state between executions
class StatelessHandler extends Handler<Input, Output, SharedData> {
  protected async handleRequest(input: Input): Promise<Output> {
    return processInput(input); // Pure function
  }
}

// ❌ Bad - handler maintains state
class StatefulHandler extends Handler<Input, Output, SharedData> {
  private counter = 0; // This will be shared across batch executions!
  
  protected async handleRequest(input: Input): Promise<Output> {
    this.counter++; // State pollution
    return processInput(input, this.counter);
  }
}
```

### 2. Use Clear Parameter Names

```typescript
// ✅ Good - descriptive parameter names
protected prepareBatchParams(sharedData: Readonly<Data>): HandlerParams[] {
  return sharedData.documents.map(doc => ({
    documentId: doc.id,
    documentPath: doc.path,
    processingPriority: doc.priority
  }));
}

// ❌ Bad - generic parameter names
protected prepareBatchParams(sharedData: Readonly<Data>): HandlerParams[] {
  return sharedData.items.map(item => ({ item })); // Unclear what handlers receive
}
```

### 3. Handle Empty Batches Gracefully

```typescript
protected prepareBatchParams(sharedData: Readonly<Data>): HandlerParams[] {
  const items = sharedData.items || [];
  
  if (items.length === 0) {
    console.warn('No items to process in batch');
  }
  
  return items.map(item => ({ itemId: item.id }));
}

protected processBatchResults(
  sharedData: Data,
  inputs: HandlerParams[],
  outputs: void,
): string {
  if (inputs.length === 0) return 'empty_batch';
  
  const processedCount = sharedData.results?.length || 0;
  return processedCount === inputs.length ? 'success' : 'partial';
}
```

### 4. Provide Meaningful Batch Results

```typescript
protected processBatchResults(
  sharedData: Data,
  inputs: HandlerParams[],
  outputs: void,
): string {
  const results = sharedData.processingResults || [];
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;
  
  // Store summary for downstream handlers
  sharedData.batchSummary = {
    totalAttempted: inputs.length,
    successCount,
    failureCount,
    successRate: successCount / inputs.length
  };
  
  // Route based on success rate
  if (successCount === inputs.length) return 'complete_success';
  if (successCount > inputs.length * 0.8) return 'mostly_successful';
  if (successCount > 0) return 'partial_success';
  return 'batch_failed';
}
```

BatchPipeline enables powerful workflow patterns by allowing you to scale any pipeline to process multiple parameter sets efficiently while maintaining clean separation between individual executions.