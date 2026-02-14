// telegram-file-tools.ts - Tools for agents to send files to Telegram
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { bot } from "../utils/telegram.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Tool: Send a file to Telegram
 * This tool allows agents to send files back to the user via Telegram
 */
export const sendTelegramFileTool = createTool({
  id: "send-telegram-file",
  description: "Send a file to the user via Telegram. Use this to share documents, images, code files, or any other files with the user. Supports both absolute paths and relative paths from the workspace directory.",
  inputSchema: z.object({
    filePath: z.string().describe("Path to the file to send (absolute or relative to workspace). Examples: 'report.pdf', '/absolute/path/to/file.txt', 'subdir/data.json'"),
    caption: z.string().optional().describe("Optional caption/description for the file"),
    filename: z.string().optional().describe("Optional custom filename (defaults to original filename)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    filePath: z.string(),
    fileSize: z.number().optional().describe("Size of the file in bytes"),
  }),
  execute: async (inputData, context) => {
    const { filePath: inputPath, caption, filename } = inputData;
    
    // Get chatId from request context (set by Telegram handler)
    const chatId = context?.requestContext?.get("telegramChatId") as number | undefined;
    
    if (!chatId) {
      return {
        success: false,
        message: "No Telegram chat context available. This tool can only be used when processing Telegram messages.",
        filePath: inputPath,
      };
    }

    try {
      // Resolve file path - handle both absolute and relative paths
      let resolvedPath: string;
      if (path.isAbsolute(inputPath)) {
        resolvedPath = inputPath;
      } else {
        // Relative path - resolve against workspace directory
        const workspaceDir = process.env.WORKSPACE_DIR || "./workspace";
        resolvedPath = path.join(workspaceDir, inputPath);
      }

      // Verify file exists
      let stats;
      try {
        stats = await fs.stat(resolvedPath);
      } catch {
        return {
          success: false,
          message: `File not found: "${inputPath}". Use the listFiles tool to see available files in the workspace.`,
          filePath: inputPath,
        };
      }
      
      if (!stats.isFile()) {
        return {
          success: false,
          message: `Path is not a file: "${inputPath}"`,
          filePath: inputPath,
        };
      }

      // Check file size (Telegram limit is 20MB for bots)
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (stats.size > maxSize) {
        return {
          success: false,
          message: `File "${path.basename(resolvedPath)}" is too large (${(stats.size / 1024 / 1024).toFixed(2)} MB). Maximum size is 20 MB.`,
          filePath: inputPath,
          fileSize: stats.size,
        };
      }

      // Read file content
      const fileContent = await fs.readFile(resolvedPath);
      const fileName = filename || path.basename(resolvedPath);
      
      // Determine file type based on extension
      const ext = path.extname(resolvedPath).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
      const isVideo = ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext);
      const isAudio = ['.mp3', '.ogg', '.wav', '.m4a', '.flac'].includes(ext);

      // File options for custom filename
      const fileOptions = {
        filename: fileName,
        contentType: undefined as string | undefined,
      };

      // Send file based on type
      if (isImage) {
        fileOptions.contentType = `image/${ext.replace('.', '')}`;
        await bot.sendPhoto(chatId, fileContent, {
          caption: caption || undefined,
        }, fileOptions);
      } else if (isVideo) {
        fileOptions.contentType = `video/${ext.replace('.', '')}`;
        await bot.sendVideo(chatId, fileContent, {
          caption: caption || undefined,
        }, fileOptions);
      } else if (isAudio) {
        fileOptions.contentType = `audio/${ext.replace('.', '')}`;
        await bot.sendAudio(chatId, fileContent, {
          caption: caption || undefined,
        }, fileOptions);
      } else {
        // Send as document for other file types
        await bot.sendDocument(chatId, fileContent, {
          caption: caption || undefined,
        }, fileOptions);
      }

      return {
        success: true,
        message: `File sent successfully to Telegram: ${fileName} (${(stats.size / 1024).toFixed(2)} KB)`,
        filePath: inputPath,
        fileSize: stats.size,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to send file: ${error.message}`,
        filePath: inputPath,
      };
    }
  },
});

/**
 * Tool: Send a text message to Telegram
 * This tool allows agents to send additional text messages
 */
export const sendTelegramMessageTool = createTool({
  id: "send-telegram-message",
  description: "Send a text message to the user via Telegram. Use this for status updates, summaries, or additional information.",
  inputSchema: z.object({
    message: z.string().describe("The message text to send (supports Markdown)"),
    parseMode: z.enum(["Markdown", "HTML", "none"]).optional().describe("Parse mode for the message (default: Markdown)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async (inputData, context) => {
    const { message, parseMode = "Markdown" } = inputData;
    
    // Get chatId from request context (set by Telegram handler)
    const chatId = context?.requestContext?.get("telegramChatId") as number | undefined;
    
    if (!chatId) {
      return {
        success: false,
        message: "No Telegram chat context available. This tool can only be used when processing Telegram messages.",
      };
    }

    try {
      await bot.sendMessage(chatId, message, {
        parse_mode: parseMode === "none" ? undefined : parseMode,
      });

      return {
        success: true,
        message: "Message sent successfully to Telegram",
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to send message: ${error.message}`,
      };
    }
  },
});

/**
 * Tool: Send multiple files as a media group to Telegram
 * Useful for sending related files together
 */
export const sendTelegramMediaGroupTool = createTool({
  id: "send-telegram-media-group",
  description: "Send multiple photos/videos as an album to Telegram. All files will be grouped together in a single message. Supports both absolute and relative paths from the workspace directory.",
  inputSchema: z.object({
    filePaths: z.array(z.string()).describe("Array of file paths to send (images or videos). Supports relative paths from workspace."),
    caption: z.string().optional().describe("Optional caption for the media group"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    sentCount: z.number(),
    skippedCount: z.number().optional().describe("Number of files skipped (non-media or not found)"),
  }),
  execute: async (inputData, context) => {
    const { filePaths, caption } = inputData;
    
    // Get chatId from request context (set by Telegram handler)
    const chatId = context?.requestContext?.get("telegramChatId") as number | undefined;
    
    if (!chatId) {
      return {
        success: false,
        message: "No Telegram chat context available. This tool can only be used when processing Telegram messages.",
        sentCount: 0,
        skippedCount: 0,
      };
    }

    if (filePaths.length === 0) {
      return {
        success: false,
        message: "No files provided",
        sentCount: 0,
        skippedCount: 0,
      };
    }

    try {
      const media: any[] = [];
      let skippedCount = 0;
      const maxSize = 20 * 1024 * 1024; // 20MB per file
      
      for (let i = 0; i < filePaths.length; i++) {
        const inputPath = filePaths[i];
        
        // Resolve file path
        let resolvedPath: string;
        if (path.isAbsolute(inputPath)) {
          resolvedPath = inputPath;
        } else {
          const workspaceDir = process.env.WORKSPACE_DIR || "./workspace";
          resolvedPath = path.join(workspaceDir, inputPath);
        }
        
        // Check if file exists
        let stats;
        try {
          stats = await fs.stat(resolvedPath);
        } catch {
          skippedCount++;
          continue; // Skip files that don't exist
        }
        
        if (!stats.isFile()) {
          skippedCount++;
          continue; // Skip directories
        }
        
        // Check size limit
        if (stats.size > maxSize) {
          skippedCount++;
          continue; // Skip files that are too large
        }
        
        const ext = path.extname(resolvedPath).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
        const isVideo = ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext);
        
        if (!isImage && !isVideo) {
          skippedCount++;
          continue; // Skip non-media files
        }

        const fileContent = await fs.readFile(resolvedPath);
        const mediaItem: any = {
          type: isImage ? 'photo' : 'video',
          media: fileContent,
        };
        
        // Add caption only to the first item
        if (i === 0 && caption) {
          mediaItem.caption = caption;
          mediaItem.parse_mode = 'Markdown';
        }
        
        media.push(mediaItem);
      }

      if (media.length === 0) {
        return {
          success: false,
          message: "No valid media files found (only images and videos are supported for media groups). Some files may not exist or be too large.",
          sentCount: 0,
          skippedCount,
        };
      }

      await bot.sendMediaGroup(chatId, media);

      return {
        success: true,
        message: `Media group sent successfully with ${media.length} items${skippedCount > 0 ? ` (${skippedCount} files skipped)` : ''}`,
        sentCount: media.length,
        skippedCount,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to send media group: ${error.message}`,
        sentCount: 0,
        skippedCount: 0,
      };
    }
  },
});

// Export all Telegram tools
export const telegramTools = {
  sendTelegramFile: sendTelegramFileTool,
  sendTelegramMessage: sendTelegramMessageTool,
  sendTelegramMediaGroup: sendTelegramMediaGroupTool,
};

export default telegramTools;
