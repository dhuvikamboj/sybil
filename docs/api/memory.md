# Memory System API Reference

Complete API documentation for Sybil's memory system including message history, working memory, and semantic recall with vector search.

## Memory Overview

The memory system consists of three components:

| Component | Description |
|-----------|-------------|
| **Message History** | Persistent conversation history with configurable limit |
| **Working Memory** | Short-term context window for recent interactions |
| **Semantic Recall** | Vector-based memory retrieval using semantic similarity search |

---

## Memory Configuration

### Default Configuration

```typescript
// From src/mastra/memory.ts
const memory = {
  messageHistory: {
    lastMessages: 50  // Remember last 50 messages
  },
  workingMemory: windowMemory({ size: 5 }),  // 5-slot window
  semanticRecall: {
    embedder: ModelRouterEmbeddingModel,  // Generate embeddings
    vector: LibSQLVector,  // Vector storage
    topK: 5,  // Return top 5 matches
    messageRange: 2,  // Include 2 messages before/after
    scope: "resource"  // Match on resource ID
  }
};
```

### Using Memory in Agents

```typescript
import { memory } from "../mastra/memory";

const agent = new Agent({
  name: "my-agent",
  model: createModel(),
  memory: memory,  // Use configured memory
  // ... other config
});
```

---

## Message History

Stores and retrieves conversation history with automatic persistence.

### Configuration

```typescript
{
  messageHistory: {
    lastMessages: 50,  // Number of messages to store
    storage: "libsql",  // Storage backend (LibSQL)
    retentionDays: null  // Optional: auto-delete older messages
  }
}
```

### API

**Storing Messages:**

```typescript
import { memory } from "../mastra/memory";

// Automatically handled by agent
const agent = new Agent({ memory });

// Manually add message
await memory.addMessage({
  role: "user",
  content: "Hello, world!",
  resourceId: "conversation-123",
  createdAt: new Date()
});
```

**Retrieving Messages:**

```typescript
// Get recent messages
const messages = await memory.getMessages({
  resourceId: "conversation-123",
  limit: 10
});

// Returns:
[
  {
    id: "msg-1",
    role: "user",
    content: "Hello, world!",
    resourceId: "conversation-123",
    createdAt: "2024-01-01T00:00:00Z"
  },
  // ...
]
```

**Message Structure:**

```typescript
interface MemoryMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  resourceId: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  embedding?: number[];  // Vector for semantic search
}
```

---

## Working Memory

Short-term memory that maintains a sliding window of recent context.

### Configuration

```typescript
import { windowMemory } from "@mastra/core/memory";

const workingMemory = windowMemory({
  size: 5  // Keep 5 most recent items
});
```

### API

**Adding Items:**

```typescript
await workingMemory.add({
  key: "currentTask",
  value: "Writing documentation",
  context: { timestamp: Date.now() }
});
```

**Retrieving Items:**

```typescript
// Get all items in window
const items = await workingMemory.getAll();
// Returns: array of size <= 5

// Get specific item
const task = await workingMemory.get("currentTask");

// Get by context
const recent = await workingMemory.findBy(ctx => ctx.timestamp > threshold);
```

**Clearing:**

```typescript
await workingMemory.clear();
```

**Automatic Window Management:**

```typescript
// When adding 6th item to size-5 window:
// 1. Oldest item is automatically removed
// No manual cleanup needed
```

---

## Semantic Recall

Vector-based memory retrieval using semantic similarity search.

### Architecture

```
Query Text
    ↓
Embedding Generation (ModelRouterEmbeddingModel)
    ↓
Vector Representation (1536 dimensions)
    ↓
Similarity Search (LibSQLVector)
    ↓
Top-K Similar Memories Retrieved
    ↓
Context Injection (messageRange)
```

### Configuration

```typescript
{
  semanticRecall: {
    // Embedding model - converts text to vectors
    embedder: ModelRouterEmbeddingModel,

    // Vector store - stores and searches vectors
    vector: LibSQLVector,

    // Search parameters
    topK: 5,  // Number of memories to retrieve
    messageRange: 2,  // Include 2 messages before/after each match
    scope: "resource",  // Match on resource ID

    // Optional: similarity threshold
    threshold: 0.7  // Minimum similarity score (0-1)
  }
}
```

### Embedding Generation

```typescript
import { ModelRouterEmbeddingModel } from "@mastra/core/embeddings";

const embedder = ModelRouterEmbeddingModel;

// Generate embedding for semantic search
const embedding = await embedder.generateEmbedding({
  input: "What did we discuss about AI?"
});

// Returns: number[1536] - 1536-dimensional vector
```

### Vector Storage

```typescript
import { LibSQLVector } from "libsql-vector";

const vectorStore = LibSQLVector;

// Store vector with indexing
await vectorStore.insert([
  {
    id: "memory-123",
    values: embedding,  // number[1536]
    metadata: {
      content: "We discussed AI models and their performance",
      timestamp: Date.now(),
      resourceId: "conversation-123"
    }
  }
]);
```

### Semantic Search

```typescript
// Search for similar memories
const results = await vectorStore.query({
  vector: queryEmbedding,
  topK: 5,
  filter: {
    resourceId: "conversation-123"  // Scope by resource
  },
  includeMetadata: true
});

// Returns:
[
  {
    id: "memory-123",
    score: 0.92,  // Similarity score (0-1)
    metadata: {
      content: "We discussed AI models...",
      timestamp: 1704067200000,
      resourceId: "conversation-123"
    }
  },
  // ... more results
]
```

### Context Injection

```typescript
// After retrieving memories, inject context
const memories = [/* retrieved memories */];
const contextWindow = 2;  // messageRange

// Include 2 messages before/after each retrieval
const enrichedContext = await enrichWithMessageRange(
  memories,
  contextWindow,
  resourceId
);

// This provides context around matches
```

---

## Memory Processor

Automatic memory retrieval using semantic search during agent inference.

### How It Works

1. **Query Generation:** Extract key concepts from user message
2. **Embedding:** Convert query to vector
3. **Similarity Search:** Find top-K related memories
4. **Context Injection:** Add retrieved memories to agent context

### Configuration

```typescript
// Already enabled in src/processors/index.ts
const enhancedSemanticRecall = {
  type: "memory",
  config: {
    topK: 5,
    messageRange: 2,
    threshold: 0.7,
    scope: "resource"
  }
};
```

### Automatic Use

```typescript
// Agent automatically retrieves relevant memories
const response = await agent.generate({
  messages: [{ role: "user", content: "What was that about?" }]
});

// Memories automatically injected into context before inference
```

**Manual Control:**

```typescript
// Disable memory for this request
const response = await agent.generate({
  messages: [{ role: "user", content: "..." }],
  options: {
    disableMemory: true
  }
});
```

---

## API Reference

### Memory Instance

```typescript
const memory = {
  // Add message to history
  addMessage(message: MemoryMessage): Promise<void>

  // Get messages for a resource
  getMessages(options: {
    resourceId: string;
    limit?: number;
    before?: Date;
    after?: Date;
  }): Promise<MemoryMessage[]>

  // Search messages by content
  searchMessages(query: string, options?: SearchOptions): Promise<MemoryMessage[]>

  // Update message metadata
  updateMessage(id: string, updates: Partial<MemoryMessage>): Promise<void>

  // Delete message
  deleteMessage(id: string): Promise<void>

  // Clear all messages for resource
  clearMessages(resourceId: string): Promise<void>
};
```

### Working Memory

```typescript
const workingMemory = {
  // Add item to window
  add(item: { key: string; value: any; context?: any }): Promise<void>

  // Get item by key
  get(key: string): Promise<any>

  // Get all items
  getAll(): Promise<Array<{ key: string; value: any; context?: any }>>

  // Find items by predicate
  findBy(predicate: (ctx: any) => boolean): Promise<any[]>

  // Update item
  update(key: string, value: any): Promise<void>

  // Remove item
  remove(key: string): Promise<void>

  // Clear all
  clear(): Promise<void>
};
```

### Semantic Recall

```typescript
const semanticRecall = {
  // Search for similar memories
  search(options: {
    query: string;
    resourceId: string;
    topK?: number;
    threshold?: number;
  }): Promise<Array<{
    message: MemoryMessage;
    score: number;
    context: MemoryMessage[];
  }>>

  // Generate embedding for text
  generateEmbedding(text: string): Promise<number[]>

  // Upsert message with embedding
  upsert(message: MemoryMessage): Promise<void>
};
```

---

## Usage Examples

### Conversation Memory

```typescript
async function conversationExample() {
  const agent = new Agent({ memory });

  // First turn
  await agent.generate({
    messages: [{ role: "user", content: "I'm working on a React project" }]
  });

  // Agent remembers this
  const response = await agent.generate({
    messages: [{ role: "user", content: "What should I do?" }]
  });

  // Response will reference React context
}
```

### Working Memory Example

```typescript
async function taskTracking() {
  await workingMemory.add({
    key: "currentTask",
    value: "Implement authentication",
    context: { priority: "high" }
  });

  const task = await workingMemory.get("currentTask");
  console.log(task);  // "Implement authentication"
}
```

### Semantic Search Example

```typescript
async function searchMemories() {
  const results = await semanticRecall.search({
    query: "AI model performance",
    resourceId: "conversation-123",
    topK: 5,
    threshold: 0.7
  });

  for (const result of results) {
    console.log(`Score: ${result.score}`);
    console.log(`Content: ${result.message.content}`);
    console.log(`Context: ${result.context.length} related messages`);
  }
}
```

### Custom Memory Configuration

```typescript
const customMemory = {
  messageHistory: { lastMessages: 20 },
  workingMemory: windowMemory({ size: 3 }),
  semanticRecall: {
    embedder: ModelRouterEmbeddingModel,
    vector: LibSQLVector,
    topK: 3,
    messageRange: 1,
    threshold: 0.8,
    scope: "global"  // Search all resources
  }
};

const agent = new Agent({ memory: customMemory });
```

---

## Performance Considerations

### Message History
- **Storage:** LibSQL database (persistent)
- **Retrieval:** O(n) for n messages (fast)
- **Optimization:** Use `lastMessages` to limit stored count

### Working Memory
- **Storage:** In-memory (ephemeral)
- **Retrieval:** O(1) direct access
- **Optimization:** Keep `size` small (3-10 items)

### Semantic Recall
- **Embedding:** ~500ms per text (depends on model)
- **Search:** O(log n) with vector index (fast)
- **Optimization:**
  - Lower `topK` to reduce context
  - Increase `threshold` to filter low-quality matches
  - Cache embeddings for frequent queries

### Memory Strategies

```typescript
// For long conversations (1000+ messages)
{ lastMessages: 100, semantic: { topK: 3 } }

// For context-heavy tasks
{ lastMessages: 30, semantic: { topK: 5, messageRange: 3 } }

// For fast, lightweight agents
{ lastMessages: 10, semantic: { topK: 2, threshold: 0.8 } }
```

---

## Error Handling

```typescript
try {
  await memory.getMessages({ resourceId: "conv-123" });
} catch (error) {
  if (error.code === "STORAGE_ERROR") {
    console.error("Database error:", error.details);
  } else if (error.code === "EMBEDDING_FAILED") {
    console.error("Failed to generate embedding:", error.details);
  } else if (error.code === "VECTOR_SEARCH_FAILED") {
    console.error("Vector search error:", error.details);
  }
}
```

Common error codes:
- `STORAGE_ERROR` - Database connection/query failed
- `EMBEDDING_FAILED` - Embedding generation failed
- `VECTOR_SEARCH_FAILED` - Vector search failed
- `MISSING_API_KEY` - Embedding provider key missing
- `INVALID_MEMORY_CONFIG` - Configuration error

---

## Best Practices

1. **Choose appropriate `lastMessages`**: 20-100 for most use cases
2. **Adjust `topK`**: 3-7 for balanced relevance vs. context
3. **Use `messageRange`**: 1-3 to provide context without noise
4. **Set `threshold`**: 0.7-0.85 to reduce low-quality matches
5. **Scope appropriately**: Use `resource` ID for conversations, `global` for shared knowledge
6. **Monitor embeddings costs**: Count tokens when using paid providers
7. **Graceful degradation**: Handle missing API keys without crashing

---

## Troubleshooting

### Memory Not Working

```bash
# Check if embedding model has API key
echo $OPENAI_API_KEY  # or your provider key

# If missing, vector searches return empty
# Graceful handling in src/mastra/memory.ts prevents crash
```

### Slow Performance

```typescript
// Reduce semantic search overhead
{ semanticRecall: { topK: 2, threshold: 0.85 } }

// Reduce message history
{ messageHistory: { lastMessages: 20 } }
```

### Poor Recall Quality

```typescript
// Increase topK and decrease threshold
{ semanticRecall: { topK: 7, threshold: 0.65 } }

// Increase messageRange for more context
{ semanticRecall: { messageRange: 3 } }
```

### Memory Exceeds Context

```typescript
// Reduce memory usage
{ messageHistory: { lastMessages: 30 } }
{ semanticRecall: { topK: 3, messageRange: 1 } }
```
