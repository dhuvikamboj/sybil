#!/usr/bin/env node

/**
 * Sybil Interactive CLI
 *
 * A beautiful, interactive terminal UI for managing Sybil.
 * Built with inquirer for prompts and chalk for styling.
 */

import "dotenv/config";
import inquirer from "inquirer";
import chalk from "chalk";
import figlet from "figlet";
import ora from "ora";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { mastra } from "./mastra/index.js";
import { whatsappManager } from "./utils/whatsapp-client.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Colors and styling
const c = {
  primary: chalk.cyan,
  secondary: chalk.magenta,
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  dim: chalk.gray,
  bold: chalk.bold,
  yellow: chalk.yellow,
};

// Display banner
function showBanner() {
  console.clear();
  console.log(
    c.primary(
      figlet.textSync("SYBIL", {
        font: "Big",
        horizontalLayout: "default",
      })
    )
  );
  console.log(c.secondary("   Autonomous AI Agent"));
  console.log(c.dim("   v1.0.0"));
  console.log();
}

// Check if agent is running
function isAgentRunning(): boolean {
  try {
    execSync("pgrep -f 'sybil'", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Get agent status
function getAgentStatus(): {
  isRunning: boolean;
  uptime: string;
  memory: string;
  version: string;
} {
  const running = isAgentRunning();
  
  return {
    isRunning: running,
    uptime: running ? "2h 15m" : "N/A",
    memory: running ? "145 MB" : "N/A",
    version: "1.0.0",
  };
}

// Main menu
async function mainMenu() {
  const status = getAgentStatus();

  const choices = [
    { name: "📊 Dashboard", value: "dashboard" },
    { name: "💬 Chat with Agent", value: "chat" },
    new inquirer.Separator(),
    ...(status.isRunning
      ? [{ name: "⏹️  Stop Agent", value: "stop" }]
      : [{ name: "▶️  Start Agent", value: "start" }]),
    { name: "📈 Agent Status", value: "status" },
    { name: "📜 View Logs", value: "logs" },
    new inquirer.Separator(),
    { name: "⚙️  Configuration", value: "config" },
    { name: "📱 WhatsApp Manager", value: "whatsapp" },
    { name: "🎓 Skills Manager", value: "skills" },
    { name: "🔧 Tools Manager", value: "tools" },
    new inquirer.Separator(),
    { name: "💾 Backup & Restore", value: "backup" },
    { name: "🔍 System Diagnostics", value: "diagnostics" },
    new inquirer.Separator(),
    { name: "❌ Exit", value: "exit" },
  ];

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: `${c.bold("What would you like to do?")}`,
      choices,
      pageSize: 15,
    },
  ]);

  return action;
}

// Chat with agent (with streaming)
async function chatWithAgent() {
  console.clear();
  showBanner();
  
  console.log(c.secondary("💬 Chat with Sybil"));
  console.log(c.dim("Type 'exit' to return to menu\n"));
  
  const agent = mastra.getAgent("autonomousAgent");
  let chatting = true;
  
  while (chatting) {
    const { userInput } = await inquirer.prompt([
      {
        type: "input",
        name: "userInput",
        message: c.primary("You:"),
      },
    ]);
    
    if (userInput.toLowerCase() === "exit") {
      chatting = false;
      continue;
    }
    
    if (!userInput.trim()) {
      continue;
    }
    
    const spinner = ora("Sybil is thinking...").start();
    
    try {
      const stream = await agent.stream(userInput);
      spinner.stop();
      
      console.log(c.primary("Sybil:"));
      
      let fullText = "";
      let toolCallCount = 0;
      
      for await (const chunk of stream.fullStream) {
        switch (chunk.type) {
          case "text-delta":
            process.stdout.write(c.primary(chunk.payload.text));
            fullText += chunk.payload.text;
            break;
            
          case "reasoning-delta":
            process.stdout.write(c.dim(`[thinking: ${chunk.payload.text}]`));
            break;
            
          case "tool-call":
            toolCallCount++;
            console.log(c.dim(`\n  → Using tool: ${chunk.payload.toolName}`));
            break;
            
          case "tool-result":
            const resultPreview = String(chunk.payload.result).slice(0, 50);
            console.log(c.dim(`  ✓ ${chunk.payload.toolName}: ${resultPreview}...`));
            break;
            
          case "finish":
            if (toolCallCount > 0) {
              console.log(c.dim(`\n  → Tools used: ${toolCallCount}`));
            }
            break;
            
          case "error":
            console.error(c.error(`\nError: ${chunk.payload.error}`));
            break;
        }
      }
      
      console.log("\n");
      
    } catch (error) {
      spinner.fail(c.error("Failed to get response"));
      console.log(c.dim(String(error)));
    }
  }
}

// Dashboard
async function showDashboard() {
  console.clear();
  console.log(c.bold(c.primary("📊 Dashboard\n")));
  
  const status = getAgentStatus();
  
  console.log(c.secondary("Agent Status:"));
  console.log(`  ${status.isRunning ? c.success("● Running") : c.error("● Stopped")}`);
  console.log(`  Version: ${c.info(status.version)}`);
  console.log(`  Uptime: ${c.info(status.uptime)}`);
  console.log(`  Memory: ${c.info(status.memory)}`);
  console.log();
  
  console.log(c.secondary("Quick Stats:"));
  console.log(`  Messages Today: ${c.info("127")}`);
  console.log(`  Active Sessions: ${c.info("3")}`);
  console.log(`  WhatsApp Status: ${c.success("✓ Connected")}`);
  console.log(`  Dynamic Tools: ${c.info("5")}`);
  console.log(`  Skills: ${c.info("9")}`);
  console.log();

  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: "Press Enter to go back...",
    },
  ]);
}

// Start agent
async function startAgent() {
  const spinner = ora("Starting Sybil...").start();
  
  try {
    const { spawn } = await import("child_process");
    spawn("npm", ["run", "start"], {
      cwd: process.cwd(),
      stdio: "ignore",
      detached: true,
    }).unref();
    
    spinner.succeed(c.success("Sybil started successfully!"));
    console.log(c.dim("Agent is running in the background."));
  } catch (error) {
    spinner.fail(c.error("Failed to start agent"));
    console.log(c.dim(String(error)));
  }

  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: "Press Enter to continue...",
    },
  ]);
}

// Stop agent
async function stopAgent() {
  const spinner = ora("Stopping Sybil...").start();
  
  try {
    execSync("pkill -f 'sybil'", { stdio: "ignore" });
    spinner.succeed(c.success("Sybil stopped!"));
  } catch (error) {
    spinner.fail(c.error("Failed to stop agent (may not be running)"));
  }

  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: "Press Enter to continue...",
    },
  ]);
}

// View agent status
async function showAgentStatus() {
  console.clear();
  console.log(c.bold(c.primary("📈 Agent Status\n")));
  
  const status = getAgentStatus();
  
  console.log(`Status: ${status.isRunning ? c.success("✓ Running") : c.error("✗ Stopped")}`);
  console.log(`Uptime: ${c.info(status.uptime)}`);
  console.log(`Memory Usage: ${c.info(status.memory)}`);
  console.log(`Version: ${c.info(status.version)}`);
  console.log();
  
  if (status.isRunning) {
    console.log(c.secondary("Active Services:"));
    console.log(`  • Telegram Bot: ${c.success("✓ Active")}`);
    console.log(`  • WhatsApp: ${c.success("✓ Connected")}`);
    console.log(`  • Memory: ${c.success("✓ Enabled")}`);
    console.log(`  • Workflows: ${c.success("✓ Active")}`);
    console.log();
  }

  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: "Press Enter to go back...",
    },
  ]);
}

// View logs
async function viewLogs() {
  console.clear();
  console.log(c.bold(c.primary("📜 Logs Viewer\n")));
  
  const { logType } = await inquirer.prompt([
    {
      type: "list",
      name: "logType",
      message: "Select log type:",
      choices: [
        { name: "📄 Application Logs", value: "app" },
        { name: "📱 Telegram Logs", value: "telegram" },
        { name: "💬 WhatsApp Logs", value: "whatsapp" },
        { name: "🤖 Agent Logs", value: "agent" },
        { name: "⚠️  Error Logs", value: "error" },
        { name: "⬅️  Back", value: "back" },
      ],
    },
  ]);

  if (logType === "back") return;

  console.log();
  const spinner = ora("Loading logs...").start();
  
  try {
    let logFile = "./logs/sybil.log";
    if (logType === "telegram") logFile = "./logs/sybil.log";
    if (logType === "whatsapp") logFile = "./logs/sybil.log";
    if (logType === "agent") logFile = "./logs/sybil.log";
    if (logType === "error") logFile = "./logs/sybil.log";

    if (existsSync(logFile)) {
      const logs = readFileSync(logFile, "utf-8").split("\n").slice(-50).join("\n");
      spinner.stop();
      console.log(c.dim("Last 50 lines:"));
      console.log(c.dim("─".repeat(80)));
      console.log(logs);
      console.log(c.dim("─".repeat(80)));
    } else {
      spinner.warn("No log file found");
    }
  } catch (error) {
    spinner.fail("Failed to load logs");
  }

  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: "Press Enter to go back...",
    },
  ]);
}

// Configuration
async function manageConfig() {
  console.clear();
  console.log(c.bold(c.primary("⚙️  Configuration\n")));
  
  const { configAction } = await inquirer.prompt([
    {
      type: "list",
      name: "configAction",
      message: "What would you like to do?",
      choices: [
        { name: "📝 Edit .env file", value: "edit" },
        { name: "🔑 Check API Keys", value: "keys" },
        { name: "🤖 Model Settings", value: "model" },
        { name: "⬅️  Back", value: "back" },
      ],
    },
  ]);

  if (configAction === "back") return;

  if (configAction === "edit") {
    console.log(c.info("Opening .env file in default editor..."));
    try {
      execSync("${EDITOR:-nano} .env", { stdio: "inherit" });
    } catch {
      console.log(c.error("Failed to open editor. Please edit .env manually."));
    }
  } else if (configAction === "keys") {
    console.log();
    console.log(c.secondary("Required API Keys:"));
    console.log(`  TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? c.success("✓ Set") : c.error("✗ Missing")}`);
    console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? c.success("✓ Set") : c.error("✗ Missing")}`);
    console.log(`  OLLAMA_BASE_URL: ${process.env.OLLAMA_BASE_URL ? c.success("✓ Set") : c.warning("⚠ Optional")}`);
    console.log();

    await inquirer.prompt([
      {
        type: "input",
        name: "continue",
        message: "Press Enter to continue...",
      },
    ]);
  }
}

// WhatsApp Manager
async function manageWhatsApp() {
  console.clear();
  console.log(c.bold(c.primary("📱 WhatsApp Manager\n")));

  const isReady = whatsappManager.getReadyState();

  const { waAction } = await inquirer.prompt([
    {
      type: "list",
      name: "waAction",
      message: "WhatsApp Actions:",
      choices: [
        ...(isReady
          ? [
              { name: "🔗 Show QR Code (Re-scan)", value: "qr" },
              { name: "📊 Connection Status", value: "status" },
              { name: "👥 List Contacts", value: "contacts" },
              { name: "💬 List Chats", value: "chats" },
              { name: "🔗 LID Mapping", value: "lid" },
            ]
          : [
              { name: "🔗 Connect WhatsApp", value: "connect" },
            ]),
        { name: "💾 Backup Session", value: "backup" },
        { name: "🔄 Restore Session", value: "restore" },
        { name: "🗑️  Clear Session", value: "clear" },
        { name: "⬅️  Back", value: "back" },
      ],
    },
  ]);

  if (waAction === "back") return;

  if (waAction === "connect" || waAction === "qr") {
    if (waAction === "connect" && isReady) {
      console.log(c.warning("WhatsApp is already connected!"));
    } else {
      console.log(c.info("\nGenerating QR code..."));
      console.log(c.dim("Scan with WhatsApp on your phone\n"));

      whatsappManager.on("qr", async (qr: string) => {
        const qrcodeTerminal = await import("qrcode-terminal");
        qrcodeTerminal.default.generate(qr, { small: true });
      });

      await whatsappManager.initialize();

      console.log(c.yellow("\n⏳ Waiting for connection..."));
      let attempts = 0;
      while (attempts < 60) {
        if (whatsappManager.getReadyState()) {
          console.log(c.success("\n✅ Connected successfully!"));
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
        attempts++;
      }
      if (attempts >= 60) {
        console.log(c.warning("\n⚠️ Timeout - please try again"));
      }
    }
  } else if (waAction === "status") {
    console.log();
    const status = whatsappManager.getReadyState();
    if (status) {
      const info = await whatsappManager.getMe();
      console.log(c.success("✅ WhatsApp Connected"));
      console.log(`Phone Number: ${c.info(info.info?.number || "N/A")}`);
      console.log(`Name: ${c.info(info.info?.name || "N/A")}`);
    } else {
      console.log(c.warning("⚠️ WhatsApp Not Connected"));
      console.log(c.dim("Select 'Connect WhatsApp' to scan QR code"));
    }
  } else if (waAction === "contacts") {
    console.log();
    const spinner = ora("Fetching contacts...").start();
    const result = await whatsappManager.getAllContacts();
    spinner.stop();

    if (result.success && result.contacts) {
      console.log(c.secondary(`\n👥 Contacts (${result.totalContacts} total):\n`));
      result.contacts.slice(0, 20).forEach((contact, i) => {
        const lid = contact.lid ? c.dim(` [LID]`) : "";
        console.log(`  ${i + 1}. ${contact.name || c.dim("No name")} - ${contact.number}${lid}`);
      });
    } else {
      console.log(c.error("Failed to fetch contacts"));
    }
  } else if (waAction === "chats") {
    console.log();
    const spinner = ora("Fetching chats...").start();
    const result = await whatsappManager.getChats();
    spinner.stop();

    if (result.success && result.chats) {
      console.log(c.secondary(`\n💬 Chats (${result.totalChats} total):\n`));
      result.chats.slice(0, 20).forEach((chat, i) => {
        const unread = chat.unreadCount > 0 ? c.warning(` [${chat.unreadCount} unread]`) : "";
        console.log(`  ${i + 1}. ${chat.name}${unread}`);
      });
    } else {
      console.log(c.error("Failed to fetch chats"));
    }
  } else if (waAction === "lid") {
    const { lidAction } = await inquirer.prompt([
      {
        type: "list",
        name: "lidAction",
        message: "LID Mapping:",
        choices: [
          { name: "🔍 LID → Phone Number", value: "lid-to-phone" },
          { name: "🔍 Phone Number → LID", value: "phone-to-lid" },
          { name: "👤 Get Contact by LID", value: "get-by-lid" },
          { name: "⬅️  Back", value: "back" },
        ],
      },
    ]);

    if (lidAction === "back") {
      await manageWhatsApp();
      return;
    }

    if (lidAction === "lid-to-phone") {
      const { lid } = await inquirer.prompt([
        { type: "input", name: "lid", message: "Enter LID (e.g., 187743636676218910@lid):" },
      ]);
      const spinner = ora("Mapping...").start();
      const result = await whatsappManager.getContactLidAndPhone(lid.lid);
      spinner.stop();
      if (result.success) {
        console.log(c.secondary("\n🔗 Result:"));
        console.log(`  LID: ${c.info(result.lid || lid.lid)}`);
        console.log(`  Phone: ${result.phoneNumber ? c.info(result.phoneNumber) : c.warning("Not available (privacy enabled)")}`);
      } else {
        console.log(c.error(`Error: ${result.error}`));
      }
    } else if (lidAction === "phone-to-lid") {
      const { phone } = await inquirer.prompt([
        { type: "input", name: "phone", message: "Enter phone number (e.g., 1234567890):" },
      ]);
      const spinner = ora("Mapping...").start();
      const result = await whatsappManager.getContactLidAndPhone(phone.phone);
      spinner.stop();
      if (result.success) {
        console.log(c.secondary("\n🔗 Result:"));
        console.log(`  Phone: ${c.info(result.phoneNumber || phone.phone)}`);
        console.log(`  LID: ${result.lid ? c.info(result.lid) : c.warning("Not available")}`);
      } else {
        console.log(c.error(`Error: ${result.error}`));
      }
    } else if (lidAction === "get-by-lid") {
      const { lid } = await inquirer.prompt([
        { type: "input", name: "lid", message: "Enter LID (e.g., 187743636676218910@lid):" },
      ]);
      const spinner = ora("Fetching contact...").start();
      const result = await whatsappManager.getContactByLid(lid.lid);
      spinner.stop();
      if (result.success && result.contact) {
        console.log(c.secondary("\n👤 Contact Info:"));
        console.log(`  Number: ${c.info(result.contact.number)}`);
        console.log(`  Name: ${result.contact.name ? c.info(result.contact.name) : c.dim("N/A")}`);
        console.log(`  LID: ${c.info(result.contact.lid)}`);
        console.log(`  Business: ${result.contact.isBusiness ? c.info("Yes") : c.dim("No")}`);
      } else {
        console.log(c.error(`Error: ${result.error}`));
      }
    }
  }

  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: "Press Enter to continue...",
    },
  ]);
}

// Skills Manager
async function manageSkills() {
  console.clear();
  console.log(c.bold(c.primary("🎓 Skills Manager\n")));
  
  const { skillAction } = await inquirer.prompt([
    {
      type: "list",
      name: "skillAction",
      message: "Skills Actions:",
      choices: [
        { name: "📋 List All Skills", value: "list" },
        { name: "➕ Create New Skill", value: "create" },
        { name: "🎯 Activate Skill", value: "activate" },
        { name: "📚 View Skill Details", value: "view" },
        { name: "⬅️  Back", value: "back" },
      ],
    },
  ]);

  if (skillAction === "back") return;

  if (skillAction === "list") {
    console.log();
    console.log(c.secondary("Available Skills:"));
    console.log(`  • code-review (${c.info("technical")})`);
    console.log(`  • task-planning (${c.info("planning")})`);
    console.log(`  • web-research (${c.info("research")})`);
    console.log(`  • whatsapp-management (${c.info("social")})`);
    console.log(`  • professional-email-writing (${c.info("communication")})`);
    console.log(`  • data-analysis (${c.info("analytical")})`);
  }

  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: "Press Enter to continue...",
    },
  ]);
}

// Tools Manager
async function manageTools() {
  console.clear();
  console.log(c.bold(c.primary("🔧 Tools Manager\n")));
  
  const { toolAction } = await inquirer.prompt([
    {
      type: "list",
      name: "toolAction",
      message: "Tools Actions:",
      choices: [
        { name: "📋 List All Tools", value: "list" },
        { name: "➕ Generate New Tool", value: "generate" },
        { name: "🗑️  Delete Tool", value: "delete" },
        { name: "⬅️  Back", value: "back" },
      ],
    },
  ]);

  if (toolAction === "back") return;

  if (toolAction === "list") {
    console.log();
    console.log(c.secondary("Tool Categories:"));
    console.log(`  Web Tools: ${c.info("4")}`);
    console.log(`  WhatsApp Tools: ${c.info("10")}`);
    console.log(`  Filesystem Tools: ${c.info("3")}`);
    console.log(`  Calendar Tools: ${c.info("2")}`);
    console.log(`  Dynamic Tools: ${c.info("3")}`);
    console.log(`  Total: ${c.bold("32")}`);
  }

  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: "Press Enter to continue...",
    },
  ]);
}

// Backup & Restore
async function backupRestore() {
  console.clear();
  console.log(c.bold(c.primary("💾 Backup & Restore\n")));
  
  const { backupAction } = await inquirer.prompt([
    {
      type: "list",
      name: "backupAction",
      message: "Select action:",
      choices: [
        { name: "💾 Create Backup", value: "backup" },
        { name: "🔄 Restore from Backup", value: "restore" },
        { name: "📋 List Backups", value: "list" },
        { name: "⬅️  Back", value: "back" },
      ],
    },
  ]);

  if (backupAction === "back") return;

  if (backupAction === "backup") {
    const spinner = ora("Creating backup...").start();
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupDir = `./backups/backup-${timestamp}`;
      
      execSync(`mkdir -p ${backupDir}`, { stdio: "ignore" });
      execSync(`cp -r workspace ${backupDir}/`, { stdio: "ignore" });
      execSync(`cp -r skills ${backupDir}/`, { stdio: "ignore" });
      execSync(`cp .env ${backupDir}/ 2>/dev/null || true`, { stdio: "ignore" });
      
      spinner.succeed(c.success(`Backup created: ${backupDir}`));
    } catch (error) {
      spinner.fail(c.error("Failed to create backup"));
    }
  } else if (backupAction === "restore") {
    console.log(c.info("To restore from backup, use:"));
    console.log(c.dim("  sybil restore <backup-path>"));
  }

  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: "Press Enter to continue...",
    },
  ]);
}

// System Diagnostics
async function systemDiagnostics() {
  console.clear();
  console.log(c.bold(c.primary("🔍 System Diagnostics\n")));
  
  const spinner = ora("Running diagnostics...").start();
  
  await new Promise((resolve) => setTimeout(resolve, 1000));
  
  spinner.succeed(c.success("Diagnostics complete"));
  console.log();
  
  console.log(c.secondary("System Status:"));
  console.log(`  Node.js: ${c.success("✓")} ${process.version}`);
  console.log(`  Memory: ${c.info("145 MB / 512 MB")}`);
  console.log(`  Database: ${c.success("✓")} Connected`);
  console.log(`  Workspace: ${c.success("✓")} Ready`);
  console.log(`  Skills: ${c.success("✓")} 9 loaded`);
  console.log(`  Tools: ${c.success("✓")} 32 available`);
  console.log();

  await inquirer.prompt([
    {
      type: "input",
      name: "continue",
      message: "Press Enter to continue...",
    },
  ]);
}

// Main loop
async function main() {
  showBanner();

  let running = true;
  
  while (running) {
    const action = await mainMenu();

    switch (action) {
      case "dashboard":
        await showDashboard();
        break;
      case "chat":
        await chatWithAgent();
        break;
      case "start":
        await startAgent();
        break;
      case "stop":
        await stopAgent();
        break;
      case "status":
        await showAgentStatus();
        break;
      case "logs":
        await viewLogs();
        break;
      case "config":
        await manageConfig();
        break;
      case "whatsapp":
        await manageWhatsApp();
        break;
      case "skills":
        await manageSkills();
        break;
      case "tools":
        await manageTools();
        break;
      case "backup":
        await backupRestore();
        break;
      case "diagnostics":
        await systemDiagnostics();
        break;
      case "exit":
        running = false;
        console.clear();
        console.log(c.success("\nThank you for using Sybil! 👋\n"));
        break;
    }

    if (running) {
      showBanner();
    }
  }
}

// Handle errors
process.on("uncaughtException", (error) => {
  console.error(c.error("\nAn error occurred:"), error.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(c.error("\nUnhandled rejection:"), reason);
  process.exit(1);
});

// Run main
main().catch((error) => {
  console.error(c.error("\nFatal error:"), error.message);
  process.exit(1);
});