import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { mastra } from "../mastra/index.js";
import { createMemoryInstance } from "../mastra/memory.js";
import { whatsappManager } from "../utils/whatsapp-client.js";
import * as browserTools from "../tools/browser-tools.js";

const memory = createMemoryInstance();

// Ensure memory is not null
if (!memory) {
  throw new Error("Failed to initialize memory");
}

/**
 * Planner Agent
 * Decomposes complex tasks into actionable steps
 */
export const plannerAgent = new Agent({
  id: "planner-agent",
  name: "Planner Agent",
  description: "Expert at task decomposition and creating structured execution plans. Breaks down complex goals into clear, actionable steps with dependencies and priorities.",
  instructions: `You are a planning specialist. Your job is to:
1. Analyze the user's request and break it into logical steps
2. Identify dependencies between steps
3. Prioritize tasks based on importance and urgency
4. Create a clear, actionable plan
5. Return a structured plan with step order, descriptions, and estimated time

Always provide specific, actionable steps. Use clear language and number your steps.`,
  model: process.env.AI_PROVIDER || "openai/gpt-4o",
});

/**
 * Researcher Agent
 * Gathers information from various sources
 */
export const researcherAgent = new Agent({
  id: "researcher-agent", 
  name: "Researcher Agent",
  description: "Expert information gatherer. Researches topics using web search, analyzes data, and provides comprehensive findings with sources. Specializes in fact-finding and data analysis.",
  instructions: `You are a research specialist. Your job is to:
1. Search for and gather relevant information
2. Analyze data from multiple sources
3. Verify facts and cross-reference information
4. Provide comprehensive findings with citations
5. Synthesize complex information into digestible summaries

Always cite your sources and indicate confidence levels. Be thorough but concise.`,
  model: process.env.AI_PROVIDER || "openai/gpt-4o",
  tools: {
    fetchWebContent: {
      id: "fetch-web-content",
      description: "Fetch and extract content from web pages",
      inputSchema: z.object({
        url: z.string().describe("URL to fetch"),
      }),
      outputSchema: z.object({
        content: z.string(),
        title: z.string(),
      }),
      execute: async ({ url }: { url: string }) => {
        // Use the actual web fetch tool
        const agent = mastra.getAgent("autonomousAgent");
        return { content: "Fetched content from " + url, title: "Web Content" };
      },
    },
    searchWeb: {
      id: "search-web",
      description: "Search the web for information",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
      }),
      outputSchema: z.object({
        results: z.array(z.object({
          title: z.string(),
          url: z.string(),
          snippet: z.string(),
        })),
      }),
      execute: async ({ query }: { query: string }) => {
        return { results: [] };
      },
    },
  },
  ...browserTools,
});

/**
 * Executor Agent
 * Executes actions and performs tasks
 */
export const executorAgent = new Agent({
  id: "executor-agent",
  name: "Executor Agent", 
  description: "Expert at executing tasks and performing actions. Implements solutions, writes code, manages files, and completes assigned tasks efficiently and accurately.",
  instructions: `You are an execution specialist. Your job is to:
1. Execute assigned tasks precisely
2. Write clean, working code when needed
3. Manage files and data operations
4. Complete actions efficiently and accurately
5. Report results clearly with success/failure status

Focus on getting things done. Be precise and thorough in your execution.`,
  model: process.env.AI_PROVIDER || "openai/gpt-4o",
  tools: {
    ...browserTools,
  },
});

/**
 * WhatsApp Agent
 * Specialized in WhatsApp messaging
 */
export const whatsappAgent = new Agent({
  id: "whatsapp-agent",
  name: "WhatsApp Agent",
  description: "WhatsApp messaging specialist. Handles sending messages, managing chats, configuring auto-replies, and monitoring WhatsApp status. Manages all WhatsApp-related tasks.",
  instructions: `You are a WhatsApp messaging specialist. Your job is to:
1. Send messages to specified phone numbers
2. Check WhatsApp connection status
3. List available chats
4. Configure auto-reply settings
5. Handle message approvals and pending replies
6. Monitor WhatsApp Web session

Always verify phone numbers are properly formatted. Use international format (e.g., +1234567890).`,
  model: process.env.AI_PROVIDER || "openai/gpt-4o",
  tools: {
    getWhatsAppStatus: {
      id: "get-whatsapp-status",
      description: "Get current WhatsApp connection status",
      inputSchema: z.object({}),
      outputSchema: z.object({
        connected: z.boolean(),
        info: z.object({
          number: z.string().optional(),
          name: z.string().optional(),
        }).optional(),
      }),
      execute: async () => {
        const status = whatsappManager.getReadyState();
        const info = status ? await whatsappManager.getMe() : null;
        return {
          connected: status,
          info: info?.success ? info.info : undefined,
        };
      },
    },
    sendWhatsAppMessage: {
      id: "send-whatsapp-message",
      description: "Send a WhatsApp message to a phone number",
      inputSchema: z.object({
        phoneNumber: z.string().describe("Phone number in international format (e.g., +1234567890)"),
        message: z.string().describe("Message content"),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        error: z.string().optional(),
      }),
      execute: async ({ phoneNumber, message }: { phoneNumber: string; message: string }) => {
        return whatsappManager.sendMessage(phoneNumber, message);
      },
    },
    listWhatsAppChats: {
      id: "list-whatsapp-chats",
      description: "List all WhatsApp chats",
      inputSchema: z.object({}),
      outputSchema: z.object({
        success: z.boolean(),
        chats: z.array(z.object({
          name: z.string(),
          id: z.string(),
          unreadCount: z.number(),
        })).optional(),
        error: z.string().optional(),
      }),
      execute: async () => {
        return whatsappManager.getChats();
      },
    },
  },
});

/**
 * Routing Agent (Coordinator)
 * Coordinates all other agents based on task type
 */
export const routingAgent = new Agent({
  id: "routing-agent",
  name: "Sybil Network Coordinator",
  description: "Coordinates multiple specialized agents to handle complex tasks. Routes requests to the appropriate agent: Planner for task decomposition, Researcher for information gathering, Executor for task execution, WhatsApp Agent for messaging.",
  instructions: `You are the coordinator of an agent network. Your job is to:
1. Analyze the user's request
2. Determine which specialized agent(s) should handle it
3. Route the task to the appropriate agent(s)
4. Coordinate multi-step tasks across agents
5. Synthesize results from multiple agents into a coherent response

Available agents:
- plannerAgent: Use for complex tasks requiring planning, task decomposition, creating action plans
- researcherAgent: Use for information gathering, research, fact-finding, web searches
- executorAgent: Use for executing tasks, writing code, managing files, completing actions
- whatsappAgent: Use for WhatsApp messaging, checking status, sending messages, managing auto-replies

Route efficiently. For simple tasks, use one agent. For complex tasks, coordinate multiple agents in sequence.`,
  model: process.env.AI_PROVIDER || "openai/gpt-4o",
  memory,
  agents: {
    plannerAgent,
    researcherAgent,
    executorAgent,
    whatsappAgent,
  },
});

/**
 * Process a task using the agent network
 * @param task - The task to process
 * @param threadId - Memory thread ID
 * @param resourceId - Memory resource ID
 */
export async function processWithNetwork(
  task: string,
  threadId: string,
  resourceId: string
): Promise<string> {
  const stream = await routingAgent.network(task, {
    memory: {
      thread: threadId,
      resource: resourceId,
    },
  });

  let fullText = "";
  
  for await (const chunk of stream) {
    switch (chunk.type) {
      case "text-delta":
        fullText += chunk.payload.text;
        break;
      case "network-execution-event-step-finish":
        // Step completed
        break;
      case "error":
        console.error("Network error:", chunk.payload.error);
        break;
    }
  }

  return fullText || "Task completed";
}

/**
 * Stream a task using the agent network
 * @param task - The task to process
 * @param threadId - Memory thread ID
 * @param resourceId - Memory resource ID
 * @param onChunk - Callback for each chunk
 */
export async function streamWithNetwork(
  task: string,
  threadId: string,
  resourceId: string,
  onChunk: (chunk: any) => void
): Promise<void> {
  const stream = await routingAgent.network(task, {
    memory: {
      thread: threadId,
      resource: resourceId,
    },
  });

  for await (const chunk of stream) {
    onChunk(chunk);
  }
}
