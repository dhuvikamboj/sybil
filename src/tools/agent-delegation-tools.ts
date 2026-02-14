// agent-delegation-tools.ts - Tools for agents to delegate to other agents
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { mastra } from "../mastra/index.js";

/**
 * Helper function to delegate to an agent
 */
async function delegateToAgent(
  agentName: string,
  task: string,
  context: any,
  timeout: number = 60000
) {
  // Get thread/resource from request context if available
  const threadId = context?.requestContext?.get("threadId") as string | undefined;
  const resourceId = context?.requestContext?.get("resourceId") as string | undefined;
  
  const startTime = Date.now();
  
  try {
    // Map agent names to actual agent IDs
    const agentIdMap: Record<string, string> = {
      planner: "plannerAgent",
      researcher: "researcherAgent", 
      executor: "executorAgent",
      whatsapp: "whatsappAgent",
    };
    
    const targetAgentId = agentIdMap[agentName];
    if (!targetAgentId) {
      return {
        success: false,
        agentName,
        result: "",
        duration: "0ms",
        error: `Unknown agent: ${agentName}. Available: planner, researcher, executor, whatsapp`,
      };
    }
    
    // Get the target agent
    const agent = mastra.getAgent(targetAgentId);
    
    // Execute with timeout
    const result = await Promise.race([
      agent.generate(task, {
        ...(threadId && resourceId ? {
          memory: {
            thread: threadId,
            resource: resourceId,
          },
        } : {}),
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Delegation timeout")), timeout)
      ),
    ]);
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      agentName,
      result: result.text,
      duration: `${duration}ms`,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      agentName,
      result: "",
      duration: `${duration}ms`,
      error: error.message || "Delegation failed",
    };
  }
}

/**
 * Tool: Delegate task to another agent
 * Allows any agent to spawn a sub-agent to handle specific tasks
 */
export const delegateToAgentTool = createTool({
  id: "delegate-to-agent",
  description: "Delegate a task to another specialized agent. Use this when the current agent lacks the specific expertise needed for a sub-task. Available agents: planner (complex planning), researcher (information gathering), executor (code/actions), whatsapp (messaging and communication).",
  inputSchema: z.object({
    agentName: z.enum(["planner", "researcher", "executor", "whatsapp"]).describe("Which agent to delegate to"),
    task: z.string().describe("Clear description of what the agent should do"),
    context: z.string().optional().describe("Additional context or background information"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default: 60000)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    agentName: z.string(),
    result: z.string(),
    duration: z.string(),
    error: z.string().optional(),
  }),
  execute: async (inputData, context) => {
    const { agentName, task, context: additionalContext, timeout = 60000 } = inputData;
    
    // Build the prompt
    let fullPrompt = task;
    if (additionalContext) {
      fullPrompt = `Context: ${additionalContext}\n\nTask: ${task}`;
    }
    
    return delegateToAgent(agentName, fullPrompt, context, timeout);
  },
});

/**
 * Tool: Delegate to Planner Agent
 * Specialized tool for planning tasks
 */
export const delegateToPlannerTool = createTool({
  id: "delegate-to-planner",
  description: "Delegate a planning task to the Planner Agent. Use for: breaking down complex goals, creating execution plans, identifying dependencies, estimating effort. Returns a structured plan with steps and timelines.",
  inputSchema: z.object({
    goal: z.string().describe("The goal or objective to plan"),
    constraints: z.string().optional().describe("Any constraints, limitations, or requirements"),
    complexity: z.enum(["simple", "medium", "complex"]).optional().describe("Expected complexity level"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    plan: z.string(),
    estimatedTime: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData, context) => {
    const { goal, constraints, complexity } = inputData;
    
    const task = `Create a ${complexity || "structured"} plan for: ${goal}${constraints ? `\n\nConstraints: ${constraints}` : ""}`;
    
    const result = await delegateToAgent("planner", task, context, 60000);
    
    return {
      success: result.success,
      plan: result.result,
      estimatedTime: result.success ? result.duration : undefined,
      error: result.error,
    };
  },
});

/**
 * Tool: Delegate to Researcher Agent
 * Specialized tool for research tasks
 */
export const delegateToResearcherTool = createTool({
  id: "delegate-to-researcher",
  description: "Delegate a research task to the Researcher Agent. Use for: gathering information, fact-checking, finding sources, comprehensive research. Returns findings with citations and confidence levels.",
  inputSchema: z.object({
    topic: z.string().describe("Topic or question to research"),
    depth: z.enum(["quick", "standard", "deep"]).optional().describe("Research depth (default: standard)"),
    sources: z.number().optional().describe("Number of sources to check (default: 5)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    findings: z.string(),
    sourcesChecked: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData, context) => {
    const { topic, depth = "standard", sources = 5 } = inputData;
    
    const task = `Research: ${topic}\n\nRequirements:\n- Depth: ${depth}\n- Check ${sources} sources minimum\n- Cite all sources with confidence levels\n- Note any conflicting information`;
    
    const result = await delegateToAgent("researcher", task, context, 60000);
    
    return {
      success: result.success,
      findings: result.result,
      sourcesChecked: result.success ? sources : undefined,
      error: result.error,
    };
  },
});

/**
 * Tool: Delegate to Executor Agent
 * Specialized tool for execution tasks
 */
export const delegateToExecutorTool = createTool({
  id: "delegate-to-executor",
  description: "Delegate an execution task to the Executor Agent. Use for: writing code, running commands, file operations, browser automation, performing actions. Returns execution results and any output files.",
  inputSchema: z.object({
    task: z.string().describe("Specific task to execute (e.g., 'Write a Python script to...', 'Create a file that...')"),
    deliverables: z.array(z.string()).optional().describe("Expected outputs or deliverables"),
    verify: z.boolean().optional().describe("Whether to verify execution success (default: true)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    filesCreated: z.array(z.string()).optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData, context) => {
    const { task, deliverables, verify = true } = inputData;
    
    let fullTask = task;
    if (deliverables && deliverables.length > 0) {
      fullTask += `\n\nDeliverables:\n${deliverables.map(d => `- ${d}`).join("\n")}`;
    }
    if (verify) {
      fullTask += "\n\nVerify all deliverables were created successfully.";
    }
    
    const result = await delegateToAgent("executor", fullTask, context, 60000);
    
    // Extract file paths from result (simple heuristic)
    const filesCreated: string[] = [];
    if (result.success && result.result) {
      const fileMatches = result.result.match(/(?:created|saved|wrote|generated).*?(?:file|to):?\s*['"`]?(\/[^\s'"`,]+)/gi);
      if (fileMatches) {
        fileMatches.forEach((match: string) => {
          const path = match.match(/(\/[^\s'"`,]+)/)?.[1];
          if (path && !filesCreated.includes(path)) {
            filesCreated.push(path);
          }
        });
      }
    }
    
    return {
      success: result.success,
      result: result.result,
      filesCreated: filesCreated.length > 0 ? filesCreated : undefined,
      error: result.error,
    };
  },
});

/**
 * Tool: Delegate to WhatsApp Agent
 * Specialized tool for WhatsApp messaging and communication tasks
 */
export const delegateToWhatsAppTool = createTool({
  id: "delegate-to-whatsapp",
  description: "Delegate a messaging or communication task to the WhatsApp Agent. Use for: sending messages, managing chats, checking message status, handling WhatsApp-specific operations. Returns execution status and message details.",
  inputSchema: z.object({
    task: z.string().describe("Specific WhatsApp task to perform (e.g., 'Send message to...', 'Check status of...', 'List recent chats')"),
    contact: z.string().optional().describe("Contact name or phone number (if applicable)"),
    message: z.string().optional().describe("Message content to send (if applicable)"),
    priority: z.enum(["low", "normal", "high"]).optional().describe("Task priority (default: normal)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.string(),
    messagesSent: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData, context) => {
    const { task, contact, message, priority = "normal" } = inputData;
    
    let fullTask = task;
    if (contact) {
      fullTask += `\n\nContact: ${contact}`;
    }
    if (message) {
      fullTask += `\n\nMessage: ${message}`;
    }
    if (priority !== "normal") {
      fullTask += `\n\nPriority: ${priority}`;
    }
    
    const result = await delegateToAgent("whatsapp", fullTask, context, 60000);
    
    // Extract message count from result (simple heuristic)
    let messagesSent: number | undefined;
    if (result.success && result.result) {
      const sentMatch = result.result.match(/sent\s+(\d+)\s+message/i);
      if (sentMatch) {
        messagesSent = parseInt(sentMatch[1], 10);
      } else if (result.result.toLowerCase().includes("message sent") || result.result.toLowerCase().includes("sent successfully")) {
        messagesSent = 1;
      }
    }
    
    return {
      success: result.success,
      result: result.result,
      messagesSent,
      error: result.error,
    };
  },
});




// Export all delegation tools
export const agentDelegationTools = {
  delegateToAgent: delegateToAgentTool,
  delegateToPlanner: delegateToPlannerTool,
  delegateToResearcher: delegateToResearcherTool,
  delegateToExecutor: delegateToExecutorTool,
  delegateToWhatsApp: delegateToWhatsAppTool,
};

export default agentDelegationTools;
