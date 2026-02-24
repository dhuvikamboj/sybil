import { Command } from "commander";
import { schedulerService } from "../../services/scheduler-service.js";
import chalk from "chalk";

export const schedulerCommand = new Command("scheduler")
  .description("Manage scheduled tasks for Sybil")
  .alias("sched");

schedulerCommand
  .command("list")
  .description("List all scheduled tasks")
  .option("-t, --type <type>", "Filter by task type (script, agent, reminder, command, webhook)")
  .option("-s, --status <status>", "Filter by status (active, paused)")
  .action((options) => {
    let tasks = schedulerService.getAllTasks();

    if (options.type) {
      tasks = tasks.filter(t => t.type === options.type);
    }
    if (options.status === "active") {
      tasks = tasks.filter(t => t.enabled);
    } else if (options.status === "paused") {
      tasks = tasks.filter(t => !t.enabled);
    }

    if (tasks.length === 0) {
      console.log(chalk.yellow("No scheduled tasks found."));
      return;
    }

    console.log(chalk.cyan(`\nFound ${tasks.length} scheduled tasks:`));
    console.table(
      tasks.map((t) => ({
        ID: t.id,
        Name: t.name,
        Type: t.type,
        Status: t.enabled ? chalk.green("Active") : chalk.gray("Paused"),
        "Cron Expr": t.cronExpression,
        "Next Run": t.nextRun ? new Date(t.nextRun).toLocaleString() : "N/A",
        "Run Count": t.runCount,
      }))
    );
  });

schedulerCommand
  .command("pause <taskId>")
  .description("Pause a scheduled task")
  .action((taskId) => {
    const success = schedulerService.pauseTask(taskId);
    if (success) {
      console.log(chalk.green(`✓ Task ${taskId} paused successfully.`));
    } else {
      console.log(chalk.red(`✗ Task ${taskId} not found.`));
    }
  });

schedulerCommand
  .command("resume <taskId>")
  .description("Resume a paused scheduled task")
  .action((taskId) => {
    const success = schedulerService.resumeTask(taskId);
    if (success) {
      console.log(chalk.green(`✓ Task ${taskId} resumed successfully.`));
    } else {
      console.log(chalk.red(`✗ Task ${taskId} not found.`));
    }
  });

schedulerCommand
  .command("delete <taskId>")
  .description("Delete a scheduled task")
  .action((taskId) => {
    const success = schedulerService.cancelTask(taskId);
    if (success) {
      console.log(chalk.green(`✓ Task ${taskId} deleted successfully.`));
    } else {
      console.log(chalk.red(`✗ Task ${taskId} not found.`));
    }
  });

schedulerCommand
  .command("run <taskId>")
  .description("Run a task immediately")
  .action(async (taskId) => {
    console.log(chalk.cyan(`Starting task ${taskId}...`));
    try {
      const result = await schedulerService.runTaskNow(taskId);
      if (result.success) {
        console.log(chalk.green(`✓ ${result.message}`));
      } else {
        console.log(chalk.red(`✗ Failed: ${result.error}`));
      }
    } catch (error: any) {
      console.log(chalk.red(`✗ Error: ${error.message}`));
    }
  });

schedulerCommand
  .command("stats")
  .description("Show scheduler statistics")
  .action(() => {
    const stats = schedulerService.getStats();
    console.log(chalk.cyan("\n📊 Scheduler Statistics:"));
    console.log(chalk.white(`Total Tasks: ${stats.totalTasks}`));
    console.log(chalk.green(`Enabled Tasks: ${stats.enabledTasks}`));
    console.log(chalk.gray(`Disabled Tasks: ${stats.disabledTasks}`));
    console.log(chalk.white(`Total Executions: ${stats.totalExecutions}`));
    
    console.log(chalk.cyan("\nBy Type:"));
    Object.entries(stats.byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  });

schedulerCommand
  .command("history [taskId]")
  .description("Show task execution history")
  .option("-n, --limit <number>", "Number of records to show", "20")
  .action((taskId, options) => {
    const limit = parseInt(options.limit, 10);
    const history = taskId 
      ? schedulerService.getTaskHistory(taskId, limit)
      : schedulerService.getExecutionHistory(limit);

    if (history.length === 0) {
      console.log(chalk.yellow("No execution history found."));
      return;
    }

    console.log(chalk.cyan(`\nExecution History (Last ${history.length}):`));
    history.forEach((h) => {
      const status = h.success ? chalk.green("SUCCESS") : chalk.red("FAILED");
      const time = new Date(h.executedAt).toLocaleString();
      console.log(`[${time}] ${status} | Task: ${h.taskId}`);
      if (!h.success && h.error) {
        console.log(chalk.red(`  └─ Error: ${h.error}`));
      }
    });
  });