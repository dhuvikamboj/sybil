#!/usr/bin/env node

/**
 * Sybil CLI
 * Command-line interface for managing Sybil AI Agent
 */

import { Command } from "commander";
import chalk from "chalk";
import figlet from "figlet";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { stopCommand } from "./commands/stop.js";
import { statusCommand } from "./commands/status.js";
import { configCommand } from "./commands/config.js";
import { logsCommand } from "./commands/logs.js";
import { backupCommand } from "./commands/backup.js";
import { restoreCommand } from "./commands/restore.js";
import { updateCommand } from "./commands/update.js";
import { whatsappCommand } from "./commands/whatsapp.js";
import { otpCommand } from "./commands/otp.js";
import { doctorCommand } from "./commands/doctor.js";

const program = new Command();

// Display banner
console.log(
  chalk.cyan(
    figlet.textSync("SYBIL", {
      font: "Big",
      horizontalLayout: "default",
    })
  )
);
console.log(chalk.magenta("   AI Agent Management CLI\n"));

program
  .name("sybil")
  .description("CLI for managing Sybil AI Agent")
  .version("1.0.0");

// Register commands
program.addCommand(initCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(statusCommand);
program.addCommand(configCommand);
program.addCommand(logsCommand);
program.addCommand(backupCommand);
program.addCommand(restoreCommand);
program.addCommand(updateCommand);
program.addCommand(whatsappCommand);
program.addCommand(otpCommand);
program.addCommand(doctorCommand);

// Default action - show help
program.action(() => {
  program.help();
});

program.parse();
