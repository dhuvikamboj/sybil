import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { whatsappManager } from "../utils/whatsapp-client.js";
import { mastra } from "../mastra/index.js";

/**
 * Interface for queued messages
 */
interface QueuedMessage {
  id: string;
  body: string;
  timestamp: number;
  from: string;
  senderName: string;
}

/**
 * Interface for message queue per contact
 */
interface MessageQueue {
  messages: QueuedMessage[];
  timeoutId: NodeJS.Timeout | null;
  lastActivity: number;
  isProcessing: boolean;
}

/**
 * Storage for auto-reply configuration
 */
interface AutoReplyConfig {
  enabled: boolean;
  mode: "manual" | "auto" | "smart";
  whitelist: string[];
  blacklist: string[];
  maxRepliesPerHour: number;
  replyDelayMs: number;
  debounceMs: number; // Time to wait for inactivity (default: 2 minutes = 120000ms)
  userContext: string;
  customInstructions: string;
  lastReplies: Map<string, number>;
}

const defaultConfig: AutoReplyConfig = {
  enabled: false,
  mode: "manual",
  whitelist: [],
  blacklist: [],
  maxRepliesPerHour: 10,
  replyDelayMs: 3000,
  debounceMs: 120000, // 2 minutes
  userContext: "",
  customInstructions: "",
  lastReplies: new Map(),
};

// In-memory config storage
let autoReplyConfig: AutoReplyConfig = { ...defaultConfig };

// Message queues per contact (phone number -> queue)
const messageQueues = new Map<string, MessageQueue>();

/**
 * Add a message to the queue for debouncing
 */
export function queueMessage(
  from: string,
  message: QueuedMessage,
  onDebounceComplete: (phoneNumber: string, messages: QueuedMessage[]) => void
): void {
  const phoneNumber = from.replace(/\D/g, "").replace(/@c\.us$/, "");
  
  // Get or create queue for this contact
  let queue = messageQueues.get(phoneNumber);
  if (!queue) {
    queue = {
      messages: [],
      timeoutId: null,
      lastActivity: Date.now(),
      isProcessing: false,
    };
    messageQueues.set(phoneNumber, queue);
  }

  // Add message to queue
  queue.messages.push(message);
  queue.lastActivity = Date.now();

  console.log(`[WhatsApp Debouncer] Queued message from ${message.senderName}. Total: ${queue.messages.length} messages`);

  // Clear existing timeout
  if (queue.timeoutId) {
    clearTimeout(queue.timeoutId);
    queue.timeoutId = null;
  }

  // Set new timeout for debouncing
  queue.timeoutId = setTimeout(() => {
    console.log(`[WhatsApp Debouncer] Debounce complete for ${message.senderName}. Processing ${queue!.messages.length} messages...`);
    
    // Only process if not already processing and auto-reply is enabled
    if (!queue!.isProcessing && autoReplyConfig.enabled) {
      queue!.isProcessing = true;
      onDebounceComplete(phoneNumber, [...queue!.messages]);
      
      // Clear the queue after processing
      queue!.messages = [];
      queue!.isProcessing = false;
    }
    
    queue!.timeoutId = null;
  }, autoReplyConfig.debounceMs);
}

/**
 * Cancel pending messages for a contact
 */
export function cancelPendingMessages(phoneNumber: string): void {
  const queue = messageQueues.get(phoneNumber);
  if (queue && queue.timeoutId) {
    clearTimeout(queue.timeoutId);
    queue.timeoutId = null;
    queue.messages = [];
    console.log(`[WhatsApp Debouncer] Cancelled pending messages for ${phoneNumber}`);
  }
}

/**
 * Get pending messages for a contact
 */
export function getPendingMessages(phoneNumber: string): QueuedMessage[] {
  const queue = messageQueues.get(phoneNumber);
  return queue ? [...queue.messages] : [];
}

/**
 * Check if we should auto-reply to a contact
 */
export function shouldAutoReply(from: string): { shouldReply: boolean; reason?: string } {
  if (!autoReplyConfig.enabled) {
    return { shouldReply: false, reason: "Auto-reply is disabled" };
  }

  const phoneNumber = from.replace(/\D/g, "").replace(/@c\.us$/, "");

  // Check blacklist
  if (autoReplyConfig.blacklist.includes(phoneNumber)) {
    return { shouldReply: false, reason: "Number is blacklisted" };
  }

  // Check whitelist (if whitelist is not empty, only reply to whitelisted numbers)
  if (autoReplyConfig.whitelist.length > 0 && !autoReplyConfig.whitelist.includes(phoneNumber)) {
    return { shouldReply: false, reason: "Number not in whitelist" };
  }

  // Check rate limit
  const lastReply = autoReplyConfig.lastReplies.get(phoneNumber);
  if (lastReply) {
    const hoursSinceLastReply = (Date.now() - lastReply) / (1000 * 60 * 60);
    if (hoursSinceLastReply < 1) {
      const repliesThisHour = Array.from(autoReplyConfig.lastReplies.entries())
        .filter(([num, time]) => num === phoneNumber && (Date.now() - time) < 3600000)
        .length;
      
      if (repliesThisHour >= autoReplyConfig.maxRepliesPerHour) {
        return { shouldReply: false, reason: "Rate limit exceeded" };
      }
    }
  }

  return { shouldReply: true };
}

/**
 * Generate a smart reply using the agent based on batched messages
 */
export async function generateSmartReplyForBatchedMessages(
  chatId: string,
  messages: QueuedMessage[],
  chatHistory: Array<{ body: string; fromMe: boolean }>
): Promise<{ reply: string; confidence: number; shouldSend: boolean; summary: string }> {
  try {
    const agent = mastra.getAgent("autonomousAgent");

    // Combine all batched messages into a single context
    const batchedMessagesText = messages.map((msg, index) => 
      `[${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.senderName}: ${msg.body}`
    ).join("\n");

    // Get the latest sender name
    const senderName = messages[messages.length - 1]?.senderName || "Unknown";

    // Build context from chat history
    const recentHistory = chatHistory.slice(-10);
    const conversationContext = recentHistory
      .map((msg) => `${msg.fromMe ? "Me" : senderName}: ${msg.body}`)
      .join("\n");

    const prompt = `Generate a reply to these WhatsApp messages on my behalf. The sender may have sent multiple messages in sequence.

My Context:
${autoReplyConfig.userContext || "I'm a busy professional who values concise communication."}

Custom Instructions:
${autoReplyConfig.customInstructions || "Reply naturally and helpfully. Keep it brief unless detailed explanation is needed."}

Previous Conversation History:
${conversationContext}

Incoming Messages from ${senderName} (${messages.length} message${messages.length > 1 ? 's' : ''}):
${batchedMessagesText}

Generate a single comprehensive reply that addresses all the messages appropriately. The reply should:
1. Sound like me (based on my communication style)
2. Address all the key points from the messages
3. Be concise but helpful
4. Match the tone of the conversation

Provide your response in this format:
SUMMARY: [brief summary of what the sender is asking/saying]
REPLY: [your suggested reply]
CONFIDENCE: [0-100, how confident you are this is appropriate]
SHOULD_SEND: [yes/no, whether this should be sent without human review]`;

    const response = await agent.generate(prompt);
    
    // Parse the response
    const summaryMatch = response.text.match(/SUMMARY:\s*(.+?)(?=\nREPLY:|$)/s);
    const replyMatch = response.text.match(/REPLY:\s*(.+?)(?=\nCONFIDENCE:|$)/s);
    const confidenceMatch = response.text.match(/CONFIDENCE:\s*(\d+)/);
    const shouldSendMatch = response.text.match(/SHOULD_SEND:\s*(yes|no)/i);

    const summary = summaryMatch ? summaryMatch[1].trim() : "New message received";
    const reply = replyMatch ? replyMatch[1].trim() : "Thanks for your message! I'll get back to you soon.";
    const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 50;
    const shouldSend = shouldSendMatch ? shouldSendMatch[1].toLowerCase() === "yes" : false;

    return { reply, confidence, shouldSend, summary };
  } catch (error) {
    console.error("Error generating smart reply for batched messages:", error);
    return {
      reply: "Thanks for your message! I'll get back to you soon.",
      confidence: 0,
      shouldSend: false,
      summary: "Error processing messages",
    };
  }
}

/**
 * Record that we replied to someone
 */
export function recordReply(phoneNumber: string): void {
  autoReplyConfig.lastReplies.set(phoneNumber.replace(/\D/g, "").replace(/@c\.us$/, ""), Date.now());
}

/**
 * Tool: Configure Auto-Reply Settings
 */
export const configureAutoReplyTool = createTool({
  id: "configure-auto-reply",
  description: `
    Configure WhatsApp auto-reply settings.
    Use this to enable/disable auto-replies, set mode (manual/auto/smart),
    manage whitelist/blacklist, set custom instructions, and configure debounce time.
    Messages are batched and only processed after 2 minutes of inactivity from the sender.
  `,
  inputSchema: z.object({
    action: z.enum(["enable", "disable", "set-mode", "set-debounce", "add-to-whitelist", "remove-from-whitelist", "add-to-blacklist", "remove-from-blacklist", "set-context", "set-instructions", "get-status", "clear-queue"]),
    value: z.string().optional().describe("Value for the action (e.g., phone number, mode, instructions, debounce time in minutes)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    currentConfig: z.object({
      enabled: z.boolean(),
      mode: z.string(),
      debounceMinutes: z.number(),
      whitelistCount: z.number(),
      blacklistCount: z.number(),
      maxRepliesPerHour: z.number(),
      pendingQueues: z.number(),
    }),
  }),
  execute: async (inputData) => {
    const { action, value } = inputData;

    switch (action) {
      case "enable":
        autoReplyConfig.enabled = true;
        return {
          success: true,
          message: "✅ Auto-reply enabled. Messages will be batched and processed after 2 minutes of inactivity.",
          currentConfig: getConfigSummary(),
        };

      case "disable":
        autoReplyConfig.enabled = false;
        return {
          success: true,
          message: "✅ Auto-reply disabled",
          currentConfig: getConfigSummary(),
        };

      case "set-mode":
        if (value && ["manual", "auto", "smart"].includes(value)) {
          autoReplyConfig.mode = value as "manual" | "auto" | "smart";
          return {
            success: true,
            message: `✅ Auto-reply mode set to: ${value}`,
            currentConfig: getConfigSummary(),
          };
        }
        return {
          success: false,
          message: "❌ Invalid mode. Use: manual, auto, or smart",
          currentConfig: getConfigSummary(),
        };

      case "set-debounce":
        if (value) {
          const minutes = parseInt(value);
          if (!isNaN(minutes) && minutes >= 1 && minutes <= 30) {
            autoReplyConfig.debounceMs = minutes * 60 * 1000;
            return {
              success: true,
              message: `✅ Debounce time set to ${minutes} minutes. Messages will be processed after ${minutes} minutes of inactivity.`,
              currentConfig: getConfigSummary(),
            };
          }
        }
        return {
          success: false,
          message: "❌ Invalid debounce time. Please provide a number between 1 and 30 minutes.",
          currentConfig: getConfigSummary(),
        };

      case "add-to-whitelist":
        if (value) {
          const cleanNumber = value.replace(/\D/g, "");
          if (!autoReplyConfig.whitelist.includes(cleanNumber)) {
            autoReplyConfig.whitelist.push(cleanNumber);
          }
          return {
            success: true,
            message: `✅ Added ${cleanNumber} to whitelist`,
            currentConfig: getConfigSummary(),
          };
        }
        return {
          success: false,
          message: "❌ Please provide a phone number",
          currentConfig: getConfigSummary(),
        };

      case "remove-from-whitelist":
        if (value) {
          const cleanNumber = value.replace(/\D/g, "");
          autoReplyConfig.whitelist = autoReplyConfig.whitelist.filter(n => n !== cleanNumber);
          return {
            success: true,
            message: `✅ Removed ${cleanNumber} from whitelist`,
            currentConfig: getConfigSummary(),
          };
        }
        return {
          success: false,
          message: "❌ Please provide a phone number",
          currentConfig: getConfigSummary(),
        };

      case "add-to-blacklist":
        if (value) {
          const cleanNumber = value.replace(/\D/g, "");
          if (!autoReplyConfig.blacklist.includes(cleanNumber)) {
            autoReplyConfig.blacklist.push(cleanNumber);
          }
          return {
            success: true,
            message: `✅ Added ${cleanNumber} to blacklist`,
            currentConfig: getConfigSummary(),
          };
        }
        return {
          success: false,
          message: "❌ Please provide a phone number",
          currentConfig: getConfigSummary(),
        };

      case "remove-from-blacklist":
        if (value) {
          const cleanNumber = value.replace(/\D/g, "");
          autoReplyConfig.blacklist = autoReplyConfig.blacklist.filter(n => n !== cleanNumber);
          return {
            success: true,
            message: `✅ Removed ${cleanNumber} from blacklist`,
            currentConfig: getConfigSummary(),
          };
        }
        return {
          success: false,
          message: "❌ Please provide a phone number",
          currentConfig: getConfigSummary(),
        };

      case "set-context":
        if (value) {
          autoReplyConfig.userContext = value;
          return {
            success: true,
            message: "✅ User context updated",
            currentConfig: getConfigSummary(),
          };
        }
        return {
          success: false,
          message: "❌ Please provide context text",
          currentConfig: getConfigSummary(),
        };

      case "set-instructions":
        if (value) {
          autoReplyConfig.customInstructions = value;
          return {
            success: true,
            message: "✅ Custom instructions updated",
            currentConfig: getConfigSummary(),
          };
        }
        return {
          success: false,
          message: "❌ Please provide instructions",
          currentConfig: getConfigSummary(),
        };

      case "get-status":
        return {
          success: true,
          message: `📊 Auto-reply is ${autoReplyConfig.enabled ? 'enabled' : 'disabled'}\n` +
            `⏱️ Debounce time: ${autoReplyConfig.debounceMs / 60000} minutes\n` +
            `📝 Messages are batched and processed after the sender stops typing for ${autoReplyConfig.debounceMs / 60000} minutes.`,
          currentConfig: getConfigSummary(),
        };

      case "clear-queue":
        if (value) {
          const cleanNumber = value.replace(/\D/g, "");
          cancelPendingMessages(cleanNumber);
          return {
            success: true,
            message: `✅ Cleared pending message queue for ${cleanNumber}`,
            currentConfig: getConfigSummary(),
          };
        }
        // Clear all queues
        messageQueues.clear();
        return {
          success: true,
          message: "✅ Cleared all pending message queues",
          currentConfig: getConfigSummary(),
        };

      default:
        return {
          success: false,
          message: "❌ Unknown action",
          currentConfig: getConfigSummary(),
        };
    }
  },
});

/**
 * Tool: Approve and Send Pending Reply
 */
export const approvePendingReplyTool = createTool({
  id: "approve-pending-reply",
  description: `
    Approve a pending auto-reply message and send it.
    Use this in manual mode when you want to send a suggested reply.
  `,
  inputSchema: z.object({
    phoneNumber: z.string().describe("Phone number to send reply to"),
    reply: z.string().describe("The reply message to send"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    messageId: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { phoneNumber, reply } = inputData;

    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        message: "WhatsApp not connected",
      };
    }

    const result = await whatsappManager.sendMessage(phoneNumber, reply);
    
    if (result.success) {
      recordReply(phoneNumber);
    }

    return {
      success: result.success,
      message: result.success ? "✅ Reply sent successfully" : `❌ Failed: ${result.error}`,
      messageId: result.messageId,
    };
  },
});

/**
 * Get a summary of current config
 */
function getConfigSummary() {
  return {
    enabled: autoReplyConfig.enabled,
    mode: autoReplyConfig.mode,
    debounceMinutes: autoReplyConfig.debounceMs / 60000,
    whitelistCount: autoReplyConfig.whitelist.length,
    blacklistCount: autoReplyConfig.blacklist.length,
    maxRepliesPerHour: autoReplyConfig.maxRepliesPerHour,
    pendingQueues: messageQueues.size,
  };
}

/**
 * Get full config (for internal use)
 */
export function getAutoReplyConfig(): AutoReplyConfig {
  return autoReplyConfig;
}

/**
 * Reset config to defaults
 */
export function resetAutoReplyConfig(): void {
  autoReplyConfig = { ...defaultConfig };
  messageQueues.clear();
}
