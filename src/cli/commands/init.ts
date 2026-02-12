import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const initCommand = new Command("init")
  .description("Initialize a new Sybil agent instance")
  .option("-d, --dir <directory>", "Installation directory", process.cwd())
  .action(async (options) => {
    const spinner = ora("Initializing Sybil...").start();
    
    try {
      console.log(chalk.cyan("\n🚀 Welcome to Sybil Setup!\n"));
      
      // Check if already initialized
      const envPath = join(options.dir, ".env");
      if (existsSync(envPath)) {
        spinner.warn(chalk.yellow("Sybil is already initialized in this directory"));
        const { overwrite } = await inquirer.prompt([
          {
            type: "confirm",
            name: "overwrite",
            message: "Do you want to reconfigure?",
            default: false,
          },
        ]);
        
        if (!overwrite) {
          console.log(chalk.blue("Setup cancelled."));
          return;
        }
      }

      spinner.stop();

      // Configuration wizard
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "telegramToken",
          message: "Enter your Telegram Bot Token:",
          validate: (input) => input.length > 0 || "Token is required",
        },
        {
          type: "list",
          name: "provider",
          message: "Choose your AI provider:",
          choices: [
            { name: "OpenAI (Recommended)", value: "openai" },
            { name: "Anthropic (Claude)", value: "anthropic" },
            { name: "Google (Gemini)", value: "google" },
            { name: "Groq (Fast)", value: "groq" },
            { name: "Ollama (Local)", value: "ollama" },
            { name: "NVIDIA AI", value: "nvidia" },
          ],
          default: "openai",
        },
        {
          type: "input",
          name: "apiKey",
          message: (answers) => `Enter your ${answers.provider.toUpperCase()} API Key:`,
          validate: (input) => input.length > 0 || "API Key is required",
          when: (answers) => answers.provider !== "ollama",
        },
        {
          type: "input",
          name: "model",
          message: "Enter the model name (press Enter for default):",
          default: (answers: { provider: string }) => {
            const defaults: Record<string, string> = {
              openai: "gpt-4o",
              anthropic: "claude-4-5-sonnet",
              google: "gemini-2.5-flash",
              groq: "llama-3.3-70b-versatile",
              ollama: "llama3.2",
              nvidia: "nvidia/llama-3.1-nemotron-70b-instruct",
            };
            return defaults[answers.provider] || "gpt-4o";
          },
        },
        {
          type: "confirm",
          name: "enableWhatsApp",
          message: "Enable WhatsApp integration?",
          default: true,
        },
        {
          type: "confirm",
          name: "createDesktopEntry",
          message: "Create desktop shortcut?",
          default: true,
          when: () => process.platform === "linux" || process.platform === "darwin",
        },
      ]);

      spinner.start("Creating configuration...");

      // Create .env file
      const envContent = `# Sybil Configuration
# Generated on ${new Date().toISOString()}

# Required
TELEGRAM_BOT_TOKEN=${answers.telegramToken}

# AI Provider Configuration
AI_PROVIDER=${answers.provider}
${answers.apiKey ? `${answers.provider.toUpperCase()}_API_KEY=${answers.apiKey}` : ""}
${answers.provider.toUpperCase()}_MODEL=${answers.model}

# Ollama Configuration (if using Ollama)
${answers.provider === "ollama" ? `OLLAMA_BASE_URL=http://localhost:11434` : ""}

# WhatsApp Configuration
ENABLE_WHATSAPP=${answers.enableWhatsApp}

# Storage
DATABASE_URL=file:./mastra.db

# Session Persistence
# Sessions are saved to ~/.sybil/
`;

      writeFileSync(envPath, envContent);

      // Create data directory
      const dataDir = join(homedir(), ".sybil");
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      spinner.succeed(chalk.green("✅ Sybil initialized successfully!"));

      console.log(chalk.cyan("\n📋 Next Steps:"));
      console.log(chalk.white("  1. Review your .env file"));
      console.log(chalk.white("  2. Run: sybil start"));
      console.log(chalk.white("  3. Start chatting with your bot on Telegram!"));
      
      if (answers.enableWhatsApp) {
        console.log(chalk.white("  4. Scan the QR code to connect WhatsApp"));
      }

    } catch (error) {
      spinner.fail(chalk.red("Failed to initialize Sybil"));
      console.error(error);
      process.exit(1);
    }
  });
