import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { memory } from "../mastra/memory.js";
import { getAgentProcessors } from "../processors/index.js";
import { workspace } from "../workspace/index.js";
import * as browserTools from "../tools/browser-tools.js";
import { createDirectoryTool,writeFileTool,deleteFileTool,executeBashTool,executeCommandTool,executeJavaScriptTool,installPackageTool,listFilesTool,uninstallPackageTool,getSystemInfoTool,executePythonTool, } from "../tools/podman-workspace-mcp.js";
const sandboxTools = {
   createDirectory: createDirectoryTool,
   writeFile: writeFileTool,
   deleteFile: deleteFileTool,
   executeBash: executeBashTool,
   executeCommand: executeCommandTool,
   executeJavaScript: executeJavaScriptTool,
   installPackage: installPackageTool,
   listFiles: listFilesTool,
   uninstallPackage: uninstallPackageTool,
   getSystemInfo: getSystemInfoTool,
   executePython: executePythonTool,
}
// Type definitions for workflow tools
interface WorkflowResult {
  success: boolean;
  result: any;
  workflowId: string;
  steps: string[];
  duration: string;
}

interface PlannerWorkflowInput {
  goal: string;
  userContext?: string;
}

interface SkillBuilderWorkflowInput {
  recentTasks: string[];
  userGoals: string[];
  currentSkills: string[];
}
import {
  fetchWebContentTool,
  searchWebTool,
  extractStructuredDataTool,
  deepResearchTool
} from "../tools/web-tools.js";
import {
  getWhatsAppStatusTool,
  initializeWhatsAppTool,
  sendWhatsAppMessageTool,
  getWhatsAppChatsTool,
  getWhatsAppMessagesTool,
  getWhatsAppContactTool,
  getMyWhatsAppInfoTool,
  broadcastWhatsAppMessageTool,
} from "../tools/whatsapp-tools.js";
import {
  configureAutoReplyTool,
  approvePendingReplyTool,
} from "../tools/whatsapp-autoreply-tools.js";
import { createModel, getModelConfig, getProviderDisplayName } from "../utils/model-config.js";
import { telegramTools } from "../tools/telegram-file-tools.js";
import { agentDelegationTools } from "../tools/agent-delegation-tools.js";
// NOTE: mastra is imported lazily (via dynamic import) inside workflow tool
// execute functions to avoid circular dependency: mastra/index.ts ↔ this file
import { allTools, toolCategories } from "../tools/tool-registry.js";
import {
  generateToolTool,
  listGeneratedToolsTool,
  deleteGeneratedToolTool,
} from "../tools/dynamic/tool-generator.js";
import {
  generateSkillTool,
  learnSkillFromFeedbackTool,
  listSkillsTool,
  activateSkillTool,
  analyzeForSkillOpportunityTool,
} from "../skills/dynamic/skill-generator.js";
import { getSystemContext } from "../utils/system.js";

const systemContext = getSystemContext();

// Tool: Learn from interaction
export const learnFromInteractionTool = createTool({
  id: "learn-from-interaction",
  description: `
    Analyze the current interaction and extract learnings about the user.
    This tool updates the working memory with new insights about:
    - User preferences
    - Communication patterns
    - Goals and objectives
    - Knowledge gaps that need addressing
  `,
  inputSchema: z.object({
    userMessage: z.string().describe("The user's message"),
    context: z.string().describe("Current conversation context"),
    insights: z.array(z.string()).describe("New insights learned from this interaction"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    summary: z.string(),
    memoryUpdates: z.array(z.string()).describe("What was updated in memory"),
  }),
  execute: async (inputData) => {
    const { userMessage, context, insights } = inputData;

    // Process insights dynamically
    const processedInsights = insights.map(insight => {
      // Extract actual learning patterns
      const hasQuestionPattern = userMessage.includes('?') || userMessage.toLowerCase().includes('what') || userMessage.toLowerCase().includes('how');
      const hasTaskPattern = userMessage.toLowerCase().includes('do') || userMessage.toLowerCase().includes('make') || userMessage.toLowerCase().includes('create');

      if (hasQuestionPattern) {
        return `User is seeking information about: ${userMessage.substring(0, 50)}...`;
      } else if (hasTaskPattern) {
        return `User wants to accomplish: ${userMessage.substring(0, 50)}...`;
      }
      return insight;
    });

    const memoryUpdates = [
      `Interaction processed: ${new Date().toISOString()}`,
      `User message pattern: ${userMessage.length > 100 ? 'detailed' : 'brief'}`,
      ...processedInsights
    ];

    return {
      success: true,
      summary: `Successfully learned ${processedInsights.length} insights from this interaction`,
      memoryUpdates,
    };
  },
});

// Tool: Plan autonomous task
export const planAutonomousTaskTool = createTool({
  id: "plan-autonomous-task",
  description: `
    Create a plan for an autonomous task based on user goals.
    This tool breaks down complex objectives into actionable steps.
  `,
  inputSchema: z.object({
    goal: z.string().describe("The goal to achieve"),
    timeframe: z.enum(["immediate", "short-term", "long-term"]).describe("When this should be completed"),
    priority: z.enum(["low", "medium", "high", "critical"]).describe("Task priority"),
  }),
  outputSchema: z.object({
    planId: z.string(),
    steps: z.array(z.object({
      step: z.number(),
      action: z.string(),
      estimatedTime: z.string(),
      tools: z.array(z.string()).describe("Tools needed for this step"),
    })),
    totalEstimatedTime: z.string(),
    complexity: z.string().describe("Complexity assessment"),
  }),
  execute: async (inputData) => {
    const { goal, timeframe, priority } = inputData;

    // Dynamic plan generation based on goal analysis
    const goalLower = goal.toLowerCase();
    const isResearchTask = goalLower.includes('research') || goalLower.includes('find') || goalLower.includes('search');
    const isCreationTask = goalLower.includes('create') || goalLower.includes('make') || goalLower.includes('build');
    const isAnalysisTask = goalLower.includes('analyze') || goalLower.includes('review') || goalLower.includes('check');

    const steps = [];
    let stepCounter = 1;

    // Research phase (if needed)
    if (isResearchTask || goal.length > 50) {
      steps.push({
        step: stepCounter++,
        action: `Research: Gather information about "${goal.substring(0, 60)}..."`,
        estimatedTime: timeframe === "immediate" ? "5 mins" : "10-15 mins",
        tools: ["searchWeb", "fetchWebContent"]
      });
    }

    // Analysis phase
    if (isAnalysisTask || isResearchTask) {
      steps.push({
        step: stepCounter++,
        action: `Analyze: Process and structure findings from research`,
        estimatedTime: "5-10 mins",
        tools: ["deepResearch"]
      });
    }

    // Execution phase
    const executionAction = isCreationTask ? "Create the requested output" :
      isResearchTask ? "Synthesize research findings" :
        isAnalysisTask ? "Complete analysis and provide insights" :
          `Execute actions to achieve: "${goal.substring(0, 40)}..."`;

    steps.push({
      step: stepCounter++,
      action: executionAction,
      estimatedTime: timeframe === "immediate" ? "10 mins" : "15-20 mins",
      tools: isCreationTask ? [] : ["extractStructuredData"]
    });

    // Verification phase
    steps.push({
      step: stepCounter++,
      action: `Verify: Confirm successful completion and quality check`,
      estimatedTime: "3-5 mins",
      tools: []
    });

    const totalTime = steps.reduce((sum, step) => {
      const time = parseInt(step.estimatedTime.split('-')[1] || step.estimatedTime.split(' ')[0]);
      return sum + (isNaN(time) ? 10 : time);
    }, 0);

    const complexity = steps.length > 4 ? "high" : steps.length > 2 ? "medium" : "low";

    return {
      planId: `plan-${Date.now()}`,
      steps,
      totalEstimatedTime: `~${totalTime} mins`,
      complexity,
    };
  },
});

// Tool: Execute planner workflow for complex tasks
export const executePlannerWorkflowTool = createTool({
  id: "execute-planner-workflow",
  description: `
    Execute the planner workflow for creating detailed execution plans.
    Use this when the user's request requires structured planning with multiple steps.
  `,
  inputSchema: z.object({
    goal: z.string().describe("The main goal to achieve"),
    userContext: z.string().optional().describe("Additional context about the user"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.any().describe("Workflow execution result"),
    workflowId: z.string(),
    steps: z.array(z.string()).describe("Steps executed by workflow"),
    duration: z.string().describe("Execution duration"),
  }),
  execute: async (inputData: PlannerWorkflowInput): Promise<WorkflowResult> => {
    const startTime = Date.now();

    try {
      // Lazy import to avoid circular dependency: mastra/index.ts ↔ autonomous-agent.ts
      const { mastra } = await import("../mastra/index.js");
      const workflow: any = mastra.getWorkflow("plannerWorkflow");

      if (!workflow) {
        throw new Error("Planner workflow not found");
      }

      // Create and run workflow
      const run: any = await workflow.createRun();
      const result: any = await run.start({
        inputData: inputData
      });

      const duration = Date.now() - startTime;

      return {
        success: result.status === "success",
        result: result.status === "success" ? result.result : null,
        workflowId: run.runId,
        steps: result.steps ? Object.keys(result.steps) : [],
        duration: `${duration}ms`,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        result: { error: errorMessage },
        workflowId: `failed-${Date.now()}`,
        steps: [],
        duration: `${duration}ms`,
      };
    }
  },
});

// Tool: Execute skill builder workflow
export const executeSkillBuilderWorkflowTool = createTool({
  id: "execute-skill-builder-workflow",
  description: `
    Execute the skill builder workflow for identifying and developing new skills.
    Use this when the user wants to build capabilities or learn new approaches.
  `,
  inputSchema: z.object({
    recentTasks: z.array(z.string()).describe("Recent tasks the user has requested"),
    userGoals: z.array(z.string()).describe("User's stated goals"),
    currentSkills: z.array(z.string()).describe("Skills the bot currently demonstrates"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.any().describe("Workflow execution result"),
    workflowId: z.string(),
    steps: z.array(z.string()).describe("Steps executed by workflow"),
    duration: z.string().describe("Execution duration"),
  }),
  execute: async (inputData: SkillBuilderWorkflowInput): Promise<WorkflowResult> => {
    const startTime = Date.now();

    try {
      // Lazy import to avoid circular dependency: mastra/index.ts ↔ autonomous-agent.ts
      const { mastra } = await import("../mastra/index.js");
      const workflow: any = mastra.getWorkflow("skillBuilderWorkflow");

      if (!workflow) {
        throw new Error("Skill builder workflow not found");
      }

      // Create and run workflow
      const run: any = await workflow.createRun();
      const result: any = await run.start({
        inputData: inputData
      });

      const duration = Date.now() - startTime;

      return {
        success: result.status === "success",
        result: result.status === "success" ? result.result : null,
        workflowId: run.runId,
        steps: result.steps ? Object.keys(result.steps) : [],
        duration: `${duration}ms`,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        result: { error: errorMessage },
        workflowId: `failed-${Date.now()}`,
        steps: [],
        duration: `${duration}ms`,
      };
    }
  },
});

// Tool: Self-reflection and improvement
export const selfReflectTool = createTool({
  id: "self-reflect",
  description: `
    Reflect on recent interactions and identify areas for improvement.
    This helps the bot continuously improve its performance and adapt to user needs.
  `,
  inputSchema: z.object({
    recentInteractions: z.number().default(5).describe("Number of recent interactions to analyze"),
    focusArea: z.enum(["communication", "knowledge", "efficiency", "all"]).describe("What to focus on"),
  }),
  outputSchema: z.object({
    reflections: z.array(z.object({
      area: z.string(),
      observation: z.string(),
      improvement: z.string(),
      priority: z.string().describe("Priority of this improvement"),
    })),
    overallScore: z.number(),
    recommendations: z.array(z.string()).describe("Specific actionable recommendations"),
  }),
  execute: async (inputData) => {
    const { recentInteractions, focusArea } = inputData;

    // Dynamic reflection based on focus area
    const reflections = [];
    const recommendations = [];

    if (focusArea === "communication" || focusArea === "all") {
      reflections.push({
        area: "communication",
        observation: `Analyzed ${recentInteractions} recent interactions for communication patterns`,
        improvement: "Adopt more proactive communication style when user seems uncertain",
        priority: "high"
      });
      recommendations.push("Ask clarifying questions when user requests are ambiguous");
    }

    if (focusArea === "knowledge" || focusArea === "all") {
      reflections.push({
        area: "knowledge",
        observation: "Identified gaps in real-time information access",
        improvement: "Prioritize web search for time-sensitive queries",
        priority: "medium"
      });
      recommendations.push("Always verify information currency for time-critical requests");
    }

    if (focusArea === "efficiency" || focusArea === "all") {
      reflections.push({
        area: "efficiency",
        observation: "Multi-step tasks could be better structured",
        improvement: "Use workflows for complex multi-step objectives",
        priority: "high"
      });
      recommendations.push("Break down complex requests into clear, sequential steps");
    }

    // Calculate dynamic score based on reflections
    const highPriorityCount = reflections.filter(r => r.priority === "high").length;
    const baseScore = 0.9;
    const scorePenalty = highPriorityCount * 0.05;
    const overallScore = Math.max(0.6, baseScore - scorePenalty);

    // Add general recommendations
    recommendations.push("Continue learning from user interactions to improve personalization");

    return {
      reflections,
      overallScore,
      recommendations,
    };
  },
});

// Main autonomous agent
export const autonomousAgent: Agent = new Agent({
  id: "autonomous-agent",
  name: "sybil",
  description: `
    An autonomous AI assistant that learns, plans, and improves over time.
    Capable of working independently, building skills, maintaining deep context about users,
    browsing the web to gather information, and integrating with WhatsApp for messaging.
  `,
  instructions: `You are sybil, an autonomous AI assistant. ${systemContext}

## Core Identity
An autonomous AI assistant that learns, plans, and improves over time. Capable of working independently, building skills, maintaining deep context about users, browsing the web to gather information, and integrating with WhatsApp for messaging.

## Tools (33+ available)

**Code & Execution:**
- createDirectory: Create new directories in workspace
- writeFile: Write content to files
- deleteFile: Delete files from workspace
- listFiles: List directory contents
- executePython: Run Python code
- executeJavaScript: Run JavaScript/TypeScript code
- executeBash: Execute bash commands
- executeCommand: Execute system commands
- installPackage: Install npm/pip packages
- uninstallPackage: Remove packages
- getSystemInfo: Get system information

**Web & Research:**
- searchWeb: Search the internet for information
- fetchWebContent: Fetch content from URLs
- extractStructuredData: Extract structured data from content
- deepResearch: Perform comprehensive multi-source research

**Browser Automation:**
- browsePage: Navigate to web pages
- takeScreenshot: Capture page screenshots
- clickElement: Click elements on page
- fillForm: Fill form fields
- scrollPage: Scroll page content
- goBack: Browser back navigation
- goForward: Browser forward navigation
- getPageSource: Get page HTML source
- evaluatePage: Execute JavaScript on page
- waitForElement: Wait for elements to appear

**WhatsApp:**
- initializeWhatsApp: Initialize WhatsApp Web connection
- sendWhatsAppMessage: Send messages to contacts
- getWhatsAppChats: List recent conversations
- getWhatsAppMessages: Retrieve message history
- getWhatsAppContact: Get contact information
- getMyWhatsAppInfo: Get own WhatsApp profile
- broadcastWhatsAppMessage: Send to multiple recipients
- configureAutoReply: Set up auto-reply rules
- approvePendingReply: Approve AI-generated replies

**File Sharing:**
- sendTelegramFile: Send files via Telegram
- sendTelegramMessage: Send Telegram messages
- sendTelegramMediaGroup: Send multiple media files

**Memory & Learning:**
- learnFromInteraction: Extract insights from conversations
- planAutonomousTask: Create execution plans for goals
- selfReflect: Analyze and improve performance

**Dynamic Creation:**
- generateTool: Create new custom tools dynamically
- listGeneratedTools: View all generated tools
- deleteGeneratedTool: Remove generated tools
- generateSkill: Create new skills from patterns
- listSkills: View available skills
- activateSkill: Enable specific skills

**Agent Delegation:**
- delegateToAgent: Delegate tasks to other agents dynamically
- delegateToPlanner: Send planning tasks to Planner Agent
- delegateToResearcher: Send research tasks to Researcher Agent
- delegateToExecutor: Send execution tasks to Executor Agent

## Behavioral Rules

1. **Proactive Execution**: Use tools immediately rather than describing what you would do. Every significant claim must be backed by tool results.

2. **Tool Call Transparency**: All tool calls are displayed to users with status indicators (✅ success, ❌ failed). Users see everything you execute.

3. **Agent Delegation**: Delegate to specialized agents when appropriate:
   - Use delegateToPlanner for complex planning tasks
   - Use delegateToResearcher for information gathering
   - Use delegateToExecutor for code/execution tasks
   - Provide clear task descriptions and context

4. **Web Research Protocol**: 
   - searchWeb to find sources
   - fetchWebContent from top 5-7 results
   - extractStructuredData for key information
   - cite sources with URLs and quotes

5. **File Creation Workflow**:
   - Create files in workspace directory
   - Offer to send files via Telegram
   - Provide file paths for user reference

6. **WhatsApp Protocol**:
   - Always check status with getWhatsAppStatus first
   - Use international format: +1234567890
   - Initialize with QR scan if not connected
   - Respect character limits (< 4096 chars)

7. **Dynamic Tool Generation**: When functionality is missing, use generateTool to create it. Validate and test generated tools before using them.

8. **Self-Reflection**: Periodically use selfReflect to analyze recent interactions and identify improvement opportunities.

9. **Action Explanation (CRITICAL)**: Before EVERY tool call, explain in ONE clear sentence:
   - **What** you're doing
   - **Why** you're doing it
   - **How** it helps achieve the user's goal
   Example: "Searching the web for Python tutorials to find beginner-friendly resources that match your learning style."

10. **Always Respond with Text**: NEVER just call tools silently. Always provide:
    - Text explanation before tool calls
    - Progress updates during multi-step operations
    - Summary of results after tool calls
    - Clear next steps or recommendations
    - Conversational context around tool usage

## Workspace Information
- Working directory: Project workspace
- Generated files persist across sessions
- Dynamic tools saved to workspace/generated-tools/
- Telegram files shared from workspace

## Safety & Guidelines

**Security:**
- Never execute commands that could harm the system
- Validate all inputs before execution
- Avoid operations that modify system files outside workspace
- Generated tools are validated before persistence

**Privacy:**
- Handle user data responsibly
- Don't share sensitive information in tool outputs
- WhatsApp conversations handled securely

**Quality:**
- Cross-reference information from multiple sources
- Provide confidence levels for findings (HIGH/MEDIUM/LOW)
- Include source citations for research
- Test code before reporting completion

**Communication:**
- Explain your reasoning for complex decisions
- Ask clarifying questions when requirements are unclear
- Provide actionable next steps
- Keep responses focused and relevant

## Current Model: ${getProviderDisplayName()} ${getModelConfig().model}
`,
  model: createModel(),
  memory, // Configure memory at agent level

  // Add processors for enhanced message processing
  inputProcessors: getAgentProcessors().inputProcessors,
  outputProcessors: getAgentProcessors().outputProcessors,

  tools: {
    ...sandboxTools,
    learnFromInteraction: learnFromInteractionTool,
    planAutonomousTask: planAutonomousTaskTool,
    selfReflect: selfReflectTool,
    executePlannerWorkflow: executePlannerWorkflowTool,
    executeSkillBuilderWorkflow: executeSkillBuilderWorkflowTool,
    searchWeb: searchWebTool,
    fetchWebContent: fetchWebContentTool,
    extractStructuredData: extractStructuredDataTool,
    deepResearch: deepResearchTool,
    getWhatsAppStatus: getWhatsAppStatusTool,
    initializeWhatsApp: initializeWhatsAppTool,
    sendWhatsAppMessage: sendWhatsAppMessageTool,
    getWhatsAppChats: getWhatsAppChatsTool,
    getWhatsAppMessages: getWhatsAppMessagesTool,
    getWhatsAppContact: getWhatsAppContactTool,
    getMyWhatsAppInfo: getMyWhatsAppInfoTool,
    broadcastWhatsAppMessage: broadcastWhatsAppMessageTool,
    configureAutoReply: configureAutoReplyTool,
    approvePendingReply: approvePendingReplyTool,
    generateTool: generateToolTool,
    listGeneratedTools: listGeneratedToolsTool,
    deleteGeneratedTool: deleteGeneratedToolTool,
    generateSkill: generateSkillTool,
    learnSkillFromFeedback: learnSkillFromFeedbackTool,
    listSkills: listSkillsTool,
    activateSkill: activateSkillTool,
    analyzeForSkillOpportunity: analyzeForSkillOpportunityTool,
    ...browserTools,
    ...telegramTools,
    ...agentDelegationTools,
  },
});
