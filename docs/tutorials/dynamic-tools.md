# Dynamic Tools Tutorial

Creating custom tools on demand with Sybil.

## Overview

Unlike traditional bots with fixed tool sets, Sybil can:

1. **Generate tools** from natural language descriptions
2. **Validate tool code** automatically
3. **Register tools** in real-time
4. **Persist tools** across sessions
5. **Manage tool metadata**

All created tools are:
- ✅ Validated TypeScript code
- ✅ Type-schemas with Zod
- ✅ Error handling
- ✅ Self-documenting

## Creating a Custom Tool

### Method 1: `/create-tool` Command

**Simple Request:**
```
User: Create a tool that converts Celsius to Fahrenheit
```

**What Happens:**
```
[Agent analyzes request]
[Generates Zod schema for inputs]
[Writes TypeScript code]
[Validates code]
[Registers tool in tool registry]
[Returns tool ID for use]
```

**Result:**
```json
{
  "success": true,
  "toolId": "temperature-converter",
  "location": "./workspace/generated-tools/temperature-converter.ts"
}
```

**Using the tool:**
```
User: Convert 25°C to Fahrenheit
→ Agent calls temperature-converter tool
→ Returns: { celsius: 25, fahrenheit: 77 }
```

### Method 2: `/network` Creation

**Request:**
```
User: Create a tool that validates email addresses
```

**Agent Network:**
```
[Executor Agent]
→ Generates validation logic
→ Uses Zod.email() schema
→ Creates validateEmailTool()
→ Registers and saves
```

**Using immediately:**
```
User: Validate my email address alice@example.com
→ [Calls validateEmailTool]
→: { valid: true }
```

## Tool Capabilities

### Supported Categories

1. **Utility Tools** - Calculations, conversions, data transformations
2. **API Tools** - HTTP requests, API interactions, data fetching
3. **Validation Tools** - Data validation, format checking
4. **Conversion Tools** - Format transformations, file processing
5. **Analysis Tools** - Data analysis, pattern matching
6. **Custom Tools** - Any custom logic you need

### Tool Generator Features

**What it generates:**

1. Complete TypeScript file with imports
2. Zod input/output schemas
3. Proper TypeScript types
4. Error handling
5. Clear descriptions
6. Usage documentation in comments
7. Export statement for tool registration

**What it validates:**
- TypeScript syntax
- Zod schema correctness
- Proper imports
- Export format

### Generated Tool Structure

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * [Generated Tool Description]
 */
export const generatedTool = createTool({
  id: "tool-id",
  description: "Human-readable description of what the tool does",
  inputSchema: z.object({
    // Input parameters
    param1: z.string().describe("Description"),
    param2: z.number().optional().describe("Description"),
  }),
  outputSchema: z.object({
    // Output structure
    result: z.any().describe("Description of result"),
    success: z.boolean(),
  }),
  execute: async (inputData) => {
    // Implementation
    try {
      const result = /* logic here */;
      return {
        result,
        success: true,
      };
    } catch (error) {
      console.error("Tool error:", error);
      return {
        result: null,
        success: false,
      };
    }
  },
});

export default generatedTool;
```

## Real-World Examples

### Example 1: Currency Converter

**Request:**
```
User: Create a tool that converts USD currencies to EUR and GBP
```

**Generated Tool:**
```typescript
inputSchema: z.object({
  amount: z.number().describe("Amount in USD"),
  toCurrency: z.enum(["EUR", "GBP"]).describe("Target currency"),
  rates: z.record(z.number()).optional().describe("Exchange rates (defaults to hard-coded)"),
}),
```

**Usage:**
```
User: Convert 100 USD to EUR
→ { amount: 100, from: "USD", to: "EUR", usd: 100, eur: 92.05 }
```

### Example 2: Validator Tool

**Request:**
```
User: Create a tool to validate GitHub usernames
```

**Generated Tool:**
```typescript
inputSchema: z.object({
  username: z.string()
    .minLength(1)
    .maxLength(39)
    .regex(/^[a-z0-9-]+$/),
  }),
outputSchema: z.object({
  valid: z.boolean(),
  available: z.boolean(),
  repoCount: z.number(),
}),
```

**Logic:**
```javascript
// Check if username exists via GitHub API
// Return availability and repo count
```

### Example 3: File Processor

**Request:**
```
User: Create a tool that reads CSV files and extracts specific columns
```

**Generated Tool:**
```typescript
inputSchema: z.object({
  filepath: z.string(),
  columns: z.array(z.string()),
  hasHeader: z.boolean().default(true),
  delimiter: z.string().default(","),
}),
```

**Logic:**
```javascript
// Parse CSV file
// Extract requested columns
// Return as array of objects
```

### Example 4: Aggregator

**Request:**
```
User: Create a tool that aggregates data from multiple API endpoints
```

**Generated Tool:**
```typescript
inputSchema: z.object({
  endpoints: z.array(z.string()),
  filterFields: z.array(z.string()),
  sortBy: z.string().optional(),
}),
```

**Logic:**
```javascript
// Make parallel requests to all endpoints
// Filter and transform data
// Sort results
// Return aggregated data
```

### Example 5: Transformer

**Request:**
```
User: Create a tool that converts JSON data to CSV format
```

**Generated Tool:**
```typescript
inputSchema: z.object({
  jsonData: z.record(z.any()),
  fields: z.array(z.string()),
  headers: z.boolean().default(false),
}),
```

**Logic:**
```javascript
// Flatten JSON structure if nested
// Apply field mapping
// Format as CSV string
// Save or return CSV
```

## Advanced Features

### Tool Composition

Use existing tools within new tools:

```typescript
// Use fetch from existing tool
import { fetchWebContent, extractStructuredData } from "./web-tools.ts";

export const advancedTool = createTool({
  // ...
});
```

### Tool Metadata

Each generated tool includes:
- Creation timestamp
- Version number
- Author (Sybil AI)
- Usage examples
- Dependencies and imports
- Known limitations

### Tool Versioning

Tools support versioning:

```typescript
export const myTool_v1 = createTool({
  // Version 1 implementation
});

export const myTool_v2 = createTool({
  // Version 2 with improvements
  // Backward compatible if possible
});
```

## Best Practices

### 1. Be Specific in Descriptions

**Good:**
```
Create a tool that validates IPv4 addresses and can check if they're from a private range
```

**Bad:**
```
Create an IP validator tool
```

### 2. Include Clear Error Messages

```typescript
return {
  result: null,
  success: false,
  error: "Invalid IP address: Format should be x.x.x.x",
};
```

### 3. Use Appropriate Types

- ✅ `z.string()` - Text data
- ✅ `z.number()` - Numeric data
- ✅ `z.boolean()` - True/false
- ✅ `z.enum([...])` - Fixed choices
- ✅ `z.date()` - Dates
- ✅ `z.array(...)` - Arrays
- ✅ `z.record({...})` - Objects/dictionaries

### 4. Use Optional Fields

```typescript
inputSchema: z.object({
  required: z.string(),
  optional: z.string().optional(),  // ← Optional
  config: z.object({...}).optional(),
  settings: z.object({...}).optional(),
}),
```

### 5. Document the Tool

Add clear documentation in comments:

```typescript
/**
 * Temperature Converter Tool
 * 
 * Converts between Celsius, Fahrenheit, and Kelvin.
 * 
 * Usage:
 * - Convert temperatures between common scales
 * - Round to 2 decimal places for readability
 * - Invalid values return null
 * 
 * Author: Sybil AI
 * Version: 1.0.0
 * Created: 2026-02-12
 */
```

### 6. Handle Edge Cases

```typescript
execute: async (inputData) => {
  // Validate inputs
  if (!inputData || typeof inputData !== "object") {
    throw new Error("Invalid input: expected object");
  }
  
  // Check for required fields
  if (!inputData.required) {
    return {
      result: null,
      success: false,
      error: "Required field: required",
    };
  }
  
  // Handle missing optional fields
  const optional = inputData.optional ?? "default value";
},
```

## Managing Tools

### List All Tools

```bash
User: /list-tools
→ Shows all available tools (32 standard + dynamic)
```

### Delete a Tool

```bash
User: Remove the temperature converter tool
→ [Checks if tool exists]
→ [Unregisters from registry]
→ [Deletes generated file]
→ ✅ Tool removed
```

### View Tool Code

```
User: Show me the code for the temperature converter tool
→ [Reads tool file]
→ [Displays TypeScript code]
```

## Integration

### With Agent Networks

```typescript
// Routing Agent sees tool creation requests
// Executor Agent generates the tool
// Immediately available for use
```

### With Skills

```typescript
// Skills can create tools dynamically
// Tools persist beyond skill context
// Available to all sessions
```

### With Memory

```typescript
// Successful tools logged to memory
// Learned from tool usage patterns
```


```

Tool creation becomes increasingly dynamic with intelligent context-aware mechanisms. The system adapts to user needs, creating specialized instruments for specific use cases through learning and autonomous generation. Agents can evolve their capabilities continuously, transforming requirements into functional code across multiple interactions.

**Dynamic Tool Registry** - Persistent generated tools stored in `workspace/generated-tools/`
```typescript
// Load all generated tools on startup
await dynamicToolRegistry.loadAllTools();
```

---

**Your agents can now create their own tools on demand! 🔧**