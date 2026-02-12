# Memory System Architecture

Complete overview of Sybil's memory and semantic recall capabilities.

## Overview

The memory system combines multiple layers for intelligent context management:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Sybil Memory System                     │
├─────────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐                         │
│  │ Message      │    │ Working Memory   │    │ Vector      │                         │
│  │ History     │    │ (User Profile)   │    │ Store      │                         │
│  │ (Last 20     │    │ (Preferences)     │    │ + Embeds    │                         │
│ │  messages)   │    │ (Goals, etc.)    │    │            │                         │
│  └──────────────┘    └──────────────────┘    └──────────────┘                         │
│                                                              │
│  ┌──────────────────────────────────────────────────┐                │
│  │           Semantic Recall Processor             │                │
│  │    ↓                                         │                │
│  ┌──────────────┐    ┌──────────────────┐                   │
│  │ Vector Search │    │  Top 5 Similar   │                   │
│  │ Results     │←──│  Messages     │                    │
│  │             │    └──────────────┘     │                       │
│  │ Confidence:   │    0.8+ for exact     │                     │
│ │ - Similarity    │   Match           │                     │
│  └──────────────┘                         │ │
│                                             │
└──────────────────────────────────────────────┘                           │
```

---

## Components

### 1. Message History

**Location:** LibSQL database `messages` table

**Storage:**
- Raw message data
- Role (user/assistant/system/tool)
- Timestamps (created, updated)
- Thread ID and resource ID associations

**Purpose: Recent conversation context**

**Configuration:**
```typescript
lastMessages: 10,  // Number of recent messages
threadId: string,
resourceId: string,
```

---

### 2. Working Memory

**Location:** LibSQL database `working_memory` table

**Format: YAML template with variable substitution

**Template:**
```yaml
# User Profile & Context

## Personal Information
- **Name**: 
- **Location**: 
- **Timezone**: 
- **Occupation**: 

## Communication Preferences
- **Style**: [Formal/Casual/Technical]
- **Response Length**: [Concise/Detailed]
- **Preferred Topics**: 

## Goals & Objectives
- **Short-term Goals**:
- **Long-term Goals**:
- **Current Projects**:

## Learned Skills
- **Known Skills**: 
- **Skill Proficiency**: [Beginner/Intermediate/Advanced]

## Interaction History
- **First Contact**: 
- **Total Interactions**: 
- **Last Conversation Summary```

**Purpose:** Persistent user context across all conversations

**Access Patterns:**
```typescript
// Read working memory
const working = await memory.getWorkingMemory({
  threadId: "thread-123",
  resourceId: "user-456",
  scope: "resource",  // or "thread"
});

// Update working memory
await memory.updateWorkingMemory(threadId, resourceId, newInformation);
```

---

### 3. Vector Store & Semantic Recall

**Location:** LibSQL vector database

**Components:**

#### 3A. Embedding Model

**Model Options:**
```typescript
// Default (best quality)
EMBEDDING_MODEL=openai/text-embed-embedding-3-small  // ~0.02/1M tokens

// Lower cost
EMBEDDING_MODEL=openai/text-embedding-3-   // ~0.13/1M tokens

// Large embeddings
EMBEDDING_MODEL=openai/text-embedding-3-large  // ~0.13/1M tokens, better quality

// Google
EMBEDDING_MODEL=google/gemini-embedding-001

// Local (free, requires @mastra/fastembed)
EMBEDDING_MODEL=fastembed
```

**Operation:**
```typescript
// Convert message to vector
const vector = embedder.embed(message);
// Stored as high-dimensional array (1536 dimensions for small)
// Stores in LibSQL vector database
```

#### 3B. Vector Database (LibSQL Vector)

**Storage:** `vectors` table

**Operations:**
- Insert: Store new message embeddings
- Query: Find similar messages by cosine similarity
- Index: Optimized with vector similarity search

#### 3C. Semantic Recall Processor

**Configuration:**
```typescript
semanticRecall: {
  topK: 5,           // Retrieve top 5 similar messages
  messageRange: 2,   // Include 2 messages before/after each match
  scope: "resource",  // "thread" or "resource"
}
```

**Search Algorithm:**
```typescript
User: "What did we discuss yesterday about project X?"

1. Convert user query to vector: queryVector
2. Search vector database: similarity(queryVector, storedVectors)
3. Get top 5 most similar messages
4. Extract relevant portions (messageRange)
5. Combine into context message
6. Inject into conversation
```

**Similarity Calculation:**
- Uses cosine similarity on high-dimensional vectors
- Returns scores between 0 and 1
- Higher = more semantically similar
- Threshold: 0.7 for meaningful matches

**Message Range:**
```
Similar message found: "I think project X needs refactoring [line 10]"

With range: 2
  ├─ [line 8] "I think project X needs refactoring"
  ├─ [line 9] "because of..."  
  ├─ [line 10] "I think project X needs refactoring"  // ←
  ├─ [line 11] "the code has become..."
  └─ [line 12] "lots of technical debt"

→ Shows context around the key information
```

---

## Initialization

### Memory Module (`src/mastra/memory.ts`)

```typescript
import { Memory, LibSQLStore, LibSQLVector } from "@mastra/libsql";
import { ModelRouterEmbeddingModel } from "@mastra/core/llm";

export const memory = new Memory({
  storage: new LibSQLStore({
    url: process.env.DATABASE_URL || "file:./mastra.db",
    id: "mastra-storage",
  }),

  vector: new LibSQLVector({
    url: process.env.DATABASE_URL || "file:./mastra.db",
    id: "mastra-vector",
  }),

  embedder: new ModelRouterEmbeddingModel(
    process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small"
  ), // ← Selects model based on provider

  options: {
    workingMemory: {
      enabled: true,
      scope: "resource",
      // ... template
    },

    semanticRecall: {
      topK: 5,
      messageRange: 2,
      scope: "resource",  // Default: search all threads for this user
    },
  },
});
```

---

## Usage Patterns

### 1. Simple Query (Message History)

```typescript
const { messages } = await memory.recall({
  threadId: "thread-123",
  perPage: 50,
});

// Returns last 50 messages from conversation
```

### 2. Semantic Search (Find Relevant Past Info)

```typescript
const { messages } = await memory.recall({
  threadId: "thread-123",
  vectorSearchString: "What did we learn about project deadlines?",
  threadConfig: {
    semanticRecall: {
      topK: 3,
      messageRange: 2,
    },
  },
});

// Returns top 3 semantically similar messages
```

### 3. Working Memory (User Profile)

```typescript
const { workingMemory } = await memory.getWorkingMemory({
  threadId: "thread-123",
  resourceId: "user-456",
});

// Returns user profile template with values filled in
```

### 4. Filtered Retrieval

```typescript
const { messages } = await memory.recall({
  threadId: "thread-123",
  perPage: 100,
  filter: {
    dateRange: {
      start: new Date("2026-01-01"),
      end: new Date("2026-02-01"),
      startExclusive: false,
      endExclusive: true,
    }
  },
  orderBy: {
    field: "createdAt",
    direction: "DESC",
  },
});
```

---

## Database Schema

### Message History Table

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,  -- user/assistant/tool
  content TEXT,            -- can be object with parts
  thread TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata JSON             -- additional data
);

-- Indexes for performance
CREATE INDEX thread_idx ON messages(thread);
CREATE INDEX resource_idx ON messages(resource);
CREATE INDEX created_idx ON messages(created_at);
```

### Working Memory Table

```sql
CREATE TABLE working_memory (
  thread TEXT NOT NULL PRIMARY KEY,
  resource TEXT NOT NULL,
  working_memory TEXT NOT NULL
);
```

### Vector Storage (LibSQL)

```sql
CREATE TABLE IF NOT EXISTS vectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread TEXT NOT NULL,
  resource TEXT NOT NULL,
  vector TEXT NOT NULL,
  metadata JSON,
  updated_at TEXT NOT NULL
);

-- Vector similarity index
CREATE INDEX IF NOT EXISTS vectors_vector_idx
  ON vectors(COSINE_DISTANCE(embedding, embedding));
```

---

## Performance Optimization

### 1. Minimize Vector Operations

```typescript
// ❌ Bad: Many small embedding operations
for (const msg of messages) {
  await embedder.embed(msg);  // Individual calls = slow
}

// ✅ Good: Batch embeddings
if (messages.length > 0) {
  const vectors = await Promise.all(
    messages.map(msg => embedder.embed(msg.id))
  );
  await vectorStore.insert(vectors);  // Batch insert
}
```

### 2. Optimize Index Queries

```typescript
// Set topK based on use case
topK: 3,    // Fast retrieval, less comprehensive
topK: 5,    // Default, good balance
topK: 10,   → Slow but more comprehensive
topK: 20,   → Very slow, use sparingly
```

### 3. Adjust context window

```typescript
messageRange: 2   // 2 messages before/after
messageRange: 5   // More context (slower)
messageRange: 0, // Just extract message
```

### 4. Use Efficient Embeddings

```typescript
// Smaller embeddings = Faster, cheaper
EMBEDDING_MODEL=openai/text-embed-3   // 1536 dims

// Larger embeddings = Slower, more accurate
EMBEDDING_MODEL=openai/textembed-3-large   // 3072 dims
EMBEDDING_MODEL=openai/textembedding-3-small   // 1536 dims ✨
```

### 5. Limit Context Window

```typescript
const memory = new Memory({
  // 3072 tokens recommended for gpt-4o
  // Adjust based on model context window
  // For gpt-3.5: 128k context, use lower topK (3)
  // For gpt-4o-mini: 128k context, use lower topK (3)
  // For ollama: 4k-8k context, higher topK (5-7)
});
```

---

## Troubleshooting

### "No semantic search results"

```typescript
// Check if vector search is enabled
// - Verify EMBEDDING_MODEL is set
// - Verify vector database exists

// Increase topK temporarily
topK: 10  // Try retrieving more results
```

### "Slow responses"

```typescript
// 1. Check topK setting (default: 5)
// 2. Reduce topK: 3
// 3. Check model context window limits
// 4. Consider disabling vector search for speed
```

### "High token usage"

```typescript
// Semantic search adds embeddings on every save
// Reduce frequency:
// - Lower topK
// - Increase semanticRecall.minSimilarity score (default: 0.3)
// - Reduce messageRange
```

### Memory growth

```typescript
// Working memory and message history can grow large
// Implement cleanup policies:

// 1. Age-based pruning
// 2. Size-based cleanup
// 3. Priority-based retention
```

---

## Advanced Topics

### 1. Multi-Thread Safety

```typescript
// Memory operations are NOT thread-safe by default
// Use locks:

import { Mutex } from "async-mutex";
const memoryLock = new Mutex();

async function safeMemoryWrite(key, value) {
  const lock = await memoryLock.acquire();
  try {
    await memory.updateWorkingMemory(key, value);
  } finally {
    await lock.release();
  }
}
```

### 2. Memory Sharding

```typescript
// Can implement per-user memory shards:
//  threadId-userId pair mapping

const shards: Map<string, string> = new Map();

function getMemoryShard(threadId: string, resourceId: string): string {
  const key = `${threadId}:${resourceId}`;
  return shards.get(key) ?? threadId;
}
```

### 3. Memory Export/Import

```typescript
// Export memory for backup
const { messages, workingMemory } = await memory.export({
  threadId: "thread-123",
  resourceId: "user-456",
});

// Import memory (backup restore)
await memory.import({
  messages,
  workingMemory,
});
```

### 4. Memory Analytics

```typescript
// Track usage patterns
const stats = await memory.getThreadStats({
  threadId: "thread-123",
});

// Get conversation timeline
// Get most frequently used skills
// Identify engagement metrics
```

---

## Future Enhancements

### 1. Hierarchical Memory
- Long-term vs short-term memory
- Different retention policies per data type

### 2. Memory Deduplication
- Prevent storing redundant information
- Track message fingerprints

### 3. Memory Compression
- Compress old messages
- Archive cold storage
- Free tier memory space

### 4. Cross-Agent Memory Sharing
- Shared knowledge base
- Collaborative learning
- Distributed updates

### 5. Smart Retrieval
- Query expansion
- Mixed semantic + keyword search
- Re-ranking of results

### 6. Memory Graph
- Build knowledge graph
- Connect related concepts
- Discover hidden relationships

---

## Comparison: keyword vs Semantic

| Feature | Keyword Search | Semantic Search |
|---------|---------------|----------------|
| Relevance | Must match exact words | Meaning-based similarity |
| Understanding | Literal match (cat ≠ "kitty") | Handles synonyms ("animal" ≈ "feline") |
| Context | No surrounding context | Includes conversation context |
| Speed | Very fast | Slightly slower (embeddings) |
| Scalability | Linear scan | Vector similarity search |
| Intelligence | None | High (understands intent) |

---

**Keywords: exact substring match**  
**Semantic search: vector similarity with embeddings** ✨

---

**Your agent now truly understands your conversations! 🧠**
