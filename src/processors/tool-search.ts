/**
 * Tool Search Processor Configuration
 * 
 * Configures ToolSearchProcessor with all available tools for dynamic discovery.
 */

import { ToolSearchProcessor } from "@mastra/core/processors";
import { allTools } from "../tools/tool-registry.js";

/**
 * Configure ToolSearchProcessor with all available tools
 * 
 * This enables the agent to dynamically discover and load tools based on user requests.
 * Instead of providing all 40+ tools upfront, the agent gets two meta-tools:
 * 1. search_tools - Find relevant tools by keyword
 * 2. load_tool - Load a specific tool by name
 */
export function createToolSearchProcessor() {
  return new ToolSearchProcessor({
    // All available tools for dynamic discovery
    tools: allTools,
    
    // Search configuration
    search: {
      topK: 10,        // Return top 10 most relevant tools
      minScore: 0.1,   // Minimum relevance score (0-1)
    },
    
    // Optional: Custom tool descriptions for better search
    // descriptions: toolDescriptions,
  });
}

/**
 * Tool Search Processor Instance
 */
export const toolSearchProcessor = createToolSearchProcessor();

/**
 * Export for agent configuration
 */
export function getToolProcessors() {
  return {
    toolSearchProcessor
  };
}
