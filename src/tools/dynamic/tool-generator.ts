/**
 * Dynamic Tool Generator
 * 
 * Allows the agent to generate new tools based on user requests.
 * Tools are validated, persisted, and can be loaded dynamically.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { promises as fs } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DYNAMIC_TOOLS_DIR = join(__dirname, "..", "..", "..", "..", "workspace", "generated-tools");

/**
 * Tool template for generating new tools
 */
const TOOL_TEMPLATE = `import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * {{description}}
 * 
 * Generated at: {{timestamp}}
 * Version: {{version}}
 */
export const {{toolId}} = createTool({
  id: "{{toolId}}",
  description: {{description}},
  inputSchema: z.object({
{{inputSchema}}
  }),
  outputSchema: z.object({
{{outputSchema}}
  }),
  execute: async (inputData) => {
{{executeCode}}
  },
});

export default {{toolId}};
`;

/**
 * Tool to generate a new tool based on user requirements
 */
export const generateToolTool = createTool({
  id: "generate-tool",
  description: `
    Generate a new custom tool based on user requirements.
    This tool creates TypeScript code for a new Mastra tool that can be immediately used.
    
    Example usage:
    - "Create a tool that calculates the factorial of a number"
    - "Generate a tool that fetches cryptocurrency prices"
    - "Make a tool that validates email addresses"
  `,
  inputSchema: z.object({
    toolName: z.string().describe("Unique identifier for the tool (e.g., 'calculate-factorial')"),
    description: z.string().describe("Clear description of what the tool does"),
    requirements: z.string().describe("Detailed requirements and functionality"),
    inputParameters: z.array(z.object({
      name: z.string(),
      type: z.enum(["string", "number", "boolean", "array", "object"]),
      description: z.string(),
      required: z.boolean().default(true),
    })).describe("Input parameters the tool accepts"),
    expectedOutput: z.string().describe("Description of what the tool should return"),
    category: z.enum(["utility", "api", "calculation", "validation", "conversion", "custom"]).describe("Tool category"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    toolId: z.string(),
    code: z.string().describe("Generated TypeScript code"),
    filePath: z.string().optional(),
    message: z.string(),
    validationErrors: z.array(z.string()).optional(),
  }),
  execute: async (inputData) => {
    const { toolName, description, requirements, inputParameters, expectedOutput, category } = inputData;
    
    try {
      // Generate input schema
      const inputSchemaFields = inputParameters.map(param => {
        const zodType = getZodType(param.type);
        const optional = param.required ? "" : ".optional()";
        return `    ${param.name}: ${zodType}${optional}.describe("${param.description}"),`;
      }).join("\n");

      // Generate output schema (generic structure)
      const outputSchema = `    success: z.boolean(),
    result: z.any().describe("${expectedOutput}"),
    timestamp: z.string(),`;

      // Generate execute code based on category and requirements
      const executeCode = generateExecuteCode(category, requirements, inputParameters);

      // Fill in template
      const code = TOOL_TEMPLATE
        .replace(/{{toolId}}/g, toolName)
        .replace(/{{description}}/g, JSON.stringify(description))
        .replace(/{{timestamp}}/g, new Date().toISOString())
        .replace(/{{version}}/g, "1.0.0")
        .replace(/{{inputSchema}}/g, inputSchemaFields)
        .replace(/{{outputSchema}}/g, outputSchema)
        .replace(/{{executeCode}}/g, executeCode);

      // Validate the generated code
      const validationErrors = validateGeneratedCode(code, toolName);
      
      if (validationErrors.length > 0) {
        return {
          success: false,
          toolId: toolName,
          code,
          message: `Tool generated but has validation errors: ${validationErrors.join(", ")}`,
          validationErrors,
        };
      }

      // Save to file
      const fileName = `${toolName}.ts`;
      const filePath = join(DYNAMIC_TOOLS_DIR, fileName);
      
      // Ensure directory exists
      await fs.mkdir(DYNAMIC_TOOLS_DIR, { recursive: true });
      await fs.writeFile(filePath, code, "utf-8");

      return {
        success: true,
        toolId: toolName,
        code,
        filePath,
        message: `Tool "${toolName}" generated and saved successfully!`,
      };
    } catch (error) {
      return {
        success: false,
        toolId: toolName,
        code: "",
        message: `Failed to generate tool: ${error instanceof Error ? error.message : "Unknown error"}`,
        validationErrors: [error instanceof Error ? error.message : "Unknown error"],
      };
    }
  },
});

/**
 * Get Zod type string for a parameter type
 */
function getZodType(type: string): string {
  switch (type) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "array":
      return "z.array(z.any())";
    case "object":
      return "z.object({})";
    default:
      return "z.any()";
  }
}

/**
 * Generate execute code based on category and requirements
 */
function generateExecuteCode(
  category: string,
  requirements: string,
  inputParameters: Array<{ name: string; type: string }>
): string {
  const destructuring = inputParameters.map(p => p.name).join(", ");
  
  let implementation = "";
  
  switch (category) {
    case "calculation":
      implementation = `
    // Perform calculation based on requirements: ${requirements}
    // TODO: Implement calculation logic
    const result = null;
    
    return {
      success: true,
      result,
      timestamp: new Date().toISOString(),
    };`;
      break;
      
    case "api":
      implementation = `
    try {
      // Make API call based on requirements: ${requirements}
      // TODO: Implement API call
      const response = null;
      
      return {
        success: true,
        result: response,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        timestamp: new Date().toISOString(),
      };
    }`;
      break;
      
    case "validation":
      implementation = `
    // Validate input based on requirements: ${requirements}
    // TODO: Implement validation logic
    const isValid = true;
    
    return {
      success: isValid,
      result: { isValid, message: isValid ? "Valid" : "Invalid" },
      timestamp: new Date().toISOString(),
    };`;
      break;
      
    case "conversion":
      implementation = `
    // Convert data based on requirements: ${requirements}
    // TODO: Implement conversion logic
    const convertedValue = null;
    
    return {
      success: true,
      result: convertedValue,
      timestamp: new Date().toISOString(),
    };`;
      break;
      
    default:
      implementation = `
    // Implement tool logic based on requirements: ${requirements}
    // TODO: Add implementation
    
    try {
      // Add your implementation here
      const result = null;
      
      return {
        success: true,
        result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        timestamp: new Date().toISOString(),
      };
    }`;
  }

  return `    const { ${destructuring} } = inputData;${implementation}`;
}

/**
 * Validate generated code for potential issues
 */
function validateGeneratedCode(code: string, toolId: string): string[] {
  const errors: string[] = [];
  
  // Check for required patterns
  if (!code.includes("createTool")) {
    errors.push("Missing createTool import or call");
  }
  
  if (!code.includes("id:")) {
    errors.push("Missing tool id");
  }
  
  if (!code.includes("inputSchema:")) {
    errors.push("Missing inputSchema");
  }
  
  if (!code.includes("execute:")) {
    errors.push("Missing execute function");
  }
  
  // Check tool ID format
  if (!/^[a-z0-9-]+$/.test(toolId)) {
    errors.push("Tool ID must be lowercase alphanumeric with hyphens only");
  }
  
  return errors;
}

/**
 * Tool to list all generated tools
 */
export const listGeneratedToolsTool = createTool({
  id: "list-generated-tools",
  description: "List all dynamically generated tools in the workspace",
  inputSchema: z.object({
    category: z.enum(["all", "utility", "api", "calculation", "validation", "conversion", "custom"]).optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    tools: z.array(z.object({
      toolId: z.string(),
      description: z.string(),
      filePath: z.string(),
      createdAt: z.string(),
      category: z.string(),
    })),
    count: z.number(),
  }),
  execute: async (inputData) => {
    try {
      await fs.mkdir(DYNAMIC_TOOLS_DIR, { recursive: true });
      const files = await fs.readdir(DYNAMIC_TOOLS_DIR);
      
      const tools = [];
      for (const file of files) {
        if (file.endsWith(".ts")) {
          const filePath = join(DYNAMIC_TOOLS_DIR, file);
          const stat = await fs.stat(filePath);
          const content = await fs.readFile(filePath, "utf-8");
          
          // Extract description and id from file
          const descriptionMatch = content.match(/description:\s*["'](.+?)["']/);
          const idMatch = content.match(/id:\s*["'](.+?)["']/);
          
          tools.push({
            toolId: idMatch?.[1] || file.replace(".ts", ""),
            description: descriptionMatch?.[1] || "No description",
            filePath,
            createdAt: stat.birthtime.toISOString(),
            category: "custom",
          });
        }
      }
      
      return {
        success: true,
        tools,
        count: tools.length,
      };
    } catch (error) {
      return {
        success: false,
        tools: [],
        count: 0,
      };
    }
  },
});

/**
 * Tool to delete a generated tool
 */
export const deleteGeneratedToolTool = createTool({
  id: "delete-generated-tool",
  description: "Delete a dynamically generated tool",
  inputSchema: z.object({
    toolId: z.string().describe("ID of the tool to delete"),
    confirm: z.boolean().describe("Confirm deletion"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async (inputData) => {
    const { toolId, confirm } = inputData;
    
    if (!confirm) {
      return {
        success: false,
        message: "Deletion not confirmed. Set confirm: true to delete.",
      };
    }
    
    try {
      const filePath = join(DYNAMIC_TOOLS_DIR, `${toolId}.ts`);
      await fs.unlink(filePath);
      
      return {
        success: true,
        message: `Tool "${toolId}" deleted successfully`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete tool: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

export default {
  generateTool: generateToolTool,
  listGeneratedTools: listGeneratedToolsTool,
  deleteGeneratedTool: deleteGeneratedToolTool,
};
