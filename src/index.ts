#!/usr/bin/env node
/**
 * Sybil - An autonomous AI agent with Mastra, memory, planning, and Telegram integration
 *
 * Copyright (c) 2024 Fortress LLM, Inc. All rights reserved.
 * Use of this source code is governed by the MIT license that can be
 * found in the LICENSE file.
 */

// Increase max listeners to prevent MaxListenersExceededWarning from numerous dependencies
process.setMaxListeners(20);

import "dotenv/config";
import { setupBot, stopBot } from "./utils/telegram.js";
import { mastra } from "./mastra/index.js";
import { whatsappManager } from "./utils/whatsapp-client.js";
import { validateModelConfig, getProviderDisplayName, getModelConfig } from "./utils/model-config.js";
import { logger } from "./utils/logger.js";
import { dynamicToolRegistry } from "./tools/dynamic/registry.js";
import { loadAutoReplyConfigFromEnv } from "./tools/whatsapp-autoreply-tools.js";
import { schedulerService } from "./services/scheduler-service.js";
import { SchedulerEventHandler } from "./services/scheduler-handler.js";
import { setupPodman, cleanupDefaultSandbox } from "./tools/podman-workspace.js";
import * as os from "os";
import * as path from "path";

async function main(): Promise<void> {
  console.log("🚀 Starting sybil...\n");

  logger.info("APP", "Starting sybil");

  // Verify Telegram token (always required)
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    logger.error("APP", "Missing TELEGRAM_BOT_TOKEN environment variable");
    console.error("❌ Missing required environment variable: TELEGRAM_BOT_TOKEN");
    console.error("\nPlease create a .env file with this variable.");
    process.exit(1);
  }

  // Validate model configuration
  const modelValidation = validateModelConfig();
  if (!modelValidation.valid) {
    logger.error("APP", `Model configuration error: ${modelValidation.error}`);
    console.error(`❌ Model configuration error: ${modelValidation.error}`);
    console.error("\nPlease check your environment variables for the AI provider.");
    process.exit(1);
  }

  const modelConfig = getModelConfig();

  // Initialize Mastra
  console.log("✅ Mastra initialized");
  console.log(` - Provider: ${getProviderDisplayName()}`);
  console.log(` - Model: ${modelConfig.model}`);
  console.log(" - Agents: autonomousAgent");
  console.log(" - Workflows: plannerWorkflow, skillBuilderWorkflow");
  console.log(" - Storage: LibSQL (SQLite)");
  console.log(" - Memory: Working Memory + Semantic Recall enabled");

  // Initialize Podman Workspace
  try {
    const autoStart = process.env.PODMAN_AUTO_START === 'true';
    const workspaceDir = process.env.PODMAN_WORKSPACE_DIR || path.join(os.homedir(), '.sybil', 'podman-workspace');
    
    const sandbox = await setupPodman(false, { 
      autoStart, 
      workspaceDir 
    });
    
    if (sandbox) {
      console.log(` ✅ Podman container running and ready`);
    } else {
      console.log(` ✅ Podman setup complete (container will start on-demand)`);
    }
  } catch (error: any) {
    console.warn(` ⚠️  Podman setup skipped: ${error.message}`);
  }

  // Load dynamic tools
  try {
    await dynamicToolRegistry.loadAllTools();
    console.log(` - Dynamic Tools: ${dynamicToolRegistry.getToolCount()} loaded`);
  } catch (error) {
    console.log(" - Dynamic Tools: 0 loaded (none available yet)");
  }

  // Load auto-reply config from environment
  loadAutoReplyConfigFromEnv();
  console.log();

  logger.info("APP", "Mastra initialized", {
    provider: getProviderDisplayName(),
    model: modelConfig.model,
    agents: ["autonomousAgent"],
    workflows: ["plannerWorkflow", "skillBuilderWorkflow"],
  });

  // Setup Telegram bot
  setupBot();

  // Initialize Scheduler
  console.log("⏰ Initializing Scheduler...");
  try {
    const schedulerHandler = new SchedulerEventHandler(schedulerService);
    const stats = schedulerService.getStats();
    console.log(` ✅ Scheduler Ready: ${stats.totalTasks} tasks loaded (${stats.enabledTasks} enabled)`);
  } catch (error) {
    console.log(` ❌ Scheduler failed to initialize: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  console.log();

  // Initialize WhatsApp (auto-connect if session exists)
  console.log("📱 Initializing WhatsApp...");
  try {
    await whatsappManager.initialize();
    
    // Wait briefly for connection
    let waReady = false;
    for (let i = 0; i < 10; i++) {
      if (whatsappManager.getReadyState()) {
        waReady = true;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    
    if (waReady) {
      const waInfo = await whatsappManager.getMe();
      console.log(` ✅ WhatsApp Connected: ${waInfo.info?.number || "Ready"}`);
    } else {
      console.log(` ⚠️  WhatsApp QR code pending (scan with WhatsApp to connect)`);
    }
  } catch (error) {
    console.log(` ❌ WhatsApp failed to initialize: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  console.log();

  // Handle graceful shutdown
  let isShuttingDown = false; // Prevent multiple shutdown attempts
  
  const doShutdown = async () => {
    if (isShuttingDown) {
      return; // Already shutting down
    }
    isShuttingDown = true;
    
    logger.info("APP", "Shutting down gracefully");
    console.log("\n\n⚠️  Shutting down gracefully...");
    
    try {
      await stopBot();
    } catch (error) {
      console.error("Error stopping bot:", error);
    }
    
    try {
      await whatsappManager.destroy();
    } catch (error) {
      console.error("Error destroying WhatsApp manager:", error);
    }
    
    try {
      schedulerService.shutdown();
    } catch (error) {
      console.error("Error shutting down scheduler:", error);
    }
    
    // Cleanup Podman container
    try {
      await cleanupDefaultSandbox({ deleteWorkspace: false });
      console.log("✓ Podman container stopped");
    } catch (error) {
      // Ignore cleanup errors
    }
    
    try {
      logger.shutdown();
    } catch (error) {
      console.error("Error shutting down logger:", error);
    }
    
    console.log("✓ Shutdown complete");
    
    // Force exit after cleanup
    process.exit(0);
  };

  process.on("SIGINT", () => {
    doShutdown().catch((error) => {
      console.error("Fatal error during shutdown:", error);
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    doShutdown().catch((error) => {
      console.error("Fatal error during shutdown:", error);
      process.exit(1);
    });
  });
  
  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("APP", "Uncaught exception", { error: error.message, stack: error.stack });
    console.error("Uncaught exception:", error);
    doShutdown().catch(() => process.exit(1));
  });
  
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("APP", "Unhandled rejection", { reason, promise });
    console.error("Unhandled rejection at:", promise, "reason:", reason);
    // Don't exit on unhandled rejection, just log it
  });

  console.log("\n✨ sybil is fully operational!");
  console.log("📝 Send /start to your bot on Telegram to begin");
  console.log("📋 Logs are saved to: ./logs/sybil.log\n");

  logger.info("APP", "sybil is fully operational");
}

// Start the bot
main().catch((error) => {
  logger.error("APP", "Fatal error starting bot", {
    error: error instanceof Error ? error.message : "Unknown error",
  });
  console.error("Fatal error starting bot:", error);
  process.exit(1);
});
