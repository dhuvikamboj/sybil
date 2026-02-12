import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { whatsappManager } from "../utils/whatsapp-client.js";

/**
 * Tool: Get WhatsApp Connection Status
 * Checks if WhatsApp is connected and ready
 */
export const getWhatsAppStatusTool = createTool({
  id: "get-whatsapp-status",
  description: `
    Check the WhatsApp Web connection status.
    Returns whether WhatsApp is connected, ready, and initialized.
    Use this before performing any WhatsApp operations.
  `,
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    isReady: z.boolean(),
    isInitialized: z.boolean(),
    message: z.string(),
    qrCodeAvailable: z.boolean(),
  }),
  execute: async () => {
    const isReady = whatsappManager.getReadyState();
    const qrCode = whatsappManager.getQRCode();

    if (isReady) {
      return {
        success: true,
        isReady: true,
        isInitialized: true,
        message: "WhatsApp is connected and ready",
        qrCodeAvailable: false,
      };
    } else if (qrCode) {
      return {
        success: true,
        isReady: false,
        isInitialized: true,
        message: "WhatsApp is initializing. QR code available - please scan with your phone",
        qrCodeAvailable: true,
      };
    } else {
      return {
        success: true,
        isReady: false,
        isInitialized: false,
        message: "WhatsApp not initialized. Use initialize-whatsapp tool first",
        qrCodeAvailable: false,
      };
    }
  },
});

/**
 * Tool: Initialize WhatsApp
 * Starts the WhatsApp Web client
 */
export const initializeWhatsAppTool = createTool({
  id: "initialize-whatsapp",
  description: `
    Initialize and start the WhatsApp Web client.
    This will generate a QR code that needs to be scanned with your phone.
    Once scanned, WhatsApp will be connected and ready to use.
    Note: This requires your phone to have an active internet connection.
  `,
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    qrCodeGenerated: z.boolean(),
  }),
  execute: async () => {
    try {
      const isReady = whatsappManager.getReadyState();
      if (isReady) {
        return {
          success: true,
          message: "WhatsApp is already connected and ready",
          qrCodeGenerated: false,
        };
      }

      await whatsappManager.initialize();
      
      return {
        success: true,
        message: "WhatsApp initialization started. Check console for QR code to scan",
        qrCodeGenerated: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to initialize WhatsApp";
      return {
        success: false,
        message: errorMessage,
        qrCodeGenerated: false,
      };
    }
  },
});

/**
 * Tool: Send WhatsApp Message
 * Sends a message to a contact or group
 */
export const sendWhatsAppMessageTool = createTool({
  id: "send-whatsapp-message",
  description: `
    Send a message via WhatsApp to a specific phone number or contact.
    Phone number format: international format without + or spaces (e.g., 1234567890)
    Can send to individuals or groups.
    Maximum message length: 4096 characters.
  `,
  inputSchema: z.object({
    to: z.string().describe("Phone number in international format without + (e.g., 1234567890) or chat ID"),
    message: z.string().max(4096).describe("Message text to send (max 4096 characters)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.string().optional(),
    error: z.string().optional(),
    deliveryStatus: z.string(),
  }),
  execute: async (inputData) => {
    const { to, message } = inputData;

    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        error: "WhatsApp not connected. Please initialize and scan QR code first.",
        deliveryStatus: "failed",
      };
    }

    const result = await whatsappManager.sendMessage(to, message);
    return {
      ...result,
      deliveryStatus: result.success ? "sent" : "failed",
    };
  },
});

/**
 * Tool: Get WhatsApp Chats
 * Retrieves list of all chats
 */
export const getWhatsAppChatsTool = createTool({
  id: "get-whatsapp-chats",
  description: `
    Get a list of all WhatsApp chats (conversations).
    Returns chat IDs, names, and unread message counts.
    Useful for finding contacts to message.
  `,
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    chats: z.array(z.object({
      id: z.string(),
      name: z.string(),
      unreadCount: z.number(),
    })).optional(),
    error: z.string().optional(),
    totalChats: z.number(),
  }),
  execute: async () => {
    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        error: "WhatsApp not connected",
        totalChats: 0,
      };
    }

    const result = await whatsappManager.getChats();
    return {
      ...result,
      totalChats: result.chats?.length || 0,
    };
  },
});

/**
 * Tool: Get WhatsApp Messages
 * Retrieves messages from a specific chat
 */
export const getWhatsAppMessagesTool = createTool({
  id: "get-whatsapp-messages",
  description: `
    Get recent messages from a specific WhatsApp chat.
    Requires the chat ID (use get-whatsapp-chats to find chat IDs).
    Returns message content, sender, timestamp, and whether message was sent by you.
  `,
  inputSchema: z.object({
    chatId: z.string().describe("Chat ID (e.g., 1234567890@c.us or group ID)"),
    limit: z.number().min(1).max(100).optional().describe("Number of messages to retrieve (1-100, default: 50)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messages: z.array(z.object({
      id: z.string(),
      body: z.string(),
      from: z.string(),
      timestamp: z.number(),
      fromMe: z.boolean(),
    })).optional(),
    error: z.string().optional(),
    totalMessages: z.number(),
  }),
  execute: async (inputData) => {
    const { chatId, limit } = inputData;

    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        error: "WhatsApp not connected",
        totalMessages: 0,
      };
    }

    const result = await whatsappManager.getMessages(chatId, limit || 50);
    return {
      ...result,
      totalMessages: result.messages?.length || 0,
    };
  },
});

/**
 * Tool: Get WhatsApp Contact Info
 * Retrieves information about a contact
 */
export const getWhatsAppContactTool = createTool({
  id: "get-whatsapp-contact",
  description: `
    Get information about a WhatsApp contact by phone number.
    Returns the contact's name, number, and whether it's a business account.
  `,
  inputSchema: z.object({
    number: z.string().describe("Phone number in international format without + (e.g., 1234567890)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    contact: z.object({
      number: z.string(),
      name: z.string().optional(),
      isBusiness: z.boolean(),
    }).optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { number } = inputData;

    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        error: "WhatsApp not connected",
      };
    }

    return await whatsappManager.getContact(number);
  },
});

/**
 * Tool: Get My WhatsApp Info
 * Retrieves information about the connected WhatsApp account
 */
export const getMyWhatsAppInfoTool = createTool({
  id: "get-my-whatsapp-info",
  description: `
    Get information about your connected WhatsApp account.
    Returns your phone number and profile name.
  `,
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    info: z.object({
      number: z.string(),
      name: z.string().optional(),
    }).optional(),
    error: z.string().optional(),
  }),
  execute: async () => {
    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        error: "WhatsApp not connected",
      };
    }

    return await whatsappManager.getMe();
  },
});

/**
 * Tool: Broadcast WhatsApp Message
 * Send a message to multiple contacts
 */
export const broadcastWhatsAppMessageTool = createTool({
  id: "broadcast-whatsapp-message",
  description: `
    Send the same message to multiple WhatsApp contacts.
    Takes an array of phone numbers and sends the message to each.
    Use responsibly and avoid spam.
    Maximum 50 recipients at once.
  `,
  inputSchema: z.object({
    recipients: z.array(z.string()).max(50).describe("Array of phone numbers (international format without +)"),
    message: z.string().max(4096).describe("Message to broadcast"),
    delayMs: z.number().optional().describe("Delay between messages in milliseconds (default: 1000)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    totalSent: z.number(),
    totalFailed: z.number(),
    results: z.array(z.object({
      recipient: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    })),
    summary: z.string(),
  }),
  execute: async (inputData) => {
    const { recipients, message, delayMs } = inputData;

    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        totalSent: 0,
        totalFailed: recipients.length,
        results: recipients.map(r => ({
          recipient: r,
          success: false,
          error: "WhatsApp not connected",
        })),
        summary: "WhatsApp not connected. Cannot send messages.",
      };
    }

    const results = [];
    let totalSent = 0;
    let totalFailed = 0;

    for (const recipient of recipients) {
      const result = await whatsappManager.sendMessage(recipient, message);
      results.push({
        recipient,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        totalSent++;
      } else {
        totalFailed++;
      }

      // Delay between messages to avoid rate limiting
      if (delayMs && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return {
      success: totalFailed === 0,
      totalSent,
      totalFailed,
      results,
      summary: `Broadcast complete: ${totalSent} sent, ${totalFailed} failed`,
    };
  },
});
