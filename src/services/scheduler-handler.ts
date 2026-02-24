import { EventEmitter } from 'events';
import { mastra } from '../mastra/index.js';
import { PodmanSandbox } from '../tools/podman-workspace.js';
import { bot } from '../utils/telegram.js';
import type { ScheduledTask } from './scheduler-service.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Whitelist of safe commands
const SAFE_COMMANDS = [
  'git', 'npm', 'node', 'docker', 'podman', 'curl', 'wget',
  'ls', 'cat', 'grep', 'find', 'echo', 'date', 'whoami'
];

import { getAuthenticatedUsers } from '../utils/telegram-auth.js';

export class SchedulerEventHandler {
  constructor(private emitter: EventEmitter) {
    this.registerHandlers();
  }

  private registerHandlers() {
    this.emitter.on('script:execute', this.handleScriptExecution.bind(this));
    this.emitter.on('agent:delegate', this.handleAgentDelegation.bind(this));
    this.emitter.on('reminder:trigger', this.handleReminder.bind(this));
    this.emitter.on('command:execute', this.handleCommandExecution.bind(this));
    this.emitter.on('webhook:trigger', this.handleWebhookExecution.bind(this));
    this.emitter.on('task:failed', this.handleTaskFailed.bind(this));
  }

  private async handleWebhookExecution(data: {
    task: ScheduledTask;
  }): Promise<void> {
    const { task } = data;
    
    try {
      console.log(`[Scheduler] Executing webhook for task: ${task.name}`);
      
      const { url, method = 'GET', headers = {}, body } = task.metadata;
      
      if (!url) {
        throw new Error('Webhook URL is missing');
      }

      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Webhook failed with status ${response.status}: ${responseText}`);
      }

      // Emit success event
      this.emitter.emit('task:complete', {
        taskId: task.id,
        result: {
          success: true,
          status: response.status,
          response: responseText
        }
      });

      console.log(`[Scheduler] Webhook task ${task.name} completed successfully (Status: ${response.status})`);
    } catch (error) {
      console.error(`[Scheduler] Webhook execution failed for task ${task.name}:`, error);
      
      this.emitter.emit('task:error', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async handleTaskFailed(data: {
    task: ScheduledTask;
    error: string;
  }): Promise<void> {
    const { task, error } = data;
    
    // Check if task metadata specifies a chatId for failure notifications
    let chatId = task.metadata?.chatId || task.metadata?.telegramChatId;
    
    if (!chatId) {
      const users = getAuthenticatedUsers();
      if (users.length > 0) {
        chatId = users[0].chatId;
      }
    }

    if (!chatId || !task.metadata?.notifyOnError) {
      return;
    }

    try {
      console.log(`[Scheduler] Sending failure notification for task: ${task.name}`);
      const formattedMessage = `❌ *Scheduled Task Failed*\n\n*Task:* ${task.name}\n*Error:* ${error}\n\n_Time: ${new Date().toLocaleString()}_`;
      await bot.sendMessage(chatId, formattedMessage, { parse_mode: 'Markdown' });
    } catch (notifyError) {
      console.error(`[Scheduler] Failed to send error notification for task ${task.name}:`, notifyError);
    }
  }

  private async handleScriptExecution(data: { 
    task: ScheduledTask; 
    command: string 
  }): Promise<void> {
    const { task, command } = data;
    
    let sandbox: PodmanSandbox | undefined;
    
    try {
      console.log(`[Scheduler] Executing script for task: ${task.name}`);
      
      // Use Podman workspace to execute script
      sandbox = new PodmanSandbox(`scheduler-${task.id}`, task.metadata?.workingDir || '/workspace');
      await sandbox.initialize();

      const result = await sandbox.executeCommand(
        command,
        {
          workingDir: task.metadata?.workingDir || '/workspace',
          timeout: task.metadata?.timeout || 300000 // 5 min default
        }
      );

      // Emit success event
      this.emitter.emit('task:complete', {
        taskId: task.id,
        result: {
          success: result.exitCode === 0,
          output: result.stdout,
          error: result.stderr,
          exitCode: result.exitCode
        }
      });

      console.log(`[Scheduler] Script task ${task.name} completed successfully`);
    } catch (error) {
      console.error(`[Scheduler] Script execution failed for task ${task.name}:`, error);
      
      this.emitter.emit('task:error', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      if (sandbox) {
        await sandbox.cleanup().catch(e => console.error(`[Scheduler] Failed to cleanup sandbox for task ${task.name}:`, e));
      }
    }
  }

  private async handleAgentDelegation(data: {
    task: ScheduledTask;
    agentName: string;
    taskDescription: string;
  }): Promise<void> {
    const { task, agentName, taskDescription } = data;
    
    try {
      console.log(`[Scheduler] Delegating to agent ${agentName} for task: ${task.name}`);
      
      // Get agent from Mastra
      const agent = mastra.getAgent(agentName);
      
      if (!agent) {
        throw new Error(`Agent ${agentName} not found`);
      }

      // Execute agent task
      const result = await agent.generate(taskDescription, {
        context: {
          scheduledTask: task.id,
          scheduledBy: 'scheduler-agent',
          ...task.metadata?.context
        }
      });

      // Emit success event
      this.emitter.emit('task:complete', {
        taskId: task.id,
        result: {
          success: true,
          agent: agentName,
          response: result.text,
          metadata: result.usage
        }
      });

      console.log(`[Scheduler] Agent delegation ${task.name} completed successfully`);
    } catch (error) {
      console.error(`[Scheduler] Agent delegation failed for task ${task.name}:`, error);
      
      this.emitter.emit('task:error', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async handleReminder(data: {
    task: ScheduledTask;
    message: string;
    targetAgent?: string;
  }): Promise<void> {
    const { task, message, targetAgent } = data;
    
    try {
      console.log(`[Scheduler] Sending reminder for task: ${task.name}`);
      
      // Get chat ID from task metadata or use default
      let chatId = task.metadata?.chatId || task.metadata?.telegramChatId;
      
      if (!chatId) {
        const users = getAuthenticatedUsers();
        if (users.length > 0) {
          chatId = users[0].chatId;
        } else {
          throw new Error('No Telegram chat ID specified for reminder and no authenticated users found');
        }
      }

      // Format reminder message
      const formattedMessage = `🔔 *Reminder*\n\n${message}\n\n_Scheduled by: ${task.name}_`;

      // Send via Telegram using bot
      await bot.sendMessage(chatId, formattedMessage, { parse_mode: 'Markdown' });

      // Emit success event
      this.emitter.emit('task:complete', {
        taskId: task.id,
        result: {
          success: true,
          reminderSent: true,
          chatId,
          message
        }
      });

      console.log(`[Scheduler] Reminder ${task.name} sent successfully`);
    } catch (error) {
      console.error(`[Scheduler] Reminder failed for task ${task.name}:`, error);
      
      this.emitter.emit('task:error', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async handleCommandExecution(data: {
    task: ScheduledTask;
    command: string;
  }): Promise<void> {
    const { task, command } = data;
    
    try {
      console.log(`[Scheduler] Executing command for task: ${task.name}`);
      
      // Safety check: validate command
      const commandBase = command.trim().split(' ')[0];
      const isSafe = SAFE_COMMANDS.some(safe => commandBase === safe || commandBase.startsWith(safe));
      
      if (!isSafe && !task.metadata?.allowUnsafe) {
        throw new Error(`Command "${commandBase}" is not in the safe commands list. Set allowUnsafe: true in metadata to override.`);
      }

      // Execute command with timeout
      const timeout = task.metadata?.timeout || 60000; // 1 min default
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        cwd: task.metadata?.workingDir,
        env: { ...process.env, ...task.metadata?.env }
      });

      // Emit success event
      this.emitter.emit('task:complete', {
        taskId: task.id,
        result: {
          success: true,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          command
        }
      });

      console.log(`[Scheduler] Command ${task.name} completed successfully`);
    } catch (error) {
      console.error(`[Scheduler] Command execution failed for task ${task.name}:`, error);
      
      this.emitter.emit('task:error', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
