/**
 * Dynamic Tool Registry
 * 
 * Manages dynamically generated tools and provides runtime loading capabilities.
 */

import { Tool } from "@mastra/core/tools";
import { promises as fs } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const DYNAMIC_TOOLS_DIR = join(__dirname, "..", "..", "..", "..", "workspace", "generated-tools");

/**
 * Registry of dynamically loaded tools
 */
export class DynamicToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private metadata: Map<string, ToolMetadata> = new Map();

  /**
   * Load all tools from the generated-tools directory
   */
  async loadAllTools(): Promise<void> {
    try {
      await fs.mkdir(DYNAMIC_TOOLS_DIR, { recursive: true });
      const files = await fs.readdir(DYNAMIC_TOOLS_DIR);

      for (const file of files) {
        if (file.endsWith(".ts")) {
          await this.loadTool(file.replace(".ts", ""));
        }
      }

      console.log(`✅ Loaded ${this.tools.size} dynamic tools`);
    } catch (error) {
      console.error("Failed to load dynamic tools:", error);
    }
  }

  /**
   * Load a specific tool by ID
   */
  async loadTool(toolId: string): Promise<Tool | null> {
    try {
      const filePath = join(DYNAMIC_TOOLS_DIR, `${toolId}.ts`);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return null;
      }

      // Dynamic import of the tool
      const module = await import(filePath);
      const tool = module.default || module[toolId];

      if (tool) {
        this.tools.set(toolId, tool);
        this.metadata.set(toolId, {
          id: toolId,
          loadedAt: new Date().toISOString(),
          source: filePath,
        });
        return tool;
      }

      return null;
    } catch (error) {
      console.error(`Failed to load tool ${toolId}:`, error);
      return null;
    }
  }

  /**
   * Get a loaded tool
   */
  getTool(toolId: string): Tool | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get all loaded tools
   */
  getAllTools(): Record<string, Tool> {
    const result: Record<string, Tool> = {};
    this.tools.forEach((tool, id) => {
      result[id] = tool;
    });
    return result;
  }

  /**
   * Get tool metadata
   */
  getMetadata(toolId: string): ToolMetadata | undefined {
    return this.metadata.get(toolId);
  }

  /**
   * Get all metadata
   */
  getAllMetadata(): ToolMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Unload a tool
   */
  unloadTool(toolId: string): boolean {
    const deleted = this.tools.delete(toolId);
    this.metadata.delete(toolId);
    return deleted;
  }

  /**
   * Check if a tool is loaded
   */
  isLoaded(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  /**
   * Get count of loaded tools
   */
  getToolCount(): number {
    return this.tools.size;
  }
}

interface ToolMetadata {
  id: string;
  loadedAt: string;
  source: string;
}

/**
 * Global registry instance
 */
export const dynamicToolRegistry = new DynamicToolRegistry();

export default dynamicToolRegistry;
