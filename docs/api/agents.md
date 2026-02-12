# Agents API Reference

API documentation for Sybil's agent system including agent networks and autonomous agents.

## Agents Overview

| Agent | Type | Purpose |
|-------|------|---------|
| `PlannerAgent` | Specialized | Planning and task breakdown |
| `ResearcherAgent` | Specialized | Information gathering and analysis |
| `ExecutorAgent` | Specialized | Task execution with tools |
| `WhatsAppAgent` | Specialized | WhatsApp integration |
| `RoutingAgent` | Specialized | Agent selection and routing |
| `AutonomousAgent` | General | Autonomous reasoning and tool use |

---

## Agent Network

### Architecture

The agent network coordinates 5 specialized agents through a central routing agent:

```
┌─────────────────────────────────────────┐
│           RoutingAgent                   │
│    (Analyzes request, selects agent)     │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┼────────────┬────────────┐
    │            │            │            │
    ▼            ▼            ▼            ▼
┌──────────┐ ┌───────┐ ┌─────────┐ ┌─────────┐
│ Planner   │ │  Researcher │ │ Executor │ │ WhatsApp│
└──────────┘ └───────┘ └─────────┘ └─────────┘
```

### Using Agent Network

```typescript
import { agentNetwork } from "../agents/network";

// Route and execute automatically
const response = await agentNetwork.generate({
  messages: [{ role: "user", content: "Research climate change articles" }]
});

// Response includes which agent handled the request
console.log(`Handled by: ${response.agentId}`);
console.log(response.text);
```

---

## Specialized Agents

### PlannerAgent

Breaks down complex tasks into actionable steps.

```typescript
import { plannerAgent } from "../agents/network";

const plan = await plannerAgent.generate({
  messages: [{ role: "user", content: "Plan a website migration" }]
});

console.log(plan.text);
// Returns structured plan with steps
```

**Capabilities:**
- Task decomposition
- Dependency analysis
- Timeline estimation
- Resource planning

**Best for:**
- Project planning
- Complex task breakdown
- Strategic analysis

---

### ResearcherAgent

Gathers and analyzes information using browser tools.

```typescript
import { researcherAgent } from "../agents/network";

const research = await researcherAgent.generate({
  messages: [{
    role: "user",
    content: "Research the latest AI developments"
  }]
});
```

**Capabilities:**
- Web browsing and scraping
- Google search integration
- Content extraction and summarization
- Source citation

**Tools Available:**
- All browser tools (navigate, search, extract, save)
- Semantic memory access

**Best for:**
- Information gathering
- Competitive analysis
- Market research
- Academic research

---

### ExecutorAgent

Executes tasks using available tools and skills.

```typescript
import { executorAgent } from "../agents/network";

const result = await executorAgent.generate({
  messages: [{
    role: "user",
    content: "Create a new workspace directory"
  }]
});
```

**Capabilities:**
- Tool execution orchestration
- File system operations
- Command execution
- Error handling and retries

**Tools Available:**
- File system tools
- Browser tools
- Dynamic tools
- User-created skills

**Best for:**
- Task execution
- Automation workflows
- Tool orchestration

---

### WhatsAppAgent

Handles WhatsApp integration and messaging.

```typescript
import { whatsappAgent } from "../agents/network";

await whatsappAgent.generate({
  messages: [{
    role: "user",
    content: "Send report to +1234567890"
  }]
});
```

**Capabilities:**
- Send/receive messages
- Handle media files
- Group management
- Automation triggers

**Tools Available:**
- WhatsApp API integration
- Message formatting
- Contact management

**Best for:**
- WhatsApp automation
- Notifications
- Customer service bots

---

### RoutingAgent

Analyzes requests and routes to appropriate agent.

**How it works:**

1. **Intent Classification:** Analyzes user request to determine intent
2. **Agent Selection:** Chooses best specialized agent based on capabilities
3. **Proxying:** Forwards request and returns response
4. **Fallback:** Routes to autonomous agent if no specialized agent fits

**Manual routing:**

```typescript
import { routingAgent } from "../agents/network";

// Routing agent automatically selects the right agent
const response = await routingAgent.generate({
  messages: [{ role: "user", content: "Your request here" }]
});
```

**Selection logic:**
- **Planning tasks** → `PlannerAgent`
- **Research/Information** → `ResearcherAgent`
- **Execution/Automation** → `ExecutorAgent`
- **WhatsApp** → `WhatsAppAgent`
- **General queries** → `AutonomousAgent`

---

## AutonomousAgent

General-purpose agent with autonomous reasoning capabilities.

```typescript
import { autonomousAgent } from "../agents/autonomous-agent";

const response = await autonomousAgent.generate({
  messages: [{ role: "user", content: "Help me understand my codebase" }]
});
```

**Capabilities:**
- Multi-step reasoning
- Tool selection and use
- Context awareness
- Memory integration

**Tools Available:**
- All browser tools (13 tools)
- Dynamic tools
- Semantic memory
- Skills

**Memory Configuration:**

```typescript
// Autonomous agent uses vector memory with semantic search
{
  memory: {
    messageHistory: { lastMessages: 50 },  // Remember last 50 messages
    workingMemory: windowMemory({ size: 5 }),  // 5-slot working memory
    semanticRecall: {
      embedder: ModelRouterEmbeddingModel,
      vector: LibSQLVector,
      topK: 5,  // Return top 5 relevant memories
      messageRange: 2,  // Include 2 messages before/after
      scope: "resource"  // Match on resource ID
    }
  }
}
```

---

## Creating Custom Agents

### Basic Agent

```typescript
import { Agent } from "@mastra/core/agent";
import { getAgentProcessors } from "../processors";
import { createModel } from "../utils/model-config";

const customAgent = new Agent({
  name: "custom-agent",
  description: "A custom specialized agent",
  instructions: "You are a helpful assistant specialized in...",
  model: createModel(),
  tools: [/* your tools */],
  processors: getAgentProcessors(),
  memory: {
    messageHistory: { lastMessages: 20 },
    workingMemory: windowMemory({ size: 3 })
  }
});
```

### Agent with Tools

```typescript
import { myTool } from "../tools/my-tool";

const toolAgent = new Agent({
  name: "tool-agent",
  description: "Agent with custom tools",
  model: createModel(),
  tools: [myTool, browserTools],
  instructions: "Use available tools to accomplish tasks"
});
```

### Agent in Network

```typescript
// Add to existing network
import { agentNetwork } from "../agents/network";

// Access routing agent
const { routingAgent } = agentNetwork;

// Network coordinates all specialized agents automatically
```

---

## Agent Configuration

Model selection and configuration:

```typescript
import { createModel } from "../utils/model-config";

// Uses default provider from environment
const model = createModel();

// Configuration via environment variables:
// AI_PROVIDER=groq
// GROQ_API_KEY=your_key
// GROQ_MODEL=llama-3.3-70b-versatile
```

**Supported providers (17+):**
- OpenAI, Anthropic, Google, NVIDIA, Groq, Mistral
- xAI, DeepSeek, Perplexity, Cohere, Hugging Face
- Together AI, Fireworks AI, Cerebras, OpenRouter
- Ollama, Ollama Cloud, Custom providers

---

## Memory and Context

### Memory Access

```typescript
// Agents automatically use semantic memory
const response = await agent.generate({
  messages: [{ role: "user", content: "What did we discuss earlier?" }]
});

// Memory is retrieved using vector similarity search
// based on semantic meaning, not keywords
```

### Working Memory

```typescript
// Working memory stores recent context
// Configured per agent:
{
  workingMemory: windowMemory({ size: 5 })  // 5 most recent items
}
```

### Message History

```typescript
// Agent remembers conversation history
{
  messageHistory: { lastMessages: 50 }  // Remember last 50 messages
}
```

---

## Processor Hooks

All agents use input/output processors:

### Input Processors
1. **Enhanced Semantic Recall** - Retrieves relevant memories
2. **Tool Search Processor** - Discovers dynamic tools
3. **Token Limiter** - Manages context length
4. **Prompt Injection Detector** - Security check
5. **PII Detector** - Privacy protection

### Output Processors
1. **Batch Parts Processor** - Stream optimization
2. **Output Token Limiter** - Response length control
3. **PII Detector** - Privacy protection
4. **Moderation Processor** - Content safety

---

## Error Handling

```typescript
try {
  const response = await agent.generate({
    messages: [{ role: "user", content: "Your request" }]
  });
} catch (error) {
  if (error.code === "TOOL_EXECUTION_FAILED") {
    console.error("Tool failed:", error.details);
  } else if (error.code === "MEMORY_RETRIEVAL_ERROR") {
    console.error("Memory error:", error.details);
  }
}
```

Common error codes:
- `MODEL_ERROR` - AI model failure
- `TOOL_EXECUTION_FAILED` - Tool execution error
- `MEMORY_RETRIEVAL_ERROR` - Memory system error
- `INVALID_INPUT` - Invalid request format

---

## Usage Examples

### Multi-step Task

```typescript
async function researchProject(topic: string) {
  // Planning
  const plan = await plannerAgent.generate({
    messages: [{ role: "user", content: `Plan research on ${topic}` }]
  });

  // Research
  const research = await researcherAgent.generate({
    messages: [{ role: "user", content: `Research ${topic}` }]
  });

  // Execution
  const summary = await executorAgent.generate({
    messages: [plan, research]
  });

  return summary;
}
```

### Web Automation

```typescript
async function automateWorkflow(url: string) {
  const result = await executorAgent.generate({
    messages: [{
      role: "user",
      content: `Automate workflow at ${url}`
    }]
  });
  return result;
}
```

### Memory-based Conversation

```typescript
// Agent remembers previous conversations
response1 = await agent.generate({
  messages: [{ role: "user", content: "My name is Alice" }]
});

response2 = await agent.generate({
  messages: [{ role: "user", content: "What's my name?" }]
});

// Agent will recall: "Alice"
```

---

## Performance Considerations

- **Semantic Memory:** Vector similarity is fast but requires embedding generation
- **Tool Execution:** Can add latency (browser tools ~2-5s, others <1s)
- **Agent Network:** Routing adds ~500ms overhead
- **Message History:** Larger history = more context = slower inference

**Optimization tips:**
- Reduce `lastMessages` if latency is critical
- Use specific agents instead of routing agent when possible
- Cache frequently accessed data
- Batch tool operations
