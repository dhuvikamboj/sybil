import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const statusCommand = new Command("status")
  .description("Check Sybil agent status and health")
  .action(async () => {
    const spinner = ora("Checking status...").start();
    
    try {
      console.log(chalk.cyan("\n📊 Sybil Status Report\n"));
      
      // Check if initialized
      const envPath = join(process.cwd(), ".env");
      const isInitialized = existsSync(envPath);
      
      console.log(chalk.bold("Configuration:"));
      console.log(`  ${isInitialized ? chalk.green("✅") : chalk.red("❌")} Initialized: ${isInitialized ? "Yes" : "No"}`);
      
      if (isInitialized) {
        const envContent = readFileSync(envPath, "utf-8");
        const provider = envContent.match(/AI_PROVIDER=(.+)/)?.[1] || "unknown";
        console.log(`  🤖 AI Provider: ${chalk.cyan(provider)}`);
      }
      
      // Check if running
      const checkProcess = spawn("pgrep", ["-f", "sybil"]);
      let isRunning = false;
      let pid = "";
      
      checkProcess.stdout.on("data", (data) => {
        isRunning = true;
        pid = data.toString().trim().split("\n")[0];
      });

      await new Promise((resolve) => checkProcess.on("close", resolve));
      
      console.log(chalk.bold("\nProcess Status:"));
      console.log(`  ${isRunning ? chalk.green("🟢") : chalk.red("🔴")} Running: ${isRunning ? "Yes" : "No"}`);
      
      if (isRunning && pid) {
        console.log(`  🆔 PID: ${chalk.gray(pid)}`);
      }
      
      // Check data directory
      const dataDir = join(homedir(), ".sybil");
      const hasDataDir = existsSync(dataDir);
      
      console.log(chalk.bold("\nData Directory:"));
      console.log(`  📁 Location: ${chalk.gray(dataDir)}`);
      console.log(`  ${hasDataDir ? chalk.green("✅") : chalk.red("❌")} Exists: ${hasDataDir ? "Yes" : "No"}`);
      
      // Memory usage (if running)
      if (isRunning && pid) {
        try {
          const { execSync } = await import("child_process");
          const memInfo = execSync(`ps -p ${pid} -o %mem=`, { encoding: "utf-8" }).trim();
          console.log(chalk.bold("\nResource Usage:"));
          console.log(`  💾 Memory: ${chalk.yellow(memInfo + "%")}`);
        } catch {
          // Ignore
        }
      }
      
      spinner.stop();
      
      console.log(chalk.cyan("\n💡 Quick Commands:"));
      console.log(chalk.gray("  sybil start    - Start the agent"));
      console.log(chalk.gray("  sybil stop     - Stop the agent"));
      console.log(chalk.gray("  sybil logs     - View logs"));
      
    } catch (error) {
      spinner.fail(chalk.red("Failed to check status"));
      console.error(error);
      process.exit(1);
    }
  });
