/**
 * Enhanced Semantic Recall Processor
 * 
 * Provides intelligent memory retrieval using keyword-based semantic search.
 * Designed to be upgraded to full vector embeddings when vector infrastructure is available.
 */

import { type Processor } from "@mastra/core/processors";
import { createMemoryInstance } from "../mastra/memory.js";

let memoryInstance: ReturnType<typeof createMemoryInstance> | null = null;

function getMemory() {
  if (!memoryInstance) {
    memoryInstance = createMemoryInstance();
  }
  return memoryInstance;
}

interface SemanticRecallResult {
  threadId: string;
  resourceId: string;
  relevance: number;
  timestamp: Date;
  summary: string;
}

/**
 * Enhanced Semantic Recall Processor
 * 
 * Currently uses keyword-based semantic search, designed to be upgraded
 * to full vector embeddings when vector database infrastructure is available.
 */
export class EnhancedSemanticRecall implements Processor {
  id = "enhanced-semantic-recall";
  name = "Enhanced Semantic Recall";

  /**
   * Extract keywords from user message for semantic search
   */
  private extractKeywords(message: string): string[] {
    // Extract important words (nouns, verbs, adjectives)
    const words = message
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(word => word.length > 3);  // Filter short words

    // Remove common stop words
    const stopWords = new Set([
      "what", "how", "why", "when", "where", "who", "which", "the", "a", "an",
      "is", "are", "was", "were", "been", "being", "have", "has", "had",
      "do", "does", "did", "will", "would", "could", "should", "can",
      "need", "want", "make", "get", "take", "give", "use", "like"
    ]);

    return [...new Set(words.filter(word => !stopWords.has(word)))];
  }

  /**
   * Calculate relevance score between query and candidate message
   */
  private calculateRelevance(
    keywords: string[],
    candidate: any
  ): number {
    let score = 0;
    
    // Check if candidate has content or summary
    const text = candidate.content || candidate.summary || "";
    const textLower = text.toLowerCase();
    
    // Keyword matching
    keywords.forEach(keyword => {
      if (textLower.includes(keyword)) {
        score += 1;
      }
    });

    // Normalize score by keyword count
    return keywords.length > 0 ? score / keywords.length : 0;
  }

  /**
   * Search memory for semantically relevant conversations
   */
  async searchRelevantMemory(
    query: string,
    threadId: string,
    resourceId: string,
    limit: number = 5
  ): Promise<SemanticRecallResult[]> {
    try {
      const keywords = this.extractKeywords(query);
      
      // Get working memory
      const workingMemory = await getMemory().getWorkingMemory({
        threadId,
        resourceId,
      });

      if (!workingMemory) {
        return [];
      }

      // Parse working memory into searchable chunks
      const chunks = this.parseWorkingMemory(workingMemory);

      // Calculate relevance scores
      const scored = chunks.map(chunk => ({
        ...chunk,
        relevance: this.calculateRelevance(keywords, chunk),
      }));

      // Sort by relevance and filter to top results
      scored.sort((a, b) => b.relevance - a.relevance);
      
      return scored
        .filter(result => result.relevance > 0.3)  // Minimum relevance threshold
        .slice(0, limit);

    } catch (error) {
      console.error("Error in semantic recall search:", error);
      return [];
    }
  }

  /**
   * Parse working memory into searchable chunks
   */
  private parseWorkingMemory(workingMemory: string): any[] {
    // Simple implementation - split by sections/lines
    const lines = workingMemory
      .split(/\n+/)
      .filter(line => line.trim().length > 10);

    return lines.map((line, index) => ({
      threadId: "semantic-retrieval",
      resourceId: "semantic-retrieval",
      relevance: 0,
      timestamp: new Date(),
      summary: line.trim(),
      content: line.trim(),
    }));
  }

  async processInput(args: any) {
    const { messages, context } = args;
    
    // Get thread and resource ID from context
    const threadId = context?.threadId || "default";
    const resourceId = context?.resourceId || "default";

    // Get the last user message
    const lastUserMessage = [...messages]
      .reverse()
      .find((msg: any) => msg.role === "user");

    if (!lastUserMessage) {
      return messages;
    }

    // Extract user query
    const query = this.extractTextFromMessage(lastUserMessage);
    
    // Search for relevant memory
    const relevantResults = await this.searchRelevantMemory(
      query,
      threadId,
      resourceId
    );

    // If we found relevant results, inject as context
    if (relevantResults.length > 0) {
      const contextMessage = this.formatRelevantResults(relevantResults);
      
      // Add context message at the beginning
      return [
        {
          role: "system",
          content: {
            parts: [
              {
                type: "text",
                text: `## Relevant Past Information\n\n${contextMessage}\n\nUse this information to provide more personalized and contextual responses.`,
              },
            ],
          },
          source: "memory",
        },
        ...messages,
      ];
    }

    return messages;
  }

  /**
   * Extract text from a message
   */
  private extractTextFromMessage(message: any): string {
    if (typeof message.content === "string") {
      return message.content;
    }
    
    if (message.content?.parts) {
      return message.content.parts
        .filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join(" ");
    }
    
    return "";
  }

  /**
   * Format relevant results as a context message
   */
  private formatRelevantResults(results: SemanticRecallResult[]): string {
    return results
      .map((result, index) => {
        const timeAgo = this.getRelativeTime(result.timestamp);
        return `${index + 1}. ${result.summary} (${timeAgo})`;
      })
      .join("\n");
  }

  /**
   * Get relative time string (e.g., "2 days ago")
   */
  private getRelativeTime(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return `${Math.floor(seconds / 604800)} weeks ago`;
  }

  /**
   * Update working memory with new information
   */
  async updateWorkingMemory(
    threadId: string,
    resourceId: string,
    information: string
  ): Promise<void> {
    try {
      const currentMemory = await getMemory().getWorkingMemory({
        threadId,
        resourceId,
      });

      const timestamp = new Date().toISOString();
      const entry = `## ${timestamp}\n${information}\n`;

      const newMemory = currentMemory
        ? `${currentMemory}\n\n${entry}`
        : entry;

      // Save updated memory
      // Note: Mastra memory API for updating working memory
      // This would be implemented based on the actual API
      console.log(
        `[SemanticRecall] Updating working memory for ${resourceId}`
      );
    } catch (error) {
      console.error("Error updating working memory:", error);
    }
  }
}

/**
 * Export singleton instance
 */
export const enhancedSemanticRecall = new EnhancedSemanticRecall();
