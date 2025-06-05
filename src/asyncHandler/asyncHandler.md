# AsyncHandler

AsyncHandler provides async-optimized handler lifecycle with retry logic and error handling. It's designed for I/O-intensive operations.

## Core Concept

AsyncHandler follows the same **3-phase lifecycle** as Handler, but with async methods throughout:

- **prepareInputsAsync** → Extract and preprocess data asynchronously
- **handleRequestAsync** → Core async computation (I/O, API calls, etc.)
- **processResultsAsync** → Update shared data and determine next action asynchronously

## Basic Usage

### Simple Async Handler

```typescript
interface APIData extends SharedData {
  userId: string;
  userData?: UserProfile;
  preferences?: UserPreferences;
}

class UserProfileHandler extends AsyncHandler<string, UserProfile, APIData> {
  protected async prepareInputsAsync(
    sharedData: Readonly<APIData>,
  ): Promise<string> {
    return sharedData.userId;
  }

  protected async handleRequestAsync(userId: string): Promise<UserProfile> {
    // Async API call
    const response = await fetch(`/api/users/${userId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch user ${userId}: ${response.status}`);
    }

    return await response.json();
  }

  protected async processResultsAsync(
    sharedData: APIData,
    inputs: string,
    outputs: UserProfile,
  ): Promise<string> {
    sharedData.userData = outputs;

    // Maybe fetch additional data asynchronously
    if (outputs.hasPreferences) {
      const prefs = await this.fetchUserPreferences(outputs.id);
      sharedData.preferences = prefs;
    }

    return 'profile_loaded';
  }

  private async fetchUserPreferences(userId: string): Promise<UserPreferences> {
    const response = await fetch(`/api/users/${userId}/preferences`);
    return await response.json();
  }
}

// Usage
const handler = new UserProfileHandler();
const data: APIData = { userId: 'user123' };

const action = await handler.run(data);
console.log('Action:', action); // 'profile_loaded'
console.log('User data:', data.userData);
```

### Database Operations

```typescript
interface DatabaseData extends SharedData {
  query: string;
  parameters?: any[];
  results?: any[];
  affectedRows?: number;
}

class DatabaseHandler extends AsyncHandler<
  QueryRequest,
  QueryResult,
  DatabaseData
> {
  protected async prepareInputsAsync(
    sharedData: Readonly<DatabaseData>,
  ): Promise<QueryRequest> {
    return {
      sql: sharedData.query,
      params: sharedData.parameters || [],
    };
  }

  protected async handleRequestAsync(
    request: QueryRequest,
  ): Promise<QueryResult> {
    // Simulate database connection and query
    const connection = await this.getConnection();

    try {
      const result = await connection.query(request.sql, request.params);
      return {
        rows: result.rows,
        rowCount: result.rowCount,
        success: true,
      };
    } finally {
      await connection.release();
    }
  }

  protected async processResultsAsync(
    sharedData: DatabaseData,
    inputs: QueryRequest,
    outputs: QueryResult,
  ): Promise<string> {
    sharedData.results = outputs.rows;
    sharedData.affectedRows = outputs.rowCount;

    // Log query performance asynchronously
    await this.logQueryPerformance(inputs.sql, outputs.rowCount);

    return outputs.rowCount > 0 ? 'data_found' : 'no_data';
  }

  private async getConnection(): Promise<DatabaseConnection> {
    // Database connection logic
    return await createConnection();
  }

  private async logQueryPerformance(
    sql: string,
    rowCount: number,
  ): Promise<void> {
    // Async logging without blocking main flow
    await fetch('/api/metrics', {
      method: 'POST',
      body: JSON.stringify({ sql, rowCount, timestamp: new Date() }),
    });
  }
}
```

## Configuration and Retry Logic

### Retry Configuration

```typescript
// Configure async retries with delays
const handler = new UserProfileHandler({
  maxRetries: 3, // Try up to 3 times
  retryDelayMs: 2000, // Wait 2 seconds between retries
});
```

### Async Error Handling

```typescript
class RobustAsyncHandler extends AsyncHandler<
  string,
  ProcessedData,
  SharedData
> {
  constructor() {
    super({
      maxRetries: 3,
      retryDelayMs: 1000,
    });
  }

  protected async handleRequestAsync(input: string): Promise<ProcessedData> {
    // This might fail due to network issues, rate limits, etc.
    const response = await fetch(`/api/process/${input}`);

    if (response.status === 429) {
      throw new Error('Rate limited');
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  }

  protected async handleErrorAsync(
    input: string,
    error: Error,
  ): Promise<ProcessedData> {
    console.warn(`Processing failed for ${input}:`, error.message);

    // Provide async fallback
    if (error.message.includes('Rate limited')) {
      // Wait longer and try a different endpoint
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return await this.tryFallbackEndpoint(input);
    }

    // Return default result instead of failing
    return {
      input,
      processed: false,
      fallback: true,
      error: error.message,
    };
  }

  protected async processResultsAsync(
    sharedData: SharedData,
    inputs: string,
    outputs: ProcessedData,
  ): Promise<string> {
    sharedData.result = outputs;

    return outputs.fallback ? 'fallback_used' : 'processing_complete';
  }

  private async tryFallbackEndpoint(input: string): Promise<ProcessedData> {
    const response = await fetch(`/api/fallback/process/${input}`);
    return await response.json();
  }
}
```

## Advanced Patterns

### File Processing Pipeline

```typescript
interface FileProcessingData extends SharedData {
  filePath: string;
  content?: string;
  processedContent?: string;
  metadata?: FileMetadata;
}

class AsyncFileProcessor extends AsyncHandler<
  string,
  ProcessedFile,
  FileProcessingData
> {
  protected async prepareInputsAsync(
    sharedData: Readonly<FileProcessingData>,
  ): Promise<string> {
    return sharedData.filePath;
  }

  protected async handleRequestAsync(filePath: string): Promise<ProcessedFile> {
    // Read file asynchronously
    const content = await fs.readFile(filePath, 'utf8');

    // Process content (could be CPU intensive)
    const processedContent = await this.processContent(content);

    // Get file metadata
    const stats = await fs.stat(filePath);

    return {
      originalPath: filePath,
      content,
      processedContent,
      metadata: {
        size: stats.size,
        lastModified: stats.mtime,
        processed: true,
      },
    };
  }

  protected async processResultsAsync(
    sharedData: FileProcessingData,
    inputs: string,
    outputs: ProcessedFile,
  ): Promise<string> {
    sharedData.content = outputs.content;
    sharedData.processedContent = outputs.processedContent;
    sharedData.metadata = outputs.metadata;

    // Save processed file asynchronously
    const outputPath = inputs.replace('.txt', '_processed.txt');
    await fs.writeFile(outputPath, outputs.processedContent);

    return 'file_processed';
  }

  private async processContent(content: string): Promise<string> {
    // Simulate async processing (e.g., calling external service)
    await new Promise((resolve) => setTimeout(resolve, 100));
    return content.toUpperCase().replace(/\s+/g, ' ');
  }
}
```

### Multi-Step API Workflow

```typescript
interface WorkflowData extends SharedData {
  searchQuery: string;
  searchResults?: SearchResult[];
  enrichedData?: EnrichedResult[];
  finalReport?: Report;
}

class MultiStepAPIHandler extends AsyncHandler<string, Report, WorkflowData> {
  protected async prepareInputsAsync(sharedData: Readonly<WorkflowData>): Promise<string> {
    return sharedData.searchQuery;
  }

  protected async handleRequestAsync(query: string): Promise<Report> {
    // Step 1: Search
    const searchResults = await this.performSearch(query);

    // Step 2: Enrich results with additional data
    const enrichedData = await this.enrichResults(searchResults);

    // Step 3: Generate report
    const report = await this.generateReport(enrichedData);

    return report;
  }

  protected async processResultsAsync(
    sharedData: WorkflowData,
    inputs: string,
    outputs: Report,
  ): Promise<string> {
    sharedData.finalReport = outputs;

    // Store intermediate results for debugging
    sharedData.searchResults = outputs.searchResults;
    sharedData.enrichedData = outputs.enrichedData;

    // Send notification asynchronously
    await this.sendCompletionNotification(outputs);

    return 'workflow_complete';
  }

  private async performSearch(query: string): Promise<SearchResult[]> {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data.results;
```
