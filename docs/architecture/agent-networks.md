# Agent Networks Architecture

Multi-agent coordination system in Sybil.

## Purpose

Enable complex task decomposition and parallel execution using specialized agents with AI routing.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Sybil Agent Network                      │
├─────────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐                │
│  │              Routing Agent (Coordinator)                │                │
│  │  AI-powered task analyzer and router             │                │
│  │  Decides:                                    │                │
│  │  - Single agent for simple tasks                     │                │
│  │  - Multiple agents for complex tasks                │                │
│  │  - Coordination patterns                   │                │
│  │  ├─→──→─→─→─→─→─→─→─→─→─→─→─→─→─→→─→        │
│  │  │         ↓                                              │                │
│  │  │    ┌──────────────────────────────────────────────────┐   │                │
│  │  │    │     5 Specialized Agents               │   │                │
│  │  │    ├──────────────────────────────────────────┐   │                │
│  │  │    │ Planner    │  Researcher   │  │    │   │                │
│  │  │    │ (Planning)  │ (Research)     │  │    │   │                │
│  │  │    └──────────┘  └──────────────┘   │                │
│  │    │         Executor                       │                │
│  │    │ (Execution)                       │                │
│  │    │      ×→×→                        │                │
│  │    │         WhatsApp                      │                │
│  │    │ (Messaging)                      │                │
│  │    └──────────────────────────────────┐   │                │
│  │    │              Routing Agent            │   │                │
│  │    │              (Coordinator)            │   │                │
│  │    │              +───→ +───→                  │   │                │
│  │    │                    ↓                      │   │                │
│  │    ┌────────────────────────┐   #                   │ │                │
│  │    │  User Task:        │   │                   │                │
│    │  "Manage dashboard   │   │                   │                │
│    │   across servers"     │   │                   │                │
│  │                        │   │                   │                │
│    │                        │   │                   │                │
│  │    └────────────────────────┘   │                   │                │
│  │                              │                   │                │
│  └──────────────────────────────┘   │                   │                │
│                                              │                   │                │
│  ┌──────────────────────────────────┐   │                   │                │
│  │         Output to User               │   │                   │                │
│  │         (User message               │   │                   │                │
│  │  │   synthesized from           │   │                   │                │
│  │  │   multiple agent inputs)         │   │                │                │
│  │                                    │   │                │                │
│  └──────────────────────────────────┘   │                   │                │
│                                              │                   │                │
└───────────────────────────────────────┘   │                   │                │
```

---

## Component Details

### 1. Routing Agent (Coordinator)

**File:** `src/agents/network.ts → routingAgent`

**Role:** Analyze task and route to appropriate agent(s)

**Logic:**
```typescript
function determineAgents(task: string): Array<string> {
  const taskLower = task.toLowerCase();
  
  if (taskLower.includes("research")) {
    return ["researcherAgent"];
  }
  if (taskLower.includes("plan") || taskLower.includes("schedule")) {
    return ["plannerAgent"];
  }
  if (taskLower.includes("write") || taskLower.includes("code")) {
    return ["executorAgent"];
  }
  if (taskLower.includes("whatsapp") || taskLower.includes("message")) {
    return ["whatsappAgent"];
  }
  
  // Complex tasks require multiple agents
  if (taskLower.includes("and") || taskLower.includes("then")) {
    return ["plannerAgent", "researcherAgent", "executorAgent"];
  }
  
  // Simple tasks handled autonomously
  return []; // Routing Agent handles it
}
```

**Capabilities:**
- Analyze natural language task descriptions
- Identify task type by keywords and intent
- Determine if delegation is needed
- Coordinate multiple agents for complex workflows
- Synthesize results from multiple agents
- Handle fallback when agents fail

**Instructions:**
```typescript
instructions: `You are the coordinator of an agent network.
Your job is to:
1. Analyze the user's request
2. Determine which specialized agent(s) should handle it
3. Route the task to the appropriate agent(s)
4. Coordinate multi-step tasks across agents
5. Synthesize results from multiple agents

Available agents:
- plannerAgent: Task decomposition, creating step-by-step plans
- researcherAgent: Web research, information gathering, fact verification
- executorAgent: Task execution, coding, file operations, automation
- whatsappAgent: WhatsApp messaging, contact management

For simple tasks, use one agent.
For complex tasks, coordinate multiple agents in sequence.

Route efficiently.`
```

---

### 2. Planner Agent

**File:** `src/agents/network.ts → plannerAgent`

**Role:** Decompose tasks into actionable steps

**Capabilities:**
- Analyze task complexity
- Create execution plans
- Identify dependencies between steps
- Prioritize steps by urgency/importance
- Set realistic timelines
- Validate plan feasibility

**Inputs:**
```typescript
interface Goal {
  id: string;
  description: string;
  priority: "high" | "medium" | "low";
  estimatedHours?: number;
}

interface Plan {
  id: string;
  goal: Goal;
  steps: PlanStep[];
  status: "pending" | "in-progress" | "completed" | "failed";
  createdAt: Date;
  createdAt: Date;
  updatedAt: Date;
  estimatedHours?: number;
}

interface PlanStep {
  order: number;
  action: string;
  dependencies: string[];
  timeline: string;
  completed: boolean;
}
```

**Example Output:**
```typescript
{
  "id": "plan-123",
  "goal": "Learn Python in 30 days",
  "status": "pending",
  "steps": [
    {
      "order": 1,
      "action": "Install Python 3.12",
      "dependencies": [],
      "timeline": "Day 1-2",
      "completed": false,
    },
    {
      "order": 2,
      "action: "Read official docs",
      "dependencies": ["install python 3.12"],
      "timeline": "Day 1-3",
      "completed": false,
    },
    // ... more steps
  ],
}
```

---

### 3. Researcher Agent

**File:** `src/agents/network.ts → researcherAgent`

**Role:** Information gathering and verification

**Capabilities:**
- Google searches
- Web browsing content extraction
- Source verification
- Cross-referencing
- Fact-checking with confidence levels

**Tools Available:**
- `browser-google-search` - Search Google
- `browser-navigate` - Navigate to URLs
- `browser-get-content` - Extract page content as Markdown
- `browser-get-links` - Extract all links
- `fetchWebContent` - Fetch web content
- `extractStructuredData` - Extract specific data with CSS selectors
- `deepResearch` - Comprehensive multi-source research

**Output Format:**
```typescript
interface ResearchResult {
  summary: string;
  sources: Array<{
    source: string;
    url: string;
    summary: string;
    confidence: number;  // 0-1
  }>;
  confidence: number; // 0-1
  citations: string[];
  data: Record<string, any>;
}
```

**Example:**
```typescript
{
  "summary": "Best practices include async/await and type hints",
  "sources": [
    {
      "source": "docs.python.org/3/faq/async.html",
      "url": "https://docs.python.org/3/faq/async.html#how-do-i-wait-for-a-cancellation-to-complete",
      "summary": "Discusses async cancellation patterns",
      "confidence": 0.95,
    }
  ],
  "confidence": 0.92,
  "citations": ["py/async.html#how-do-i-wait-for-a-cancellation-to-complete"],
  "data": {
    codeSnippet: "try:\n    await task\nexcept InterruptedError..."
  }
}
```

---

### 4. Executor Agent

**File:** `src/agents/network.ts → executorAgent`

**Role:** Execute tasks and perform actions

**Capabilities:**
- Write clean, working code
- Manage files in workspace
- Execute commands in sandbox
- Browser automation
- Testing and validation
- Error handling and recovery

**Tools Available:**
- All workspace tools (file read/write/list)
- All browser tools (navigate, content, screenshot, execute script)
- Code execution tools
- WhatsApp tools
- Development tools

**Workflow:**
```
1. Understand task requirements
2. Plan implementation approach
3. Acquire necessary resources
4. Execute implementation steps
5. Test and validate results
6. Report status with logs
```

**Output Format:**
```typescript
interface ExecutionResult {
  type: "code" | "automation" | "test" | "config";
  result: any;
  status: "success" | "failed" | "partial";
  logs: string[];
  duration: number;
  resourceUsage?: {
    memory: number;
    cpu: number;
    disk: number;
  };
}
```

**Example:**
```typescript
{
  "type": "code",
  "result": {
    "filename": "workspace/scraper.js",
    "language": "JavaScript",
    status": "success"
  },
  "status": "success",
  "logs": [
    "Created workspace/scraper.js",
    "Started scraping tests",
    "All 3 tests passed"
  ],
  "duration": 1245,
  "resourceUsage": {
    "memory": "128MB",
    "cpu": "45%",
  },
}
```

---

### 5. WhatsApp Agent

**File:** `src/agents/network.ts → whatsappAgent`

**Role:** WhatsApp Web integration specialist

**Capabilities:**
- Send messages
- Check connection status
- Get chat list
- Manage auto-reply
- Get contact information
- My WhatsApp info

**Tools Available:**
- `get-whatsapp-status`
- `send-whatsapp-message`
- `get-whatsapp-chats`
- `configure-auto-reply`
- `read-whatsapp-messages`
- `get-whatsapp-contact`
- `get-my-whatsapp-info`
- `broadcast-whatsapp-message`

**Workflow:**
```
1. Verify WhatsApp connection
2. Format the message
3. Send to recipient
4. Handle response/callback
```

**Phone Formats:**
- ✅ `1234567890` (US)
- ✅ `9191234567890` (Philippines)
- ✅ `4477000001234` (Singapore)
- ❌ `+1234567890` (no +)
- ❌ `1-234-567-890` (no dashes)

---

## Communication Flow

### User Request → Response Flow

1. **User sends task** via `/network <task>`
2. **Routing Agent** analyzes request
3. **Determines optimal agent(s)**
4. **Routes task to selected agent(s)**
5. **Agent(s) execute their capabilities**
6. **Routing Agent:**
   - Collects results
   - Synthesizes multi-agent results
   - Returns comprehensive response

### Simple Task Flow

```
User: /network Navigate to example.com
           ↓
Routing Agent: Singleagent task detected
           ↓
Executor Agent:
  → browserNavigate({ url: "https://example.com" })
  → browserGetContent({ url, includeMarkdown: true })
           ↓
Routing Agent: Returns summary
```

### Multi-Agent Flow

```
User: /network Create a web scraper for nytimes.com
           ↓
Routing Agent: Complex task detected
           ↓
[1] Planner Agent:
  Creates plan with 5 steps:
   1. Site analysis
   2. Data extraction logic
   3. Scraper implementation
  4. Testing
  5. Documentation

[2] Researcher Agent:
  → browser-google-search
  → Analyzes nytimes.com
  → Extract article URLs

[3] Executor Agent:
  → Writes scraper.js
  → Implements logic from plan
  → Executes test

[4] WhatsApp Agent:
  → Skipped (not needed)

[5] Routing Agent:
  → Synthesizes results
  → Returns complete summary
```

---

## Orchestration Patterns

### Pattern 1: Sequential Execution

```
Task: "Research topic, create report, save data"
Flow: Research → Report → Save (sequential)
```

### Pattern 2: Parallel Execution

```
Task: "Analyze 3 different websites"
Flow: Analyze (3 threads in parallel) → Summarize
```

### Pattern 3: Conditional Branching

```
Task: "Get prices from AWS, Azure, and GCP"

Routing Agent logic:
  if (requires cloud comparison):
    → Use all 3 agents in parallel
  else:
    → Use cheapest/fastest provider (Groq, Cerebras)
```

### Pattern 4: Error Recovery

```
Executor Agent: task failed
  → Log error details
  → Attempt recovery strategy
  → Report partial success
  → Routing Agent creates recovery plan
```

### Pattern 5: Tool Composition

```
Task: "Browsing tool composition"

Executor Agent:
  → Use browser-tools + dynamic-tools
  → Researcher Agent: Web searching background
  → Saves to workspace using file-tools
```

---

## Failure Handling

### Agent-Level Fallback
```typescript
// If Researcher Agent fails, try Executor with URL extraction
async resilientTask(task: Task) {
  try {
    return await researcherAgent.execute(task);
  } catch (error) {
    // Try fallback strategy
    console.error("Research failed, trying fallback...");
    await executorAgent.execute(recoveryPlan);
  }
}
```

### Retry Mechanism
```typescript
// Automatic retry with exponential backoff
maxRetries: 2

Attempt retry with longer timeout:
  {
    timeout: initial * 2,
  }
```

### Graceful Degradation
```typescript
// On consecutive failures, simplify approach
// Or fall back to basic capabilities
```

---

## Performance

### Optimization Techniques

1. **Parallel Execution:** Multi-agent tasks run concurrently
2. **Caching:** Agent tool results cached
3. **Lazy Loading:** Agents instantiated on first use
4. **Connection Pooling**: Reuse agent instances
5. **Session Management:** Group related agent operations

### Scalability

- Add more specialised agents easily
- Implement agent hierarchies (sub-agents)
- Create domain-specific networks
- Network composition (network of networks)

---

## Implementation Files

```
src/
├── agents/
│   ├── network.ts          # All 5 specialized agents + network routing
│   ├── plannerAgent.ts   # Task planning
│   ├── researcherAgent.ts   # Information gathering
│   ├── executorAgent.ts    # Task execution
│   ├── whatsappAgent.ts    # WhatsApp integration
│   └── routingAgent.ts     # Network coordinator
├── mastra/index.ts          # Mastra instance registration
└── ...other modules
```

---

## Advantages

✅ **Specialization:** Each agent excels at specific tasks  
✅ **Coordination:** Intelligent routing reduces agent conflict  
✅ **Scalability:** Easy to add new specialized agents  
✅ **Flexibility:** Sequential or parallel execution based on needs  
✅ **Integration:** All agents use shared memory and workspace  

---

## Current Agent Set

| Agent | Primary Function | Tools Available |
|-------|------------------|----------------|
| **Planner** | Planning | Mastra workflows |
| **Researcher** | Research | Web + data tools |
| **Executor** | Execution | File system + workspace + workspace tools |
| **WhatsApp** | Messaging | WhatsApp tools (10 tools) |
| **Routing** | Coordination | Delegates to other agents |
| **Autonomous** | General | All tools listed above + dynamic tools |

---

**Multi-agent coordination makes complex tasks manageable! 🤖**