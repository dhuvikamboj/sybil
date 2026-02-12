import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  sessionId?: string;
  userId?: number;
}

export interface LoggerConfig {
  level: LogLevel;
  logFile: string;
  enableConsole: boolean;
  enableFile: boolean;
  maxFileSize: number; // in bytes
  maxFiles: number;
}

const defaultConfig: LoggerConfig = {
  level: LogLevel.DEBUG,
  logFile: "./logs/sybil.log",
  enableConsole: true,
  enableFile: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
};

class Logger {
  private config: LoggerConfig;
  private logDir: string;
  private logBuffer: LogEntry[] = [];
  private bufferFlushInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.logDir = path.dirname(this.config.logFile);
    this.init();
  }

  private init(): void {
    if (this.config.enableFile) {
      try {
        if (!fs.existsSync(this.logDir)) {
          fs.mkdirSync(this.logDir, { recursive: true });
        }
        this.rotateLogs();
      } catch (error) {
        console.error("Failed to initialize log directory:", error);
        this.config.enableFile = false;
      }
    }
    this.bufferFlushInterval = setInterval(() => this.flush(), 5000);
  }

  private rotateLogs(): void {
    try {
      if (!fs.existsSync(this.logDir)) return;
      
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith("sybil") && f.endsWith(".log"))
        .map(f => ({
          name: f,
          path: path.join(this.logDir, f),
          stats: fs.statSync(path.join(this.logDir, f)),
        }))
        .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

      if (files.length >= this.config.maxFiles) {
        const toDelete = files.slice(this.config.maxFiles - 1);
        for (const file of toDelete) {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {
            // Ignore deletion errors
          }
        }
      }
    } catch (error) {
      // Ignore rotation errors
    }
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatLevel(level: LogLevel): string {
    return ["DEBUG", "INFO ", "WARN ", "ERROR"][level];
  }

  private formatCategory(category: string): string {
    return category.length > 12 ? category.substring(0, 11) + ":" : category.padEnd(12);
  }

  private colorize(level: LogLevel, text: string): string {
    const colors: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: "\x1b[90m",   // Gray
      [LogLevel.INFO]: "\x1b[32m",    // Green
      [LogLevel.WARN]: "\x1b[33m",    // Yellow
      [LogLevel.ERROR]: "\x1b[31m",   // Red
    };
    return `${colors[level]}${text}\x1b[0m`;
  }

  private formatMessage(entry: LogEntry): string {
    let msg = `[${entry.timestamp}] [${this.formatLevel(entry.level)}] [${this.formatCategory(entry.category)}]`;
    if (entry.userId) msg += ` [User:${entry.userId}]`;
    if (entry.sessionId) msg += ` [Session:${entry.sessionId}]`;
    msg += ` ${entry.message}`;
    return msg;
  }

  private writeToFile(entry: LogEntry): void {
    if (!this.config.enableFile) return;
    
    try {
      const logPath = this.config.logFile;
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        if (stats.size > this.config.maxFileSize) {
          this.rotateLogs();
        }
      }
      
      const line = JSON.stringify(entry) + "\n";
      fs.appendFileSync(logPath, line);
    } catch (error) {
      // Silently fail for file writing errors
    }
  }

  log(
    level: LogLevel,
    category: string,
    message: string,
    data?: any,
    sessionId?: string,
    userId?: number
  ): void {
    if (level < this.config.level) return;

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      category,
      message,
      data: data !== undefined ? this.sanitizeData(data) : undefined,
      sessionId,
      userId,
    };

    this.logBuffer.push(entry);

    if (this.config.enableConsole) {
      const formatted = this.formatMessage(entry);
      const colored = this.colorize(level, formatted);
      
      if (entry.data) {
        console.log(colored);
        console.log(this.colorize(level, `  Data: ${JSON.stringify(entry.data, null, 2)}`));
      } else {
        console.log(colored);
      }
    }

    this.writeToFile(entry);
  }

  private sanitizeData(data: any): any {
    if (data === null || data === undefined) return data;
    if (typeof data !== "object") return data;
    
    const sanitized: any = Array.isArray(data) ? [] : {};
    const seen = new Set();
    
    const sanitize = (obj: any, depth: number = 0): any => {
      if (depth > 5) return "[MAX_DEPTH]";
      if (seen.has(obj)) return "[CIRCULAR]";
      if (typeof obj !== "object" || obj === null) return obj;
      
      seen.add(obj);
      
      if (Array.isArray(obj)) {
        return obj.map(item => sanitize(item, depth + 1));
      }
      
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === "string" && value.length > 1000) {
          result[key] = value.substring(0, 1000) + "...[TRUNCATED]";
        } else if (typeof value === "object" && value !== null) {
          result[key] = sanitize(value, depth + 1);
        } else {
          result[key] = value;
        }
      }
      return result;
    };
    
    return sanitize(data);
  }

  debug(category: string, message: string, data?: any, sessionId?: string, userId?: number): void {
    this.log(LogLevel.DEBUG, category, message, data, sessionId, userId);
  }

  info(category: string, message: string, data?: any, sessionId?: string, userId?: number): void {
    this.log(LogLevel.INFO, category, message, data, sessionId, userId);
  }

  warn(category: string, message: string, data?: any, sessionId?: string, userId?: number): void {
    this.log(LogLevel.WARN, category, message, data, sessionId, userId);
  }

  error(category: string, message: string, data?: any, sessionId?: string, userId?: number): void {
    this.log(LogLevel.ERROR, category, message, data, sessionId, userId);
  }

  toolCall(toolName: string, params: any, sessionId?: string, userId?: number): void {
    this.info("TOOL_CALL", `Tool called: ${toolName}`, {
      parameters: params,
    }, sessionId, userId);
  }

  toolResult(toolName: string, success: boolean, result: any, duration: number, sessionId?: string, userId?: number): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    this.log(level, "TOOL_RESULT", `Tool ${toolName} ${success ? "succeeded" : "failed"}`, {
      success,
      duration: `${duration}ms`,
      result: result,
    }, sessionId, userId);
  }

  agentDecision(decision: string, reasoning: string, sessionId?: string, userId?: number): void {
    this.info("AGENT", `Decision: ${decision}`, {
      reasoning,
    }, sessionId, userId);
  }

  memoryOperation(operation: string, details: any, sessionId?: string): void {
    this.debug("MEMORY", `Operation: ${operation}`, details, sessionId);
  }

  messageReceived(source: string, userId: number, messagePreview: string): void {
    this.info("MESSAGE", `[${source}] Message from user ${userId}`, {
      preview: messagePreview.substring(0, 100),
    }, undefined, userId);
  }

  messageSent(destination: string, recipientId: number, messagePreview: string): void {
    this.info("MESSAGE", `Sent to [${destination}] user ${recipientId}`, {
      preview: messagePreview.substring(0, 100),
    }, undefined, recipientId);
  }

  workflowStart(workflowName: string, input: any, sessionId?: string): void {
    this.info("WORKFLOW", `Started: ${workflowName}`, { input }, sessionId);
  }

  workflowStep(workflowName: string, step: string, details: any, sessionId?: string): void {
    this.debug("WORKFLOW", `[${workflowName}] Step: ${step}`, details, sessionId);
  }

  workflowComplete(workflowName: string, result: any, duration: number, sessionId?: string): void {
    this.info("WORKFLOW", `Completed: ${workflowName}`, {
      duration: `${duration}ms`,
      result,
    }, sessionId);
  }

  whatsappEvent(event: string, details: any): void {
    this.info("WHATSAPP", `Event: ${event}`, details);
  }

  autoReplyEvent(event: string, details: any): void {
    this.info("AUTO_REPLY", `Event: ${event}`, details);
  }

  flush(): void {
    // Empty buffer for file writing if needed
    this.logBuffer = [];
  }

  shutdown(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }
    this.flush();
  }

  getRecentLogs(count: number = 100): LogEntry[] {
    if (!this.config.enableFile) return [];
    
    try {
      const logPath = this.config.logFile;
      if (!fs.existsSync(logPath)) return [];
      
      const content = fs.readFileSync(logPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      return lines.slice(-count).map(line => JSON.parse(line));
    } catch (error) {
      return [];
    }
  }

  getLogsByCategory(category: string, count: number = 100): LogEntry[] {
    const logs = this.getRecentLogs(1000);
    return logs.filter(log => log.category.startsWith(category)).slice(-count);
  }

  getLogsByUser(userId: number, count: number = 100): LogEntry[] {
    const logs = this.getRecentLogs(1000);
    return logs.filter(log => log.userId === userId).slice(-count);
  }

  searchLogs(query: string): LogEntry[] {
    const logs = this.getRecentLogs(1000);
    const lowerQuery = query.toLowerCase();
    return logs.filter(log => 
      log.message.toLowerCase().includes(lowerQuery) ||
      log.category.toLowerCase().includes(lowerQuery)
    );
  }
}

export const logger = new Logger();

export function createSessionLogger(sessionId: string, userId?: number): Logger {
  return {
    debug: (category, message, data) => logger.debug(category, message, data, sessionId, userId),
    info: (category, message, data) => logger.info(category, message, data, sessionId, userId),
    warn: (category, message, data) => logger.warn(category, message, data, sessionId, userId),
    error: (category, message, data) => logger.error(category, message, data, sessionId, userId),
    toolCall: (toolName, params) => logger.toolCall(toolName, params, sessionId, userId),
    toolResult: (toolName, success, result, duration) => logger.toolResult(toolName, success, result, duration, sessionId, userId),
    agentDecision: (decision, reasoning) => logger.agentDecision(decision, reasoning, sessionId, userId),
    memoryOperation: (operation, details) => logger.memoryOperation(operation, details, sessionId),
    messageReceived: (source, uid, msg) => logger.messageReceived(source, uid, msg),
    messageSent: (dest, rid, msg) => logger.messageSent(dest, rid, msg),
    workflowStart: (name, input) => logger.workflowStart(name, input, sessionId),
    workflowStep: (name, step, details) => logger.workflowStep(name, step, details, sessionId),
    workflowComplete: (name, result, duration) => logger.workflowComplete(name, result, duration, sessionId),
    whatsappEvent: (event, details) => logger.whatsappEvent(event, details),
    autoReplyEvent: (event, details) => logger.autoReplyEvent(event, details),
    log: (level, category, message, data) => logger.log(level, category, message, data, sessionId, userId),
    flush: () => logger.flush(),
    shutdown: () => logger.shutdown(),
    getRecentLogs: (count) => logger.getRecentLogs(count),
    getLogsByCategory: (cat, count) => logger.getLogsByCategory(cat, count),
    getLogsByUser: (uid, count) => logger.getLogsByUser(uid, count),
    searchLogs: (query) => logger.searchLogs(query),
  } as Logger;
}
