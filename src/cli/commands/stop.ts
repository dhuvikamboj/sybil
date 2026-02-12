import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { execSync, spawn } from "child_process";

export const stopCommand = new Command("stop")
  .description("Stop the Sybil agent service")
  .option("-f, --force", "Force stop (kill immediately)")
  .action(async (options) => {
    const spinner = ora("Stopping Sybil...").start();
    
    try {
      // Find Sybil processes
      const checkProcess = spawn("pgrep", ["-f", "sybil"]);
      let pids: string[] = [];
      
      checkProcess.stdout.on("data", (data) => {
        pids = data.toString().trim().split("\n").filter(Boolean);
      });

      await new Promise((resolve) => checkProcess.on("close", resolve));

      if (pids.length === 0) {
        spinner.info(chalk.blue("ℹ️  Sybil is not running"));
        return;
      }

      // Stop processes
      for (const pid of pids) {
        try {
          if (options.force) {
            process.kill(parseInt(pid), "SIGKILL");
          } else {
            process.kill(parseInt(pid), "SIGTERM");
          }
        } catch (error) {
          // Process might already be dead
        }
      }

      // Wait a moment and verify
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      const verifyProcess = spawn("pgrep", ["-f", "sybil"]);
      let stillRunning = false;
      
      verifyProcess.stdout.on("data", () => {
        stillRunning = true;
      });

      await new Promise((resolve) => verifyProcess.on("close", resolve));

      if (stillRunning && options.force) {
        spinner.fail(chalk.red("❌ Some processes could not be stopped"));
        console.log(chalk.yellow("Try: kill -9 <pid>"));
      } else if (stillRunning) {
        spinner.warn(chalk.yellow("⚠️  Some processes still running"));
        console.log(chalk.gray("Use --force to kill immediately"));
      } else {
        spinner.succeed(chalk.green("✅ Sybil stopped successfully"));
      }

    } catch (error) {
      spinner.fail(chalk.red("Failed to stop Sybil"));
      console.error(error);
      process.exit(1);
    }
  });
