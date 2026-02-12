import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const doctorCommand = new Command("doctor")
  .description("Run system diagnostics and health checks")
  .action(async () => {
    console.log(chalk.cyan("\n🔍 Sybil System Diagnostics\n"));
    
    const checks = [
      {
        name: "Configuration File",
        check: () => existsSync(join(process.cwd(), ".env")),
        success: ".env file exists",
        failure: ".env file missing",
        critical: true,
      },
      {
        name: "Data Directory",
        check: () => existsSync(join(homedir(), ".sybil")),
        success: "Data directory exists",
        failure: "Data directory missing",
        critical: false,
      },
      {
        name: "Node.js Version",
        check: () => {
          const version = process.version;
          const major = parseInt(version.slice(1).split(".")[0]);
          return major >= 18;
        },
        success: `Node.js ${process.version} (compatible)`,
        failure: "Node.js version too old (need 18+)",
        critical: true,
      },
      {
        name: "Environment Variables",
        check: () => {
          const required = ["TELEGRAM_BOT_TOKEN"];
          const missing = required.filter((key) => !process.env[key]);
          return missing.length === 0;
        },
        success: "Required env vars set",
        failure: "Missing required env vars",
        critical: true,
      },
      {
        name: "Dependencies",
        check: () => existsSync(join(process.cwd(), "node_modules")),
        success: "Dependencies installed",
        failure: "node_modules missing (run npm install)",
        critical: true,
      },
    ];

    let passed = 0;
    let failed = 0;
    let criticalFailed = false;

    for (const check of checks) {
      const spinner = ora(check.name).start();
      
      try {
        const result = await check.check();
        
        if (result) {
          spinner.succeed(chalk.green(check.success));
          passed++;
        } else {
          spinner.fail(chalk.red(check.failure));
          failed++;
          if (check.critical) {
            criticalFailed = true;
          }
        }
      } catch (error) {
        spinner.fail(chalk.red(`Error: ${check.failure}`));
        failed++;
        if (check.critical) {
          criticalFailed = true;
        }
      }
    }

    // Summary
    console.log(chalk.cyan("\n📊 Summary:\n"));
    console.log(`  ${chalk.green("✅")} Passed: ${passed}/${checks.length}`);
    console.log(`  ${chalk.red("❌")} Failed: ${failed}/${checks.length}`);

    if (criticalFailed) {
      console.log(chalk.red("\n⚠️  Critical issues found!"));
      console.log(chalk.gray("Please fix the issues above before running Sybil."));
      process.exit(1);
    } else if (failed > 0) {
      console.log(chalk.yellow("\n⚠️  Some non-critical issues found."));
      console.log(chalk.gray("Sybil may still run, but some features may not work."));
    } else {
      console.log(chalk.green("\n✅ All checks passed!"));
      console.log(chalk.gray("Your system is ready to run Sybil."));
    }

    // Recommendations
    console.log(chalk.cyan("\n💡 Recommendations:\n"));
    console.log(chalk.gray("  • Keep your system updated"));
    console.log(chalk.gray("  • Regular backups: sybil backup"));
    console.log(chalk.gray("  • Monitor logs: sybil logs"));
    console.log(chalk.gray("  • Check status: sybil status"));
  });
