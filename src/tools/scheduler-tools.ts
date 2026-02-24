import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import schedulerService, { TaskType } from "../services/scheduler-service.js";

export const scheduleTaskTool = createTool({
  id: "schedule-task",
  description: `Schedule a new task to run at specified times using cron expressions.

Cron Expression Format:
* * * * *
│ │ │ │ │
│ │ │ │ └── Day of week (0-7, where 0 and 7 are Sunday)
│ │ │ └──── Month (1-12)
│ │ └────── Day of month (1-31)
│ └──────── Hour (0-23)
└────────── Minute (0-59)

Examples:
- "*/5 * * * *" - Every 5 minutes
- "0 * * * *" - Every hour
- "0 9 * * *" - Every day at 9:00 AM
- "0 9 * * 1" - Every Monday at 9:00 AM
- "0 9 1 * *" - First day of every month at 9:00 AM
- "0 */2 * * *" - Every 2 hours

Task Types:
- "script": Run a script/program
- "agent": Delegate a task to another agent
- "reminder": Set a reminder
- "command": Execute a system command
- "webhook": Call an HTTP endpoint`,
  inputSchema: z.object({
    name: z.string().describe("Human-readable name for the scheduled task"),
    type: z.enum(["script", "agent", "reminder", "command", "webhook"]).describe("Type of task to schedule"),
    cronExpression: z.string().describe("Cron expression defining when to run (e.g., '0 9 * * *' for daily at 9 AM)"),
    target: z.string().optional().describe("Target script path (for script type)"),
    agentName: z.string().optional().describe("Agent to delegate to (for agent type): planner, researcher, executor, whatsapp"),
    taskDescription: z.string().optional().describe("Task description for agent or message for reminder"),
    command: z.string().optional().describe("Command to execute (for command type)"),
    url: z.string().optional().describe("URL to call (for webhook type)"),
    method: z.string().optional().describe("HTTP method like GET, POST, PUT, DELETE (for webhook type)"),
    headers: z.record(z.string(), z.string()).optional().describe("HTTP Headers (for webhook type)"),
    body: z.any().optional().describe("JSON body (for webhook type)"),
    enabled: z.boolean().optional().describe("Whether task is enabled immediately (default: true)"),
    notifyOnError: z.boolean().optional().describe("Send a Telegram notification if task execution fails"),
    dependencies: z.object({
      taskIds: z.array(z.string()),
      mode: z.enum(["all", "any"]),
      onFailure: z.enum(["skip", "run"])
    }).optional().describe("Task dependencies configuring when this task runs based on others"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    taskId: z.string().optional(),
    name: z.string(),
    type: z.string(),
    cronExpression: z.string(),
    nextRun: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData, context) => {
    const { name, type, cronExpression, target, agentName, taskDescription, command, url, method, headers, body, enabled = true, notifyOnError, dependencies } = inputData;
    
    // Attempt to automatically extract chat ID from the request context if the agent was invoked from Telegram
    const chatId = context?.requestContext?.get("telegramChatId") as number | undefined;

    try {
      const validation = schedulerService.validateCronExpression(cronExpression);
      if (!validation.valid && !dependencies) {
        return {
          success: false,
          name,
          type,
          cronExpression,
          error: `Invalid cron expression: ${cronExpression} (either a valid cron or valid dependencies array is required)`,
        };
      }

      let task;
      const metadata: Record<string, any> = {};
      if (notifyOnError) {
        metadata.notifyOnError = true;
      }
      if (chatId) {
        metadata.chatId = chatId;
      }

      switch (type) {
        case "script":
          if (!target) {
            return {
              success: false,
              name,
              type,
              cronExpression,
              error: "Script path (target) is required for script type",
            };
          }
          metadata.target = target;
          metadata.command = command || target;
          task = schedulerService.scheduleTask(name, type as TaskType, cronExpression, metadata, enabled, dependencies);
          break;

        case "agent":
          if (!agentName || !taskDescription) {
            return {
              success: false,
              name,
              type,
              cronExpression,
              error: "Both agentName and taskDescription are required for agent type",
            };
          }
          metadata.agentName = agentName;
          metadata.task = taskDescription;
          task = schedulerService.scheduleTask(name, type as TaskType, cronExpression, metadata, enabled, dependencies);
          break;

        case "reminder":
          if (!taskDescription) {
            return {
              success: false,
              name,
              type,
              cronExpression,
              error: "Message (taskDescription) is required for reminder type",
            };
          }
          metadata.message = taskDescription;
          if (agentName) metadata.agentName = agentName;
          task = schedulerService.scheduleTask(name, type as TaskType, cronExpression, metadata, enabled, dependencies);
          break;

        case "command":
          if (!command) {
            return {
              success: false,
              name,
              type,
              cronExpression,
              error: "Command is required for command type",
            };
          }
          metadata.command = command;
          task = schedulerService.scheduleTask(name, type as TaskType, cronExpression, metadata, enabled, dependencies);
          break;

        case "webhook":
          if (!url) {
            return {
              success: false,
              name,
              type,
              cronExpression,
              error: "URL is required for webhook type",
            };
          }
          metadata.url = url;
          if (method) metadata.method = method;
          if (headers) metadata.headers = headers;
          if (body) metadata.body = body;
          task = schedulerService.scheduleTask(name, type as TaskType, cronExpression, metadata, enabled, dependencies);
          break;

        default:
          return {
            success: false,
            name,
            type,
            cronExpression,
            error: `Unknown task type: ${type}`,
          };
      }

      return {
        success: true,
        taskId: task.id,
        name: task.name,
        type: task.type,
        cronExpression: task.cronExpression,
        nextRun: task.nextRun?.toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        name,
        type,
        cronExpression,
        error: error.message || "Failed to schedule task",
      };
    }
  },
});

export const listScheduledTasksTool = createTool({
  id: "list-scheduled-tasks",
  description: "List all scheduled tasks, optionally filtered by type or status",
  inputSchema: z.object({
    type: z.enum(["script", "agent", "reminder", "command", "webhook"]).optional().describe("Filter by task type"),
    enabledOnly: z.boolean().optional().describe("Show only enabled tasks"),
    disabledOnly: z.boolean().optional().describe("Show only disabled tasks"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    tasks: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      cronExpression: z.string(),
      enabled: z.boolean(),
      createdAt: z.string(),
      lastRun: z.string().optional(),
      nextRun: z.string().optional(),
      runCount: z.number(),
      metadata: z.record(z.string(), z.any()),
    })),
    total: z.number(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    try {
      let tasks = schedulerService.getAllTasks();

      if (inputData.type) {
        tasks = tasks.filter((t) => t.type === inputData.type);
      }

      if (inputData.enabledOnly) {
        tasks = tasks.filter((t) => t.enabled);
      }

      if (inputData.disabledOnly) {
        tasks = tasks.filter((t) => !t.enabled);
      }

      return {
        success: true,
        tasks: tasks.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type,
          cronExpression: t.cronExpression,
          enabled: t.enabled,
          createdAt: t.createdAt.toISOString(),
          lastRun: t.lastRun?.toISOString(),
          nextRun: t.nextRun?.toISOString(),
          runCount: t.runCount,
          metadata: t.metadata,
        })),
        total: tasks.length,
      };
    } catch (error: any) {
      return {
        success: false,
        tasks: [],
        total: 0,
        error: error.message || "Failed to list tasks",
      };
    }
  },
});

export const cancelScheduledTaskTool = createTool({
  id: "cancel-scheduled-task",
  description: "Cancel and remove a scheduled task",
  inputSchema: z.object({
    taskId: z.string().describe("ID of the task to cancel"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    taskId: z.string(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { taskId } = inputData;

    try {
      const cancelled = schedulerService.cancelTask(taskId);

      if (cancelled) {
        return {
          success: true,
          taskId,
          message: `Task ${taskId} cancelled successfully`,
        };
      } else {
        return {
          success: false,
          taskId,
          error: `Task ${taskId} not found`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        taskId,
        error: error.message || "Failed to cancel task",
      };
    }
  },
});

export const pauseScheduledTaskTool = createTool({
  id: "pause-scheduled-task",
  description: "Pause a scheduled task (can be resumed later)",
  inputSchema: z.object({
    taskId: z.string().describe("ID of the task to pause"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    taskId: z.string(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { taskId } = inputData;

    try {
      const paused = schedulerService.pauseTask(taskId);

      if (paused) {
        return {
          success: true,
          taskId,
          message: `Task ${taskId} paused successfully`,
        };
      } else {
        return {
          success: false,
          taskId,
          error: `Task ${taskId} not found`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        taskId,
        error: error.message || "Failed to pause task",
      };
    }
  },
});

export const resumeScheduledTaskTool = createTool({
  id: "resume-scheduled-task",
  description: "Resume a paused scheduled task",
  inputSchema: z.object({
    taskId: z.string().describe("ID of the task to resume"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    taskId: z.string(),
    nextRun: z.string().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { taskId } = inputData;

    try {
      const task = schedulerService.getTask(taskId);
      const resumed = schedulerService.resumeTask(taskId);

      if (resumed) {
        return {
          success: true,
          taskId,
          nextRun: task?.nextRun?.toISOString(),
          message: `Task ${taskId} resumed successfully`,
        };
      } else {
        return {
          success: false,
          taskId,
          error: `Task ${taskId} not found`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        taskId,
        error: error.message || "Failed to resume task",
      };
    }
  },
});

export const runTaskNowTool = createTool({
  id: "run-task-now",
  description: "Execute a scheduled task immediately without waiting for its scheduled time",
  inputSchema: z.object({
    taskId: z.string().describe("ID of the task to run immediately"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    taskId: z.string(),
    executedAt: z.string().optional(),
    result: z.any().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { taskId } = inputData;

    try {
      const result = await schedulerService.runTaskNow(taskId);

      return {
        success: result.success,
        taskId,
        executedAt: new Date().toISOString(),
        result: result.message,
        error: result.error,
      };
    } catch (error: any) {
      return {
        success: false,
        taskId,
        error: error.message || "Failed to run task",
      };
    }
  },
});

export const updateScheduledTaskTool = createTool({
  id: "update-scheduled-task",
  description: "Update a scheduled task's properties (name, cron expression, metadata, or enabled status)",
  inputSchema: z.object({
    taskId: z.string().describe("ID of the task to update"),
    name: z.string().optional().describe("New name for the task"),
    cronExpression: z.string().optional().describe("New cron expression"),
    enabled: z.boolean().optional().describe("Enable or disable the task"),
    taskDescription: z.string().optional().describe("Update task description/message"),
    command: z.string().optional().describe("Update command"),
    url: z.string().optional().describe("Update webhook URL"),
    method: z.string().optional().describe("Update webhook method"),
    headers: z.record(z.string(), z.string()).optional().describe("Update webhook headers"),
    body: z.any().optional().describe("Update webhook body"),
    dependencies: z.object({
      taskIds: z.array(z.string()),
      mode: z.enum(["all", "any"]),
      onFailure: z.enum(["skip", "run"])
    }).optional().describe("Update task dependencies"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    taskId: z.string(),
    task: z.any().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { taskId, name, cronExpression, enabled, taskDescription, command, url, method, headers, body, dependencies } = inputData;

    try {
      const updates: any = {};
      if (name) updates.name = name;
      if (cronExpression !== undefined) updates.cronExpression = cronExpression;
      if (enabled !== undefined) updates.enabled = enabled;
      if (dependencies !== undefined) updates.dependencies = dependencies;

      if (taskDescription || command || url || method || headers || body) {
        updates.metadata = {};
        if (taskDescription) {
          updates.metadata.task = taskDescription;
          updates.metadata.message = taskDescription;
        }
        if (command) updates.metadata.command = command;
        if (url) updates.metadata.url = url;
        if (method) updates.metadata.method = method;
        if (headers) updates.metadata.headers = headers;
        if (body) updates.metadata.body = body;
      }

      const task = schedulerService.updateTask(taskId, updates);

      if (task) {
        return {
          success: true,
          taskId,
          task: {
            id: task.id,
            name: task.name,
            type: task.type,
            cronExpression: task.cronExpression,
            enabled: task.enabled,
            nextRun: task.nextRun?.toISOString(),
          },
          message: `Task ${taskId} updated successfully`,
        };
      } else {
        return {
          success: false,
          taskId,
          error: `Task ${taskId} not found`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        taskId,
        error: error.message || "Failed to update task",
      };
    }
  },
});

export const getScheduledTaskTool = createTool({
  id: "get-scheduled-task",
  description: "Get details of a specific scheduled task",
  inputSchema: z.object({
    taskId: z.string().describe("ID of the task to retrieve"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    task: z.any().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { taskId } = inputData;

    try {
      const task = schedulerService.getTask(taskId);

      if (task) {
        return {
          success: true,
          task: {
            id: task.id,
            name: task.name,
            type: task.type,
            cronExpression: task.cronExpression,
            enabled: task.enabled,
            createdAt: task.createdAt.toISOString(),
            lastRun: task.lastRun?.toISOString(),
            nextRun: task.nextRun?.toISOString(),
            runCount: task.runCount,
            metadata: task.metadata,
          },
        };
      } else {
        return {
          success: false,
          error: `Task ${taskId} not found`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to get task",
      };
    }
  },
});

export const getSchedulerStatsTool = createTool({
  id: "get-scheduler-stats",
  description: "Get statistics about the scheduler (total tasks, by type, execution count)",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      totalTasks: z.number(),
      enabledTasks: z.number(),
      disabledTasks: z.number(),
      byType: z.record(z.string(), z.number()),
      totalExecutions: z.number(),
    }).optional(),
    error: z.string().optional(),
  }),
  execute: async () => {
    try {
      const stats = schedulerService.getStats();
      return {
        success: true,
        stats,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to get stats",
      };
    }
  },
});

export const getTaskHistoryTool = createTool({
  id: "get-task-history",
  description: "Get execution history for tasks",
  inputSchema: z.object({
    taskId: z.string().optional().describe("Filter by specific task ID"),
    limit: z.number().optional().describe("Number of records to return (default: 20)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    history: z.array(z.object({
      taskId: z.string(),
      executedAt: z.string(),
      success: z.boolean(),
      result: z.any().optional(),
      error: z.string().optional(),
    })).optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { taskId, limit = 20 } = inputData;

    try {
      let history;
      if (taskId) {
        history = schedulerService.getTaskHistory(taskId, limit);
      } else {
        history = schedulerService.getExecutionHistory(limit);
      }

      return {
        success: true,
        history: history.map((h) => ({
          taskId: h.taskId,
          executedAt: h.executedAt.toISOString(),
          success: h.success,
          result: h.result,
          error: h.error,
        })),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to get history",
      };
    }
  },
});

export const validateCronExpressionTool = createTool({
  id: "validate-cron-expression",
  description: "Validate a cron expression and get a human-readable description",
  inputSchema: z.object({
    cronExpression: z.string().describe("Cron expression to validate"),
  }),
  outputSchema: z.object({
    valid: z.boolean(),
    description: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { cronExpression } = inputData;

    try {
      const result = schedulerService.validateCronExpression(cronExpression);
      return {
        valid: result.valid,
        description: result.description,
        error: result.valid ? undefined : "Invalid cron expression",
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || "Failed to validate cron expression",
      };
    }
  },
});

export const exportTasksTool = createTool({
  id: "export-scheduled-tasks",
  description: "Export all scheduled tasks as JSON for backup or transfer",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.string().optional(),
    taskCount: z.number().optional(),
    filePath: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async () => {
    try {
      const data = schedulerService.exportTasks();
      const tasks = schedulerService.getAllTasks();

      return {
        success: true,
        data,
        taskCount: tasks.length,
        filePath: schedulerService.getTasksFilePath(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to export tasks",
      };
    }
  },
});

export const importTasksTool = createTool({
  id: "import-scheduled-tasks",
  description: "Import scheduled tasks from JSON. Can merge with existing tasks or replace all.",
  inputSchema: z.object({
    jsonData: z.string().describe("JSON data containing tasks to import"),
    merge: z.boolean().optional().describe("Merge with existing tasks (true) or replace all (false). Default: true"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    imported: z.number().optional(),
    errors: z.array(z.string()).optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const { jsonData, merge = true } = inputData;

    try {
      const result = schedulerService.importTasks(jsonData, merge);

      return {
        success: result.success,
        imported: result.imported,
        errors: result.errors.length > 0 ? result.errors : undefined,
        error: result.success ? undefined : "Import failed",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to import tasks",
      };
    }
  },
});

export const getSchedulerStatusTool = createTool({
  id: "get-scheduler-status",
  description: "Get scheduler status including persistence file location and readiness",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    ready: z.boolean().optional(),
    tasksFile: z.string().optional(),
    totalTasks: z.number().optional(),
    enabledTasks: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async () => {
    try {
      const stats = schedulerService.getStats();

      return {
        success: true,
        ready: schedulerService.isReady(),
        tasksFile: schedulerService.getTasksFilePath(),
        totalTasks: stats.totalTasks,
        enabledTasks: stats.enabledTasks,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to get scheduler status",
      };
    }
  },
});

export const schedulerTools = {
  scheduleTask: scheduleTaskTool,
  listScheduledTasks: listScheduledTasksTool,
  cancelScheduledTask: cancelScheduledTaskTool,
  pauseScheduledTask: pauseScheduledTaskTool,
  resumeScheduledTask: resumeScheduledTaskTool,
  runTaskNow: runTaskNowTool,
  updateScheduledTask: updateScheduledTaskTool,
  getScheduledTask: getScheduledTaskTool,
  getSchedulerStats: getSchedulerStatsTool,
  getTaskHistory: getTaskHistoryTool,
  validateCronExpression: validateCronExpressionTool,
  exportTasks: exportTasksTool,
  importTasks: importTasksTool,
  getSchedulerStatus: getSchedulerStatusTool,
};

export default schedulerTools;
