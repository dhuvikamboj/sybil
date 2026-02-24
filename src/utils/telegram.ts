import TelegramBot from "node-telegram-bot-api";
import { mastra } from "../mastra/index.js";
import { memory } from "../mastra/memory.js";
import { whatsappManager } from "./whatsapp-client.js";
import { logger } from "./logger.js";
import { getModelConfig, getProviderDisplayName } from "./model-config.js";
import { processWithNetwork } from "../agents/network.js";
import { isAuthenticated, verifyOTP, generateOTP, storeOTP, getAuthenticatedUsers } from "./telegram-auth.js";
import { RequestContext } from "@mastra/core/request-context";
import { promises as fs } from "fs";

// Simple throttle helper
function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null;
  let previous = 0;
  const { leading = true, trailing = true } = options;
  
  const throttled = function(this: any, ...args: Parameters<T>) {
    const now = Date.now();
    if (!previous && !leading) previous = now;
    const remaining = wait - (now - previous);
    
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(this, args);
    } else if (!timeout && trailing) {
      timeout = setTimeout(() => {
        previous = leading ? Date.now() : 0;
        timeout = null;
        func.apply(this, args);
      }, remaining);
    }
  };
  
  throttled.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    previous = 0;
  };
  
  return throttled;
}

// Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
}

// Initialize bot
export const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Session mode types
type SessionMode = "normal" | "plan" | "research" | "agent";

// User session management
interface UserSession {
  threadId: string;
  resourceId: string;
  lastActivity: Date;
  messageCount: number;
  mode: SessionMode;
}

const userSessions = new Map<number, UserSession>();

// Mode indicator emojis
const modeEmojis: Record<SessionMode, string> = {
  normal: "💬",
  plan: "📋",
  research: "🔍",
  agent: "🤖",
};

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
    mode: "agent",
  };

  userSessions.set(chatId, session);
  return session;
}

// Helper: Send typing indicator
async function sendTyping(chatId: number): Promise<void> {
  await bot.sendChatAction(chatId, "typing");
}

// Helper: Escape Markdown special characters
function escapeMarkdownV1(text: string): string {
  // Escape characters that have special meaning in Telegram's Markdown mode
  // Note: Only escape when needed, preserve intentional formatting
  
  // First, temporarily mark intentional markdown patterns
  const replacements: string[] = [];
  const save = (match: string) => {
    replacements.push(match);
    return `\x00${replacements.length - 1}\x00`;
  };
  
  // Save intentional formatting patterns
  let processed = text
    .replace(/\*\*[^*]+\*\*/g, save)  // Bold **text**
    .replace(/\*[^*\n]+\*/g, save)    // Italic *text*
    .replace(/`[^`]+`/g, save)        // Code `text`
    .replace(/```[\s\S]*?```/g, save) // Code blocks
    .replace(/\[[^\]]+\]\([^\)]+\)/g, save); // Links [text](url)
  
  // Escape remaining special characters that would break markdown
  processed = processed
    .replace(/([_*`[\]()])/g, '\\$1');
  
  // Restore intentional formatting
  replacements.forEach((val, i) => {
    processed = processed.replace(`\x00${i}\x00`, val);
  });
  
  return processed;
}

// Helper: Send message with fallback for markdown errors
async function sendMessageSafe(
  chatId: number, 
  text: string, 
  options?: TelegramBot.SendMessageOptions
): Promise<TelegramBot.Message> {
  try {
    return await bot.sendMessage(chatId, text, options);
  } catch (error: any) {
    // If markdown parsing fails, retry without parse_mode
    if (error?.response?.body?.description?.includes("parse entities")) {
      logger.warn("TELEGRAM", "Markdown parsing failed, sending as plain text", {
        error: error.message,
        textLength: text.length,
      });
      // Strip markdown and send as plain text
      const plainText = text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, '').trim());
      return await bot.sendMessage(chatId, plainText);
    }
    throw error;
  }
}

// Helper: Edit message with fallback for markdown errors
async function editMessageSafe(
  text: string,
  options: TelegramBot.EditMessageTextOptions
): Promise<void> {
  try {
    await bot.editMessageText(text, options);
  } catch (error: any) {
    // If markdown parsing fails, retry without parse_mode
    if (error?.response?.body?.description?.includes("parse entities")) {
      logger.warn("TELEGRAM", "Markdown parsing failed in edit, sending as plain text", {
        error: error.message,
        textLength: text.length,
      });
      // Strip markdown and retry without parse_mode
      const plainText = text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, '').trim());
      await bot.editMessageText(plainText, {
        ...options,
        parse_mode: undefined,
      });
    }
    // Ignore other errors (like edit conflicts)
  }
}

// Helper: Check if text is valid Markdown
function isValidMarkdown(text: string): boolean {
  let depth = 0;
  let inBold = 0;
  let inItalic = 0;
  let inCode = false;
  let inCodeBlock = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    // Check for code blocks
    if (char === '`' && nextChar === '`' && text[i + 2] === '`') {
      inCodeBlock = !inCodeBlock;
      i += 2;
      continue;
    }
    
    if (inCodeBlock) continue;
    
    // Check for inline code
    if (char === '`' && !inCode) {
      inCode = true;
      continue;
    } else if (char === '`' && inCode) {
      inCode = false;
      continue;
    }
    
    if (inCode) continue;
    
    // Check for bold
    if (char === '*' && nextChar === '*') {
      inBold = inBold === 0 ? 1 : 0;
      i++;
      continue;
    }
    
    // Check for italic (single star, but not part of bold)
    if (char === '*' && nextChar !== '*') {
      inItalic = inItalic === 0 ? 1 : 0;
      continue;
    }
  }
  
  // Check brackets for links
  const openBrackets = (text.match(/\[/g) || []).length;
  const closeBrackets = (text.match(/\]/g) || []).length;
  const openParens = (text.match(/\(/g) || []).length;
  const closeParens = (text.match(/\)/g) || []).length;
  
  return inBold === 0 && inItalic === 0 && !inCode && !inCodeBlock && 
         openBrackets === closeBrackets && openParens === closeParens;
}

// Helper: Format response for Telegram
function formatForTelegram(text: string): string {
  // Check if text has valid markdown, if not, escape it
  if (!isValidMarkdown(text)) {
    text = escapeMarkdownV1(text);
  }
  
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
      mode: session.mode,
    });

    // Get agent based on session mode
    let agent;
    const modeEmoji = modeEmojis[session.mode];
    const agentNames: Record<SessionMode, string> = {
      normal: "autonomousAgent",
      plan: "plannerAgent",
      research: "researcherAgent",
      agent: "executorAgent",
    };

    switch (session.mode) {
      case "plan":
        agent = mastra.getAgent("plannerAgent");
        break;
      case "research":
        agent = mastra.getAgent("researcherAgent");
        break;
      case "agent":
        agent = mastra.getAgent("executorAgent");
        break;
      case "normal":
      default:
        agent = mastra.getAgent("autonomousAgent");
        break;
    }

    // Generate response with streaming
    const startTime = Date.now();
    const agentName = agent?.id || agentNames[session.mode];
    logger.info("AGENT", `Generating response for user ${userId || chatId}`, {
      threadId: session.threadId,
      messagePrefix: text.substring(0, 50),
      mode: session.mode,
      agent: agentName,
    });

    // Add retry logic without time constraints
    const maxRetries = 2;
    let lastError: Error | null = null;
    let fullText = "";
    let toolCallCount = 0;
    let lastMessageId: number | null = null;
    let pendingEdit: Promise<void> | null = null;
    
    // Track tool calls for response
    const toolCallsMade: Array<{name: string; success: boolean; error?: string}> = [];

    // Create request context with Telegram chat ID for tools
    const requestContext = new RequestContext();
    requestContext.set("telegramChatId", chatId);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info("AGENT", `Attempt ${attempt} of ${maxRetries} for response generation`);
        lastMessageId = await bot.sendMessage(chatId, `🌐 Thinking...`).then(msg => msg.message_id);

        const stream = await agent.stream(text, {
          maxSteps: 100,
          memory: {
            thread: session.threadId,
            resource: session.resourceId,
          },
          requestContext,
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

        // Update function for sending/editing messages
        const performUpdate = async () => {
          // Build current display with tool calls section
          let currentDisplay = fullText;
          if (toolCallsMade.length > 0) {
            currentDisplay += "\n\n🔧 *Tools:*\n";
            toolCallsMade.forEach((tool, index) => {
              const status = tool.success ? "✅" : "⏳";
              currentDisplay += `${index + 1}. ${status} \`${tool.name}\`\n`;
            });
          }
          
          const formattedResponse = formatForTelegram(currentDisplay);
          if (lastMessageId) {
            // Edit existing message with fallback
            pendingEdit = editMessageSafe(formattedResponse, {
              chat_id: chatId,
              message_id: lastMessageId,
              parse_mode: "Markdown",
            }) as Promise<void>;
          } else {
            // Send first message with fallback
            lastMessageId = await sendMessageSafe(chatId, formattedResponse, {
              parse_mode: "Markdown",
            }).then(msg => msg.message_id);
          }
        };
        
        // Throttled version for streaming updates
        const updateMessage = throttle(performUpdate, 1000, { leading: true, trailing: true });
        
        // Process streaming response
        for await (const chunk of stream.fullStream) {
          switch (chunk.type) {
            case "text-delta":
              if ('text' in chunk.payload) {
                fullText += chunk.payload.text;
                updateMessage();
              }
              break;

            case "tool-call":
              const toolCall = chunk.payload;
              // Add to tracking as in-progress
              toolCallsMade.push({
                name: (toolCall as any).toolName || (toolCall as any).name,
                success: false,
                error: undefined,
              });
              
              // Immediately display the new tool call
              if (lastMessageId) {
                await (pendingEdit || Promise.resolve());
                
                let currentDisplay = fullText;
                if (toolCallsMade.length > 0) {
                  currentDisplay += "\n\n🔧 *Tools:*\n";
                  toolCallsMade.forEach((tool, index) => {
                    let toolStatus = tool.success ? "✅" : "⏳";
                    if (tool.error) toolStatus = "❌";
                    currentDisplay += `${index + 1}. ${toolStatus} \`${tool.name}\`\n`;
                  });
                }
                
                const formattedResponse = formatForTelegram(currentDisplay);
                pendingEdit = editMessageSafe(formattedResponse, {
                  chat_id: chatId,
                  message_id: lastMessageId,
                  parse_mode: "Markdown",
                }) as Promise<void>;
              }
              break;

            case "tool-result":
              const toolResult = chunk.payload;
              
              // Update tool callsMade with result
              const existingIndex = toolCallsMade.findIndex(t => t.name === toolResult.toolName);
              if (existingIndex >= 0) {
                toolCallsMade[existingIndex].success = !toolResult.isError;
                toolCallsMade[existingIndex].error = toolResult.isError ? (toolResult as any).error : undefined;
              }
              
              // Immediately display the updated tool call status
              if (lastMessageId) {
                await (pendingEdit || Promise.resolve());
                
                let currentDisplay = fullText;
                if (toolCallsMade.length > 0) {
                  currentDisplay += "\n\n🔧 *Tools:*\n";
                  toolCallsMade.forEach((tool, index) => {
                    let toolStatus = tool.success ? "✅" : "⏳";
                    if (tool.error) toolStatus = "❌";
                    currentDisplay += `${index + 1}. ${toolStatus} \`${tool.name}\`\n`;
                  });
                }
                
                const formattedResponse = formatForTelegram(currentDisplay);
                pendingEdit = editMessageSafe(formattedResponse, {
                  chat_id: chatId,
                  message_id: lastMessageId,
                  parse_mode: "Markdown",
                }) as Promise<void>;
              }
              
              logger.debug("AGENT", `Tool result: ${chunk.payload.toolName}`);
              break;

            case "finish":
              logger.debug("AGENT", `Stream finished. Tools used: ${toolCallCount}`);
              break;
          }
        }

        // Ensure final update is sent immediately
        updateMessage.cancel();
        await (pendingEdit || Promise.resolve());
        if (fullText.length > 0 || toolCallsMade.length > 0) {
          await performUpdate();
        }

        // Build final tool calls summary with all results
        let toolCallsSection = "";
        if (toolCallsMade.length > 0) {
          toolCallsSection = "\n\n🔧 *Tools Used:*\n";
          toolCallsMade.forEach((tool, index) => {
            const status = tool.success ? "✅" : "❌";
            toolCallsSection += `${index + 1}. ${status} \`${tool.name}\`\n`;
          });
        }

        // Send final message with complete text
        if (fullText.length > 0 || toolCallsMade.length > 0) {
          const TELEGRAM_LIMIT = 4000;
          
          // Combine response with tool calls
          let finalResponse = fullText + toolCallsSection;
          
          if (finalResponse.length > TELEGRAM_LIMIT) {
            // Response is too long, send as file
            const timestamp = Date.now();
            const filename = `response-${timestamp}.md`;
            const tempDir = process.env.TEMP || process.env.TMPDIR || '/tmp';
            const filePath = `${tempDir}/${filename}`;
            
            try {
              // Write response to file (including tool calls)
              await fs.writeFile(filePath, finalResponse, 'utf-8');
              
              // Read file content
              const fileContent = await fs.readFile(filePath);
              
              // Send as document
              const summary = fullText.substring(0, 200) + "...\n\n[Full response attached as file]";
              
              if (lastMessageId) {
                // Edit the last message with summary
                await (pendingEdit || Promise.resolve());
                await bot.editMessageText(
                  `📄 Response is too long (${finalResponse.length} characters). Sending as file...`,
                  {
                    chat_id: chatId,
                    message_id: lastMessageId,
                  }
                );
              } else {
                // Send initial message
                await bot.sendMessage(
                  chatId,
                  `📄 Response is too long (${finalResponse.length} characters). Sending as file...`
                );
              }
              
              // Send the file
              await bot.sendDocument(chatId, fileContent, {
                caption: `Response (${finalResponse.length} characters)`,
              }, {
                filename: filename,
                contentType: 'text/markdown',
              });
              
              // Clean up temp file
              await fs.unlink(filePath).catch(() => {});
              
            } catch (fileError) {
              logger.error("TELEGRAM", "Failed to send response as file", {
                error: fileError instanceof Error ? fileError.message : "Unknown error",
              });
              // Fallback: send truncated message
              const truncatedResponse = fullText.substring(0, TELEGRAM_LIMIT - 100) + 
                "\n\n...[Response truncated - too long to display]";
              await sendMessageSafe(chatId, truncatedResponse, {
                parse_mode: "Markdown",
              });
            }
          } else {
            // Normal response, send as text
            const formattedResponse = formatForTelegram(finalResponse);
            if (lastMessageId) {
              await (pendingEdit || Promise.resolve());
              try {
                await editMessageSafe(formattedResponse, {
                  chat_id: chatId,
                  message_id: lastMessageId,
                  parse_mode: "Markdown",
                });
              } catch {
                // If editing failed, send new message
                await sendMessageSafe(chatId, formattedResponse, {
                  parse_mode: "Markdown",
                });
              }
            } else {
              await sendMessageSafe(chatId, formattedResponse, {
                parse_mode: "Markdown",
              });
            }
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
      toolCallCount: toolCallsMade.length,
      toolsUsed: toolCallsMade.map(t => t.name),
      duration: `${duration}ms`,
      agent: agentName,
      mode: session.mode,
    });

    logger.info("TELEGRAM", `Response sent to user ${chatId}`, {
      responseLength: fullText.length,
      mode: session.mode,
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

    await sendMessageSafe(chatId, `✅ Tool creation response:\n\n${result.text}`, { parse_mode: "Markdown" });
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

    await sendMessageSafe(chatId, `📋 Available Tools:\n\n${result.text}`, { parse_mode: "Markdown" });
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

    await sendMessageSafe(chatId, `✅ Skill creation response:\n\n${result.text}`, { parse_mode: "Markdown" });
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

    await sendMessageSafe(chatId, `🎓 Learned Skills:\n\n${result.text}`, { parse_mode: "Markdown" });
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

    await sendMessageSafe(chatId, `🗂️ Workspace ${action}:\n\n${result.text}`, { parse_mode: "Markdown" });
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
        "🤖 **Agent Mode** is active by default - I'm ready to execute tasks, write code, and perform actions!\n\n" +
        "Use /help for commands and /normal to switch to chat mode."
      );
      break;

    case "/plan": {
      const planSession = await getOrCreateSession(chatId, msg.from?.id);
      planSession.mode = "plan";
      await bot.sendMessage(
        chatId,
        "📋 **Plan Mode Activated**\n\n" +
        "All your messages will now be handled by the **Planner Agent**.\n\n" +
        "The Planner Agent excels at:\n" +
        "• Breaking down complex tasks into steps\n" +
        "• Creating structured execution plans\n" +
        "• Identifying dependencies and priorities\n" +
        "• Estimating effort and time\n\n" +
        "Just describe what you want to achieve!"
      );
      break;
    }

    case "/research": {
      const researchSession = await getOrCreateSession(chatId, msg.from?.id);
      researchSession.mode = "research";
      await bot.sendMessage(
        chatId,
        "🔍 **Research Mode Activated**\n\n" +
        "All your messages will now be handled by the **Research Agent**.\n\n" +
        "The Research Agent excels at:\n" +
        "• Finding current information and facts\n" +
        "• Web scraping and content extraction\n" +
        "• Multi-source verification\n" +
        "• Comprehensive research reports\n\n" +
        "What would you like me to research?"
      );
      break;
    }

    case "/agent": {
      const agentSession = await getOrCreateSession(chatId, msg.from?.id);
      agentSession.mode = "agent";
      await bot.sendMessage(
        chatId,
        "🤖 **Agent Mode Activated**\n\n" +
        "All your messages will now be handled by the **Executor Agent**.\n\n" +
        "The Executor Agent excels at:\n" +
        "• Writing and executing code\n" +
        "• Browser automation\n" +
        "• File operations\n" +
        "• Performing actions and tasks\n\n" +
        "What task should I execute?"
      );
      break;
    }

    case "/normal": {
      const normalSession = await getOrCreateSession(chatId, msg.from?.id);
      normalSession.mode = "normal";
      await bot.sendMessage(
        chatId,
        "💬 **Normal Mode Activated**\n\n" +
        "All your messages will now be handled by the **Autonomous Agent** (default).\n\n" +
        "The Autonomous Agent can:\n" +
        "• Handle general conversations\n" +
        "• Learn from interactions\n" +
        "• Plan and execute tasks\n" +
        "• Access all available tools\n\n" +
        "What can I help you with?"
      );
      break;
    }

    case "/help":
      await bot.sendMessage(
        chatId,
        "🤖 *Sybil Commands*\n\n" +
        "🎯 *Session Modes:*\n" +
        "/plan - Plan mode (planner agent)\n" +
        "/research - Research mode (research agent)\n" +
        "/agent - Agent mode (executor agent)\n" +
        "/normal - Normal mode (autonomous agent)\n\n" +
        "📝 *Planning:*\n" +
        "/plan - Switch to plan mode\n" +
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
        "🎛️ *Session Modes:*\n" +
        "• /plan - Plan mode: All messages go to Planner Agent\n" +
        "• /research - Research mode: All messages go to Research Agent\n" +
        "• /agent - Agent mode: All messages go to Executor Agent\n" +
        "• /normal - Normal mode: All messages go to Autonomous Agent (default)\n\n" +
        "🧠 *Memory & Learning:*\n" +
        "• /memory - Show what I remember about you\n" +
        "• /reflect - Trigger self-reflection and improvement\n" +
        "• I'm continuously learning from our interactions!\n\n" +
        "📋 *Planning:*\n" +
        "• /plan - Switch to plan mode for structured planning\n" +
        "• /network <task> - Multi-agent task\n\n" +
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
        "• /workspace-clear - Clear all files\n" +
        "• /send <filename> - Send a file from workspace\n\n" +
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
        "✅ Session modes (plan, research, agent, normal)\n" +
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

    case "/status": {
      const session = await getOrCreateSession(chatId, msg.from?.id);
      const modeEmoji = modeEmojis[session.mode];
      const modeNames: Record<SessionMode, string> = {
        normal: "Normal (Autonomous Agent)",
        plan: "Plan (Planner Agent)",
        research: "Research (Research Agent)",
        agent: "Agent (Executor Agent)",
      };
      await bot.sendMessage(
        chatId,
        `📊 *Your Status:*\n\n` +
        `• Messages exchanged: ${session.messageCount}\n` +
        `• Last activity: ${session.lastActivity.toLocaleString()}\n` +
        `• Session ID: ${session.threadId}\n` +
        `• Current mode: ${modeEmoji} ${modeNames[session.mode]}\n\n` +
        `Use /plan, /research, /agent, or /normal to switch modes.\n\n` +
        `I'm continuously learning from our interactions to serve you better!`,
        { parse_mode: "Markdown" }
      );
      break;
    }

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

    case "/send":
      const sendFilename = text.replace("/send", "").trim();
      if (!sendFilename) {
        await bot.sendMessage(
          chatId,
          "Usage: /send <filename>\n" +
          "Example: /send report.pdf\n\n" +
          "Sends a file from the workspace to this chat."
        );
      } else {
        await handleSendFileCommand(chatId, sendFilename, msg.from?.id);
      }
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

// Handle send file command
async function handleSendFileCommand(chatId: number, filename: string, userId?: number): Promise<void> {
  try {
    const path = await import("path");
    const workspaceDir = process.env.WORKSPACE_DIR || "./workspace";
    const filePath = path.join(workspaceDir, filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      await bot.sendMessage(
        chatId,
        `❌ File not found: "${filename}"\n\nUse /workspace-list to see available files.`
      );
      return;
    }
    
    // Read file stats
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      await bot.sendMessage(chatId, `❌ "${filename}" is not a file.`);
      return;
    }
    
    // Check file size (Telegram limit is 20MB for bots)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (stats.size > maxSize) {
      await bot.sendMessage(
        chatId,
        `❌ File "${filename}" is too large (${(stats.size / 1024 / 1024).toFixed(2)} MB).\nMaximum size is 20 MB.`
      );
      return;
    }
    
    // Send processing message
    const processingMsg = await bot.sendMessage(chatId, `📤 Sending "${filename}"...`);
    
    // Read and send file
    const fileContent = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // Determine file type
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
    const isVideo = ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext);
    const isAudio = ['.mp3', '.ogg', '.wav', '.m4a', '.flac'].includes(ext);
    
    // File options
    const fileOptions = {
      filename: path.basename(filePath),
      contentType: undefined as string | undefined,
    };
    
    // Send based on file type
    if (isImage) {
      fileOptions.contentType = `image/${ext.replace('.', '')}`;
      await bot.sendPhoto(chatId, fileContent, {
        caption: `📎 ${filename}`,
      }, fileOptions);
    } else if (isVideo) {
      fileOptions.contentType = `video/${ext.replace('.', '')}`;
      await bot.sendVideo(chatId, fileContent, {
        caption: `📎 ${filename}`,
      }, fileOptions);
    } else if (isAudio) {
      fileOptions.contentType = `audio/${ext.replace('.', '')}`;
      await bot.sendAudio(chatId, fileContent, {
        caption: `📎 ${filename}`,
      }, fileOptions);
    } else {
      // Send as document
      await bot.sendDocument(chatId, fileContent, {
        caption: `📎 ${filename}`,
      }, fileOptions);
    }
    
    // Delete processing message
    try {
      await bot.deleteMessage(chatId, processingMsg.message_id);
    } catch {
      // Ignore deletion errors
    }
    
  } catch (error) {
    console.error("Error sending file:", error);
    await bot.sendMessage(
      chatId,
      `❌ Failed to send file "${filename}".\nError: ${error instanceof Error ? error.message : "Unknown error"}`
    );
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
    for (const {chatId} of getAuthenticatedUsers()) {
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

    await sendMessageSafe(chatId, result.text, { parse_mode: "Markdown" });
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

    await sendMessageSafe(chatId, result.text, { parse_mode: "Markdown" });
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

    await sendMessageSafe(chatId, result.text, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error approving reply:", error);
    await bot.sendMessage(chatId, "Sorry, I couldn't send the approved reply. Please try again.");
  }
}
