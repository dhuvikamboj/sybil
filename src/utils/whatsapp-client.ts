import { EventEmitter } from "events";
import { shouldAutoReply, generateSmartReplyForBatchedMessages, recordReply, getAutoReplyConfig, queueMessage } from "../tools/whatsapp-autoreply-tools.js";
import { logger } from "./logger.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use absolute paths for persistence
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const SYBIL_DIR = path.join(process.env.HOME || process.env.USERPROFILE || PROJECT_ROOT, ".sybil");
const WHATSAPP_SESSION_DIR = path.join(SYBIL_DIR, "whatsapp-session");
const SETTINGS_FILE = path.join(SYBIL_DIR, "settings.json");

// Ensure directories exist
function ensureDirectories(): void {
  try {
    if (!fs.existsSync(SYBIL_DIR)) {
      fs.mkdirSync(SYBIL_DIR, { recursive: true });
      logger.info("WHATSAPP", `Created Sybil data directory: ${SYBIL_DIR}`);
    }
    if (!fs.existsSync(WHATSAPP_SESSION_DIR)) {
      fs.mkdirSync(WHATSAPP_SESSION_DIR, { recursive: true });
    }
  } catch (error) {
    logger.error("WHATSAPP", `Failed to create directories: ${error}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WhatsAppClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WhatsAppMessage = any;

let WhatsApp: {
  Client: any;
  LocalAuth: any;
} | null = null;
let qrcodeTerminal: any = null;

/**
 * Dynamically import whatsapp-web.js
 */
async function importWhatsAppModules(): Promise<void> {
  if (!WhatsApp) {
    const whatsappModule = await import("whatsapp-web.js");
    WhatsApp = {
      Client: whatsappModule.default?.Client || whatsappModule.Client,
      LocalAuth: whatsappModule.default?.LocalAuth || whatsappModule.LocalAuth,
    };
  }
  if (!qrcodeTerminal) {
    qrcodeTerminal = (await import("qrcode-terminal")).default;
  }
}

// Type assertion helper
function getWhatsAppModules() {
  if (!WhatsApp) {
    throw new Error("WhatsApp modules not loaded");
  }
  return WhatsApp;
}

/**
 * WhatsApp Web Client Manager
 * Manages the WhatsApp Web connection using whatsapp-web.js
 */
class WhatsAppClientManager extends EventEmitter {
  private client: WhatsAppClient | null = null;
  private isReady = false;
  private isInitializing = false;
  private qrCode: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  /**
   * Initialize the WhatsApp client
   */
  async initialize(): Promise<void> {
    if (this.isInitializing || this.client) {
      logger.info("WHATSAPP", "Already initializing or initialized");
      return;
    }

    this.isInitializing = true;
    logger.info("WHATSAPP", "Initializing client...");

    // Ensure directories exist
    ensureDirectories();

    // Dynamically import whatsapp-web.js
    await importWhatsAppModules();

    const WhatsAppModule = getWhatsAppModules();

    logger.info("WHATSAPP", `Using session directory: ${WHATSAPP_SESSION_DIR}`);

    this.client = new WhatsAppModule.Client({
      authStrategy: new WhatsAppModule.LocalAuth({
        dataPath: WHATSAPP_SESSION_DIR,
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      },
    });

    // QR Code event
    this.client.on("qr", (qr: string) => {
      this.qrCode = qr;
      logger.info("WHATSAPP", "QR Code received. Scan with your phone.");
      qrcodeTerminal.generate(qr, { small: true });
      this.emit("qr", qr);
    });

    // Ready event
    this.client.on("ready", () => {
      this.isReady = true;
      this.isInitializing = false;
      logger.info("WHATSAPP", "Client is ready!");
      this.emit("ready");
    });

    // Authentication event
    this.client.on("authenticated", () => {
      logger.info("WHATSAPP", "Authenticated successfully");
      this.emit("authenticated");
    });

    // Auth failure event
    this.client.on("auth_failure", (msg: string) => {
      logger.error("WHATSAPP", "Authentication failed", { error: msg });
      this.isInitializing = false;
      this.emit("auth_failure", msg);
    });

    // Disconnected event
    this.client.on("disconnected", async (reason: string) => {
      logger.warn("WHATSAPP", "Client disconnected", { reason });
      this.isReady = false;
      this.isInitializing = false;

      // Check if session files exist
      const sessionExists = fs.existsSync(WHATSAPP_SESSION_DIR);
      const hasSessionData = sessionExists && fs.readdirSync(WHATSAPP_SESSION_DIR).length > 0;

      if (hasSessionData && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        logger.info("WHATSAPP", `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        // Wait before reconnecting
        setTimeout(async () => {
          try {
            this.client = null;
            await this.initialize();
          } catch (error) {
            logger.error("WHATSAPP", "Reconnection failed", {
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }, 5000 * this.reconnectAttempts); // Increasing delay
      } else if (!hasSessionData) {
        logger.info("WHATSAPP", "No session data found, will require new QR scan");
        this.client = null;
        this.qrCode = null;
        this.emit("session_expired");
      } else {
        logger.warn("WHATSAPP", "Max reconnection attempts reached, session may be invalid");
        this.client = null;
        this.isInitializing = false;
        this.emit("session_expired");
      }

      this.emit("disconnected", reason);
    });

    // Message received event
    this.client.on("message_create", async (msg: WhatsAppMessage) => {
      if (!msg.fromMe) {
        const contact = await msg.getContact().catch(() => null);
        const senderName = contact?.name || contact?.pushname || "Unknown";
        logger.info("WHATSAPP", `Message received from ${senderName}`, {
          from: msg.from,
          messageId: msg.id.id,
          messagePreview: msg.body.substring(0, 100),
        });

        this.emit("message", msg);

        // Handle auto-reply
        await this.handleAutoReply(msg);
      }
    });

    try {
      await this.client.initialize();
      logger.info("WHATSAPP", "Client initialization started");
    } catch (error) {
      logger.error("WHATSAPP", "Failed to initialize", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      this.isInitializing = false;
      throw error;
    }
  }

  /**
   * Get the WhatsApp client instance
   */
  getClient(): WhatsAppClient {
    if (!this.client) {
      throw new Error("WhatsApp client not initialized. Call initialize() first.");
    }
    return this.client;
  }

  /**
   * Check if client is ready
   */
  getReadyState(): boolean {
    return this.isReady;
  }

  /**
   * Get the current QR code
   */
  getQRCode(): string | null {
    return this.qrCode;
  }

  /**
   * Send a message to a contact
   */
  async sendMessage(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.isReady || !this.client) {
      logger.warn("WHATSAPP", "Attempted to send message but client not ready");
      return { success: false, error: "WhatsApp client not ready" };
    }

    const startTime = Date.now();
    logger.info("WHATSAPP", `Sending message to ${to}`, {
      to,
      messageLength: message.length,
      preview: message.substring(0, 50),
    });

    try {
      // Format phone number (remove non-numeric and add @c.us)
      const formattedNumber = to.replace(/\D/g, "");
      const chatId = formattedNumber.includes("@") ? formattedNumber : `${formattedNumber}@c.us`;

      const sent = await this.client.sendMessage(chatId, message);

      const duration = Date.now() - startTime;
      logger.info("WHATSAPP", `Message sent successfully`, {
        to,
        messageId: sent.id.id,
        duration: `${duration}ms`,
      });

      return { success: true, messageId: sent.id.id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const duration = Date.now() - startTime;

      logger.error("WHATSAPP", `Failed to send message`, {
        to,
        error: errorMessage,
        duration: `${duration}ms`,
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get all chats
   */
  async getChats(): Promise<{ success: boolean; chats?: Array<{ id: string; name: string; unreadCount: number }>; totalChats: number; error?: string }> {
    if (!this.isReady || !this.client) {
      logger.warn("WHATSAPP", "Attempted to get chats but client not ready");
      return { success: false, totalChats: 0, error: "WhatsApp client not ready" };
    }

    const startTime = Date.now();
    logger.info("WHATSAPP", "Fetching all chats");

    try {
      const chats = await this.client.getChats();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formattedChats = chats.map((chat: any) => ({
        id: chat.id._serialized,
        name: chat.name || chat.id.user,
        unreadCount: chat.unreadCount,
      }));

      const duration = Date.now() - startTime;
      logger.info("WHATSAPP", `Fetched ${formattedChats.length} chats`, {
        totalChats: formattedChats.length,
        duration: `${duration}ms`,
      });

      return { success: true, chats: formattedChats, totalChats: formattedChats.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const duration = Date.now() - startTime;

      logger.error("WHATSAPP", "Failed to fetch chats", {
        error: errorMessage,
        duration: `${duration}ms`,
      });

      return { success: false, totalChats: 0, error: errorMessage };
    }
  }

  /**
   * Get messages from a specific chat
   */
  async getMessages(chatId: string, limit: number = 50): Promise<{ success: boolean; messages?: Array<{ id: string; body: string; from: string; timestamp: number; fromMe: boolean }>; error?: string }> {
    if (!this.isReady || !this.client) {
      return { success: false, error: "WhatsApp client not ready" };
    }

    try {
      const chat = await this.client.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit });
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formattedMessages = messages.map((msg: any) => ({
        id: msg.id.id,
        body: msg.body,
        from: msg.from,
        timestamp: msg.timestamp,
        fromMe: msg.fromMe,
      }));

      return { success: true, messages: formattedMessages };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get contact info
   */
  async getContact(number: string): Promise<{ success: boolean; contact?: { number: string; name?: string; isBusiness: boolean }; error?: string }> {
    if (!this.isReady || !this.client) {
      return { success: false, error: "WhatsApp client not ready" };
    }

    try {
      const formattedNumber = number.replace(/\D/g, "");
      const contactId = `${formattedNumber}@c.us`;
      const contact = await this.client.getContactById(contactId);

      return {
        success: true,
        contact: {
          number: formattedNumber,
          name: contact.name || contact.pushname,
          isBusiness: contact.isBusiness,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get user's own info
   */
  async getMe(): Promise<{ success: boolean; info?: { number: string; name?: string }; error?: string }> {
    if (!this.isReady || !this.client) {
      return { success: false, error: "WhatsApp client not ready" };
    }

    try {
      const info = await this.client.info;
      return {
        success: true,
        info: {
          number: info.wid.user,
          name: info.pushname,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle auto-reply logic for incoming messages with debouncing
   */
  private async handleAutoReply(msg: WhatsAppMessage): Promise<void> {
    try {
      // Check if we should auto-reply
      const check = shouldAutoReply(msg.from);
      if (!check.shouldReply) {
        logger.info("AUTO_REPLY", `Auto-reply skipped: ${check.reason}`, {
          from: msg.from,
        });
        return;
      }

      const config = getAutoReplyConfig();

      // Get sender info
      const contact = await msg.getContact();
      const senderName = contact.name || contact.pushname || "Unknown";
      const phoneNumber = msg.from.replace(/@c\.us$/, "");

      logger.info("AUTO_REPLY", `Message received from ${senderName}, queuing for debouncing`, {
        phoneNumber,
        senderName,
        debounceMinutes: config.debounceMs / 60000,
      });

      // Queue the message for debouncing
      queueMessage(
        msg.from,
        {
          id: msg.id.id,
          body: msg.body,
          timestamp: msg.timestamp,
          from: msg.from,
          senderName,
        },
        async (contactNumber, batchedMessages) => {
          // This callback is called after debounce period (2 minutes of inactivity)
          await this.processBatchedMessages(contactNumber, batchedMessages);
        }
      );

      logger.debug("AUTO_REPLY", `Message queued for ${senderName}`, {
        phoneNumber,
        debounceMinutes: config.debounceMs / 60000,
      });
    } catch (error) {
      logger.error("AUTO_REPLY", `Error handling auto-reply`, {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Process batched messages after debounce period
   */
  private async processBatchedMessages(phoneNumber: string, batchedMessages: any[]): Promise<void> {
    try {
      if (batchedMessages.length === 0) return;

      const config = getAutoReplyConfig();
      const firstMessage = batchedMessages[0];
      const senderName = firstMessage.senderName;

      logger.info("AUTO_REPLY", `Processing ${batchedMessages.length} batched messages from ${senderName}`, {
        phoneNumber,
        senderName,
        messageCount: batchedMessages.length,
        mode: config.mode,
      });

      // Get chat history for context (with error handling for stale sessions)
      let chatHistory: Array<{ body: string; fromMe: boolean }> = [];
      const chatId = `${phoneNumber}@c.us`;

      try {
        const chat = await this.client!.getChatById(chatId);
        const chatMessages = await chat.fetchMessages({ limit: 10 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chatHistory = chatMessages.map((m: any) => ({
          body: m.body,
          fromMe: m.fromMe
        }));
      } catch (chatError) {
        const errorMessage = chatError instanceof Error ? chatError.message : "Unknown error";
        logger.warn("AUTO_REPLY", `Failed to fetch chat history for ${senderName}, proceeding without context`, {
          phoneNumber,
          senderName,
          error: errorMessage,
        });
        // Continue without chat history - the AI will still generate a reply
      }

      // Generate smart reply for batched messages
      const { reply, confidence, shouldSend, summary } = await generateSmartReplyForBatchedMessages(
        chatId,
        batchedMessages,
        chatHistory
      );

      logger.info("AUTO_REPLY", `Batched reply generated`, {
        phoneNumber,
        senderName,
        confidence,
        shouldSend,
        summaryLength: summary.length,
      });

      // Format the batched messages for display
      const batchedMessagesText = batchedMessages.map((msg, index) =>
        `${index + 1}. ${msg.body}`
      ).join('\n');

      // Handle based on mode
      switch (config.mode) {
        case "manual":
          // Emit event for manual approval
          this.emit("autoReplyPending", {
            phoneNumber,
            senderName,
            incomingMessage: batchedMessagesText,
            suggestedReply: reply,
            confidence,
            summary,
            messageCount: batchedMessages.length,
            chatId,
          });
          logger.info("AUTO_REPLY", `Pending approval for ${senderName}`, {
            phoneNumber,
            senderName,
            messageCount: batchedMessages.length,
          });
          break;

        case "auto":
          // Always send after delay
          setTimeout(async () => {
            try {
              const result = await this.sendMessage(chatId, reply);
              if (result.success) {
                recordReply(phoneNumber);
                logger.info("AUTO_REPLY", `Auto reply sent to ${senderName}`, {
                  phoneNumber,
                  senderName,
                  messageCount: batchedMessages.length,
                });
              }
            } catch (sendError) {
              logger.error("AUTO_REPLY", `Failed to send auto reply to ${senderName}`, {
                phoneNumber,
                senderName,
                error: sendError instanceof Error ? sendError.message : "Unknown error",
              });
            }
          }, config.replyDelayMs);
          break;

        case "smart":
          // Send only if confidence is high enough
          if (shouldSend && confidence >= 80) {
            setTimeout(async () => {
              try {
                const result = await this.sendMessage(chatId, reply);
                if (result.success) {
                  recordReply(phoneNumber);
                  logger.info("AUTO_REPLY", `Smart reply sent to ${senderName}`, {
                    phoneNumber,
                    senderName,
                    messageCount: batchedMessages.length,
                    confidence,
                  });
                }
              } catch (sendError) {
                logger.error("AUTO_REPLY", `Failed to send smart reply to ${senderName}`, {
                  phoneNumber,
                  senderName,
                  error: sendError instanceof Error ? sendError.message : "Unknown error",
                });
              }
            }, config.replyDelayMs);
          } else {
            // Emit for manual approval if confidence is low
            this.emit("autoReplyPending", {
              phoneNumber,
              senderName,
              incomingMessage: batchedMessagesText,
              suggestedReply: reply,
              confidence,
              summary,
              messageCount: batchedMessages.length,
              chatId,
            });
            logger.info("AUTO_REPLY", `Low confidence (${confidence}%), pending approval for ${senderName}`, {
              phoneNumber,
              senderName,
              confidence,
              shouldSend,
            });
          }
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error("AUTO_REPLY", `Error processing batched messages`, {
        error: errorMessage,
        stack: errorStack,
      });

      // Don't rethrow - this is called from a callback and we don't want to crash the bot
    }
  }

  /**
   * Get session status
   */
  getSessionStatus(): { exists: boolean; path: string; reconnectAttempts: number } {
    const sessionExists = fs.existsSync(WHATSAPP_SESSION_DIR);
    const hasSessionData = sessionExists && fs.readdirSync(WHATSAPP_SESSION_DIR).length > 0;

    return {
      exists: hasSessionData,
      path: WHATSAPP_SESSION_DIR,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Save settings to persistent storage
   */
  async saveSettings(settings: Record<string, any>): Promise<void> {
    try {
      const currentSettings = this.loadSettings();
      const mergedSettings = { ...currentSettings, ...settings, updatedAt: new Date().toISOString() };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(mergedSettings, null, 2));
      logger.info("WHATSAPP", `Settings saved to ${SETTINGS_FILE}`);
    } catch (error) {
      logger.error("WHATSAPP", `Failed to save settings: ${error}`);
    }
  }

  /**
   * Load settings from persistent storage
   */
  loadSettings(): Record<string, any> {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      logger.warn("WHATSAPP", `Failed to load settings: ${error}`);
    }
    return {};
  }

  /**
   * Get session data path
   */
  getSessionPath(): string {
    return WHATSAPP_SESSION_DIR;
  }

  /**
   * Destroy the client
   */
  async destroy(): Promise<void> {
    if (this.client) {
      logger.info("WHATSAPP", "Destroying client");
      await this.client.destroy();
      this.client = null;
      this.isReady = false;
      this.isInitializing = false;
      logger.info("WHATSAPP", "Client destroyed");
    }
  }
}

// Export singleton instance
export const whatsappManager = new WhatsAppClientManager();
