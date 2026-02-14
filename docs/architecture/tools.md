# Tools System Architecture

Comprehensive guide to Sybil's tool ecosystem, dynamic tool generation, and registry system.

---

## Overview

Sybil provides **33+ tools** organized across **10 categories**, with support for dynamic tool creation and discovery.

### Tool Categories

```
┌─────────────────────────────────────────────────────────────────┐
│                      TOOL ECOSYSTEM                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Web (4)           WhatsApp (11)         Filesystem (3)        │
│  ├── searchWeb     ├── sendMessage      ├── readFile           │
│  ├── fetchContent  ├── getChats         ├── writeFile          │
│  ├── extractData   ├── getMessages      └── listDirectory      │
│  └── deepResearch  ├── getStatus                                │
│                    ├── broadcastMessage                          │
│  Code (1)          ├── auto-reply (2)                            │
│  └── executeCode   └── [4 more...]                             │
│                                                                 │
│  Calendar (2)      Email (1)          Database (1)             │
│  ├── createEvent   └── sendEmail      └── queryDatabase        │
│  └── listEvents                                                │
│                                                                 │
│  Social (1)        Analytics (1)      Dynamic (8)              │
│  └── postToTwitter └── getAnalytics   ├── generateTool         │
│                                       ├── listGeneratedTools    │
│                                       ├── deleteGeneratedTool   │
│                                       ├── generateSkill         │
│                                       ├── learnFromFeedback     │
│                                       ├── listSkills            │
│                                       ├── activateSkill         │
│                                       └── analyzeOpportunity    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tool Registry

### Central Registry

**File:** `src/tools/tool-registry.ts`

The tool registry exports all available tools for dynamic discovery:

```typescript
// All available tools (33 total)
export const allTools = {
  // Web tools (4)
  fetchWebContent: fetchWebContentTool,
  searchWeb: searchWebTool,
  extractStructuredData: extractStructuredDataTool,
  deepResearch: deepResearchTool,

  // WhatsApp tools (11)
  getWhatsAppStatus: getWhatsAppStatusTool,
  initializeWhatsApp: initializeWhatsAppTool,
  sendWhatsAppMessage: sendWhatsAppMessageTool,
  // ... 8 more

  // Filesystem tools (3)
  readFile: readFileTool,
  writeFile: writeFileTool,
  listDirectory: listDirectoryTool,

  // Code execution (1)
  executeCode: executeCodeTool,

  // Calendar tools (2)
  createCalendarEvent: createCalendarEventTool,
  listCalendarEvents: listCalendarEventsTool,

  // Email (1)
  sendEmail: sendEmailTool,

  // Database (1)
  queryDatabase: queryDatabaseTool,

  // Social media (1)
  postToTwitter: postToTwitterTool,

  // Analytics (1)
  getAnalyticsReport: getAnalyticsReportTool,

  // Dynamic tool generation (3)
  generateTool: generateToolTool,
  listGeneratedTools: listGeneratedToolsTool,
  deleteGeneratedTool: deleteGeneratedToolTool,

  // Dynamic skill generation (5)
  generateSkill: generateSkillTool,
  learnSkillFromFeedback: learnSkillFromFeedbackTool,
  listSkills: listSkillsTool,
  activateSkill: activateSkillTool,
  analyzeForSkillOpportunity: analyzeForSkillOpportunityTool,
};
```

### Tool Categories

Tools are organized by category for easy retrieval:

```typescript
export const toolCategories = {
  web: ["fetchWebContent", "searchWeb", "extractStructuredData", "deepResearch"],
  whatsapp: ["sendWhatsAppMessage", "getWhatsAppChats", "..."],
  filesystem: ["readFile", "writeFile", "listDirectory"],
  code: ["executeCode"],
  calendar: ["createCalendarEvent", "listCalendarEvents"],
  email: ["sendEmail"],
  database: ["queryDatabase"],
  social: ["postToTwitter"],
  analytics: ["getAnalyticsReport"],
  dynamic: ["generateTool", "generateSkill", "..."],
};
```

### Tool Descriptions

Each tool has a searchable description for semantic matching:

```typescript
export const toolDescriptions: Record<string, string> = {
  searchWeb: "Search the web for information using DuckDuckGo",
  sendWhatsAppMessage: "Send WhatsApp messages to contacts",
  executeCode: "Execute code in sandboxed environment",
  generateTool: "Generate new custom tools based on requirements",
  // ... etc
};
```

---

## Web Tools

**File:** `src/tools/web-tools.ts`

| Tool | Purpose | Example Usage |
|------|---------|---------------|
| `searchWeb` | Search DuckDuckGo | "Search for TypeScript tutorials" |
| `fetchWebContent` | Fetch page content | "Get article from URL" |
| `extractStructuredData` | Scrape with CSS selectors | "Extract prices from page" |
| `deepResearch` | Multi-source research | "Research AI trends comprehensively" |

### Implementation Pattern

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const searchWebTool = createTool({
  id: "search-web",
  description: "Search the web using DuckDuckGo",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    maxResults: z.number().optional().default(5),
  }),
  execute: async ({ context }) => {
    const { query, maxResults } = context;
    // Implementation...
    return {
      results: [...],
      query,
    };
  },
});
```

---

## WhatsApp Tools

**File:** `src/tools/whatsapp-tools.ts`

### Core Messaging

| Tool | Purpose | Notes |
|------|---------|-------|
| `getWhatsAppStatus` | Check connection | Verify before sending |
| `initializeWhatsApp` | Start connection | Shows QR code |
| `sendWhatsAppMessage` | Send messages | Auto-formats numbers |
| `broadcastWhatsAppMessage` | Send to multiple | Bulk messaging |

### Contact Management

| Tool | Purpose |
|------|---------|
| `getWhatsAppChats` | List conversations |
| `getWhatsAppMessages` | Get message history |
| `getWhatsAppContact` | Get contact info |
| `getAllWhatsAppContacts` | List all contacts |
| `getMyWhatsAppInfo` | Get my profile |

### LID (Privacy) Support

| Tool | Purpose |
|------|---------|
| `getWhatsAppContactByLid` | Find by LID |
| `mapWhatsAppLidToPhone` | Unmask LID |
| `mapWhatsAppPhoneToLid` | Get LID from phone |

### Auto-Reply System

**File:** `src/tools/whatsapp-autoreply-tools.ts`

| Tool | Purpose |
|------|---------|
| `configureAutoReply` | Enable/disable auto-reply |
| `approvePendingReply` | Review pending messages |

**Modes:**
- **Manual**: Review before sending
- **Auto**: Automatic replies
- **Smart**: AI-generated responses

---

## Workspace Tools

**File:** `src/tools/podman-workspace-mcp.ts`

Sandboxed file and code execution tools:

| Tool | Purpose |
|------|---------|
| `createDirectory` | Create directories |
| `writeFile` | Write files |
| `readFile` | Read files |
| `deleteFile` | Delete files |
| `listFiles` | List directory contents |
| `executeBash` | Run bash commands |
| `executeCommand` | Execute system commands |
| `executeJavaScript` | Run JS/TS code |
| `executePython` | Run Python code |
| `installPackage` | Install dependencies |
| `uninstallPackage` | Remove packages |
| `getSystemInfo` | Get system info |

### Path Rules (CRITICAL)

All operations run in a Podman container with workspace at `/workspace`:

```typescript
// ✅ CORRECT
"/workspace/myfile.txt"
"/workspace/project/src/app.js"

// ❌ WRONG
"workspace/myfile.txt"           // Relative path
"/Users/.../workspace/file.txt" // Host path
"./myfile.txt"                  // Relative path
```

---

## Browser Tools

**File:** `src/tools/browser-tools.ts`

Full Playwright-based browser automation:

| Tool | Purpose |
|------|---------|
| `browsePage` | Navigate to URL |
| `takeScreenshot` | Capture screenshots |
| `clickElement` | Click elements |
| `fillForm` | Fill form fields |
| `scrollPage` | Scroll page |
| `goBack` / `goForward` | Navigation |
| `getPageSource` | Get HTML |
| `evaluatePage` | Execute JS on page |
| `waitForElement` | Wait for elements |

### Integration

Browser tools are available via:
- **Executor Agent**: Direct tool access
- **MCP Server**: `playwright` MCP in Researcher/Executor agents

---

## Telegram File Tools

**File:** `src/tools/telegram-file-tools.ts`

| Tool | Purpose |
|------|---------|
| `sendTelegramFile` | Send files via Telegram |
| `sendTelegramMessage` | Send messages |
| `sendTelegramMediaGroup` | Send multiple media |

---

## Agent Delegation Tools

**File:** `src/tools/agent-delegation-tools.ts`

Tools for inter-agent communication:

| Tool | Purpose |
|------|---------|
| `delegateToAgent` | Delegate to any agent |
| `delegateToPlanner` | Send to Planner |
| `delegateToResearcher` | Send to Researcher |
| `delegateToExecutor` | Send to Executor |
| `delegateToWhatsApp` | Send to WhatsApp Agent |

---

## Extended Tools

**File:** `src/tools/extended-tools.ts`

Additional utility tools:

| Category | Tools |
|----------|-------|
| **Calendar** | `createCalendarEvent`, `listCalendarEvents` |
| **Email** | `sendEmail` |
| **Database** | `queryDatabase` |
| **Social** | `postToTwitter` |
| **Analytics** | `getAnalyticsReport` |
| **Files** | `readFile`, `writeFile`, `listDirectory` |
| **Code** | `executeCode` |

---

## Dynamic Tool Generation

**File:** `src/tools/dynamic/tool-generator.ts`

### Generate New Tools

```typescript
export const generateToolTool = createTool({
  id: "generate-tool",
  description: "Generate a new custom tool from natural language description",
  inputSchema: z.object({
    name: z.string().describe("Tool name (camelCase)"),
    description: z.string().describe("What the tool does"),
    parameters: z.string().describe("Parameter schema description"),
    implementation: z.string().describe("Tool implementation code"),
  }),
  execute: async ({ context }) => {
    // Validates and creates new tool
    // Stores in registry for persistence
  },
});
```

### Manage Generated Tools

| Tool | Purpose |
|------|---------|
| `listGeneratedTools` | View all custom tools |
| `deleteGeneratedTool` | Remove custom tool |

### Dynamic Registry

**File:** `src/tools/dynamic/registry.ts`

Runtime tool storage:

```typescript
export const dynamicToolRegistry = {
  tools: new Map<string, Tool>(), // Generated tools
  metadata: new Map<string, ToolMetadata>(), // Tool info

  // Methods
  register(toolId: string, tool: Tool, metadata: ToolMetadata),
  get(toolId: string): Tool | undefined,
  list(): ToolMetadata[],
  delete(toolId: string): boolean,
};
```

---

## Dynamic Skill System

**File:** `src/skills/dynamic/skill-generator.ts`

Skills are similar to tools but guide agent behavior:

| Tool | Purpose |
|------|---------|
| `generateSkill` | Create new skill |
| `learnSkillFromFeedback` | Learn from user feedback |
| `listSkills` | View available skills |
| `activateSkill` | Enable skill for conversation |
| `analyzeForSkillOpportunity` | Identify learning opportunities |

---

## Tool Discovery

### Dynamic Loading

The `ToolSearchProcessor` finds relevant tools:

```typescript
// src/processors/tool-search.ts
export class ToolSearchProcessor {
  async search(userRequest: string): Promise<Tool[]> {
    // 1. Extract keywords from request
    // 2. Match against toolDescriptions
    // 3. Return most relevant tools
    // 4. Limit to avoid token overflow
  }
}
```

### Usage in Agent

```typescript
// Agent loads only relevant tools
const relevantTools = await toolSearchProcessor.search(userRequest);

const agent = new Agent({
  tools: {
    ...baseTools,
    ...relevantTools,
  },
});
```

**Benefits:**
- Faster initialization
- Reduced token usage (~40%)
- Context-appropriate tools

---

## Tool Security

### Sandboxed Execution

Code execution tools run in Podman containers:

```
┌────────────────────────────────────────┐
│           Host System                  │
│  ┌──────────────────────────────────┐  │
│  │      Podman Container            │  │
│  │  ┌────────────────────────────┐  │  │
│  │  │       /workspace           │  │  │
│  │  │  (Isolated filesystem)    │  │  │
│  │  └────────────────────────────┘  │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

### Input Validation

All tools use Zod schemas for validation:

```typescript
inputSchema: z.object({
  filename: z.string()
    .min(1, "Filename required")
    .regex(/^\/workspace\//, "Must use /workspace/ path"),
  content: z.string(),
})
```

### Path Validation

File operations validate paths:

```typescript
// Prevents directory traversal
if (!filename.startsWith("/workspace/")) {
  throw new Error("Invalid path: must be in /workspace/");
}
```

---

## MCP Integration

Tools can also come from MCP servers:

| MCP Server | Tools Available |
|------------|-----------------|
| `playwright` | Browser automation |
| `wikipedia` | Knowledge lookup |
| `html-to-markdown` | Content conversion |
| `context7` | Documentation lookup |

**Usage in Agents:**

```typescript
const mcpClient = new MCPClient({
  servers: {
    playwright: {
      command: "npx",
      args: ["@playwright/mcp@latest"],
    },
  },
});

const agent = new Agent({
  tools: {
    ...(await mcpClient.listTools()),
  },
});
```

---

## Best Practices

### 1. Tool Naming

- Use camelCase: `sendMessage`, not `send-message`
- Be descriptive: `getWhatsAppStatus`, not `status`

### 2. Descriptions

Write clear, searchable descriptions:

```typescript
// Good
"Send WhatsApp messages to contacts using international phone format"

// Bad
"Send messages"
```

### 3. Error Handling

Always provide helpful error messages:

```typescript
try {
  // Execute tool
} catch (error) {
  return {
    success: false,
    error: `Failed to send message: ${error.message}`,
    suggestion: "Check if WhatsApp is connected with /whatsapp",
  };
}
```

### 4. Progress Updates

For long-running tools, provide status:

```typescript
execute: async ({ context, runId }) => {
  // Send progress update
  await sendProgress(runId, "Searching web...");

  // Do work
  const results = await search(query);

  await sendProgress(runId, `Found ${results.length} results`);

  return { results };
}
```

---

## Adding New Tools

### 1. Create Tool File

```typescript
// src/tools/my-new-tool.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const myNewTool = createTool({
  id: "my-new-tool",
  description: "What this tool does",
  inputSchema: z.object({
    param: z.string().describe("Parameter description"),
  }),
  execute: async ({ context }) => {
    // Implementation
    return { result: "..." };
  },
});
```

### 2. Register in Registry

```typescript
// src/tools/tool-registry.ts
import { myNewTool } from "./my-new-tool.js";

export const allTools = {
  // ...existing tools
  myNewTool: myNewTool,
};

export const toolDescriptions = {
  myNewTool: "Description for search indexing",
};

export const toolCategories = {
  myCategory: ["myNewTool"],
};
```

### 3. Use in Agent

```typescript
// In your agent definition
const agent = new Agent({
  tools: {
    myNewTool: myNewTool,
  },
});
```

---

## References

- [Tool Registry](/src/tools/tool-registry.ts) - All tool exports
- [Web Tools](/src/tools/web-tools.ts) - Web search and fetch
- [WhatsApp Tools](/src/tools/whatsapp-tools.ts) - WhatsApp integration
- [Browser Tools](/src/tools/browser-tools.ts) - Playwright automation
- [Workspace Tools](/src/tools/podman-workspace-mcp.ts) - Sandboxed execution
- [Dynamic Tool Generation](/src/tools/dynamic/tool-generator.ts) - Custom tool creation
- [Mastra Tools Documentation](https://mastra.ai/docs/agents/adding-tools)
