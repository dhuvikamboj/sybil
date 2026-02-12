import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const backupCommand = new Command("backup")
  .description("Create a backup of Sybil configuration and data")
  .option("-o, --output <path>", "Output directory for backup")
  .option("-n, --name <name>", "Backup name (default: timestamp)")
  .action(async (options) => {
    const spinner = ora("Creating backup...").start();
    
    try {
      const backupName = options.name || `sybil-backup-${new Date().toISOString().split("T")[0]}`;
      const backupDir = options.output || join(homedir(), ".sybil", "backups");
      
      // Create backup directory
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }
      
      const backupPath = join(backupDir, backupName);
      
      if (!existsSync(backupPath)) {
        mkdirSync(backupPath, { recursive: true });
      }

      // Files to backup
      const filesToBackup = [
        { src: join(process.cwd(), ".env"), dest: join(backupPath, ".env") },
        { src: join(homedir(), ".sybil", "settings.json"), dest: join(backupPath, "settings.json") },
        { src: join(process.cwd(), "mastra.db"), dest: join(backupPath, "mastra.db") },
      ];

      let backedUp = 0;
      
      for (const { src, dest } of filesToBackup) {
        if (existsSync(src)) {
          copyFileSync(src, dest);
          backedUp++;
        }
      }

      // Create backup metadata
      const metadata = {
        createdAt: new Date().toISOString(),
        version: "1.0.0",
        filesBackedUp: backedUp,
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
        },
      };
      
      writeFileSync(
        join(backupPath, "metadata.json"),
        JSON.stringify(metadata, null, 2)
      );

      spinner.succeed(chalk.green("✅ Backup created successfully"));
      
      console.log(chalk.cyan("\n📦 Backup Details:"));
      console.log(`  📁 Name: ${chalk.bold(backupName)}`);
      console.log(`  📍 Location: ${chalk.gray(backupPath)}`);
      console.log(`  📄 Files: ${backedUp} files backed up`);
      console.log(`  📅 Created: ${new Date().toLocaleString()}`);
      
      console.log(chalk.gray("\n💡 To restore: sybil restore " + backupName));

    } catch (error) {
      spinner.fail(chalk.red("❌ Failed to create backup"));
      console.error(error);
      process.exit(1);
    }
  });
