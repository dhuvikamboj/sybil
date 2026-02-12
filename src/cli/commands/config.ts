import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export const configCommand = new Command("config")
  .description("Manage Sybil configuration")
  .option("-g, --get <key>", "Get configuration value")
  .option("-s, --set <keyvalue>", "Set configuration value (format: key=value)")
  .option("-l, --list", "List all configuration")
  .option("-e, --edit", "Edit configuration interactively")
  .action(async (options) => {
    const envPath = join(process.cwd(), ".env");
    
    if (!existsSync(envPath)) {
      console.log(chalk.red("❌ Sybil not initialized. Run 'sybil init' first."));
      process.exit(1);
    }

    const spinner = ora("Reading configuration...").start();
    
    try {
      const envContent = readFileSync(envPath, "utf-8");
      const config: Record<string, string> = {};
      
      // Parse env file
      envContent.split("\n").forEach((line) => {
        const match = line.match(/^([^#][^=]*)=(.*)$/);
        if (match) {
          config[match[1].trim()] = match[2].trim();
        }
      });

      spinner.stop();

      if (options.get) {
        // Get specific key
        const value = config[options.get];
        if (value) {
          console.log(chalk.cyan(`${options.get}=${value}`));
        } else {
          console.log(chalk.yellow(`Key '${options.get}' not found`));
        }
      } else if (options.set) {
        // Set key=value
        const [key, ...valueParts] = options.set.split("=");
        const value = valueParts.join("=");
        
        if (!key || value === undefined) {
          console.log(chalk.red("❌ Invalid format. Use: key=value"));
          process.exit(1);
        }

        config[key] = value;
        
        // Write back
        const newContent = Object.entries(config)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n");
        
        writeFileSync(envPath, newContent);
        console.log(chalk.green(`✅ Set ${key}=${value}`));
      } else if (options.list) {
        // List all config
        console.log(chalk.cyan("\n📋 Current Configuration:\n"));
        
        Object.entries(config).forEach(([key, value]) => {
          // Mask sensitive values
          const displayValue = key.toLowerCase().includes("token") || 
                               key.toLowerCase().includes("key") ||
                               key.toLowerCase().includes("secret")
            ? "***"
            : value;
          console.log(`  ${chalk.bold(key)}: ${displayValue}`);
        });
      } else if (options.edit) {
        // Interactive edit
        const answers = await inquirer.prompt([
          {
            type: "list",
            name: "action",
            message: "What would you like to do?",
            choices: [
              { name: "Change AI Provider", value: "provider" },
              { name: "Update API Key", value: "apikey" },
              { name: "Change Model", value: "model" },
              { name: "Toggle WhatsApp", value: "whatsapp" },
              { name: "View/Edit Raw .env", value: "raw" },
            ],
          },
        ]);

        switch (answers.action) {
          case "provider":
            const { provider } = await inquirer.prompt([
              {
                type: "list",
                name: "provider",
                message: "Select new provider:",
                choices: ["openai", "anthropic", "google", "groq", "ollama", "nvidia"],
                default: config.AI_PROVIDER || "openai",
              },
            ]);
            config.AI_PROVIDER = provider;
            break;
            
          case "apikey":
            const { apiKey } = await inquirer.prompt([
              {
                type: "password",
                name: "apiKey",
                message: "Enter new API Key:",
                mask: "*",
              },
            ]);
            const providerKey = `${(config.AI_PROVIDER || "openai").toUpperCase()}_API_KEY`;
            config[providerKey] = apiKey;
            break;
            
          case "model":
            const { model } = await inquirer.prompt([
              {
                type: "input",
                name: "model",
                message: "Enter model name:",
                default: config[`${(config.AI_PROVIDER || "openai").toUpperCase()}_MODEL`] || "gpt-4o",
              },
            ]);
            const modelKey = `${(config.AI_PROVIDER || "openai").toUpperCase()}_MODEL`;
            config[modelKey] = model;
            break;
            
          case "whatsapp":
            const { enableWhatsApp } = await inquirer.prompt([
              {
                type: "confirm",
                name: "enableWhatsApp",
                message: "Enable WhatsApp integration?",
                default: config.ENABLE_WHATSAPP === "true",
              },
            ]);
            config.ENABLE_WHATSAPP = enableWhatsApp.toString();
            break;
            
          case "raw":
            console.log(chalk.gray("\nEdit .env file manually\n"));
            console.log(envContent);
            return;
        }

        // Save changes
        const newContent = Object.entries(config)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n");
        
        writeFileSync(envPath, newContent);
        console.log(chalk.green("\n✅ Configuration updated"));
        console.log(chalk.yellow("\n⚠️  Restart Sybil for changes to take effect"));
      } else {
        // Default: show help
        console.log(chalk.cyan("\n📋 Configuration Management\n"));
        console.log(chalk.white("Usage:"));
        console.log(chalk.gray("  sybil config -g, --get <key>     Get a value"));
        console.log(chalk.gray("  sybil config -s, --set <k=v>     Set a value"));
        console.log(chalk.gray("  sybil config -l, --list          List all config"));
        console.log(chalk.gray("  sybil config -e, --edit          Edit interactively"));
      }

    } catch (error) {
      spinner.fail(chalk.red("Failed to read configuration"));
      console.error(error);
      process.exit(1);
    }
  });
