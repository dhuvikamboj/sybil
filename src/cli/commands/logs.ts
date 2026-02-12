import { Command } from "commander";
import chalk from "chalk";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { join } from "path";
import { homedir } from "os";

export const logsCommand = new Command("logs")
  .description("View and filter agent logs")
  .option("-f, --follow", "Follow logs in real-time (tail)")
  .option("-n, --lines <number>", "Number of lines to show", "50")
  .option("-l, --level <level>", "Filter by log level (error, warn, info, debug)")
  .option("-s, --search <term>", "Search for specific term")
  .option("--component <component>", "Filter by component (AGENT, TELEGRAM, WHATSAPP)")
  .action(async (options) => {
    const logPath = join(homedir(), ".sybil", "logs", "sybil.log");
    
    console.log(chalk.cyan("\n📜 Sybil Logs\n"));
    
    if (options.follow) {
      // Real-time tail
      console.log(chalk.gray("Following logs... Press Ctrl+C to exit\n"));
      
      const { spawn } = await import("child_process");
      const tail = spawn("tail", ["-f", "-n", options.lines, logPath], {
        stdio: "inherit",
      });
      
      tail.on("error", () => {
        console.log(chalk.red("❌ Could not tail logs. File may not exist."));
      });
      
      return;
    }

    try {
      const lines: string[] = [];
      const fileStream = createReadStream(logPath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        lines.push(line);
      }

      // Get last N lines
      const lastLines = lines.slice(-parseInt(options.lines));

      // Filter and display
      let displayed = 0;
      
      for (const line of lastLines) {
        // Apply filters
        if (options.level && !line.includes(`[${options.level.toUpperCase()}]`)) {
          continue;
        }
        
        if (options.component && !line.includes(`[${options.component.toUpperCase()}]`)) {
          continue;
        }
        
        if (options.search && !line.toLowerCase().includes(options.search.toLowerCase())) {
          continue;
        }

        // Colorize based on level
        let coloredLine = line;
        if (line.includes("[ERROR]")) {
          coloredLine = chalk.red(line);
        } else if (line.includes("[WARN]")) {
          coloredLine = chalk.yellow(line);
        } else if (line.includes("[INFO]")) {
          coloredLine = chalk.blue(line);
        } else if (line.includes("[DEBUG]")) {
          coloredLine = chalk.gray(line);
        }

        console.log(coloredLine);
        displayed++;
      }

      console.log(chalk.gray(`\n📊 Showing ${displayed} lines${options.level ? ` (filtered by: ${options.level})` : ""}`));
      
      if (displayed === 0) {
        console.log(chalk.yellow("\n⚠️  No logs found matching your criteria"));
      }

    } catch (error) {
      console.log(chalk.red("❌ Could not read logs"));
      console.log(chalk.gray("Log file may not exist yet. Start Sybil to generate logs."));
    }
  });
