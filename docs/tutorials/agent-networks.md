# Agent Networks Tutorials

Using Sybil's multi-agent system efficiently.

## Overview

Sybil has **5 specialized AI agents** coordinated by an intelligent **Routing Agent**:

| Agent | Role | Capabilities |
|-------|------|-------------|
| **Planner Agent** | Task Planning | Decomposes complex goals into actionable steps |
| **Researcher Agent** | Information Gathering | Web research, fact verification, data analysis |
| **Executor Agent** | Task Execution | Coding, file operations, automation |
| **WhatsApp Agent** | Messaging | WhatsApp Web integration, contact management |
| **Routing Agent** | Coordinator | Routes tasks, coordinates agents, synthesizes results |

## Routing Logic

The Routing Agent intelligently determines:

1. **Task Type Analysis**
2. **Agent Selection**
3. **Task Decomposition**
4. **Coordination**
5. **Result Synthesis**

## Usage Examples

### Simple Task - Single Agent

**Request:**
```
User: Send "Hello" to WhatsApp
User: Network: Send "Hello" to WhatsApp
```

**Routing:**
```
Routing Agent → WhatsApp Agent
```

### Medium Task - Two Agents

**Request:**
```
User: Research Node.js best practices for REST APIs
Network Agent: Researcher Agent → gather info
                   Executor Agent → compile notes
```

**Routing:**
```
Routing Agent: "Research Node.js best practices → I'll route this to research for information gathering,
              then coordinate with executor to compile the findings."
```

### Complex Task - All Agents

**Request:**
```
User: Build a web scraper for techcrunch.com
Network Agent:
  1. Research → TechCrunch site structure
  2. Planner → Create development plan with steps
  3. Executor → Implement scraper
  4. WhatsApp → Notify "Scraper ready for testing"
```

## Telegram Command: `/network`

### Syntax

```
/network <task description>
```

### Examples

```
/network Research AI trends and summarize
/network Analyze the competition for product X
/network Create a PR automation workflow for GitHub
/network Investigate the issue on page X
```

### Live Updates

The `/network` command shows real-time progress:

```
🌐 Processing with Agent Network: "Research..."

[Agent: Executing...]

🌐 [Step 1/3] Researching...

→ Using tool: browser-google-search
→ Found 10 results

🌐 [Step 2/3] Analyzing...

→ Processing results...

🌐 [Step 3/3] Synthesis...

✅ Network Complete
```

## Example Conversations

### Example 1: Research with Action

```
User: /network Find and download the latest Python tutorial

🌐 Processing with Agent Network...
🌐 [1/2] Using Researcher Agent...

[Researcher Agent]
→ browser-google-search: "Python tutorial 2026"
→ browser-navigate: "https://docs.python.org/3/..."
→ browser-save-content: "python-tutorial"

🌐 [2/2] Using Executor Agent...

[Executor Agent]
→ verify saved file
→ workspace/list-workspace: "python-tutorial.md"

✅ Summary:
- Downloaded Python tutorial from docs.python.org
- Saved to workspace/python-tutorial.md
- Word count: 15,234 words
```

### Example 2: Multi-Agent Coordination

```
User: /network Create a web scraper for nytimes.com with pagination

🌐 Processing with Agent Network...

[Planner Agent]
→ Steps identified:
  1. Analyze nytimes.com structure
  2. Design scraper architecture
  3. Implement pagination logic
  4. Add error handling
  5. Test with sample extraction

[Researcher Agent]
→ Investigates nytimes.com article URLs
→ Analyzes pagination patterns
→ Found pagination logic: `?page=1,2,3...`

[Executor Agent]
→ Creates scraper code
→ Implements pagination
→ Tests with first 3 pages

[WhatsApp Agent]
→ (Skipped - not needed)

✅ Summary:
- Web scraper created in workspace/
- Supports pagination
- Tested and working
- Usage: node workspace/nytimes-scraper.js start
```

### Example 3: Cross-Platform Research

```
User: /network Compare the pricing models of AWS, Google Cloud, and Azure

🌐 Processing with Agent Network...

[Researcher Agent]
→ AWS pricing: navigate → AWS → extract pricing table
→ Azure pricing: navigate → Azure → extract pricing table
→ GCP pricing: navigate → GCP → extract pricing table

[Executor Agent]
→ Create comparison table
→ Add metadata (regions, instance types)

✅ Summary:
- Extracted pricing from all 3 platforms
- Comparison saved to: workspace/cloud-pricing-comparison.md
- Includes: compute, storage, database prices
```

## Best Practices

### 1. Be Specific with Tasks

**Bad:**
```
/network Do research
```

**Good:**
```
/network Research AI trends 2026, find 3 most important papers, and save them with titles and abstracts
```

### 2. Use Agent-Specific Tasks

If you know which agent is best:

**For research:**
```
Use: /network Research [topic] 
Instead of: Ask your Researcher to research [topic]
```

**For planning:**
```
Use: /plan [goal]
Instead of: Use your Planner to plan [goal]
```

**For execution:**
```
Use direct: "Execute [task]"
Instead of: Let your Executor do [task]"
```

### 3. Provide Context

**Bad:**
```
/network Look at some websites
```

**Good:**
```
/network Research React vs Vue.js performance benchmarks on js-framework-bench.com and bencher.app
```

### 4. Set Realistic Timeframes

**Bad:**
```
/network Write a complete book about quantum mechanics
```

**Good:**
```
/network Explain the fundamentals of quantum mechanics in under 500 words
/network Create a research plan for "learning quantum computing over 3 months"
```

## Agent Capabilities Deep Dive

### Planner Agent

**Specializes In:**
- Task decomposition
- Dependency mapping
- Priority-setting
- Resource estimation

**Output Format:**
```typescript
{
  id: "plan-123",
  goal: "Learn Rust in 30 days",
  steps: [...],
  estimatedHours: 40,
  resources: ["docs.rust-lang.org", "rust-anatomy.com"]
}
```

### Researcher Agent

**Specializes In:**
- Search evaluation
- Source verification
- Data extraction
- Cross-referencing

**Tools Available:**
- `browser-google-search` - Google search
- `browser-get-content` - Extract page content
- `fetch-web-content` - Fetch web content from URL
- `browser-get-links` - Extract all links

**Output Format:**
```typescript
{
  sources: [
    { url, title, source, summary },
    ...
  ],
  confidence: 0.85,
  citations: [...]
}
```

### Executor Agent

**Specializes In:**
- Code generation
- File operations
- Testing
- Automation

**Tools Available:**
- All workspace tools (file read/write/list)
- Browser tools (navigate, interact, save)
- Code execution tools
- WhatsApp tools

**Output Format:**
```typescript
{
  type: "code" | "test" | "automation",
  result: any,
  status: "passed" | "failed",
  logs: [...]
}
```

### WhatsApp Agent

**Specializes In:**
- Message sending
- Chat management
- Auto-reply configuration
- Contact retrieval

**Tools Available:**
- `get-whatsapp-status` - Connection status
- `send-whatsapp-message` - Send message
- `get-whatsapp-chats` - List chats
- `configure-auto-reply` - Auto-reply settings

**Output Format:**
```typescript
{
  messageId: "msg_abc",
  status: "sent",
  timestamp: "2026-02-12T..."
}
```

### Routing Agent (Coordinator)

**Routing Logic:**

```typescript
function routeTask(task: string): Agent[] {
  const taskLower = task.toLowerCase();
  
  if (taskLower.includes("research") ||
      taskLower.includes("find information") ||
      taskLower.includes("investigate")) {
    return [researcherAgent];
  }
  
  if (taskLower.includes("write") ||
      taskLower.includes("create") ||
      taskLower.includes("code") ||
      taskLower.includes("implement")) {
    return [executorAgent];
  }
  
  if (taskLower.includes("plan") ||
      taskLower.includes("schedule") ||
      taskLower.includes("organize")) {
    return [plannerAgent];
  }
  
  if (taskLower.includes("whatsapp") ||
      taskLower.includes("send message") ||
      taskLower.includes("chat")) {
    return [whatsappAgent];
  }
  
  // Complex tasks may require multiple agents
  if (taskLower.includes("and") ||
      taskLower.includes("then")) {
    return [plannerAgent, researcherAgent, executorAgent];
  }
  
  // Default: routing agent handles itself
  return [];
}
```

## Troubleshooting

### "Agent not responding"

**Check:**
```bash
sybil status  # Verify agent is running
sybil logs --level error  # Check for errors
```

**Possible causes:**
- Agent not loaded
- Model not configured correctly
- Task is too complex
- Timeout issues

### "Agent selected wrong agent"

**Provide explicit direction:**
```
/network Use the Researcher Agent to research X
```

**Or use specific commands:**
```
/plan [task]    # Forces Planner Agent
/create-tool [task]  # Executor Agent
```

### "Agent timeout"

**Break down task:**
```
Bad: /network Write a book, summarize it, create a cover image, publish it to 5 platforms

Good: /network Plan to summarize first chapter in 500 words
```

---

**Now orchestrate your agents effectively! 🤖**
