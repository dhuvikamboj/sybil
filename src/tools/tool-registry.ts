/**
 * Tool Registry for Dynamic Tool Discovery
 * 
 * This module exports all available tools for use with ToolSearchProcessor
 * enabling dynamic tool loading based on user requests.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";

// Import existing tools from other files
import {
  fetchWebContentTool,
  searchWebTool,
  extractStructuredDataTool,
  deepResearchTool
} from "./web-tools.js";

import {
  getWhatsAppStatusTool,
  initializeWhatsAppTool,
  sendWhatsAppMessageTool,
  getWhatsAppChatsTool,
  getWhatsAppMessagesTool,
  getWhatsAppContactTool,
  getMyWhatsAppInfoTool,
  broadcastWhatsAppMessageTool,
} from "./whatsapp-tools.js";

import {
  configureAutoReplyTool,
  approvePendingReplyTool,
} from "./whatsapp-autoreply-tools.js";

// Import extended tools that are actually available
import {
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  executeCodeTool,
  createCalendarEventTool,
  listCalendarEventsTool,
  sendEmailTool,
  queryDatabaseTool,
  postToTwitterTool,
  getAnalyticsReportTool,
} from "./extended-tools.js";

// Import dynamic tool generation tools
import {
  generateToolTool,
  listGeneratedToolsTool,
  deleteGeneratedToolTool,
} from "./dynamic/tool-generator.js";

// Import dynamic skill generation tools
import {
  generateSkillTool,
  learnSkillFromFeedbackTool,
  listSkillsTool,
  activateSkillTool,
  analyzeForSkillOpportunityTool,
} from "../skills/dynamic/skill-generator.js";

import { dynamicToolRegistry } from "./dynamic/registry.js";

/**
 * All available tools for dynamic discovery
 * Total: 32 tools across multiple domains (24 static + 3 dynamic tool generation + 5 dynamic skill generation)
 */
export const allTools = {
  // Web tools (4)
  fetchWebContent: fetchWebContentTool,
  searchWeb: searchWebTool,
  extractStructuredData: extractStructuredDataTool,
  deepResearch: deepResearchTool,

  // WhatsApp tools (10)
  getWhatsAppStatus: getWhatsAppStatusTool,
  initializeWhatsApp: initializeWhatsAppTool,
  sendWhatsAppMessage: sendWhatsAppMessageTool,
  getWhatsAppChats: getWhatsAppChatsTool,
  getWhatsAppMessages: getWhatsAppMessagesTool,
  getWhatsAppContact: getWhatsAppContactTool,
  getMyWhatsAppInfo: getMyWhatsAppInfoTool,
  broadcastWhatsAppMessage: broadcastWhatsAppMessageTool,
  configureAutoReply: configureAutoReplyTool,
  approvePendingReply: approvePendingReplyTool,

  // Filesystem tools (3)
  readFile: readFileTool,
  writeFile: writeFileTool,
  listDirectory: listDirectoryTool,

  // Code execution (1)
  executeCode: executeCodeTool,

  // Calendar tools (2)
  createCalendarEvent: createCalendarEventTool,
  listCalendarEvents: listCalendarEventsTool,

  // Email (1)
  sendEmail: sendEmailTool,

  // Database (1)
  queryDatabase: queryDatabaseTool,

  // Social media (1)
  postToTwitter: postToTwitterTool,

  // Analytics (1)
  getAnalyticsReport: getAnalyticsReportTool,

  // Dynamic tool generation (3)
  generateTool: generateToolTool,
  listGeneratedTools: listGeneratedToolsTool,
  deleteGeneratedTool: deleteGeneratedToolTool,

  // Dynamic skill generation (5)
  generateSkill: generateSkillTool,
  learnSkillFromFeedback: learnSkillFromFeedbackTool,
  listSkills: listSkillsTool,
  activateSkill: activateSkillTool,
  analyzeForSkillOpportunity: analyzeForSkillOpportunityTool,
};

/**
 * Tool count for reference
 */
export const toolCount = Object.keys(allTools).length;

/**
 * Tool categories for organization
 */
export const toolCategories = {
  web: ["fetchWebContent", "searchWeb", "extractStructuredData", "deepResearch"],
  whatsapp: ["getWhatsAppStatus", "initializeWhatsApp", "sendWhatsAppMessage", "getWhatsAppChats", "getWhatsAppMessages", "getWhatsAppContact", "getMyWhatsAppInfo", "broadcastWhatsAppMessage", "configureAutoReply", "approvePendingReply"],
  filesystem: ["readFile", "writeFile", "listDirectory"],
  code: ["executeCode"],
  calendar: ["createCalendarEvent", "listCalendarEvents"],
  email: ["sendEmail"],
  database: ["queryDatabase"],
  social: ["postToTwitter"],
  analytics: ["getAnalyticsReport"],
  dynamic: [
    "generateTool",
    "listGeneratedTools",
    "deleteGeneratedTool",
    "generateSkill",
    "learnSkillFromFeedback",
    "listSkills",
    "activateSkill",
    "analyzeForSkillOpportunity",
  ],
};

/**
 * Get tools by category
 */
export function getToolsByCategory(category: keyof typeof toolCategories): string[] {
  return toolCategories[category] || [];
}

/**
 * Get tool descriptions for search indexing
 * This is used by ToolSearchProcessor for semantic matching
 */
export const toolDescriptions: Record<string, string> = {
  // Web tools
  fetchWebContent: "Fetch and extract content from web pages. Read articles, documentation, or any web content.",
  searchWeb: "Search the web for information. Use DuckDuckGo to find current information.",
  extractStructuredData: "Extract structured data from web pages using CSS selectors. Scrape specific elements.",
  deepResearch: "Perform comprehensive research on topics. Search, read, and synthesize information.",

  // WhatsApp tools
  getWhatsAppStatus: "Check WhatsApp connection status. Verify if WhatsApp is ready.",
  initializeWhatsApp: "Initialize WhatsApp Web connection. Scan QR code to connect.",
  sendWhatsAppMessage: "Send WhatsApp messages to contacts. Use international phone format.",
  getWhatsAppChats: "List WhatsApp conversations. View recent chats.",
  getWhatsAppMessages: "Retrieve WhatsApp message history. View conversation messages.",
  getWhatsAppContact: "Get WhatsApp contact information. View contact details.",
  getMyWhatsAppInfo: "Get my WhatsApp profile information. View my account details.",
  broadcastWhatsAppMessage: "Broadcast WhatsApp message to multiple contacts. Send bulk messages.",
  configureAutoReply: "Configure WhatsApp auto-reply settings. Enable/disable auto-replies.",
  approvePendingReply: "Approve pending WhatsApp auto-replies. Review and send pending messages.",

  // Filesystem tools
  readFile: "Read file contents from the filesystem. Open and view files.",
  writeFile: "Write content to files. Create or update files.",
  listDirectory: "List files and directories. Explore folder contents.",

  // Code execution
  executeCode: "Execute code in sandboxed environment. Run JavaScript, Python, or shell scripts.",

  // Calendar tools
  createCalendarEvent: "Create calendar events and meetings. Schedule appointments.",
  listCalendarEvents: "List upcoming calendar events. View schedule.",

  // Email
  sendEmail: "Send emails. Send notifications and communications.",

  // Database
  queryDatabase: "Query databases using SQL. Retrieve data.",

  // Social media
  postToTwitter: "Post tweets to Twitter. Share updates on social media.",

  // Analytics
  getAnalyticsReport: "Get analytics and reports. View website traffic and metrics.",

  // Dynamic tool generation (3)
  generateTool: "Generate new custom tools based on requirements. Create tools dynamically from natural language descriptions.",
  listGeneratedTools: "List all dynamically generated tools. View custom tools created by the agent.",
  deleteGeneratedTool: "Delete a dynamically generated tool. Remove custom tools when no longer needed.",

  // Dynamic skill generation (5)
  generateSkill: "Create a new skill that teaches the agent how to handle specific tasks. Skills guide behavior in particular domains.",
  learnSkillFromFeedback: "Learn or update a skill based on user feedback. Extract patterns from what worked well.",
  listSkills: "List all available skills that can be activated. Skills enhance agent capabilities.",
  activateSkill: "Activate a skill for use in the current conversation. Skills provide specialized instructions.",
  analyzeForSkillOpportunity: "Analyze interactions to identify opportunities for new skills. Find gaps in capabilities.",
};

/**
 * Export dynamic tool registry for runtime tool loading
 */
export { dynamicToolRegistry };

export default allTools;