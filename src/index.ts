#!/usr/bin/env node
/**
 * Sybil - An autonomous AI agent with Mastra, memory, planning, and Telegram integration
 *
 * Copyright (c) 2024 Fortress LLM, Inc. All rights reserved.
 * Use of this source code is governed by the MIT license that can be
 * found in the LICENSE file.
 */
import "dotenv/config";
import { setupBot, stopBot } from "./utils/telegram.js";
import { mastra } from "./mastra/index.js";
import { whatsappManager } from "./utils/whatsapp-client.js";
import { validateModelConfig, getProviderDisplayName, getModelConfig } from "./utils/model-config.js";
import { logger } from "./utils/logger.js";
import { dynamicToolRegistry } from "./tools/dynamic/registry.js";
import { loadAutoReplyConfigFromEnv } from "./tools/whatsapp-autoreply-tools.js";

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
  process.on("SIGINT", async () => {
    logger.info("APP", "Received SIGINT, shutting down gracefully");
    console.log("\n\n⚠️  Received SIGINT, shutting down gracefully...");
    await stopBot();
    await whatsappManager.destroy();
    logger.shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("APP", "Received SIGTERM, shutting down gracefully");
    console.log("\n\n⚠️  Received SIGTERM, shutting down gracefully...");
    await stopBot();
    await whatsappManager.destroy();
    logger.shutdown();
    process.exit(0);
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
