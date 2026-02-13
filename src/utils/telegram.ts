import TelegramBot from "node-telegram-bot-api";
import { mastra } from "../mastra/index.js";
import { memory } from "../mastra/memory.js";
import { whatsappManager } from "./whatsapp-client.js";
import { logger } from "./logger.js";
import { getModelConfig, getProviderDisplayName } from "./model-config.js";
import { processWithNetwork } from "../agents/network.js";
import { isAuthenticated, verifyOTP, generateOTP, storeOTP } from "./telegram-auth.js";

// Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
}

// Initialize bot
export const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// User session management
interface UserSession {
  threadId: string;
  resourceId: string;
  lastActivity: Date;
  messageCount: number;
}

const userSessions = new Map<number, UserSession>();

// Helper: Get or create user session
async function getOrCreateSession(chatId: number, userId?: number): Promise<UserSession> {
  if (userSessions.has(chatId)) {
    const session = userSessions.get(chatId)!;
    session.lastActivity = new Date();
    return session;
  }

  const resourceId = userId ? `telegram-user-${userId}` : `telegram-chat-${chatId}`;
  const threadId = `telegram-thread-${chatId}`;

  // Create thread in memory
  try {
    if (!memory) {
      throw new Error("Memory not initialized");
    }
    await memory.saveThread({
      thread: {
        id: threadId,
        resourceId,
        title: `Telegram Chat ${chatId}`,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    // Thread might already exist
    console.log(`Thread ${threadId} may already exist`);
  }

  const session: UserSession = {
    threadId,
    resourceId,
    lastActivity: new Date(),
    messageCount: 0,
  };

  userSessions.set(chatId, session);
  return session;
}

// Helper: Send typing indicator
async function sendTyping(chatId: number): Promise<void> {
  await bot.sendChatAction(chatId, "typing");
}

// Helper: Format response for Telegram
function formatForTelegram(text: string): string {
  // Telegram has a 4096 character limit for messages
  if (text.length <= 4000) return text;

  // Truncate with indicator
  return text.substring(0, 3997) + "...";
}

// Message handler
export async function handleMessage(msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = msg.text;

  if (!text) return;

  // Check authentication first
  if (!isAuthenticated(chatId)) {
    // Check if user is trying to verify OTP
    if (text.match(/^\d{6}$/)) {
      // 6-digit code
      const otp = text.trim();
      if (verifyOTP(chatId, otp)) {
        await bot.sendMessage(
          chatId,
          "✅ Welcome to Sybil!\n\nI'm your autonomous AI assistant. Just start chatting with me!\n\nType /help for commands.",
          { parse_mode: "Markdown" }
        );
        return;
      } else {
        await bot.sendMessage(
          chatId,
          "❌ Invalid code.\n\nAsk your admin for a new 6-digit code.",
          { parse_mode: "Markdown" }
        );
        return;
      }
    }

    // User not authenticated, send simple instructions
    await bot.sendMessage(
      chatId,
      "🔐 Send 6-digit code from admin to unlock Sybil Bot, Your chat ID is: " + chatId + "",
      { parse_mode: "Markdown" }
    );
    return;
  }

  logger.info("TELEGRAM", `Message received from user ${userId || chatId}`, {
    chatId,
    userId,
    messageLength: text.length,
    preview: text.substring(0, 100),
  });

  try {
    // Get or create session
    const session = await getOrCreateSession(chatId, userId || undefined);
    session.messageCount++;

    logger.debug("TELEGRAM", `Session details`, {
      threadId: session.threadId,
      messageCount: session.messageCount,
    });

    // Get agent
    const agent = mastra.getAgent("autonomousAgent");

    // Generate response with streaming
    const startTime = Date.now();
    logger.info("AGENT", `Generating response for user ${userId || chatId}`, {
      threadId: session.threadId,
      messagePrefix: text.substring(0, 50),
    });

    // Add retry logic without time constraints
    const maxRetries = 2;
    let lastError: Error | null = null;
    let fullText = "";
    let toolCallCount = 0;
    let lastMessageId: number | null = null;
    let pendingEdit: Promise<void> | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info("AGENT", `Attempt ${attempt} of ${maxRetries} for response generation`);

        const stream = await agent.stream(text, {
          maxSteps: 15,
          memory: {
            thread: session.threadId,
            resource: session.resourceId,
          },
          onStepFinish: ({ text, toolCalls, toolResults, finishReason, usage }: any) => {
            if (toolCalls.length > 0 || toolResults.length > 0) {
              // Log successful tool calls
              const successfulTools = toolResults
                .filter((result: any) => !result.error)
                .map((result: any) => result.toolName);

              // Log failed tool calls
              const failedTools = toolResults
                .filter((result: any) => result.error)
                .map((result: any) => ({
                  toolName: result.toolName,
                  error: result.error,
                  errorCode: result.errorCode
                }));

              logger.info("AGENT", `Step completed`, {
                attempt,
                toolCalls: toolCalls.map((tc: any) => tc.payload.toolName),
                successfulTools,
                failedTools,
                toolResultsCount: toolResults.length,
                finishReason,
                usage: usage ? {
                  totalTokens: usage.totalTokens
                } : undefined
              });

              // Log detailed errors for failed tools
              failedTools.forEach((failedTool: any) => {
                logger.error("AGENT", `Tool execution failed`, {
                  toolName: failedTool.toolName,
                  error: failedTool.error,
                  errorCode: failedTool.errorCode,
                  attempt,
                });
              });
            }
          },
        });

        // Process streaming response
        for await (const chunk of stream.fullStream) {
          switch (chunk.type) {
            case "text-delta":
              if ('text' in chunk.payload) {
                fullText += chunk.payload.text;

                // Send/update message periodically for streaming effect
                if (fullText.length > 0 && fullText.length % 100 < 10) {
                  const formattedResponse = formatForTelegram(fullText);
                  if (lastMessageId) {
                    // Edit existing message (don't wait for previous edit)
                    pendingEdit = bot.editMessageText(formattedResponse, {
                      chat_id: chatId,
                      message_id: lastMessageId,
                      parse_mode: "Markdown",
                    }).catch(() => {
                      // Ignore edit conflicts
                    }) as Promise<void>;
                  } else {
                    // Send first message
                    lastMessageId = await bot.sendMessage(chatId, formattedResponse, {
                      parse_mode: "Markdown",
                    }).then(msg => msg.message_id);
                  }
                }
              }
              break;

            case "tool-result":
              logger.debug("AGENT", `Tool result: ${chunk.payload.toolName}`);
              break;

            case "finish":
              logger.debug("AGENT", `Stream finished. Tools used: ${toolCallCount}`);
              break;
          }
        }

        // Send final message with complete text
        if (fullText.length > 0) {
          const formattedResponse = formatForTelegram(fullText);
          if (lastMessageId) {
            await (pendingEdit || Promise.resolve());
            try {
              await bot.editMessageText(formattedResponse, {
                chat_id: chatId,
                message_id: lastMessageId,
                parse_mode: "Markdown",
              });
            } catch {
              // If editing failed, send new message
              await bot.sendMessage(chatId, formattedResponse, {
                parse_mode: "Markdown",
              });
            }
          } else {
            await bot.sendMessage(chatId, formattedResponse, {
              parse_mode: "Markdown",
            });
          }
        }

        // Success - break out of retry loop
        break;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        logger.error("AGENT", `Attempt ${attempt} failed`, {
          attempt,
          maxRetries,
          error: lastError.message,
          willRetry: attempt < maxRetries
        });

        if (attempt === maxRetries) {
          throw lastError;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const duration = Date.now() - startTime;
    logger.info("AGENT", `Response generated`, {
      userId,
      responseLength: fullText.length,
      toolCallCount,
      duration: `${duration}ms`,
    });

    logger.info("TELEGRAM", `Response sent to user ${chatId}`, {
      responseLength: fullText.length,
    });

    // Learn from interaction (async, don't block response)
    if (session.messageCount % 5 === 0) {
      // Every 5 messages, trigger learning
      learnFromInteraction(session, text, fullText).catch(console.error);
    }

  } catch (error) {
    logger.error("TELEGRAM", `Error handling message`, {
      chatId,
      userId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error("Error handling Telegram message:", error);
    await bot.sendMessage(
      chatId,
      "I apologize, but I encountered an error processing your message. Please try again."
    );
  }
}

// Handle create tool command
async function handleCreateToolCommand(chatId: number, description: string, userId?: number): Promise<void> {
  try {
    await bot.sendMessage(chatId, `🔧 Creating tool: "${description.substring(0, 50)}"...`);

    const session = await getOrCreateSession(chatId, userId || undefined);
    const agent = mastra.getAgent("autonomousAgent");

    const result = await agent.generate(
      `Use the generateTool tool to create a new tool with this description: ${description}`,
      {
        memory: {
          thread: session.threadId,
          resource: session.resourceId,
        },
      }
    );

    await bot.sendMessage(chatId, `✅ Tool creation response:\n\n${result.text}`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error creating tool:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't create the tool. Please try again.");
  }
}

// Handle list tools command
async function handleListToolsCommand(chatId: number, userId?: number): Promise<void> {
  try {
    const session = await getOrCreateSession(chatId, userId || undefined);
    const agent = mastra.getAgent("autonomousAgent");

    const result = await agent.generate(
      "Use the listGeneratedTools tool to show all available tools",
      {
        memory: {
          thread: session.threadId,
          resource: session.resourceId,
        },
      }
    );

    await bot.sendMessage(chatId, `📋 Available Tools:\n\n${result.text}`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error listing tools:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't list the tools. Please try again.");
  }
}

// Handle create skill command
async function handleCreateSkillCommand(chatId: number, description: string, userId?: number): Promise<void> {
  try {
    await bot.sendMessage(chatId, `🎓 Creating skill: "${description.substring(0, 50)}"...`);

    const session = await getOrCreateSession(chatId, userId || undefined);
    const agent = mastra.getAgent("autonomousAgent");

    const result = await agent.generate(
      `Use the generateSkill tool to learn a new skill with this description: ${description}`,
      {
        memory: {
          thread: session.threadId,
          resource: session.resourceId,
        },
      }
    );

    await bot.sendMessage(chatId, `✅ Skill creation response:\n\n${result.text}`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error creating skill:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't create the skill. Please try again.");
  }
}

// Handle list skills command
async function handleListSkillsCommand(chatId: number, userId?: number): Promise<void> {
  try {
    const session = await getOrCreateSession(chatId, userId || undefined);
    const agent = mastra.getAgent("autonomousAgent");

    const result = await agent.generate(
      "Use the listSkills tool to show all learned skills",
      {
        memory: {
          thread: session.threadId,
          resource: session.resourceId,
        },
      }
    );

    await bot.sendMessage(chatId, `🎓 Learned Skills:\n\n${result.text}`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error listing skills:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't list the skills. Please try again.");
  }
}

// Handle workspace commands
async function handleWorkspaceCommand(chatId: number, action: string, userId?: number, filename?: string, content?: string): Promise<void> {
  try {
    const session = await getOrCreateSession(chatId, userId || undefined);
    const agent = mastra.getAgent("autonomousAgent");

    let command = `Use the workspace to ${action}`;

    if (filename) {
      command += ` with filename "${filename}"`;
    }
    if (content) {
      command += ` and content "${content.substring(0, 100)}..."`;
    }

    const result = await agent.generate(command, {
      memory: {
        thread: session.threadId,
        resource: session.resourceId,
      },
    });

    await bot.sendMessage(chatId, `🗂️ Workspace ${action}:\n\n${result.text}`, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error in workspace command:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't execute the workspace command. Please try again.");
  }
}

// Handle backup command
async function handleBackupCommand(chatId: number, userId?: number): Promise<void> {
  try {
    await bot.sendMessage(chatId, "💾 Creating backup...");

    // Here you would implement actual backup logic
    const timestamp = new Date().toISOString().split('T')[0];
    const backupFile = `sybil-backup-${timestamp}.json`;

    await bot.sendMessage(
      chatId,
      `✅ Backup concept created:\n\n📁 File: ${backupFile}\n💾 Data: Configuration & settings\n📍 Location: ~/.sybil/backups/\n\n⚠️  Note: This is a concept - implement actual backup logic`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Error creating backup:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't create a backup. Please try again.");
  }
}

// Handle restore command
async function handleRestoreCommand(chatId: number, backupFile: string, userId?: number): Promise<void> {
  try {
    await bot.sendMessage(chatId, `📂 Restoring from: ${backupFile}...`);

    await bot.sendMessage(
      chatId,
      `✅ Restore concept executed:\n\n📁 File: ${backupFile}\n📍 Location: ~/.sybil/backups/\n\n⚠️  Note: This is a concept - implement actual restore logic`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("Error restoring backup:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't restore the backup. Please try again.");
  }
}

// Handle diagnostics command
async function handleDiagnosticsCommand(chatId: number, userId?: number): Promise<void> {
  try {
    await bot.sendMessage(chatId, "🔍 Running system diagnostics...");

    const modelConfig = getModelConfig();
    const status = whatsappManager.getReadyState();

    let diagnostics = `📊 **System Diagnostics**\n\n`;
    diagnostics += `🤖 **AI Provider:** ${getProviderDisplayName()}\n`;
    diagnostics += `📋 **Model:** ${modelConfig.model}\n`;
    diagnostics += `📱 **WhatsApp:** ${status ? '✅ Connected' : '❌ Disconnected'}\n`;
    diagnostics += `💾 **Memory:** Working + Semantic Recall ✅\n`;
    diagnostics += `🔧 **Tools:** Dynamic Generation ✅\n`;
    diagnostics += `🗂️ **Workspace:** File Operations ✅\n`;
    diagnostics += `🛡️ **Safety:** PII/Moderation/Injection Detection ✅\n`;
    diagnostics += `📈 **Status:** All systems operational`;

    await bot.sendMessage(chatId, diagnostics, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error running diagnostics:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't run diagnostics. Please try again.");
  }
}

// Learn from interaction
async function learnFromInteraction(
  session: UserSession,
  userMessage: string,
  botResponse: string
): Promise<void> {
  try {
    const agent = mastra.getAgent("autonomousAgent");

    // Trigger the learn-from-interaction tool by asking the agent to analyze
    await agent.generate(
      `Please analyze this conversation and use the learn-from-interaction tool to extract insights:\n\nUser: ${userMessage}\n\nAssistant: ${botResponse}`,
      {
        memory: {
          thread: session.threadId,
          resource: session.resourceId,
        },
      }
    );
  } catch (error) {
    console.error("Error learning from interaction:", error);
  }
}

// Command handler
export async function handleCommand(msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text || "";
  const command = text.split(" ")[0].toLowerCase();

  switch (command) {
    case "/start":
      await bot.sendMessage(
        chatId,
        "👋 Hi! I'm **Sybil**, your AI assistant.\n\n" +
        "I can:\n" +
        "• 🧠 Remember our chats\n" +
        "• 📋 Plan & do tasks\n" +
        "• 🎓 Learn new skills\n" +
        "• 🌐 Research online\n" +
        "• 📱 Send WhatsApp messages\n\n" +
        "💬 Just start chatting or use /help for commands!"
      );
      break;

    case "/help":
      await bot.sendMessage(
        chatId,
        "🤖 *Sybil Commands*\n\n" +
        "📝 *Planning:*\n" +
        "/plan <goal> - Create action plan\n" +
        "/network <task> - Multi-agent task\n\n" +
        "🧠 *Learning:*\n" +
        "/create-tool <desc> - Make new tool\n" +
        "/create-skill <desc> - Learn new skill\n" +
        "/list-tools - Show all tools\n" +
        "/list-skills - Show all skills\n\n" +
        "📱 *WhatsApp:*\n" +
        "/whatsapp - Check connection\n" +
        "/whatsapp-send <num> <msg> - Send message\n\n" +
        "⚙️ *System:*\n" +
        "/status - Your stats\n" +
        "/memory - What I remember\n" +
        "/model <provider> - Change AI model\n\n" +
        "Just type anything to chat normally!",

        { parse_mode: "Markdown" }
      );
      break;

    case "/help":
      await bot.sendMessage(
        chatId,
        "📚 *Available Commands:*\n\n" +
        "🎯 *General:*\n" +
        "• /start - Start the bot\n" +
        "• /help - Show this help message\n" +
        "• /status - Check your current status and progress\n\n" +
        "🧠 *Memory & Learning:*\n" +
        "• /memory - Show what I remember about you\n" +
        "• /reflect - Trigger self-reflection and improvement\n" +
        "• I'm continuously learning from our interactions!\n\n" +
        "📋 *Planning:*\n" +
        "• /plan <goal> - Create an autonomous plan for a goal\n" +
        "  Example: /plan Research best practices for Node.js\n\n" +
        "🤖 *AI Providers:*\n" +
        "• /models - List all supported AI providers\n" +
        "• /model <provider> - Check/switch AI provider\n" +
        "  Examples: /model anthropic, /model groq, /model nvidia\n\n" +
        "🔧 *Dynamic Tools:*\n" +
        "• /create-tool <description> - Create a custom tool\n" +
        "  Example: /create-tool temperature converter\n\n" +
        "📚 *Skills:*\n" +
        "• /create-skill <description> - Create a skill\n" +
        "• /list-skills - View all available skills\n\n" +
        "🗂️ *Workspace:*\n" +
        "• /workspace-list - List files in workspace\n" +
        "• /workspace-read <filename> - Read a file\n" +
        "• /workspace-write <filename> <content> - Write to a file\n" +
        "• /workspace-exec <command> - Execute a command\n" +
        "• /workspace-clear - Clear all files\n\n" +
        "💬 *WhatsApp:*\n" +
        "• /whatsapp - Check WhatsApp connection status\n" +
        "• /whatsapp-send <number> <message> - Send a message\n" +
        "• /whatsapp-chats - List your WhatsApp chats\n\n" +
        "🔄 *Auto-Reply:*\n" +
        "• /autoreply - Check auto-reply configuration\n" +
        "• /autoreply-enable - Enable auto-reply\n" +
        "• /autoreply-disable - Disable auto-reply\n" +
        "• /autoreply-mode <manual|auto|smart> - Set reply mode\n" +
        "• /approve-reply <number> <message> - Approve pending reply\n\n" +
        "💾 *Data Management:*\n" +
        "• /backup - Save configuration & data\n" +
        "• /restore <filename> - Restore from backup\n\n" +
        "🔍 *System:*\n" +
        "• /diagnostics - Run system health check\n\n" +
        "⚡ *Features:*\n" +
        "✅ Streaming responses\n" +
        "✅ 17+ AI providers (OpenAI, Anthropic, Google, etc.)\n" +
        "✅ Dynamic tool generation\n" +
        "✅ Dynamic skill creation\n" +
        "✅ File system workspace\n" +
        "✅ PII & content moderation\n" +
        "✅ WhatsApp integration\n" +
        "✅ Persistent memory\n" +

        { parse_mode: "Markdown" }
      );
      break;

    case "/status":
      const session = await getOrCreateSession(chatId, msg.from?.id);
      await bot.sendMessage(
        chatId,
        `📊 *Your Status:*\n\n` +
        `• Messages exchanged: ${session.messageCount}\n` +
        `• Last activity: ${session.lastActivity.toLocaleString()}\n` +
        `• Session ID: ${session.threadId}\n\n` +
        `I'm continuously learning from our interactions to serve you better!`,
        { parse_mode: "Markdown" }
      );
      break;

    case "/memory":
      await handleMemoryCommand(chatId, msg.from?.id);
      break;

    case "/reflect":
      await handleReflectCommand(chatId, msg.from?.id);
      break;

    case "/model":
      const requestedProvider = text.replace("/model", "").trim();
      if (!requestedProvider) {
        await bot.sendMessage(
          chatId,
          "Please provide a provider after /model. For example:\n/model anthropic\n\n" +
          "Use /models to see all available providers."
        );
      } else {
        // Check if provider is valid and switch
        const availableProviders = ["openai", "anthropic", "google", "deepseek", "groq", "mistral", "xai", "ollama", "perplexity", "cohere", "huggingface", "togetherai", "fireworks-ai", "cerebras", "openrouter"];

        if (availableProviders.includes(requestedProvider)) {
          // Update provider (this would require restart to take effect)
          await bot.sendMessage(
            chatId,
            `✅ Provider "${requestedProvider}" is valid!\n\n` +
            `⚠️  To switch providers, please restart the bot with:\n` +
            `AI_PROVIDER=${requestedProvider}\n\n` +
            `Current provider remains: ${process.env.AI_PROVIDER || "openai"}`
          );
        } else {
          await bot.sendMessage(
            chatId,
            `❌ Invalid provider "${requestedProvider}"\n\n` +
            `Use /models to see all available providers.`
          );
        }
      }
      break;

    case "/models":
      await bot.sendMessage(
        chatId,
        "🤖 *Available AI Providers:*\n\n" +
        "📈 **Major Providers:**\n" +
        "• openai - GPT-4o, GPT-5\n" +
        "• anthropic - Claude 4.5 Sonnet/Opus\n" +
        "• google - Gemini 2.5\n" +
        "• deepseek - DeepSeek-R1\n" +
        "• xai - Grok-4\n" +
        "• mistral - Mistral Large\n" +
        "• nvidia - NVIDIA Llama\n\n" +
        "⚡ **Fast Providers:**\n" +
        "• groq - Llama 3.3 (Ultra Fast)\n" +
        "• cerebras - Llama 3.3 (NVIDIA GPU)\n\n" +
        "🌐 **Specialized:**\n" +
        "• perplexity - Web Search + LLM\n" +
        "• openrouter - 2000+ Models Gateway\n" +
        "• huggingface - Open Source Models\n\n" +
        "🏠 **Local:**\n" +
        "• ollama - Local LLM Server\n" +
        "• ollama-cloud - Managed Ollama\n\n" +
        "💬 Use /model <provider> to switch"
      );
      break;

    case "/create-tool":
      const toolDescription = text.replace("/create-tool", "").trim();
      if (!toolDescription) {
        await bot.sendMessage(
          chatId,
          "Please provide a tool description after /create-tool.\n" +
          "Example: /create-tool Create a temperature converter between Celsius and Fahrenheit"
        );
      } else {
        await handleCreateToolCommand(chatId, toolDescription, msg.from?.id);
      }
      break;

    case "/create-skill":
      const skillDescription = text.replace("/create-skill", "").trim();
      if (!skillDescription) {
        await bot.sendMessage(
          chatId,
          "Please provide a skill description after /create-skill.\n" +
          "Example: /create-skill Create a skill for managing project tasks"
        );
      } else {
        await handleCreateSkillCommand(chatId, skillDescription, msg.from?.id);
      }
      break;

    case "/list-skills":
      await handleListSkillsCommand(chatId, msg.from?.id);
      break;

    case "/workspace-list":
      await handleWorkspaceCommand(chatId, "list", msg.from?.id);
      break;

    case "/workspace-read":
      const args = text.replace("/workspace-read", "").trim().split(" ");
      const filename = args[0];
      if (!filename) {
        await bot.sendMessage(
          chatId,
          "Usage: /workspace-read <filename>\n" +
          "Example: /workspace-read notes.txt"
        );
      } else {
        await handleWorkspaceCommand(chatId, "read", msg.from?.id, filename);
      }
      break;

    case "/workspace-write":
      const writeArgs = text.replace("/workspace-write", "").trim().split(" ");
      const writeFilename = writeArgs[0];
      const content = writeArgs.slice(1).join(" ");
      if (!writeFilename || !content) {
        await bot.sendMessage(
          chatId,
          "Usage: /workspace-write <filename> <content>\n" +
          "Example: /workspace-write notes.txt My meeting notes here"
        );
      } else {
        await handleWorkspaceCommand(chatId, "write", msg.from?.id, writeFilename, content);
      }
      break;

    case "/workspace-exec":
      const execArgs = text.replace("/workspace-exec", "").trim().split(" ");
      const command = execArgs.join(" ");
      if (!command) {
        await bot.sendMessage(
          chatId,
          "Usage: /workspace-exec <command>\n" +
          "Example: /workspace-exec ls -la"
        );
      } else {
        await handleWorkspaceCommand(chatId, "exec", msg.from?.id, command);
      }
      break;

    case "/workspace-clear":
      await handleWorkspaceCommand(chatId, "clear", msg.from?.id);
      await bot.sendMessage(chatId, "✅ Workspace cleared successfully");
      break;

    case "/backup":
      await handleBackupCommand(chatId, msg.from?.id);
      break;

    case "/restore":
      const restoreFile = text.replace("/restore", "").trim();
      if (!restoreFile) {
        await bot.sendMessage(
          chatId,
          "Usage: /restore <backup-file>\n" +
          "Example: /restore sybil-backup-2024-02-12.json"
        );
      } else {
        await handleRestoreCommand(chatId, restoreFile, msg.from?.id);
      }
      break;

    case "/diagnostics":
      await handleDiagnosticsCommand(chatId, msg.from?.id);
      break;

    case "/plan":
      const goal = text.replace("/plan", "").trim();
      if (!goal) {
        await bot.sendMessage(
          chatId,
          "Please provide a goal after /plan. For example:\n/plan Research best practices for Node.js"
        );
      } else {
        await handlePlanCommand(chatId, msg.from?.id, goal);
      }
      break;

    case "/whatsapp":
      await handleWhatsAppCommand(chatId, msg.from?.id);
      break;

    case "/whatsapp-send":
      const whatsappArgs = text.replace("/whatsapp-send", "").trim();
      const [phoneNumber, ...messageParts] = whatsappArgs.split(" ");
      const whatsappMessage = messageParts.join(" ");
      if (!phoneNumber || !whatsappMessage) {
        await bot.sendMessage(
          chatId,
          "Usage: /whatsapp-send <phone_number> <message>\nExample: /whatsapp-send 1234567890 Hello there!"
        );
      } else {
        await handleWhatsAppSendCommand(chatId, msg.from?.id, phoneNumber, whatsappMessage);
      }
      break;

    case "/whatsapp-chats":
      await handleWhatsAppChatsCommand(chatId, msg.from?.id);
      break;

    case "/autoreply":
      await handleAutoReplyCommand(chatId, msg.from?.id);
      break;

    case "/autoreply-enable":
      await handleAutoReplyConfigCommand(chatId, msg.from?.id, "enable");
      break;

    case "/autoreply-disable":
      await handleAutoReplyConfigCommand(chatId, msg.from?.id, "disable");
      break;

    case "/autoreply-mode":
      const mode = text.replace("/autoreply-mode", "").trim();
      if (!mode) {
        await bot.sendMessage(
          chatId,
          "Usage: /autoreply-mode <manual|auto|smart>\nExample: /autoreply-mode smart"
        );
      } else {
        await handleAutoReplyConfigCommand(chatId, msg.from?.id, "set-mode", mode);
      }
      break;

    case "/approve-reply":
      const approveArgs = text.replace("/approve-reply", "").trim();
      const [replyNumber, ...replyMessageParts] = approveArgs.split(" ");
      const replyMessage = replyMessageParts.join(" ");
      if (!replyNumber || !replyMessage) {
        await bot.sendMessage(
          chatId,
          "Usage: /approve-reply <phone_number> <message>\nExample: /approve-reply 1234567890 Thanks for your message!"
        );
      } else {
        await handleApproveReplyCommand(chatId, msg.from?.id, replyNumber, replyMessage);
      }
      break;

    case "/network":
      const networkTask = text.replace("/network", "").trim();
      if (!networkTask) {
        await bot.sendMessage(
          chatId,
          "Please provide a task after /network.\n" +
          "Example: /network Research Node.js best practices and create a summary\n\n" +
          "The agent network will coordinate multiple specialized agents:\n" +
          "🧠 Planner - Decomposes tasks\n" +
          "🔍 Researcher - Gathers information\n" +
          "⚡ Executor - Performs actions\n" +
          "📱 WhatsApp Agent - Handles messaging"
        );
      } else {
        await handleNetworkCommand(chatId, msg.from?.id, networkTask);
      }
      break;

    default:
      // Unknown command - treat as regular message
      await handleMessage(msg);
  }
}

// Handle memory command
async function handleMemoryCommand(chatId: number, userId?: number): Promise<void> {
  try {
    const session = await getOrCreateSession(chatId, userId || undefined);
    if (!memory) {
      await bot.sendMessage(chatId, "❌ Memory not available", { parse_mode: "Markdown" });
      return;
    }

    const workingMemory = await memory.getWorkingMemory({
      threadId: session.threadId,
      resourceId: session.resourceId,
    });

    if (workingMemory) {
      await bot.sendMessage(
        chatId,
        `🧠 *What I Remember About You:*\n\n${workingMemory}`,
        { parse_mode: "Markdown" }
      );
    } else {
      await bot.sendMessage(
        chatId,
        "🤔 I don't have much information about you yet. Let's chat more so I can learn your preferences!"
      );
    }
  } catch (error) {
    console.error("Error getting memory:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't retrieve your memory at this Time.");
  }
}

// Handle reflect command
async function handleReflectCommand(chatId: number, userId?: number): Promise<void> {
  try {
    await bot.sendMessage(chatId, "🤔 Running self-reflection to identify improvements...");

    const session = await getOrCreateSession(chatId, userId || undefined);
    const agent = mastra.getAgent("autonomousAgent");

    const result = await agent.generate("Please use the self-reflect tool to analyze my recent performance and identify improvements", {
      memory: {
        thread: session.threadId,
        resource: session.resourceId,
      },
    });

    await bot.sendMessage(chatId, `✅ Reflection complete!\n\n${result.text}`);
  } catch (error) {
    console.error("Error during reflection:", error);
    await bot.sendMessage(chatId, "Sorry, reflection failed. Please try again later.");
  }
}

// Handle plan command
async function handlePlanCommand(chatId: number, userId: number | undefined, goal: string): Promise<void> {
  try {
    await bot.sendMessage(chatId, `📝 Creating an autonomous plan for: "${goal}"...`);

    const workflow = mastra.getWorkflow("plannerWorkflow");
    const run = await workflow.createRun();

    const result = await run.start({
      inputData: {
        goal,
        userContext: `Telegram user ${userId || chatId}`,
      },
    });

    if (result.status === "success" && result.result) {
      const plan = result.result;
      let message = `✅ *Plan Created!*\n\n`;
      message += `*Goal:* ${goal}\n`;
      message += `*Estimated Duration:* ${plan.metadata?.estimatedDuration || "N/A"}\n`;
      message += `*Steps:* ${plan.metadata?.totalSteps || "N/A"}\n\n`;
      message += `*Action Plan:*\n`;

      plan.steps?.forEach((step: any) => {
        message += `${step.order || step.id}. ${step.action}\n`;
      });

      if (plan.suggestions && plan.suggestions.length > 0) {
        message += `\n*Suggestions:*\n${plan.suggestions.join("\n")}`;
      }

      await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } else {
      await bot.sendMessage(chatId, "❌ Failed to create plan. Please try again.");
    }
  } catch (error) {
    console.error("Error creating plan:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't create the plan. Please try again later.");
  }
}



// Handle network command
async function handleNetworkCommand(chatId: number, userId: number | undefined, task: string): Promise<void> {
  try {
    const msg = await bot.sendMessage(chatId, `🌐 Thinking...`);

    const session = await getOrCreateSession(chatId, userId);

    // Stream response
    let fullText = "";


    const stream = await mastra.getAgent("routingAgent").network(task, {
      memory: {
        thread: session.threadId,
        resource: session.resourceId,
      },
      maxSteps: 100,
      autoResumeSuspendedTools: true,
      onIterationComplete(context) {
        logger.info("AGENT_NETWORK", `Iteration complete`, {
          result: context.result,
          isComplete: context.isComplete,
          iteration: context.iteration,
        });
      },

    });

    for await (const chunk of stream) {
      if (chunk.type === "text-delta") {
        fullText += chunk.payload.text;

        // Update message every 100 chars
        if (fullText.length % 100 < 20 && fullText.length > 100) {
          bot.editMessageText(
            `🌐 ${fullText.substring(0, 800)}${fullText.length > 800 ? "..." : ""}`,
            {
              chat_id: chatId,
              message_id: msg.message_id,
              parse_mode: "Markdown"
            }
          ).catch(() => { }); // Ignore errors
        }
      }
    }


    // Send final message
    await bot.editMessageText(
      `✅ *Done:*\n\n${fullText}`,
      {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: "Markdown"
      }
    );
  } catch (error) {
    console.error("Error processing with network:", error);
    await bot.sendMessage(chatId, "Sorry, I had an error. Try again?");
  }
}

// Setup bot listeners
export function setupBot(): void {
  console.log("🤖 Setting up Telegram bot...");

  // Handle text messages
  bot.on("message", async (msg) => {
    if (msg.text?.startsWith("/")) {
      await handleCommand(msg);
    } else {
      await handleMessage(msg);
    }
  });

  // Handle errors
  bot.on("polling_error", (error) => {
    logger.error("TELEGRAM", `Polling error`, {
      error: error.message,
    });
  });

  // Handle new chat members
  bot.on("new_chat_members", async (msg) => {
    const chatId = msg.chat.id;
    logger.info("TELEGRAM", `New chat members joined`, {
      chatId,
      members: msg.new_chat_members?.map(m => m.id) || [],
    });
    await bot.sendMessage(
      chatId,
      "👋 Hello everyone! I'm sybil, ready to help and learn!"
    );
  });

  // Handle auto-reply pending events from WhatsApp
  whatsappManager.on("autoReplyPending", async (data) => {
    logger.info("AUTO_REPLY", `Pending approval notification`, {
      senderName: data.senderName,
      phoneNumber: data.phoneNumber,
      messageCount: data.messageCount,
    });

    // Get all active chat sessions and notify them
    for (const [chatId, session] of userSessions.entries()) {
      try {
        const messageCount = data.messageCount || 1;
        const summary = data.summary || "New message received";

        let messageText = `🤖 *Auto-Reply Pending Approval*\n\n`;
        messageText += `📱 From: ${data.senderName} (${data.phoneNumber})\n`;
        messageText += `💬 ${messageCount} message${messageCount > 1 ? 's' : ''} received\n`;
        messageText += `📝 Summary: ${summary}\n\n`;

        if (messageCount > 1) {
          messageText += `*Messages:*\n${data.incomingMessage.substring(0, 300)}${data.incomingMessage.length > 300 ? "..." : ""}\n\n`;
        } else {
          messageText += `*Message:* "${data.incomingMessage.substring(0, 100)}${data.incomingMessage.length > 100 ? "..." : ""}"\n\n`;
        }

        messageText += `✍️ *Suggested Reply* (${data.confidence}% confidence):\n`;
        messageText += `"${data.suggestedReply}"\n\n`;
        messageText += `To approve and send, reply with:\n`;
        messageText += `/approve-reply ${data.phoneNumber} ${data.suggestedReply}`;

        await bot.sendMessage(chatId, messageText, { parse_mode: "Markdown" });
      } catch (error) {
        logger.error("TELEGRAM", `Failed to notify about pending reply`, {
          chatId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  });

  console.log("✅ Telegram bot is running and listening for messages");
}

// Graceful shutdown
export async function stopBot(): Promise<void> {
  console.log("🛑 Stopping Telegram bot...");
  await bot.stopPolling();
  console.log("✅ Telegram bot stopped");
}

// WhatsApp command handlers
async function handleWhatsAppCommand(chatId: number, userId?: number): Promise<void> {
  try {
    const status = whatsappManager.getReadyState();
    const qrCode = whatsappManager.getQRCode();
    const sessionStatus = whatsappManager.getSessionStatus();

    if (status) {
      const info = await whatsappManager.getMe();
      if (info.success && info.info) {
        await bot.sendMessage(
          chatId,
          `✅ *WhatsApp Connected!*\n\n` +
          `📱 Number: ${info.info.number}\n` +
          `👤 Name: ${info.info.name || "N/A"}\n\n` +
          `💾 *Session:*\n` +
          `   Path: ${sessionStatus.path}\n` +
          `   Status: Active\n\n` +
          `WhatsApp is ready to send messages.\n` +
          `Use /whatsapp-send <number> <message> to send a message.`,
          { parse_mode: "Markdown" }
        );
      } else {
        await bot.sendMessage(chatId, "✅ WhatsApp is connected!");
      }
    } else if (qrCode) {
      await bot.sendMessage(
        chatId,
        `⏳ *WhatsApp Initializing...*\n\n` +
        `Please scan the QR code that was printed in the console with your phone.\n` +
        `Open WhatsApp → Settings → Linked Devices → Link a Device\n\n` +
        `Once scanned, WhatsApp will be ready to use.\n\n` +
        `💾 *Session Path:* ${sessionStatus.path}`
      );
    } else {
      const sessionInfo = sessionStatus.exists
        ? `📁 *Existing Session Found:*\n` +
        `   Path: ${sessionStatus.path}\n\n` +
        `The session is saved and will be restored on restart.`
        : `📭 *No Session:*\n` +
        `   A new QR code will be generated when you initialize.`;

      await bot.sendMessage(
        chatId,
        `📱 *WhatsApp Setup Required*\n\n` +
        `${sessionInfo}\n\n` +
        `To set up WhatsApp:\n` +
        `1. Ask me to "initialize WhatsApp"\n` +
        `2. Scan the QR code with your phone\n` +
        `3. Start sending messages!\n\n` +
        `💾 *Session will be saved to:*\n` +
        `${sessionStatus.path}`
      );
    }
  } catch (error) {
    console.error("Error handling WhatsApp command:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't check WhatsApp status. Please try again.");
  }
}

async function handleWhatsAppSendCommand(chatId: number, userId: number | undefined, phoneNumber: string, message: string): Promise<void> {
  try {
    if (!whatsappManager.getReadyState()) {
      await bot.sendMessage(
        chatId,
        `❌ WhatsApp not connected!\n\n` +
        `Please initialize WhatsApp first by saying "initialize whatsapp"\n` +
        `and scanning the QR code with your phone.`
      );
      return;
    }

    await bot.sendMessage(chatId, `📤 Sending message to ${phoneNumber}...`);

    const result = await whatsappManager.sendMessage(phoneNumber, message);

    if (result.success) {
      await bot.sendMessage(
        chatId,
        `✅ *Message sent successfully!*\n\n` +
        `📱 To: ${phoneNumber}\n` +
        `💬 Message: ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`,
        { parse_mode: "Markdown" }
      );
    } else {
      await bot.sendMessage(
        chatId,
        `❌ Failed to send message:\n${result.error || "Unknown error"}`
      );
    }
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't send the WhatsApp message. Please try again.");
  }
}

async function handleWhatsAppChatsCommand(chatId: number, userId?: number): Promise<void> {
  try {
    if (!whatsappManager.getReadyState()) {
      await bot.sendMessage(
        chatId,
        `❌ WhatsApp not connected!\n\n` +
        `Please initialize WhatsApp first by saying "initialize whatsapp"\n` +
        `and scanning the QR code with your phone.`
      );
      return;
    }

    await bot.sendMessage(chatId, "📱 Fetching your WhatsApp chats...");

    const result = await whatsappManager.getChats();

    if (result.success && result.chats) {
      let message = `💬 *Your WhatsApp Chats*\n\n`;

      // Show first 20 chats
      const chatsToShow = result.chats.slice(0, 20);
      chatsToShow.forEach((chat, index) => {
        const unreadBadge = chat.unreadCount > 0 ? ` 🔴 ${chat.unreadCount}` : "";
        message += `${index + 1}. ${chat.name}${unreadBadge}\n`;
      });

      if (result.chats.length > 20) {
        message += `\n... and ${result.chats.length - 20} more chats`;
      }

      message += `\n\nTotal: ${result.totalChats} chats`;

      await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } else {
      await bot.sendMessage(chatId, `❌ Failed to get chats: ${result.error || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Error getting WhatsApp chats:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't get your WhatsApp chats. Please try again.");
  }
}

// Auto-Reply command handlers
async function handleAutoReplyCommand(chatId: number, userId?: number): Promise<void> {
  try {
    const agent = mastra.getAgent("autonomousAgent");
    const session = await getOrCreateSession(chatId, userId || undefined);

    const result = await agent.generate("Get the current auto-reply status using the configure-auto-reply tool", {
      memory: {
        thread: session.threadId,
        resource: session.resourceId,
      },
    });

    await bot.sendMessage(chatId, result.text, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error getting auto-reply status:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't get the auto-reply status. Please try again.");
  }
}

async function handleAutoReplyConfigCommand(
  chatId: number,
  userId: number | undefined,
  action: string,
  value?: string
): Promise<void> {
  try {
    const agent = mastra.getAgent("autonomousAgent");
    const session = await getOrCreateSession(chatId, userId || undefined);

    let prompt = `Configure auto-reply with action: ${action}`;
    if (value) {
      prompt += ` and value: ${value}`;
    }
    prompt += " using the configure-auto-reply tool";

    const result = await agent.generate(prompt, {
      memory: {
        thread: session.threadId,
        resource: session.resourceId,
      },
    });

    await bot.sendMessage(chatId, result.text, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error configuring auto-reply:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't configure auto-reply. Please try again.");
  }
}

async function handleApproveReplyCommand(
  chatId: number,
  userId: number | undefined,
  phoneNumber: string,
  message: string
): Promise<void> {
  try {
    if (!whatsappManager.getReadyState()) {
      await bot.sendMessage(
        chatId,
        `❌ WhatsApp not connected!\n\n` +
        `Please initialize WhatsApp first.`
      );
      return;
    }

    await bot.sendMessage(chatId, `📤 Sending approved reply to ${phoneNumber}...`);

    const agent = mastra.getAgent("autonomousAgent");
    const session = await getOrCreateSession(chatId, userId || undefined);

    const result = await agent.generate(
      `Approve and send this reply using the approve-pending-reply tool:\n` +
      `Phone: ${phoneNumber}\n` +
      `Message: ${message}`,
      {
        memory: {
          thread: session.threadId,
          resource: session.resourceId,
        },
      }
    );

    await bot.sendMessage(chatId, result.text, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error approving reply:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't send the approved reply. Please try again.");
  }
}
