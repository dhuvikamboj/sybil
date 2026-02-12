import "dotenv/config";
import { setupBot, stopBot } from "./utils/telegram.js";
import { mastra } from "./mastra/index.js";
import { whatsappManager } from "./utils/whatsapp-client.js";
import { validateModelConfig, getProviderDisplayName, getModelConfig } from "./utils/model-config.js";
import { logger } from "./utils/logger.js";
import { dynamicToolRegistry } from "./tools/dynamic/registry.js";

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
  console.log();

  logger.info("APP", "Mastra initialized", {
    provider: getProviderDisplayName(),
    model: modelConfig.model,
    agents: ["autonomousAgent"],
    workflows: ["plannerWorkflow", "skillBuilderWorkflow"],
  });

  // Setup Telegram bot
  setupBot();

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
  console.log("📱 WhatsApp integration available (use /whatsapp to setup)");
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
