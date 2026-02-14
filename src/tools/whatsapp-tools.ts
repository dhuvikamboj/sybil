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
    Send a message via WhatsApp. Accepts multiple formats for recipient:
    - Phone number: international format (e.g., "1234567890", "911234567890")
    - Chat ID: WhatsApp format (e.g., "1234567890@c.us")
    - Group ID: Group format (e.g., "123456789@g.us")
    - List/Channel ID: Format (e.g., "187743636676218910@lid")
    
    The tool automatically detects and formats the recipient appropriately.
    Maximum message length: 4096 characters.
  `,
  inputSchema: z.object({
    to: z.string().describe("Recipient: phone number (e.g., '1234567890'), chat ID ('1234567890@c.us'), group ID ('123456789@g.us'), or list/channel ID ('187743636676218910@lid')"),
    message: z.string().max(4096).describe("Message text to send (max 4096 characters)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.string().optional(),
    error: z.string().optional(),
    deliveryStatus: z.string(),
    formattedRecipient: z.string().optional(),
  }),
  execute: async (inputData) => {
    let { to, message } = inputData;

    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        error: "WhatsApp not connected. Please initialize and scan QR code first.",
        deliveryStatus: "failed",
      };
    }

    // Auto-format recipient if needed
    // If it's just digits (phone number), append @c.us
    // If it already has @ symbol (@c.us, @g.us, @lid, etc.), use as-is
    let formattedTo = to;
    if (!/[@]/.test(to)) {
      // Remove any spaces, dashes, or + signs
      const cleanNumber = to.replace(/[\s\-+]/g, '');
      // Add @c.us suffix for individual chats
      formattedTo = `${cleanNumber}@c.us`;
    }

    const result = await whatsappManager.sendMessage(formattedTo, message);
    return {
      ...result,
      deliveryStatus: result.success ? "sent" : "failed",
      formattedRecipient: formattedTo,
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
 * Tool: Get All WhatsApp Contacts
 * Retrieves all contacts from WhatsApp
 */
export const getAllWhatsAppContactsTool = createTool({
  id: "get-all-whatsapp-contacts",
  description: `
    Get all WhatsApp contacts from your connected account.
    Returns a list of all contacts with their IDs, names, numbers, and business status.
    Useful for finding contacts to message or getting an overview of all connections.
  `,
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    contacts: z.array(z.object({
      id: z.string(),
      number: z.string(),
      name: z.string().optional(),
      isBusiness: z.boolean(),
      isMyContact: z.boolean(),
    })).optional(),
    totalContacts: z.number(),
    error: z.string().optional(),
  }),
  execute: async () => {
    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        totalContacts: 0,
        error: "WhatsApp not connected",
      };
    }

    return await whatsappManager.getAllContacts();
  },
});

/**
 * Tool: Get WhatsApp Contact by LID
 * Retrieves information about a WhatsApp contact using their LID (Local Identifier)
 * LID is a privacy-focused identifier that masks phone numbers in groups/communities
 */
export const getWhatsAppContactByLidTool = createTool({
  id: "get-whatsapp-contact-by-lid",
  description: `
    Get information about a WhatsApp contact using their LID (Local Identifier).
    LID (Local Identifier) is a privacy-focused alphanumeric identifier (ending in @lid) 
    that masks users' real phone numbers in group chats, communities, or with unlisted contacts.
    
    Input: LID in format "xxxxxxxxxx@lid" (e.g., "187743636676218910@lid")
    Returns: Contact's LID, phone number (if available), name, and business status.
  `,
  inputSchema: z.object({
    lid: z.string().describe("LID (Local Identifier) in format xxxxxxxxxx@lid (e.g., 187743636676218910@lid)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    contact: z.object({
      lid: z.string(),
      number: z.string(),
      name: z.string().optional(),
      isBusiness: z.boolean(),
    }).optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { lid } = inputData;

    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        error: "WhatsApp not connected",
      };
    }

    return await whatsappManager.getContactByLid(lid);
  },
});

/**
 * Tool: Map WhatsApp LID to Phone Number
 * Converts a LID (Local Identifier) to the corresponding phone number
 * Useful for identifying users who have privacy settings enabled
 */
export const mapWhatsAppLidToPhoneTool = createTool({
  id: "map-whatsapp-lid-to-phone",
  description: `
    Map a WhatsApp LID (Local Identifier) to the corresponding phone number.
    LID is a privacy-focused identifier that masks phone numbers in groups/communities.
    
    This tool helps identify users who have number privacy enabled.
    Input: LID in format "xxxxxxxxxx@lid"
    Output: Phone number in format "1234567890@c.us"
  `,
  inputSchema: z.object({
    lid: z.string().describe("LID (Local Identifier) in format xxxxxxxxxx@lid (e.g., 187743636676218910@lid)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    lid: z.string().optional(),
    phoneNumber: z.string().optional(),
    formattedPhoneNumber: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { lid } = inputData;

    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        error: "WhatsApp not connected",
      };
    }

    const result = await whatsappManager.getContactLidAndPhone(lid);
    
    if (result.success) {
      return {
        success: true,
        lid: result.lid,
        phoneNumber: result.phoneNumber,
        formattedPhoneNumber: result.phoneNumber ? `${result.phoneNumber}@c.us` : undefined,
      };
    }
    
    return {
      success: false,
      error: result.error,
    };
  },
});

/**
 * Tool: Map WhatsApp Phone Number to LID
 * Converts a phone number to the corresponding LID (Local Identifier) if available
 * Note: LID is only available for contacts who have used LID or have number privacy enabled
 */
export const mapWhatsAppPhoneToLidTool = createTool({
  id: "map-whatsapp-phone-to-lid",
  description: `
    Map a phone number to its LID (Local Identifier) if available.
    LID is a privacy-focused identifier that masks phone numbers.
    
    Note: LID may not be available for all contacts - only those who have 
    used LID or have number privacy enabled in groups/communities.
    Input: Phone number (e.g., "1234567890" or "1234567890@c.us")
    Output: LID if available (format: xxxxxxxxxx@lid)
  `,
  inputSchema: z.object({
    phoneNumber: z.string().describe("Phone number in format 1234567890 or 1234567890@c.us"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    phoneNumber: z.string().optional(),
    lid: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { phoneNumber } = inputData;

    if (!whatsappManager.getReadyState()) {
      return {
        success: false,
        error: "WhatsApp not connected",
      };
    }

    // Format the phone number to get the contact ID
    let contactId: string;
    if (phoneNumber.includes("@")) {
      contactId = phoneNumber;
    } else {
      const cleanNumber = phoneNumber.replace(/\D/g, "");
      contactId = `${cleanNumber}@c.us`;
    }

    const result = await whatsappManager.getContactLidAndPhone(contactId);
    
    if (result.success) {
      return {
        success: true,
        phoneNumber: result.phoneNumber,
        lid: result.lid,
      };
    }
    
    return {
      success: false,
      error: result.error,
    };
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
    Accepts phone numbers in multiple formats:
    - Phone number: international format (e.g., "1234567890")
    - Chat ID: WhatsApp format (e.g., "1234567890@c.us")
    - Group ID: Group format (e.g., "123456789@g.us")
    - List/Channel ID: Format (e.g., "187743636676218910@lid")
    
    Automatically formats recipients as needed.
    Use responsibly and avoid spam.
    Maximum 50 recipients at once.
  `,
  inputSchema: z.object({
    recipients: z.array(z.string()).max(50).describe("Array of phone numbers or chat IDs"),
    message: z.string().max(4096).describe("Message to broadcast"),
    delayMs: z.number().optional().describe("Delay between messages in milliseconds (default: 1000)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    totalSent: z.number(),
    totalFailed: z.number(),
    results: z.array(z.object({
      recipient: z.string(),
      formattedRecipient: z.string(),
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
          formattedRecipient: r,
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
      // Auto-format recipient if needed
      // Only add @c.us if no @ symbol present
      let formattedRecipient = recipient;
      if (!/[@]/.test(recipient)) {
        const cleanNumber = recipient.replace(/[\s\-+]/g, '');
        formattedRecipient = `${cleanNumber}@c.us`;
      }

      const result = await whatsappManager.sendMessage(formattedRecipient, message);
      results.push({
        recipient,
        formattedRecipient,
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
