import cron from "node-cron";
import { CronExpressionParser } from "cron-parser";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { createClient, Client } from "@libsql/client";

export type TaskType = "script" | "agent" | "reminder" | "command" | "webhook";

export interface ScheduledTask {
  id: string;
  name: string;
  type: TaskType;
  cronExpression: string; // If empty, it's a dependent-only task
  enabled: boolean;
  createdAt: Date;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  metadata: {
    target?: string;
    command?: string;
    agentName?: string;
    task?: string;
    message?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    [key: string]: any;
  };
  retryConfig?: {
    maxRetries: number;
    retryCount: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
  dependencies?: {
    taskIds: string[];
    mode: "all" | "any";
    onFailure: "skip" | "run";
  };
}

export interface TaskExecutionResult {
  taskId: string;
  executedAt: Date;
  success: boolean;
  result?: any;
  error?: string;
}

interface PersistedData {
  version: number;
  timezone?: string;
  tasks: Array<{
    id: string;
    name: string;
    type: TaskType;
    cronExpression: string;
    enabled: boolean;
    createdAt: string;
    lastRun?: string;
    runCount: number;
    metadata: ScheduledTask["metadata"];
    retryConfig?: ScheduledTask["retryConfig"];
    dependencies?: ScheduledTask["dependencies"];
  }>;
  savedAt: string;
}

const SCHEDULER_DIR = path.join(homedir(), ".sybil", "scheduler");
const DB_FILE = path.join(SCHEDULER_DIR, "scheduler.db");
const TASKS_FILE = path.join(SCHEDULER_DIR, "tasks.json"); // Kept for backward compatibility / migration
const PERSISTENCE_VERSION = 1;

class SchedulerService extends EventEmitter {
  private tasks: Map<string, ScheduledTask> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private executionHistory: TaskExecutionResult[] = [];
  private maxHistorySize = 1000;
  private persistenceTimer: NodeJS.Timeout | null = null;
  private isLoaded = false;
  private timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  private db: Client | null = null;

  constructor() {
    super();
    this.ensureDataDir();
    this.initDb().then(() => {
      this.loadPersistedTasks();
      this.startAutoSave();
    }).catch(e => {
      console.error("[Scheduler] Failed to initialize database:", e);
      // Fallback to JSON logic if DB fails
      this.loadPersistedTasksJson();
      this.startAutoSave();
    });

    this.on('task:complete', this.handleTaskComplete.bind(this));
    this.on('task:error', this.handleTaskError.bind(this));
  }

  private handleTaskComplete(data: { taskId: string; result: any }): void {
    const task = this.tasks.get(data.taskId);
    if (!task) return;

    if (task.retryConfig) {
      task.retryConfig.retryCount = 0; // reset retry counter on success
    }

    this.addToHistory({
      taskId: data.taskId,
      executedAt: new Date(),
      success: true,
      result: data.result,
    });

    this.checkAndTriggerDependentTasks(data.taskId, true);
  }

  private handleTaskError(data: { taskId: string; error: string }): void {
    const task = this.tasks.get(data.taskId);
    if (!task) return;

    this.addToHistory({
      taskId: data.taskId,
      executedAt: new Date(),
      success: false,
      error: data.error,
    });

    if (task.retryConfig && task.retryConfig.retryCount < task.retryConfig.maxRetries) {
      const delay = task.retryConfig.initialDelay * 
                    Math.pow(task.retryConfig.backoffMultiplier, task.retryConfig.retryCount);
      
      task.retryConfig.retryCount++;
      
      console.log(`[Scheduler] Retrying task ${task.name} in ${delay}ms (attempt ${task.retryConfig.retryCount}/${task.retryConfig.maxRetries})`);
      
      setTimeout(() => {
        this.runTaskNow(task.id);
      }, delay);
    } else {
      if (task.metadata?.notifyOnError && task.metadata?.chatId) {
        // Retries exhausted or no retries configured, but notifications enabled
        this.emit('task:failed', { task, error: data.error });
      }
      this.checkAndTriggerDependentTasks(data.taskId, false);
    }
  }

  private checkAndTriggerDependentTasks(completedTaskId: string, success: boolean): void {
    for (const [taskId, task] of this.tasks.entries()) {
      if (!task.enabled || !task.dependencies || !task.dependencies.taskIds.includes(completedTaskId)) {
        continue;
      }

      const deps = task.dependencies;
      
      if (!success && deps.onFailure === 'skip') {
        console.log(`[Scheduler] Skipping dependent task ${task.name} because dependency ${completedTaskId} failed`);
        continue;
      }

      if (deps.mode === 'any') {
        console.log(`[Scheduler] Triggering task ${task.name} (dependency 'any' met)`);
        this.runTaskNow(task.id);
        continue;
      }

      // If mode is 'all', check if all dependencies have run successfully recently
      if (deps.mode === 'all') {
        const allDepsMet = deps.taskIds.every(depId => {
          if (depId === completedTaskId) return success || deps.onFailure === 'run';
          const depTask = this.tasks.get(depId);
          if (!depTask) return false;
          // Simplified heuristic: consider it met if it has run recently.
          // A more robust implementation would track specific execution runs per workflow chain.
          return depTask.lastRun && (new Date().getTime() - new Date(depTask.lastRun).getTime()) < 3600000; 
        });

        if (allDepsMet) {
          console.log(`[Scheduler] Triggering task ${task.name} (all dependencies met)`);
          this.runTaskNow(task.id);
        }
      }
    }
  }

  private ensureDataDir(): void {
    try {
      if (!fs.existsSync(SCHEDULER_DIR)) {
        fs.mkdirSync(SCHEDULER_DIR, { recursive: true });
      }
    } catch (error) {
      console.error("[Scheduler] Failed to create data directory:", error);
    }
  }

  private startAutoSave(): void {
    this.persistenceTimer = setInterval(() => {
      this.persistTasks();
    }, 30000);
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private isValidCron(expression: string): boolean {
    return cron.validate(expression);
  }

  private calculateNextRun(cronExpression: string): Date | undefined {
    try {
      const interval = CronExpressionParser.parse(cronExpression, {
        currentDate: new Date(),
        tz: this.timezone || "UTC"
      });
      return interval.next().toDate();
    } catch (error) {
      console.error("[Scheduler] Failed to calculate next run:", error);
      return undefined;
    }
  }

  public setTimezone(timezone: string): void {
    try {
      // Validate timezone
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      this.timezone = timezone;
      console.log(`[Scheduler] Timezone set to ${timezone}`);
      
      // Recalculate all next run times
      this.tasks.forEach(task => {
        if (task.enabled) {
          task.nextRun = this.calculateNextRun(task.cronExpression);
        }
      });
      
      this.persistTasks();
    } catch (error) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }
  }

  public getTimezone(): string {
    return this.timezone;
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    try {
      task.lastRun = new Date();
      task.runCount++;
      task.nextRun = this.calculateNextRun(task.cronExpression);

      this.emit("task:start", task);

      switch (task.type) {
        case "script":
          this.executeScript(task);
          break;
        case "agent":
          this.executeAgentTask(task);
          break;
        case "reminder":
          this.executeReminder(task);
          break;
        case "command":
          this.executeCommand(task);
          break;
        case "webhook":
          this.executeWebhook(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
    } catch (error: any) {
      this.emit("task:error", { taskId: task.id, error: error.message || "Unknown error" });
    }
    
    this.persistTasks();
  }

  private executeScript(task: ScheduledTask): void {
    const { command, target } = task.metadata;
    this.emit("script:execute", { task, command: command || target });
  }

  private executeAgentTask(task: ScheduledTask): void {
    const { agentName, task: agentTask, message } = task.metadata;
    this.emit("agent:delegate", {
      task,
      agentName,
      taskDescription: agentTask || message,
    });
  }

  private executeReminder(task: ScheduledTask): void {
    const { message, agentName } = task.metadata;
    this.emit("reminder:trigger", {
      task,
      message,
      targetAgent: agentName,
    });
  }

  private executeCommand(task: ScheduledTask): void {
    const { command } = task.metadata;
    this.emit("command:execute", { task, command });
  }

  private executeWebhook(task: ScheduledTask): void {
    this.emit("webhook:trigger", { task });
  }

  private addToHistory(result: TaskExecutionResult): void {
    this.executionHistory.push(result);
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
    
    if (this.db) {
      this.db.execute({
        sql: `INSERT INTO task_history (task_id, executed_at, success, result, error) VALUES (?, ?, ?, ?, ?)`,
        args: [
          result.taskId,
          result.executedAt.toISOString(),
          result.success ? 1 : 0,
          result.result ? JSON.stringify(result.result) : null,
          result.error || null
        ]
      }).catch(e => console.error("[Scheduler] Failed to save history to DB:", e));
    }
  }

  private async initDb() {
    this.db = createClient({
      url: `file:${DB_FILE}`,
    });

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        cron_expression TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        last_run TEXT,
        next_run TEXT,
        run_count INTEGER DEFAULT 0,
        metadata TEXT,
        retry_config TEXT,
        dependencies TEXT
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS task_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        executed_at TEXT NOT NULL,
        success INTEGER NOT NULL,
        result TEXT,
        error TEXT
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS scheduler_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  private persistTasks(): void {
    if (this.db) {
      this.persistTasksDb().catch(e => console.error("[Scheduler] DB save failed:", e));
    } else {
      this.persistTasksJson();
    }
  }

  private async persistTasksDb(): Promise<void> {
    if (!this.db) return;

    try {
      // Save settings
      await this.db.execute({
        sql: "INSERT OR REPLACE INTO scheduler_settings (key, value) VALUES (?, ?)",
        args: ["timezone", this.timezone]
      });

      // We don't need to bulk save all tasks to DB like we do with JSON.
      // Usually we'd save when a task is updated. But to keep the same API structure:
      const stmts = Array.from(this.tasks.values()).map(task => ({
        sql: `INSERT OR REPLACE INTO scheduled_tasks 
             (id, name, type, cron_expression, enabled, created_at, last_run, next_run, run_count, metadata, retry_config, dependencies) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          task.id,
          task.name,
          task.type,
          task.cronExpression || "",
          task.enabled ? 1 : 0,
          task.createdAt.toISOString(),
          task.lastRun ? task.lastRun.toISOString() : null,
          task.nextRun ? task.nextRun.toISOString() : null,
          task.runCount,
          JSON.stringify(task.metadata),
          task.retryConfig ? JSON.stringify(task.retryConfig) : null,
          task.dependencies ? JSON.stringify(task.dependencies) : null
        ]
      }));

      if (stmts.length > 0) {
        await this.db.batch(stmts, "write");
      }
    } catch (error) {
      console.error("[Scheduler] Failed to persist tasks to DB:", error);
    }
  }

  private persistTasksJson(): void {
    try {
      const data: PersistedData = {
        version: PERSISTENCE_VERSION,
        timezone: this.timezone,
        tasks: Array.from(this.tasks.values()).map((task) => ({
          id: task.id,
          name: task.name,
          type: task.type,
          cronExpression: task.cronExpression,
          enabled: task.enabled,
          createdAt: task.createdAt.toISOString(),
          lastRun: task.lastRun?.toISOString(),
          runCount: task.runCount,
          metadata: task.metadata,
          retryConfig: task.retryConfig,
          dependencies: task.dependencies,
        })),
        savedAt: new Date().toISOString(),
      };

      fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error("[Scheduler] Failed to persist tasks:", error);
    }
  }

  private async loadPersistedTasks(): Promise<void> {
    if (this.db) {
      try {
        // Load settings
        const tzResult = await this.db.execute("SELECT value FROM scheduler_settings WHERE key = 'timezone'");
        if (tzResult.rows.length > 0) {
          this.timezone = tzResult.rows[0].value as string;
        }

        const tasksResult = await this.db.execute("SELECT * FROM scheduled_tasks");
        
        // If DB is empty but JSON exists, migrate
        if (tasksResult.rows.length === 0 && fs.existsSync(TASKS_FILE)) {
          console.log("[Scheduler] Migrating JSON to SQLite...");
          this.loadPersistedTasksJson();
          await this.persistTasksDb();
          return;
        }

        let loadedCount = 0;
        let enabledCount = 0;

        for (const row of tasksResult.rows) {
          const task: ScheduledTask = {
            id: row.id as string,
            name: row.name as string,
            type: row.type as TaskType,
            cronExpression: row.cron_expression as string,
            enabled: row.enabled === 1,
            createdAt: new Date(row.created_at as string),
            lastRun: row.last_run ? new Date(row.last_run as string) : undefined,
            nextRun: row.next_run ? new Date(row.next_run as string) : undefined,
            runCount: row.run_count as number,
            metadata: JSON.parse(row.metadata as string),
            retryConfig: row.retry_config ? JSON.parse(row.retry_config as string) : undefined,
            dependencies: row.dependencies ? JSON.parse(row.dependencies as string) : undefined,
          };

          // Re-calculate next run to be safe
          if (task.cronExpression) {
             task.nextRun = this.calculateNextRun(task.cronExpression);
          }

          this.tasks.set(task.id, task);
          loadedCount++;

          if (task.enabled && task.cronExpression) {
            this.startCronJob(task);
            enabledCount++;
          }
        }

        this.isLoaded = true;
        console.log(`[Scheduler] Loaded ${loadedCount} tasks (${enabledCount} enabled) from DB`);
        return;
      } catch (error) {
        console.error("[Scheduler] Failed to load tasks from DB, falling back to JSON:", error);
      }
    }
    
    this.loadPersistedTasksJson();
  }

  private loadPersistedTasksJson(): void {
    try {
      if (!fs.existsSync(TASKS_FILE)) {
        console.log("[Scheduler] No persisted tasks found, starting fresh");
        this.isLoaded = true;
        return;
      }

      const data: PersistedData = JSON.parse(
        fs.readFileSync(TASKS_FILE, "utf-8")
      );

      if (data.version !== PERSISTENCE_VERSION) {
        console.warn(
          `[Scheduler] Version mismatch (file: ${data.version}, current: ${PERSISTENCE_VERSION}), may need migration`
        );
      }
      
      if (data.timezone) {
        this.timezone = data.timezone;
      }

      let loadedCount = 0;
      let enabledCount = 0;

      for (const taskData of data.tasks) {
        const task: ScheduledTask = {
          id: taskData.id,
          name: taskData.name,
          type: taskData.type,
          cronExpression: taskData.cronExpression,
          enabled: taskData.enabled,
          createdAt: new Date(taskData.createdAt),
          lastRun: taskData.lastRun ? new Date(taskData.lastRun) : undefined,
          nextRun: this.calculateNextRun(taskData.cronExpression),
          runCount: taskData.runCount || 0,
          metadata: taskData.metadata,
          retryConfig: taskData.retryConfig,
          dependencies: taskData.dependencies,
        };

        this.tasks.set(task.id, task);
        loadedCount++;

        if (task.enabled && task.cronExpression) {
          this.startCronJob(task);
          enabledCount++;
        }
      }

      this.isLoaded = true;
      console.log(
        `[Scheduler] Loaded ${loadedCount} tasks (${enabledCount} enabled) from ${TASKS_FILE}`
      );
    } catch (error) {
      console.error("[Scheduler] Failed to load persisted tasks:", error);
      this.isLoaded = true;
    }
  }

  private startCronJob(task: ScheduledTask): void {
    if (this.cronJobs.has(task.id)) {
      this.cronJobs.get(task.id)?.stop();
    }

    const cronJob = cron.schedule(task.cronExpression, async () => {
      await this.executeTask(task);
    });

    this.cronJobs.set(task.id, cronJob);
  }

  private stopCronJob(taskId: string): void {
    const cronJob = this.cronJobs.get(taskId);
    if (cronJob) {
      cronJob.stop();
      this.cronJobs.delete(taskId);
    }
  }

  public scheduleTask(
    name: string,
    type: TaskType,
    cronExpression: string,
    metadata: ScheduledTask["metadata"],
    enabled: boolean = true,
    dependencies?: ScheduledTask["dependencies"]
  ): ScheduledTask {
    if (cronExpression && !this.isValidCron(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const task: ScheduledTask = {
      id: this.generateTaskId(),
      name,
      type,
      cronExpression,
      enabled,
      createdAt: new Date(),
      runCount: 0,
      metadata,
      nextRun: cronExpression ? this.calculateNextRun(cronExpression) : undefined,
      dependencies,
    };

    this.tasks.set(task.id, task);

    if (enabled && cronExpression) {
      this.startCronJob(task);
    }

    this.persistTasks();
    this.emit("task:scheduled", task);

    return task;
  }

  public scheduleScript(
    name: string,
    cronExpression: string,
    scriptPath: string,
    args?: string[]
  ): ScheduledTask {
    return this.scheduleTask(name, "script", cronExpression, {
      target: scriptPath,
      command: args ? `${scriptPath} ${args.join(" ")}` : scriptPath,
    });
  }

  public scheduleAgentTask(
    name: string,
    cronExpression: string,
    agentName: string,
    taskDescription: string
  ): ScheduledTask {
    return this.scheduleTask(name, "agent", cronExpression, {
      agentName,
      task: taskDescription,
    });
  }

  public scheduleReminder(
    name: string,
    cronExpression: string,
    message: string,
    targetAgent?: string
  ): ScheduledTask {
    return this.scheduleTask(name, "reminder", cronExpression, {
      message,
      agentName: targetAgent,
    });
  }

  public scheduleCommand(
    name: string,
    cronExpression: string,
    command: string
  ): ScheduledTask {
    return this.scheduleTask(name, "command", cronExpression, {
      command,
    });
  }

  public scheduleWebhook(
    name: string,
    cronExpression: string,
    url: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
    headers?: Record<string, string>,
    body?: any
  ): ScheduledTask {
    return this.scheduleTask(name, "webhook", cronExpression, {
      url,
      method,
      headers,
      body,
    });
  }

  public cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    this.stopCronJob(taskId);
    this.tasks.delete(taskId);
    
    if (this.db) {
      this.db.execute({ sql: "DELETE FROM scheduled_tasks WHERE id = ?", args: [taskId] })
        .catch(e => console.error("[Scheduler] Failed to delete task from DB:", e));
    }
    
    this.persistTasks();
    this.emit("task:cancelled", task);

    return true;
  }

  public pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.enabled = false;
    this.stopCronJob(taskId);
    this.persistTasks();
    this.emit("task:paused", task);

    return true;
  }

  public resumeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.enabled = true;
    if (task.cronExpression) {
      task.nextRun = this.calculateNextRun(task.cronExpression);
      this.startCronJob(task);
    }
    this.persistTasks();
    this.emit("task:resumed", task);

    return true;
  }

  public getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  public getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  public getTasksByType(type: TaskType): ScheduledTask[] {
    return this.getAllTasks().filter((task) => task.type === type);
  }

  public getEnabledTasks(): ScheduledTask[] {
    return this.getAllTasks().filter((task) => task.enabled);
  }

  public getExecutionHistory(limit: number = 50): TaskExecutionResult[] {
    return this.executionHistory.slice(-limit);
  }

  public getTaskHistory(taskId: string, limit: number = 20): TaskExecutionResult[] {
    return this.executionHistory
      .filter((result) => result.taskId === taskId)
      .slice(-limit);
  }

  public updateTask(
    taskId: string,
    updates: Partial<Pick<ScheduledTask, "name" | "cronExpression" | "metadata" | "enabled" | "dependencies">>
  ): ScheduledTask | undefined {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    if (updates.cronExpression && !this.isValidCron(updates.cronExpression)) {
      throw new Error(`Invalid cron expression: ${updates.cronExpression}`);
    }

    const wasEnabled = task.enabled;
    const cronChanged = updates.cronExpression !== undefined && updates.cronExpression !== task.cronExpression;

    Object.assign(task, updates);

    if (cronChanged) {
      task.nextRun = task.cronExpression ? this.calculateNextRun(task.cronExpression) : undefined;
    }

    if (cronChanged || updates.enabled !== undefined) {
      this.stopCronJob(taskId);
      if (task.enabled && task.cronExpression) {
        this.startCronJob(task);
      }
    }

    this.persistTasks();
    this.emit("task:updated", task);

    return task;
  }

  public async runTaskNow(taskId: string): Promise<{ success: boolean; message: string; error?: string }> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return {
        success: false,
        message: "Task not found",
        error: "Task not found",
      };
    }

    await this.executeTask(task);
    
    return {
      success: true,
      message: "Task execution started",
    };
  }

  public validateCronExpression(expression: string): { valid: boolean; description?: string } {
    const valid = this.isValidCron(expression);
    return {
      valid,
      description: valid ? this.describeCron(expression) : undefined,
    };
  }

  private describeCron(expression: string): string {
    const parts = expression.split(" ");
    if (parts.length !== 5 && parts.length !== 6) {
      return "Custom schedule";
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    if (minute === "*" && hour === "*") {
      return "Every minute";
    }
    if (minute === "*/5" && hour === "*") {
      return "Every 5 minutes";
    }
    if (minute === "*/15" && hour === "*") {
      return "Every 15 minutes";
    }
    if (minute === "*/30" && hour === "*") {
      return "Every 30 minutes";
    }
    if (minute === "0" && hour === "*") {
      return "Every hour";
    }
    if (minute === "0" && hour === "*/2") {
      return "Every 2 hours";
    }
    if (minute === "0" && hour === "*/6") {
      return "Every 6 hours";
    }
    if (minute === "0" && hour === "*/12") {
      return "Every 12 hours";
    }
    if (minute === "0" && hour === "0") {
      return "Daily at midnight";
    }
    if (minute !== "*" && hour !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return `Daily at ${hour}:${minute}`;
    }
    if (dayOfWeek !== "*" && dayOfMonth === "*") {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return `Every ${days[parseInt(dayOfWeek)] || "week"} at ${hour}:${minute}`;
    }

    return "Custom schedule";
  }

  public getStats(): {
    totalTasks: number;
    enabledTasks: number;
    disabledTasks: number;
    byType: Record<TaskType, number>;
    totalExecutions: number;
  } {
    const tasks = this.getAllTasks();
    const byType: Record<TaskType, number> = {
      script: 0,
      agent: 0,
      reminder: 0,
      command: 0,
      webhook: 0,
    };

    tasks.forEach((task) => {
      byType[task.type]++;
    });

    return {
      totalTasks: tasks.length,
      enabledTasks: tasks.filter((t) => t.enabled).length,
      disabledTasks: tasks.filter((t) => !t.enabled).length,
      byType,
      totalExecutions: this.executionHistory.length,
    };
  }

  public shutdown(): void {
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
      this.persistenceTimer = null;
    }

    this.persistTasks();

    for (const taskId of this.cronJobs.keys()) {
      this.stopCronJob(taskId);
    }
    this.emit("shutdown");
  }

  public getTasksFilePath(): string {
    return TASKS_FILE;
  }

  public isReady(): boolean {
    return this.isLoaded;
  }

  public exportTasks(): string {
    const data: PersistedData = {
      version: PERSISTENCE_VERSION,
      tasks: Array.from(this.tasks.values()).map((task) => ({
        id: task.id,
        name: task.name,
        type: task.type,
        cronExpression: task.cronExpression,
        enabled: task.enabled,
        createdAt: task.createdAt.toISOString(),
        lastRun: task.lastRun?.toISOString(),
        runCount: task.runCount,
        metadata: task.metadata,
      })),
      savedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  }

  public importTasks(jsonData: string, merge: boolean = true): { success: boolean; imported: number; errors: string[] } {
    const errors: string[] = [];
    let imported = 0;

    try {
      const data: PersistedData = JSON.parse(jsonData);

      if (!merge) {
        for (const taskId of this.tasks.keys()) {
          this.cancelTask(taskId);
        }
      }

      for (const taskData of data.tasks) {
        try {
          if (!this.isValidCron(taskData.cronExpression)) {
            errors.push(`Invalid cron for task "${taskData.name}": ${taskData.cronExpression}`);
            continue;
          }

          const task: ScheduledTask = {
            id: taskData.id,
            name: taskData.name,
            type: taskData.type,
            cronExpression: taskData.cronExpression,
            enabled: taskData.enabled,
            createdAt: new Date(taskData.createdAt),
            lastRun: taskData.lastRun ? new Date(taskData.lastRun) : undefined,
            nextRun: this.calculateNextRun(taskData.cronExpression),
            runCount: taskData.runCount || 0,
            metadata: taskData.metadata,
          };

          if (this.tasks.has(task.id)) {
            task.id = this.generateTaskId();
          }

          this.tasks.set(task.id, task);

          if (task.enabled && task.cronExpression) {
            this.startCronJob(task);
          }

          imported++;
        } catch (err: any) {
          errors.push(`Failed to import task "${taskData.name}": ${err.message}`);
        }
      }

      this.persistTasks();

      return { success: true, imported, errors };
    } catch (error: any) {
      return { success: false, imported: 0, errors: [`Failed to parse import data: ${error.message}`] };
    }
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService;
