import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { existsSync, copyFileSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import inquirer from "inquirer";

export const restoreCommand = new Command("restore")
  .description("Restore Sybil from a backup")
  .argument("[backup-name]", "Name of the backup to restore")
  .option("-l, --list", "List available backups")
  .action(async (backupName, options) => {
    const backupDir = join(homedir(), ".sybil", "backups");
    
    if (options.list) {
      // List available backups
      console.log(chalk.cyan("\n📦 Available Backups:\n"));
      
      if (!existsSync(backupDir)) {
        console.log(chalk.yellow("No backups found."));
        return;
      }
      
      const { readdirSync } = await import("fs");
      const backups = readdirSync(backupDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
      
      if (backups.length === 0) {
        console.log(chalk.yellow("No backups found."));
        return;
      }
      
      for (const backup of backups) {
        const metadataPath = join(backupDir, backup, "metadata.json");
        if (existsSync(metadataPath)) {
          const metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
          console.log(`  📁 ${chalk.bold(backup)}`);
          console.log(`     Created: ${new Date(metadata.createdAt).toLocaleString()}`);
          console.log(`     Files: ${metadata.filesBackedUp}`);
          console.log("");
        } else {
          console.log(`  📁 ${chalk.bold(backup)}`);
          console.log("     (No metadata available)");
          console.log("");
        }
      }
      
      return;
    }

    if (!backupName) {
      console.log(chalk.red("❌ Please specify a backup name or use --list"));
      console.log(chalk.gray("Usage: sybil restore <backup-name>"));
      process.exit(1);
    }

    const backupPath = join(backupDir, backupName);
    
    if (!existsSync(backupPath)) {
      console.log(chalk.red(`❌ Backup '${backupName}' not found`));
      console.log(chalk.gray(`Run 'sybil restore --list' to see available backups`));
      process.exit(1);
    }

    const spinner = ora("Restoring from backup...").start();
    
    try {
      // Confirm restore
      spinner.stop();
      
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: chalk.yellow("⚠️  This will overwrite your current configuration. Continue?"),
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.blue("Restore cancelled."));
        return;
      }

      spinner.start("Restoring files...");

      // Restore files
      const filesToRestore = [
        { src: join(backupPath, ".env"), dest: join(process.cwd(), ".env") },
        { src: join(backupPath, "settings.json"), dest: join(homedir(), ".sybil", "settings.json") },
        { src: join(backupPath, "mastra.db"), dest: join(process.cwd(), "mastra.db") },
      ];

      let restored = 0;
      
      for (const { src, dest } of filesToRestore) {
        if (existsSync(src)) {
          copyFileSync(src, dest);
          restored++;
        }
      }

      spinner.succeed(chalk.green("✅ Restore completed successfully"));
      
      console.log(chalk.cyan("\n📦 Restore Details:"));
      console.log(`  📁 Backup: ${chalk.bold(backupName)}`);
      console.log(`  📄 Files restored: ${restored}`);
      
      console.log(chalk.yellow("\n⚠️  Please restart Sybil for changes to take effect"));

    } catch (error) {
      spinner.fail(chalk.red("❌ Failed to restore backup"));
      console.error(error);
      process.exit(1);
    }
  });
