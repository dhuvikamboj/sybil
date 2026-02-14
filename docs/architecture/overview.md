# Sybil Architecture Overview

High-level system architecture and component design.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYBIL SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         INTERFACE LAYER                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │   │
│  │  │   Telegram   │  │     CLI      │  │        WhatsApp          │   │   │
│  │  │     Bot      │  │    (TUI)     │  │       Web Client         │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      MASTRA CORE FRAMEWORK                         │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │   │
│  │  │    Agents    │  │   Workflows  │  │        Memory            │   │   │
│  │  │   (6 total)  │  │   (2 types)  │  │   (Vector + Semantic)    │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘   │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │   │
│  │  │    Tools     │  │   MCP Servers│  │      Processors          │   │   │
│  │  │   (33+)      │  │  (Playwright, │  │  (Safety + Performance)    │   │   │
│  │  │              │  │ Wikipedia, etc)│  │                          │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      INFRASTRUCTURE LAYER                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │   │
│  │  │   LibSQL     │  │   Podman     │  │   AI Providers (17+)     │   │   │
│  │  │  (Storage)   │  │  (Sandbox)   │  │  (OpenAI, Anthropic, etc)│   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Interface Layer

| Component | Purpose | File |
|-----------|---------|------|
| **Telegram Bot** | Primary user interface with streaming responses | `src/utils/telegram.ts` |
| **CLI (TUI)** | Command-line management and interactive interface | `src/cli/index.ts` |
| **WhatsApp Web** | Secondary messaging platform integration | `src/utils/whatsapp-client.ts` |

### 2. Mastra Core Framework

The application is built on [Mastra](https://mastra.ai), providing:

- **Agent orchestration** with multi-agent coordination
- **Memory management** with vector storage and semantic search
- **Workflow engine** for complex task execution
- **Tool system** for extensible capabilities
- **MCP (Model Context Protocol)** integration for external services

### 3. Agent System

```
┌─────────────────────────────────────────────────────────────┐
│                     AGENT NETWORK                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────┐                                   │
│  │   Routing Agent      │  ← Master coordinator             │
│  │  (Network Manager)   │                                   │
│  └──────────┬───────────┘                                   │
│             │                                               │
│     ┌───────┴───────┬───────────────┬──────────────┐       │
│     ▼               ▼               ▼              ▼        │
│ ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│ │Planner  │   │Researcher│   │Executor  │   │WhatsApp  │ │
│ │Agent    │   │Agent     │   │Agent     │   │Agent     │ │
│ └─────────┘   └──────────┘   └──────────┘   └──────────┘ │
│     Task        Information    Code/File      Messaging   │
│   Planning      Gathering     Operations       Specialist   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Total Agents:** 5
- 1 Routing Agent (coordinator)
- 4 Specialized Agents (planner, researcher, executor, whatsapp)

**Plus:** 1 Autonomous Agent for direct user interactions

### 4. Memory System

```
┌─────────────────────────────────────────────────────────────┐
│                     MEMORY SYSTEM                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              LibSQL Vector Database                   │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐│ │
│  │  │  Working     │  │  Short-Term  │  │  Long-Term   ││ │
│  │  │  Memory      │  │  Memory      │  │  Memory      ││ │
│  │  │  (Context)   │  │  (Session)   │  │  (Semantic)  ││ │
│  │  └──────────────┘  └──────────────┘  └─────────────┘│ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Features:                                                  │
│  • Vector embeddings via FastEmbed                         │
│  • Semantic search with similarity scoring                   │
│  • Thread-based conversation history                       │
│  • Resource-based memory organization                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5. Tool System

```
┌─────────────────────────────────────────────────────────────┐
│                     TOOL ECOSYSTEM                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Web Tools (4)        WhatsApp Tools (11)                  │
│  ├── searchWeb        ├── sendWhatsAppMessage              │
│  ├── fetchWebContent  ├── getWhatsAppChats                 │
│  ├── extractStructuredData ├── getWhatsAppMessages         │
│  └── deepResearch     ├── getWhatsAppStatus                │
│                       ├── broadcastWhatsAppMessage          │
│  Workspace Tools      └── [6 more...]                      │
│  ├── createDirectory                                       │
│  ├── writeFile        Dynamic Generation                   │
│  ├── readFile         ├── generateTool                     │
│  ├── executeCode      ├── generateSkill                    │
│  └── [9 more...]      └── [6 more...]                      │
│                                                             │
│  Total: 33+ tools across 10 categories                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6. MCP Integration

**MCP (Model Context Protocol)** servers provide extended capabilities:

| MCP Server | Purpose | Usage |
|------------|---------|-------|
| **Playwright** | Browser automation | Web browsing, screenshots, form filling |
| **Wikipedia** | Knowledge base | Quick factual lookups |
| **HTML-to-Markdown** | Content conversion | Convert web pages to readable format |
| **Context7** | Documentation | Real-time library docs (Executor Agent only) |

### 7. Processors

Input/output processors for safety and performance:

| Processor | Type | Status | Purpose |
|-----------|------|--------|---------|
| **SemanticRecall** | Input | ✅ Active | Intelligent memory retrieval |
| **TokenLimiter** | Output | ✅ Active | Context window optimization |
| **BatchParts** | Output | ✅ Active | Streaming optimization |
| **PIIDetector** | Input | ⚠️ Disabled | Privacy protection (commented out) |
| **ModerationProcessor** | Output | ⚠️ Disabled | Content filtering (commented out) |
| **PromptInjectionDetector** | Input | ⚠️ Disabled | Security (commented out) |

### 8. Infrastructure Layer

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Storage** | LibSQL (SQLite) | Persistent memory and data |
| **Sandbox** | Podman | Secure code execution environment |
| **AI Models** | 17+ providers | LLM inference (OpenAI, Anthropic, etc.) |
| **Embeddings** | FastEmbed | Vector generation for semantic search |
| **Logging** | Pino | Structured logging |

---

## Data Flow

### User Request Flow

```
1. User sends message via Telegram
          │
          ▼
2. Telegram bot receives message
   - Authenticates user (if OTP enabled)
   - Loads conversation context
          │
          ▼
3. Message processors execute
   - SemanticRecall: Find relevant past context
   - TokenLimiter: Optimize token usage
          │
          ▼
4. Route to appropriate handler
   ├── Simple query → Autonomous Agent
   ├── Complex task → Routing Agent
   │                    └── Delegates to specialized agents
   └── WhatsApp → WhatsApp Agent
          │
          ▼
5. Agent executes with tools
   - Calls relevant tools
   - Streams response progress
          │
          ▼
6. Response sent back to user
   - Formatted for Telegram
   - Includes file attachments if generated
          │
          ▼
7. Memory updated
   - Conversation stored
   - Semantic index updated
```

### Multi-Agent Workflow

```
User: "Research AI trends and create a report"

Routing Agent
      │
      ├───► Researcher Agent ─┐
      │     (gather data)     │
      │                       ├─► Synthesis ─► User
      └───► Executor Agent ───┘
            (create report)
```

---

## File Organization

```
src/
├── index.ts              # Application entry point
├── cli.ts                # CLI interface
├── cli/commands/         # CLI subcommands (12 commands)
│
├── mastra/               # Mastra configuration
│   ├── index.ts          # Mastra instance with all agents
│   └── memory.ts         # Vector memory setup
│
├── agents/               # Agent definitions
│   ├── autonomous-agent.ts   # Main autonomous agent
│   └── network.ts            # Agent network (5 agents)
│
├── tools/                # Tool implementations
│   ├── tool-registry.ts     # Dynamic tool discovery
│   ├── web-tools.ts           # Web search/fetch
│   ├── whatsapp-tools.ts      # WhatsApp integration
│   ├── browser-tools.ts       # Playwright automation
│   ├── podman-workspace.ts    # Sandbox execution
│   ├── telegram-file-tools.ts # Telegram file operations
│   ├── agent-delegation-tools.ts # Inter-agent communication
│   ├── extended-tools.ts      # Calendar, email, etc.
│   └── dynamic/               # Dynamic tool/skill generation
│       ├── tool-generator.ts
│       ├── skill-generator.ts
│       └── registry.ts
│
├── workflows/            # Workflow definitions
│   ├── planner-workflow.ts
│   └── skill-builder-workflow.ts
│
├── processors/           # Message processors
│   ├── index.ts          # Processor configuration
│   ├── semantic-recall.ts
│   └── tool-search.ts
│
├── utils/                # Utility functions
│   ├── telegram.ts       # Telegram bot implementation
│   ├── whatsapp-client.ts # WhatsApp client manager
│   ├── model-config.ts   # AI provider configuration
│   ├── telegram-auth.ts  # OTP authentication
│   ├── semantic-memory.ts # Memory utilities
│   ├── logger.ts         # Logging utilities
│   └── system.ts         # System context provider
│
└── workspace/            # Workspace management
    └── index.ts
```

---

## Key Design Patterns

### 1. Agent Delegation

Agents can delegate tasks to other agents using delegation tools:

```typescript
// Example: Routing agent delegates to specialized agents
const result = await routingAgent.generate(task, {
  toolChoice: "delegateToResearcher",
  toolParams: { task: "Research topic", context: "..." }
});
```

### 2. Dynamic Tool Loading

Tools are loaded dynamically based on context rather than all at once:

```typescript
// ToolSearchProcessor finds relevant tools
const relevantTools = await toolSearchProcessor.search(userRequest);
agent.updateTools(relevantTools);
```

### 3. Streaming Responses

All responses stream in real-time with progress updates:

```typescript
const stream = await agent.generate(message, { streaming: true });
for await (const chunk of stream) {
  // Send chunk to user as it arrives
}
```

### 4. Memory Context Injection

Semantic memory is automatically retrieved and injected:

```typescript
// Before processing, semantic search finds relevant memories
const context = await memory.semanticSearch({
  query: userMessage,
  topK: 5,
  threshold: 0.3
});
```

### 5. Sandboxed Execution

Code execution is isolated in Podman containers:

```typescript
// All executeCode calls run in container
const result = await executeCodeTool.execute({
  code: "...",
  language: "python",
  // Runs in: /workspace inside container
});
```

---

## Performance Characteristics

| Metric | Target | Notes |
|--------|--------|-------|
| Response Time | < 30s average | Complex tasks may take longer |
| Token Usage | 30% reduction | Via TokenLimiter processor |
| Max Steps | 5-8 | Configurable per agent |
| Memory Search | < 100ms | Vector search with LibSQL |
| Tool Loading | Dynamic | Only load relevant tools |

---

## Security Considerations

1. **Sandboxed Execution**: All code runs in Podman containers
2. **OTP Authentication**: Optional user verification
3. **PII Protection**: Detectors available (commented out)
4. **Content Moderation**: Moderation processors available
5. **Path Validation**: All file operations validated
6. **Workspace Isolation**: User files isolated to /workspace

---

## Extension Points

### Adding New Agents

```typescript
// src/agents/network.ts
export const newAgent = new Agent({
  id: "new-agent",
  name: "New Agent",
  instructions: "...",
  model: createModel(),
  memory,
  tools: { ... }
});

// Add to mastra configuration
// src/mastra/index.ts
agents: {
  // ...existing agents
  newAgent,
}
```

### Adding New Tools

```typescript
// src/tools/tool-registry.ts
export const allTools = {
  // ...existing tools
  newTool: newToolTool,
};

export const toolDescriptions = {
  newTool: "Description for search indexing",
};
```

### Adding New Processors

```typescript
// src/processors/index.ts
export const inputProcessors = [
  // ...existing processors
  newProcessor,
];
```

---

## References

- [Agent Networks](agent-networks.md) - Multi-agent coordination details
- [Memory System](memory.md) - Vector memory architecture
- [Tools System](tools.md) - Tool registry and dynamic loading
- [Mastra Documentation](https://mastra.ai/docs)
