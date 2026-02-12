import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { whatsappManager } from "../../utils/whatsapp-client.js";

export const whatsappCommand = new Command("whatsapp")
  .description("Manage WhatsApp integration")
  .option("-s, --status", "Check WhatsApp connection status")
  .option("-i, --initialize", "Initialize WhatsApp connection")
  .option("-d, --disconnect", "Disconnect WhatsApp")
  .option("-l, --list-chats", "List WhatsApp chats")
  .action(async (options) => {
    console.log(chalk.cyan("\n📱 WhatsApp Management\n"));
    
    if (options.status || (!options.initialize && !options.disconnect && !options.listChats)) {
      // Show status
      const spinner = ora("Checking WhatsApp status...").start();
      
      try {
        const isReady = whatsappManager.getReadyState();
        spinner.stop();
        
        if (isReady) {
          const info = await whatsappManager.getMe();
          console.log(chalk.green("✅ WhatsApp Connected"));
          if (info.success && info.info) {
            console.log(`  📱 Number: ${info.info.number}`);
            console.log(`  👤 Name: ${info.info.name || "N/A"}`);
          }
        } else {
          console.log(chalk.yellow("⚠️  WhatsApp Not Connected"));
          console.log(chalk.gray("  Run 'sybil whatsapp --initialize' to connect"));
        }
      } catch (error) {
        spinner.fail(chalk.red("Failed to check status"));
      }
      
      return;
    }

    if (options.initialize) {
      const spinner = ora("Initializing WhatsApp...").start();
      
      try {
        // Initialize WhatsApp
        await whatsappManager.initialize();
        
        spinner.stop();
        console.log(chalk.cyan("📱 WhatsApp Initialization"));
        console.log(chalk.white("\n1. Open WhatsApp on your phone"));
        console.log(chalk.white("2. Go to Settings → Linked Devices"));
        console.log(chalk.white("3. Tap 'Link a Device'"));
        console.log(chalk.white("4. Scan the QR code that will appear\n"));
        
        console.log(chalk.yellow("⏳ Waiting for connection..."));
        
        // Wait for ready state
        let attempts = 0;
        const maxAttempts = 60;
        
        while (attempts < maxAttempts) {
          if (whatsappManager.getReadyState()) {
            console.log(chalk.green("\n✅ WhatsApp connected successfully!"));
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
          attempts++;
        }
        
        console.log(chalk.yellow("\n⚠️  Timeout waiting for connection"));
        console.log(chalk.gray("Please try again or check the logs"));
        
      } catch (error) {
        spinner.fail(chalk.red("Failed to initialize WhatsApp"));
        console.error(error);
      }
      
      return;
    }

    if (options.disconnect) {
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Are you sure you want to disconnect WhatsApp?",
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.blue("Cancelled."));
        return;
      }

      const spinner = ora("Disconnecting WhatsApp...").start();
      
      try {
        await whatsappManager.destroy();
        spinner.succeed(chalk.green("✅ WhatsApp disconnected"));
      } catch (error) {
        spinner.fail(chalk.red("Failed to disconnect"));
      }
      
      return;
    }

    if (options.listChats) {
      const spinner = ora("Fetching chats...").start();
      
      try {
        if (!whatsappManager.getReadyState()) {
          spinner.fail(chalk.red("WhatsApp not connected"));
          return;
        }

        const result = await whatsappManager.getChats();
        spinner.stop();
        
        if (result.success && result.chats) {
          console.log(chalk.cyan(`\n💬 WhatsApp Chats (${result.totalChats} total):\n`));
          
          result.chats.slice(0, 20).forEach((chat, index) => {
            const unread = chat.unreadCount > 0 ? chalk.red(` [${chat.unreadCount} unread]`) : "";
            console.log(`  ${index + 1}. ${chat.name}${unread}`);
          });
          
          if (result.chats.length > 20) {
            console.log(chalk.gray(`\n... and ${result.chats.length - 20} more`));
          }
        } else {
          console.log(chalk.yellow("Could not fetch chats"));
        }
      } catch (error) {
        spinner.fail(chalk.red("Failed to fetch chats"));
      }
      
      return;
    }
  });
