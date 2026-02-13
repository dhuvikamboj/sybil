import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { 
  generateOTP, 
  storeOTP, 
  getPendingOTPs, 
  getAuthenticatedUsers,
  cleanupExpiredOTPs,
  revokeAuthentication
} from "../../utils/telegram-auth.js";

export const otpCommand = new Command("otp")
  .description("Manage Telegram user authentication with OTP")
  .option("-g, --generate", "Generate a new OTP for user authentication")
  .option("-l, --list", "List pending OTPs and authenticated users")
  .option("-r, --revoke <chatId>", "Revoke authentication for a user")
  .option("-c, --cleanup", "Clean up expired OTPs")
  .action(async (options) => {
    console.log(chalk.cyan("\n🔐 Telegram OTP Authentication\n"));

    if (options.cleanup) {
      const spinner = ora("Cleaning up expired OTPs...").start();
      cleanupExpiredOTPs();
      spinner.succeed("✅ Expired OTPs cleaned up");
      return;
    }

    if (options.revoke) {
      const chatId = parseInt(options.revoke);
      if (isNaN(chatId)) {
        console.log(chalk.red("❌ Invalid chat ID"));
        process.exit(1);
      }

      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Are you sure you want to revoke access for chat ${chatId}?`,
          default: false,
        },
      ]);

      if (confirm) {
        revokeAuthentication(chatId);
        console.log(chalk.green(`✅ Authentication revoked for chat ${chatId}`));
      } else {
        console.log(chalk.gray("Cancelled"));
      }
      return;
    }

    if (options.list) {
      const pending = getPendingOTPs();
      const users = getAuthenticatedUsers();

      console.log(chalk.bold("\n📋 Pending OTPs:"));
      if (pending.length === 0) {
        console.log(chalk.gray("  No pending OTPs"));
      } else {
        pending.forEach((otp) => {
          const expiresIn = Math.floor((new Date(otp.expiresAt).getTime() - Date.now()) / 60000);
          console.log(`  🔑 Code: ${chalk.yellow(otp.code)} | Expires in: ${chalk.cyan(expiresIn + " min")}`);
        });
      }

      console.log(chalk.bold("\n👥 Authenticated Users:"));
      if (users.length === 0) {
        console.log(chalk.gray("  No authenticated users"));
      } else {
        users.forEach((user) => {
          const date = new Date(user.authenticatedAt).toLocaleString();
          console.log(`  ✅ Chat ID: ${chalk.green(user.chatId)} | Since: ${chalk.gray(date)}`);
        });
      }

      console.log(chalk.gray("\n💡 Use 'sybil otp --generate' to create a new OTP"));
      return;
    }

    // Default: generate new OTP
    if (options.generate || (!options.list && !options.revoke && !options.cleanup)) {
      console.log(chalk.cyan("📱 Generate Authentication OTP\n"));
      
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "What would you like to do?",
          choices: [
            { name: "🆕 Generate new OTP", value: "generate" },
            { name: "📋 Show pending OTPs", value: "show" },
            { name: "👥 List authenticated users", value: "users" },
          ],
          default: "generate",
        },
      ]);

      if (action === "show") {
        const pending = getPendingOTPs();
        console.log(chalk.bold("\nPending OTPs:"));
        if (pending.length === 0) {
          console.log(chalk.gray("  No pending OTPs"));
        } else {
          pending.forEach((otp) => {
            const expiresIn = Math.floor((new Date(otp.expiresAt).getTime() - Date.now()) / 60000);
            console.log(`  🔑 ${chalk.yellow(otp.code)} (expires in ${expiresIn} min)`);
          });
        }
        return;
      }

      if (action === "users") {
        const users = getAuthenticatedUsers();
        console.log(chalk.bold("\nAuthenticated Users:"));
        if (users.length === 0) {
          console.log(chalk.gray("  No authenticated users"));
        } else {
          users.forEach((user) => {
            const date = new Date(user.authenticatedAt).toLocaleString();
            console.log(`  ✅ ${chalk.green(user.chatId)} - ${date}`);
          });
        }
        return;
      }

      // Generate OTP
      const { chatId } = await inquirer.prompt([
        {
          type: "input",
          name: "chatId",
          message: "Enter the user's Telegram Chat ID:",
          default: "pending",
        },
      ]);

      const otp = generateOTP();
      const chatIdNum = chatId === "pending" ? 0 : parseInt(chatId);
      
      if (chatId == "pending" && isNaN(chatIdNum)) {
        console.log(chalk.red("❌ Invalid chat ID"));
        process.exit(1);
      }

      storeOTP(chatIdNum, otp);

      console.log(chalk.green("\n✅ OTP Generated!\n"));
      console.log(chalk.bold("📱 Share this code with the user:"));
      console.log(chalk.yellow(`\n   🔑 ${otp}\n`));
      console.log(chalk.gray("⏰ Valid for: 10 minutes"));
      console.log(chalk.gray("📋 Instructions for user:"));
      console.log(chalk.white("   1. Send the code to the bot"));
      console.log(chalk.white("   2. They will be authenticated automatically"));
      console.log(chalk.white("   3. This is a one-time setup\n"));

      if (chatId === "pending") {
        console.log(chalk.cyan("💡 Note: You set this as 'pending' - the first user who sends this code will be authenticated."));
      }
    }
  });
