import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export const startCommand = new Command("start")
  .description("Start the Sybil agent service")
  .option("-d, --daemon", "Run as background daemon")
  .option("-p, --port <port>", "Port for web interface", "3000")
  .action(async (options) => {
    const spinner = ora("Starting Sybil...").start();
    
    try {
      // Check if .env exists
      if (!existsSync(join(process.cwd(), ".env"))) {
        spinner.fail(chalk.red("❌ Sybil not initialized. Run 'sybil init' first."));
        process.exit(1);
      }

      // Check if already running
      const checkProcess = spawn("pgrep", ["-f", "sybil"]);
      let isRunning = false;
      
      checkProcess.stdout.on("data", () => {
        isRunning = true;
      });

      await new Promise((resolve) => checkProcess.on("close", resolve));

      if (isRunning) {
        spinner.warn(chalk.yellow("⚠️  Sybil is already running"));
        console.log(chalk.blue("Use 'sybil status' to check details"));
        return;
      }

      spinner.stop();

      if (options.daemon) {
        // Start as daemon using PM2 or nohup
        console.log(chalk.cyan("🚀 Starting Sybil as daemon...\n"));
        
        const child = spawn("nohup", ["npm", "run", "start"], {
          detached: true,
          stdio: "ignore",
          env: { ...process.env, PORT: options.port },
        });
        
        child.unref();
        
        console.log(chalk.green("✅ Sybil started in background"));
        console.log(chalk.white(`📊 Web interface: http://localhost:${options.port}`));
        console.log(chalk.gray("\nTo stop: sybil stop"));
      } else {
        // Start in foreground
        console.log(chalk.cyan("🚀 Starting Sybil...\n"));
        console.log(chalk.gray("Press Ctrl+C to stop\n"));
        
        const child = spawn("npm", ["run", "start"], {
          stdio: "inherit",
          env: { ...process.env, PORT: options.port },
        });

        child.on("error", (error) => {
          console.error(chalk.red("Failed to start:"), error.message);
          process.exit(1);
        });
      }

    } catch (error) {
      spinner.fail(chalk.red("Failed to start Sybil"));
      console.error(error);
      process.exit(1);
    }
  });
