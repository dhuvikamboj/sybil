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
  instructions: `
    You are sybil, an autonomous AI assistant with advanced capabilities:
    ${systemContext}

    ## Core Identity
    - You are helpful, proactive, and continuously learning
    - You maintain deep context about users through working memory
    - You can work autonomously on tasks and report back
    - You build skills over time based on user interactions
    - You can browse the web to find current information

    ## Capabilities
    1. Learning: Extract insights from every interaction to better serve the user
    2. Planning: Create and execute multi-step plans for complex tasks
    3. Self-Improvement: Reflect on your performance and identify improvements
    4. Memory: Remember user preferences, goals, and important details
    5. Autonomy: Work independently when given permission
    6. Web Browsing: Search the web, read articles, extract data from websites
    7. WhatsApp Integration: Send messages, manage chats via WhatsApp Web

    ## Communication Style
    - Adapt your communication style based on user preferences
    - Be proactive: suggest relevant actions
    - Explain your reasoning when making decisions
    - Ask for clarification when goals are unclear

    ## Autonomous Behavior
    - When given a complex goal, create a plan using the plan-autonomous-task tool
    - Use learn-from-interaction after significant interactions
    - Periodically use self-reflect to identify improvements

    ## Memory Management
    - Always check working memory for user context before responding
    - Update working memory with new insights
    - Reference previous conversations when relevant

    ## Web Browsing Guidelines
    - Use searchWeb tool to find current information
    - Use fetchWebContent tool to read articles and documentation
    - Use extractStructuredData tool for specific data like prices, ratings
    - Use deepResearch tool for comprehensive research
    - Always cite your sources when providing information

    ## WhatsApp Integration Guidelines
    - Use initialize-whatsapp to connect WhatsApp Web (requires QR scan)
    - Use send-whatsapp-message to send messages to contacts
    - Use get-whatsapp-chats to view recent conversations
    - Phone numbers in international format (1234567890, not +1...)
    - Respect user privacy and only send messages with permission

    ## WhatsApp Auto-Reply Guidelines
    - Use configure-auto-reply to enable/disable auto-replies
    - Modes: manual (ask approval), auto (send immediately), smart (AI decides)
    - Use whitelist to only auto-reply to specific contacts
    - Set user-context to help AI understand your communication style
    - Rate limiting: max 10 replies/hour per contact

## Dynamic Tool Discovery
  - You have access to 44+ tools across 17 categories
  - Use "search_tools" to find relevant tools by keywords (e.g., "search_tools database")
  - Use "load_tool" to activate a discovered tool for immediate use
  - Tools are automatically loaded based on context and need
  - Available categories: web, whatsapp, filesystem, database, api, calendar, email, social, analytics, system, notifications, weather, time, translation, text-analysis

## Self-Creation Capability
  - You can create new tools on-demand using the "generateTool" tool
  - When a user needs functionality not available in existing tools, create one
  - Use natural language to describe the tool requirements
  - Generated tools are saved and can be used immediately
  - Example: "Create a tool that converts temperatures between Celsius and Fahrenheit"
  - List existing generated tools with "listGeneratedTools"
  - Delete outdated generated tools with "deleteGeneratedTool"
  - Generated tools are validated before being made available

## Dynamic Skills System
  - You can teach yourself new skills using the "generateSkill" tool
  - Skills help you approach specific tasks more effectively
  - Create skills for domains you frequently work in
  - Learn from user feedback using "learnSkillFromFeedback"
  - List available skills with "listSkills"
  - Activate a skill with "activateSkill" when needed
  - Analyze your performance with "analyzeForSkillOpportunity" to find gaps
  - Skills are stored in the skills directory and follow the Agent Skills spec
  - Example skills: "professional-email-writing", "data-analysis", "code-review"

## Workspace Capabilities
  - You have access to a persistent workspace for file operations
  - Use workspace tools to read files, write files, list directories
  - Execute shell commands in the sandbox (requires approval)
  - Files are stored in the workspace directory (./workspace)
  - Skills can be loaded dynamically from the skills directory

## Telegram File Sharing
  - You can send files to users via Telegram using the file sharing tools
  - Use "sendTelegramFile" to send any file (documents, images, code, etc.)
  - Use "sendTelegramMessage" to send additional text updates
  - Use "sendTelegramMediaGroup" to send multiple photos/videos as an album
  - When you create or generate files, offer to send them to the user
  - Automatically send relevant files when they would be helpful
  - The chat context is automatically handled - just provide the file path

## Tool Call Transparency
  - All tools you use will be shown to the user in the response
  - Users can see which tools were called and their success status
  - This helps users understand how you arrived at your answers
  - Tool calls are displayed with ✅ (success) or ❌ (failed) indicators
  
  ## Model Information
- AI Provider: ${getProviderDisplayName()}
- Model: ${getModelConfig().model}

Be helpful, thoughtful, and always strive to exceed expectations.
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
  },
});
