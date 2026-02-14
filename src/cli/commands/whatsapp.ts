import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { whatsappManager } from "../../utils/whatsapp-client.js";

export const whatsappCommand = new Command("whatsapp")
  .description("Manage WhatsApp integration")
  .option("-s, --status", "Check WhatsApp connection status")
  .option("-i, --initialize", "Initialize WhatsApp connection")
  .option("-q, --qr", "Show QR code for scanning")
  .option("-d, --disconnect", "Disconnect WhatsApp")
  .option("-l, --list-chats", "List WhatsApp chats")
  .option("-c, --list-contacts [limit]", "List WhatsApp contacts (optional: limit number)")
  .option("--get-contact <number>", "Get contact info by phone number or LID")
  .option("--lid-to-phone <lid>", "Map LID to phone number (e.g., 187743636676218910@lid)")
  .option("--phone-to-lid <phone>", "Map phone number to LID (e.g., 1234567890)")
  .action(async (options) => {
    console.log(chalk.cyan("\n📱 WhatsApp Management\n"));

    const isReady = whatsappManager.getReadyState();

    // Show QR code
    if (options.qr) {
      if (isReady) {
        console.log(chalk.yellow("⚠️  WhatsApp is already connected"));
        console.log(chalk.gray("  Run 'sybil whatsapp --disconnect' to disconnect first"));
        return;
      }

      console.log(chalk.cyan("📱 WhatsApp QR Code\n"));

      // Listen for QR code event
      whatsappManager.on("qr", (qr: string) => {
        console.log(chalk.white("📱 Scan this QR code with your phone:\n"));
        import("qrcode-terminal").then((qrcodeTerminal) => {
          qrcodeTerminal.default.generate(qr, { small: true });
        });
        console.log(chalk.white("\nOr follow these steps:"));
        console.log(chalk.white("1. Open WhatsApp on your phone"));
        console.log(chalk.white("2. Go to Settings → Linked Devices"));
        console.log(chalk.white("3. Tap 'Link a Device'"));
        console.log(chalk.white("4. Scan the QR code above\n"));
      });

      try {
        await whatsappManager.initialize();
        console.log(chalk.yellow("⏳ Waiting for scan..."));
      } catch (error) {
        console.log(chalk.red("Failed to generate QR code"));
      }

      return;
    }

    // Status check (default if no other options)
    if (options.status || (!options.initialize && !options.disconnect && !options.listChats && !options.listContacts && !options.getContact && !options.lidToPhone && !options.phoneToLid)) {
      const spinner = ora("Checking WhatsApp status...").start();

      try {
        const ready = whatsappManager.getReadyState();
        spinner.stop();

        if (ready) {
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
      if (isReady) {
        console.log(chalk.yellow("⚠️  WhatsApp is already connected"));
        return;
      }

      console.log(chalk.cyan("📱 WhatsApp Initialization"));

      // Listen for QR code event
      whatsappManager.on("qr", (qr: string) => {
        console.log(chalk.white("\n📱 Scan this QR code with your phone:\n"));
        // Using qrcode-terminal to display (same as client)
        import("qrcode-terminal").then((qrcodeTerminal) => {
          qrcodeTerminal.default.generate(qr, { small: true });
        });
        console.log(chalk.white("\nOr follow these steps:"));
        console.log(chalk.white("1. Open WhatsApp on your phone"));
        console.log(chalk.white("2. Go to Settings → Linked Devices"));
        console.log(chalk.white("3. Tap 'Link a Device'"));
        console.log(chalk.white("4. Scan the QR code above\n"));
      });

      const spinner = ora("Initializing WhatsApp...").start();

      try {
        await whatsappManager.initialize();
        spinner.stop();

        console.log(chalk.yellow("⏳ Waiting for connection..."));

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
      if (!isReady) {
        console.log(chalk.yellow("⚠️  WhatsApp is not connected"));
        return;
      }

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
      if (!isReady) {
        console.log(chalk.red("❌ WhatsApp not connected. Run 'sybil whatsapp --initialize' first."));
        return;
      }

      const spinner = ora("Fetching chats...").start();

      try {
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

    if (options.listContacts) {
      if (!isReady) {
        console.log(chalk.red("❌ WhatsApp not connected. Run 'sybil whatsapp --initialize' first."));
        return;
      }

      const spinner = ora("Fetching contacts...").start();
      const limit = options.listContacts === true ? 50 : parseInt(options.listContacts, 10) || 50;

      try {
        const result = await whatsappManager.getAllContacts();
        spinner.stop();

        if (result.success && result.contacts) {
          console.log(chalk.cyan(`\n👥 WhatsApp Contacts (${result.totalContacts} total):\n`));

          result.contacts.slice(0, limit).forEach((contact, index) => {
            const lid = contact.lid ? chalk.gray(` [LID: ${contact.lid}]`) : "";
            const name = contact.name ? `${contact.name}` : chalk.gray("No name");
            console.log(`  ${index + 1}. ${name} - ${contact.number}${lid}`);
          });

          if (result.contacts.length > limit) {
            console.log(chalk.gray(`\n... and ${result.contacts.length - limit} more`));
          }
        } else {
          console.log(chalk.yellow("Could not fetch contacts"));
        }
      } catch (error) {
        spinner.fail(chalk.red("Failed to fetch contacts"));
      }

      return;
    }

    if (options.getContact) {
      if (!isReady) {
        console.log(chalk.red("❌ WhatsApp not connected. Run 'sybil whatsapp --initialize' first."));
        return;
      }

      const spinner = ora("Getting contact info...").start();

      try {
        const result = await whatsappManager.getContact(options.getContact);
        spinner.stop();

        if (result.success && result.contact) {
          console.log(chalk.cyan("\n👤 Contact Info:\n"));
          console.log(`  📱 Number: ${result.contact.number || "N/A"}`);
          console.log(`  👤 Name: ${result.contact.name || "N/A"}`);
          console.log(`  🏢 Business: ${result.contact.isBusiness ? "Yes" : "No"}`);
          if (result.contact.lid) {
            console.log(chalk.cyan(`  🆔 LID: ${result.contact.lid}`));
          }
        } else {
          console.log(chalk.red(`❌ Contact not found: ${result.error}`));
        }
      } catch (error) {
        spinner.fail(chalk.red("Failed to get contact"));
      }

      return;
    }

    if (options.lidToPhone) {
      if (!isReady) {
        console.log(chalk.red("❌ WhatsApp not connected. Run 'sybil whatsapp --initialize' first."));
        return;
      }

      const spinner = ora("Mapping LID to phone number...").start();

      try {
        const result = await whatsappManager.getContactLidAndPhone(options.lidToPhone);
        spinner.stop();

        if (result.success) {
          console.log(chalk.cyan("\n🔗 LID Mapping Result:\n"));
          console.log(`  🆔 LID: ${result.lid || options.lidToPhone}`);
          console.log(`  📱 Phone: ${result.phoneNumber || "Not available (user has privacy enabled)"}`);
          if (result.phoneNumber) {
            console.log(`  📱 Full ID: ${result.phoneNumber}@c.us`);
          }
        } else {
          console.log(chalk.red(`❌ Failed to map LID: ${result.error}`));
        }
      } catch (error) {
        spinner.fail(chalk.red("Failed to map LID"));
      }

      return;
    }

    if (options.phoneToLid) {
      if (!isReady) {
        console.log(chalk.red("❌ WhatsApp not connected. Run 'sybil whatsapp --initialize' first."));
        return;
      }

      const spinner = ora("Mapping phone number to LID...").start();

      try {
        const result = await whatsappManager.getContactLidAndPhone(options.phoneToLid);
        spinner.stop();

        if (result.success) {
          console.log(chalk.cyan("\n🔗 Phone to LID Mapping Result:\n"));
          console.log(`  📱 Phone: ${result.phoneNumber || options.phoneToLid}`);
          console.log(`  🆔 LID: ${result.lid || "Not available"}`);
          if (!result.lid) {
            console.log(chalk.gray("  Note: LID not available - user may not have privacy enabled"));
          }
        } else {
          console.log(chalk.red(`❌ Failed to map phone: ${result.error}`));
        }
      } catch (error) {
        spinner.fail(chalk.red("Failed to map phone number"));
      }

      return;
    }
  });
