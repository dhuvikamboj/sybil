import { LibSQLStore, LibSQLVector } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { fastembed } from "@mastra/fastembed";

let memoryInstance: Memory | null = null;

/**
 * Create memory instance with vector storage and semantic search
 */
export function createMemoryInstance(): Memory {
  if (!memoryInstance) {
    const storage = new LibSQLStore({
      id: "mastra-storage",
      url: process.env.DATABASE_URL || "file:./mastra.db",
    });

    // Try to initialize vector components, but handle missing API keys gracefully
    let vectorConfig = {};
    try {
      // Vector store for semantic search
      const vector = new LibSQLVector({
        id: "mastra-vector",
        url: process.env.DATABASE_URL || "file:./mastra.db",
      });

      // Embedding model for converting messages to vectors
      const embedder = fastembed.small

      vectorConfig = { vector, embedder };
    } catch (error) {
      // If embedding model fails to initialize, continue without vector search
      console.warn("Warning: Vector search not available - missing API keys");
      vectorConfig = {};
    }

    memoryInstance = new Memory({
      storage,
      ...vectorConfig,
      options: {
        workingMemory: {
          enabled: true,
          scope: "resource",
          template: `# User Profile & Context

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
- **Last Conversation Summary**:

## Preferences & Notes
- **Important Dates**: 
- **Preferences**:
- **Avoid Topics**:
`,
        },
        ...(Object.keys(vectorConfig).length > 0 ? {
          semanticRecall: {
            topK: 5, // Retrieve 5 most similar messages
            messageRange: 2, // Include 2 messages before and after each match
            scope: "resource", // Search across all threads for this user
          },
        } : {}),
      },
    });
  }
  
  return memoryInstance;
}

// Export memory instance for direct access
export const memory = createMemoryInstance();

// Export for use in Mastra config
export function getMemoryStorage() {
  return new LibSQLStore({
    id: "mastra-storage",
    url: process.env.DATABASE_URL || "file:./mastra.db",
  });
}
