// podman-workspace-mcp.ts - Mastra MCP Server for Podman Sandbox
import { MCPServer } from "@mastra/mcp";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { spawn, exec as execCallback } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const exec = promisify(execCallback);

// Global sandbox instance
let sandbox: PodmanSandbox | null = null;

// Default sandbox configuration
const DEFAULT_AGENT_ID = "mastra-sandbox";

/**
 * Ensure sandbox is initialized before using it
 * Automatically creates and initializes if not ready
 */
async function ensureInitialized(): Promise<PodmanSandbox> {
  if (sandbox && sandbox.isReady()) {
    return sandbox;
  }

  // Create new sandbox with config from environment variables
  const agentId = process.env.PODMAN_AGENT_ID || DEFAULT_AGENT_ID;
  const workspaceDir = process.env.PODMAN_WORKSPACE_DIR;
  sandbox = new PodmanSandbox(agentId, workspaceDir);
  await sandbox.initialize();
  return sandbox;
}

/**
 * Podman Sandbox Manager - handles container lifecycle and workspace
 */
class PodmanSandbox {
  private containerId: string | null = null;
  private imageName: string;
  private workspaceDir: string;
  private agentId: string;
  private isInitialized: boolean = false;

  constructor(agentId: string = "default", workspaceDir?: string) {
    this.agentId = agentId;
    this.imageName = "agent-sandbox:alpine";

    if (workspaceDir) {
      this.workspaceDir = path.resolve(workspaceDir);
    } else {
      this.workspaceDir = path.join(os.tmpdir(), "podman-sandbox", agentId);
    }
  }

  getWorkspacePath(): string {
    return this.workspaceDir;
  }

  async workspaceExists(): Promise<boolean> {
    try {
      await fs.access(this.workspaceDir);
      return true;
    } catch {
      return false;
    }
  }

  async createWorkspace(): Promise<void> {
    await fs.mkdir(this.workspaceDir, { recursive: true });
  }

  async listWorkspaceFromHost(): Promise<string[]> {
    // Use container commands to list workspace files
    if (!this.isInitialized) {
      // If container not initialized, list from host
      try {
        const files = await fs.readdir(this.workspaceDir, { recursive: true });
        return files as string[];
      } catch {
        return [];
      }
    }
    
    // Use find command in container for accurate listing
    const result = await this.executeCommand(
      `find /workspace -type f -o -type d | sed 's|^/workspace/||' | grep -v '^$'`
    );
    
    if (result.exitCode !== 0) {
      return [];
    }
    
    return result.stdout.split('\\n').filter(Boolean);
  }

  async getWorkspaceSize(): Promise<{ bytes: number; human: string }> {
    // Use container commands to get workspace size
    if (!this.isInitialized) {
      // Fallback to host calculation if container not ready
      let totalSize = 0;

      async function getSize(dirPath: string): Promise<void> {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            await getSize(fullPath);
          } else {
            const stats = await fs.stat(fullPath);
            totalSize += stats.size;
          }
        }
      }

      try {
        await getSize(this.workspaceDir);
      } catch {}

      const kb = totalSize / 1024;
      const mb = kb / 1024;
      const gb = mb / 1024;

      let human: string;
      if (gb >= 1) human = `${gb.toFixed(2)} GB`;
      else if (mb >= 1) human = `${mb.toFixed(2)} MB`;
      else if (kb >= 1) human = `${kb.toFixed(2)} KB`;
      else human = `${totalSize} bytes`;

      return { bytes: totalSize, human };
    }
    
    // Use du command in container
    const result = await this.executeCommand(`du -sb /workspace | awk '{print $1}'`);
    
    if (result.exitCode !== 0) {
      return { bytes: 0, human: '0 bytes' };
    }
    
    const totalSize = parseInt(result.stdout.trim()) || 0;
    const kb = totalSize / 1024;
    const mb = kb / 1024;
    const gb = mb / 1024;

    let human: string;
    if (gb >= 1) human = `${gb.toFixed(2)} GB`;
    else if (mb >= 1) human = `${mb.toFixed(2)} MB`;
    else if (kb >= 1) human = `${kb.toFixed(2)} KB`;
    else human = `${totalSize} bytes`;

    return { bytes: totalSize, human };
  }

  async cleanWorkspace(): Promise<void> {
    // Use container commands to clean workspace
    // Remove all files but keep the workspace directory itself
    await this.executeCommand(`find /workspace -mindepth 1 -delete`);
  }

  async deleteWorkspace(): Promise<void> {
    // This deletes the workspace on the host (only used when completely destroying)
    await fs.rm(this.workspaceDir, { recursive: true, force: true });
  }

  async copyToWorkspace(sourcePath: string, destPath: string = "."): Promise<void> {
    // Use podman cp to copy from host to container
    if (!this.containerId) {
      throw new Error("Container not initialized");
    }
    
    const sourceResolved = path.resolve(sourcePath);
    const destInContainer = destPath.startsWith("/") ? destPath : `/workspace/${destPath}`;
    
    // Create destination directory in container first
    const destDir = path.dirname(destInContainer);
    await this.executeCommand(`mkdir -p "${destDir}"`);
    
    // Use podman cp to copy file
    await exec(`podman cp "${sourceResolved}" ${this.containerId}:"${destInContainer}"`);
  }

  async copyFromWorkspace(sourcePath: string, destPath: string): Promise<void> {
    // Use podman cp to copy from container to host
    if (!this.containerId) {
      throw new Error("Container not initialized");
    }
    
    const sourceInContainer = sourcePath.startsWith("/") ? sourcePath : `/workspace/${sourcePath}`;
    const destResolved = path.resolve(destPath);

    // Create destination directory on host
    await fs.mkdir(path.dirname(destResolved), { recursive: true });
    
    // Use podman cp to copy file
    await exec(`podman cp ${this.containerId}:"${sourceInContainer}" "${destResolved}"`);
  }

  async archiveWorkspace(outputPath: string): Promise<void> {
    // Create tar archive inside container, then copy to host
    if (!this.containerId) {
      throw new Error("Container not initialized");
    }
    
    const archiveName = `workspace_backup_${Date.now()}.tar.gz`;
    const containerArchive = `/tmp/${archiveName}`;
    
    // Create archive inside container
    await this.executeCommand(
      `tar -czf "${containerArchive}" -C /workspace .`,
      { timeout: 120000 }
    );
    
    // Copy archive from container to host
    const destResolved = path.resolve(outputPath);
    await fs.mkdir(path.dirname(destResolved), { recursive: true });
    await exec(`podman cp ${this.containerId}:"${containerArchive}" "${destResolved}"`);
    
    // Clean up archive in container
    await this.executeCommand(`rm -f "${containerArchive}"`).catch(() => {});
  }

  async restoreWorkspace(archivePath: string): Promise<void> {
    // Copy archive to container, then extract
    if (!this.containerId) {
      throw new Error("Container not initialized");
    }
    
    const archiveName = `restore_${Date.now()}.tar.gz`;
    const containerArchive = `/tmp/${archiveName}`;
    
    // Copy archive from host to container
    const sourceResolved = path.resolve(archivePath);
    await exec(`podman cp "${sourceResolved}" ${this.containerId}:"${containerArchive}"`);
    
    // Extract archive inside container
    await this.executeCommand(
      `tar -xzf "${containerArchive}" -C /workspace`,
      { timeout: 120000 }
    );
    
    // Clean up archive in container
    await this.executeCommand(`rm -f "${containerArchive}"`).catch(() => {});
  }

  static async isPodmanAvailable(): Promise<boolean> {
    try {
      await exec("podman --version");
      return true;
    } catch {
      return false;
    }
  }

  private async isPodmanMachineRunning(): Promise<boolean> {
    const platform = os.platform();

    if (platform === "linux") {
      return true;
    }

    try {
      const { stdout } = await exec("podman machine list --format json");
      const machines = JSON.parse(stdout);
      return machines.some((m: any) => m.Running);
    } catch {
      return false;
    }
  }

  private async startPodmanMachine(): Promise<void> {
    const platform = os.platform();

    if (platform === "linux") {
      return;
    }

    try {
      const { stdout } = await exec("podman machine list --format json");
      const machines = JSON.parse(stdout);

      if (machines.length === 0) {
        await exec("podman machine init");
      }

      await exec("podman machine start", { timeout: 60000 });
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error: any) {
      throw new Error(`Failed to start Podman machine: ${error.message}`);
    }
  }

  static async buildImage(): Promise<void> {
    const dockerfile = `
FROM alpine:latest

# Install required packages (base system utilities and development tools)
RUN apk update && apk add --no-cache  python3 py3-pip nodejs npm bash curl wget git gcc g++ make linux-headers musl-dev ca-certificates tzdata

# Create workspace directory - this will be the ONLY writable location when container runs
# (Container runs with --read-only, so only /workspace mount and /tmp tmpfs are writable)
RUN mkdir -p /workspace && chmod 777 /workspace
WORKDIR /workspace

# Create non-root user for executing commands
# UID 1000 matches typical user on host for file permission compatibility
RUN adduser -D -u 1000 -h /home/sandbox sandbox &&  chown -R sandbox:sandbox /workspace

# Switch to non-root user (though container may start as root, commands execute as this user)
USER sandbox

# Keep container running (idle loop)
CMD ["/bin/sh", "-c", "while true; do sleep 1; done"]
`;

    const tmpDir = os.tmpdir();
    const dockerfilePath = path.join(tmpDir, "Dockerfile.sandbox");
    await fs.writeFile(dockerfilePath, dockerfile);

    try {
      try {
        await exec("podman image inspect agent-sandbox:alpine");
        return;
      } catch {}

      await new Promise<void>((resolve, reject) => {
        const process = spawn(
          "podman",
          ["build", "-t", "agent-sandbox:alpine", "-f", dockerfilePath, tmpDir],
          { stdio: "inherit" }
        );

        process.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Build failed with code ${code}`));
        });

        process.on("error", reject);
      });
    } finally {
      await fs.unlink(dockerfilePath).catch(() => {});
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (!(await PodmanSandbox.isPodmanAvailable())) {
      throw new Error("Podman is not installed. Please install Podman first.");
    }

    if (!(await this.isPodmanMachineRunning())) {
      await this.startPodmanMachine();
    }

    try {
      await exec(`podman image inspect ${this.imageName}`);
    } catch {
      await PodmanSandbox.buildImage();
    }

    await fs.mkdir(this.workspaceDir, { recursive: true });
    
    // Fix permissions: Make workspace writable by container user (UID 1000)
    // This ensures the sandbox user inside container can write to the mounted volume
    try {
      await exec(`chmod -R 777 "${this.workspaceDir}"`);
    } catch {
      // Ignore chmod errors - may not have permission to change
    }

    const containerName = `sandbox-${this.agentId}`;

    const createCmd = [
      "podman",
      "run",
      "-d",
      "--name",
      containerName,
      "--rm",
      // Mount workspace - your ONLY connection to host filesystem
      "-v",
      `${this.workspaceDir}:/workspace:Z`,
      // Note: No --read-only to allow package installations to persist
      // Container filesystem is isolated from host regardless
      // Writable /tmp for temporary operations
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=100m",
      // Resource limits
      "--memory",
      "512m",
      "--cpus",
      "0.5",
      // Network access (set to "none" if you want no internet)
      "--network",
      "bridge",
      // Security hardening
      "--security-opt",
      "no-new-privileges",
      "--cap-drop",
      "ALL",
      // Prevent DNS/hosts manipulation
      "--no-hosts",
      // Prevent access to host devices
      // "--device-read-bps",
      // "/dev/sda:0",
      // "--device-write-bps",
      // "/dev/sda:0",
      // User namespace isolation
      "--userns",
      "keep-id",
      // Run with minimal privileges
      "--pids-limit",
      "100",
      this.imageName,
    ].join(" ");

    const { stdout } = await exec(createCmd);
    this.containerId = stdout.trim();
    this.isInitialized = true;
  }

  async executeCommand(
    command: string,
    options: {
      timeout?: number;
      user?: string;
      workingDir?: string;
      env?: Record<string, string>;
    } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.isInitialized || !this.containerId) {
      throw new Error("Sandbox not initialized. Call initialize() first.");
    }

    const timeout = options.timeout || 30000;
    const user = options.user || "sandbox";
    const workingDir = options.workingDir || "/workspace";

    const execArgs = ["podman", "exec", "-u", user, "-w", workingDir];

    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        execArgs.push("-e", `${key}=${value}`);
      }
    }

    execArgs.push(this.containerId, "/bin/sh", "-c", command);

    return new Promise((resolve, reject) => {
      const process = spawn(execArgs[0], execArgs.slice(1));

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        process.kill("SIGTERM");
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      process.on("close", (code) => {
        clearTimeout(timeoutId);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0,
        });
      });

      process.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  async executePython(
    code: string,
    options: { timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const filename = `/workspace/script_${Date.now()}.py`;
    await this.writeFile(filename, code);

    try {
      const result = await this.executeCommand(`python3 "${filename}"`, {
        timeout: options.timeout || 30000,
      });
      return result;
    } finally {
      await this.deleteFile(filename).catch(() => {});
    }
  }

  async executeJavaScript(
    code: string,
    options: { timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const filename = `/workspace/script_${Date.now()}.js`;
    await this.writeFile(filename, code);

    try {
      const result = await this.executeCommand(`node "${filename}"`, {
        timeout: options.timeout || 30000,
      });
      return result;
    } finally {
      await this.deleteFile(filename).catch(() => {});
    }
  }

  async executeBash(
    script: string,
    options: { timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const filename = `/workspace/script_${Date.now()}.sh`;
    await this.writeFile(filename, script);

    try {
      const result = await this.executeCommand(
        `chmod +x "${filename}" && "${filename}"`,
        { timeout: options.timeout || 30000 }
      );
      return result;
    } finally {
      await this.deleteFile(filename).catch(() => {});
    }
  }

  async writeFile(filename: string, content: string): Promise<void> {
    // Use container commands to write files (respects container user permissions)
    const escapedContent = content.replace(/'/g, "'\\''"  ); // Escape single quotes
    const dir = path.dirname(filename);
    
    // Create directory if needed
    await this.executeCommand(`mkdir -p "${dir}"`);
    
    // Write file using cat with heredoc
    await this.executeCommand(`cat > "${filename}" << 'EOF_MARKER_12345'
${content}
EOF_MARKER_12345`);
  }

  async readFile(filename: string): Promise<string> {
    // Use container commands to read files
    const result = await this.executeCommand(`cat "${filename}"`);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }
    
    return result.stdout;
  }

  async listFiles(dirPath: string = "/workspace"): Promise<string[]> {
    const result = await this.executeCommand(`ls -1 ${dirPath}`);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list files: ${result.stderr}`);
    }

    return result.stdout.split("\n").filter(Boolean);
  }

  async deleteFile(filename: string): Promise<void> {
    // Use container commands to delete files
    const result = await this.executeCommand(`rm -f "${filename}"`);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to delete file: ${result.stderr}`);
    }
  }

  async fileExists(filename: string): Promise<boolean> {
    const result = await this.executeCommand(
      `test -f "${filename}" && echo "exists"`
    );
    return result.stdout.includes("exists");
  }

  async createDirectory(dirPath: string): Promise<void> {
    // Use container commands to create directories
    const result = await this.executeCommand(`mkdir -p "${dirPath}"`);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create directory: ${result.stderr}`);
    }
  }

  async installPackage(
    packageName: string,
    type: "python" | "npm" | "apk" = "python",
    options: { timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    let command: string;
    let user: string = "root";

    switch (type) {
      case "python":
        command = `pip3 install --break-system-packages ${packageName}`;
        break;
      case "npm":
        command = `npm install -g ${packageName}`;
        break;
      case "apk":
        command = `apk add ${packageName}`;
        break;
    }

    return await this.executeCommand(command, {
      timeout: options.timeout || 120000,
      user,
    });
  }

  async uninstallPackage(
    packageName: string,
    type: "python" | "npm" | "apk" = "python"
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    let command: string;
    let user: string = "root";

    switch (type) {
      case "python":
        command = `pip3 uninstall -y ${packageName}`;
        break;
      case "npm":
        command = `npm uninstall -g ${packageName}`;
        break;
      case "apk":
        command = `apk del ${packageName}`;
        break;
    }

    return await this.executeCommand(command, { timeout: 60000, user });
  }

  async getSystemInfo(): Promise<{
    os: string;
    kernel: string;
    python: string;
    node: string;
    disk: string;
    memory: string;
  }> {
    const result = await this.executeCommand(`
      echo "OS=$(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"
      echo "Kernel=$(uname -r)"
      echo "Python=$(python3 --version 2>&1)"
      echo "Node=$(node --version 2>&1)"
      echo "Disk=$(df -h /workspace | tail -1 | awk '{print $4}')"
      echo "Memory=$(free -h 2>/dev/null | grep Mem | awk '{print $2}' || echo 'N/A')"
    `);

    const info: any = {};
    result.stdout.split("\n").forEach((line) => {
      const [key, value] = line.split("=");
      if (key && value) {
        info[key.toLowerCase()] = value;
      }
    });

    return info;
  }

  async getResourceUsage(): Promise<{
    cpu: string;
    memory: string;
    disk: string;
  }> {
    if (!this.containerId) {
      throw new Error("Container not initialized");
    }

    const { stdout } = await exec(
      `podman stats ${this.containerId} --no-stream --format json`
    );
    const stats = JSON.parse(stdout);

    return {
      cpu: stats.CPUPerc || "0%",
      memory: stats.MemUsage || "0B / 0B",
      disk: stats.BlockIO || "0B / 0B",
    };
  }

  async cleanup(options: { deleteWorkspace?: boolean } = {}): Promise<void> {
    if (this.containerId) {
      try {
        await exec(`podman stop ${this.containerId}`, { timeout: 10000 });
      } catch {}
      this.containerId = null;
      this.isInitialized = false;
    }

    if (options.deleteWorkspace) {
      await this.deleteWorkspace();
    }
  }

  getContainerId(): string | null {
    return this.containerId;
  }

  isReady(): boolean {
    return this.isInitialized && this.containerId !== null;
  }
}

// ==================== MCP TOOLS ====================

const initializeSandboxTool = createTool({
  id: "initialize-sandbox",
  description: "Initialize a new Podman sandbox container with persistent workspace using environment variables PODMAN_AGENT_ID and PODMAN_WORKSPACE_DIR",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    workspacePath: z.string(),
    containerId: z.string().optional(),
    message: z.string(),
  }),
  execute: async (input) => {
    const agentId = process.env.PODMAN_AGENT_ID || DEFAULT_AGENT_ID;
    const workspaceDir = process.env.PODMAN_WORKSPACE_DIR;
    sandbox = new PodmanSandbox(agentId, workspaceDir);

    try {
      await sandbox.initialize();
      return {
        success: true,
        workspacePath: sandbox.getWorkspacePath(),
        containerId: sandbox.getContainerId() || undefined,
        message: "Sandbox initialized successfully",
      };
    } catch (error: any) {
      return {
        success: false,
        workspacePath: sandbox.getWorkspacePath(),
        message: error.message,
      };
    }
  },
});

const executeCommandTool = createTool({
  id: "execute-command",
  description: "Execute a shell command in the sandbox container (auto-initializes if needed using environment variables)",
  inputSchema: z.object({
    command: z.string().describe("The shell command to execute"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default: 30000)"),
    user: z.string().optional().describe("User to run as (default: 'sandbox')"),
    workingDir: z.string().optional().describe("Working directory inside container. Use paths starting with /workspace (e.g., '/workspace' or '/workspace/project'). Default: '/workspace'"),
    env: z.record(z.string(), z.string()).optional().describe("Environment variables"),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    const result = await sb.executeCommand(input.command, {
      timeout: input.timeout,
      user: input.user,
      workingDir: input.workingDir,
      env: input.env,
    });
    return { ...result, autoInitialized: !wasAlreadyReady };
  },
});

const executePythonTool = createTool({
  id: "execute-python",
  description: "Execute Python code in the sandbox container (auto-initializes if needed using environment variables)",
  inputSchema: z.object({
    code: z.string().describe("Python code to execute"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default: 30000)"),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    const result = await sb.executePython(input.code, { timeout: input.timeout });
    return { ...result, autoInitialized: !wasAlreadyReady };
  },
});

const executeJavaScriptTool = createTool({
  id: "execute-javascript",
  description: "Execute JavaScript/Node.js code in the sandbox container (auto-initializes if needed using environment variables)",
  inputSchema: z.object({
    code: z.string().describe("JavaScript code to execute"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default: 30000)"),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    const result = await sb.executeJavaScript(input.code, { timeout: input.timeout });
    return { ...result, autoInitialized: !wasAlreadyReady };
  },
});

const executeBashTool = createTool({
  id: "execute-bash",
  description: "Execute a bash script in the sandbox container (auto-initializes if needed using environment variables)",
  inputSchema: z.object({
    script: z.string().describe("Bash script to execute"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default: 30000)"),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    const result = await sb.executeBash(input.script, { timeout: input.timeout });
    return { ...result, autoInitialized: !wasAlreadyReady };
  },
});

const writeFileTool = createTool({
  id: "write-file",
  description: "Write a file to the sandbox workspace (auto-initializes if needed using environment variables)",
  inputSchema: z.object({
    filename: z.string().describe("Path of the file to write. MUST use container path starting with /workspace (e.g., '/workspace/myfile.txt' or '/workspace/project/src/app.js'). Do NOT use relative paths or host paths."),
    content: z.string().describe("Content to write to the file"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    await sb.writeFile(input.filename, input.content);
    return {
      success: true,
      path: path.join(sb.getWorkspacePath(), input.filename),
      autoInitialized: !wasAlreadyReady,
    };
  },
});

const readFileTool = createTool({
  id: "read-file",
  description: "Read a file from the sandbox workspace (auto-initializes if needed using environment variables)",
  inputSchema: z.object({
    filename: z.string().describe("Path of the file to read. MUST use container path starting with /workspace (e.g., '/workspace/myfile.txt'). Do NOT use relative paths or host paths."),
  }),
  outputSchema: z.object({
    content: z.string(),
    path: z.string(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    const content = await sb.readFile(input.filename);
    return {
      content,
      path: path.join(sb.getWorkspacePath(), input.filename),
      autoInitialized: !wasAlreadyReady,
    };
  },
});

const listFilesTool = createTool({
  id: "list-files",
  description: "List files in the sandbox workspace (auto-initializes if needed using environment variables)",
  inputSchema: z.object({
    dirPath: z.string().optional().describe("Directory path to list. Use container paths starting with /workspace (e.g., '/workspace' or '/workspace/project'). Default: '/workspace'"),
  }),
  outputSchema: z.object({
    files: z.array(z.string()),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    const files = await sb.listFiles(input.dirPath || "/workspace");
    return { files, autoInitialized: !wasAlreadyReady };
  },
});

const deleteFileTool = createTool({
  id: "delete-file",
  description: "Delete a file from the sandbox workspace (auto-initializes if needed using environment variables)",
  inputSchema: z.object({
    filename: z.string().describe("Path of the file to delete. MUST use container path starting with /workspace (e.g., '/workspace/myfile.txt'). Do NOT use relative paths or host paths."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    await sb.deleteFile(input.filename);
    return { success: true, autoInitialized: !wasAlreadyReady };
  },
});

const createDirectoryTool = createTool({
  id: "create-directory",
  description: "Create a directory in the sandbox workspace (auto-initializes if needed using environment variables)",
  inputSchema: z.object({
    dirPath: z.string().describe("Directory path to create. MUST use container path starting with /workspace (e.g., '/workspace/project' or '/workspace/src/components'). Do NOT use relative paths or host paths."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    await sb.createDirectory(input.dirPath);
    return {
      success: true,
      path: path.join(sb.getWorkspacePath(), input.dirPath),
      autoInitialized: !wasAlreadyReady,
    };
  },
});

const installPackageTool = createTool({
  id: "install-package",
  description: "Install a package in the sandbox (Python, npm, or apk) (auto-initializes if needed using environment variables)",
  inputSchema: z.object({
    packageName: z.string().describe("Name of the package to install"),
    type: z.enum(["python", "npm", "apk"]).describe("Package manager type"),
    timeout: z.number().optional().describe("Timeout in milliseconds (default: 120000)"),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    const result = await sb.installPackage(input.packageName, input.type, {
      timeout: input.timeout,
    });
    return { ...result, autoInitialized: !wasAlreadyReady };
  },
});

const uninstallPackageTool = createTool({
  id: "uninstall-package",
  description: "Uninstall a package from the sandbox (Python, npm, or apk) (auto-initializes if needed using environment variables)",
  inputSchema: z.object({
    packageName: z.string().describe("Name of the package to uninstall"),
    type: z.enum(["python", "npm", "apk"]).describe("Package manager type"),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    const result = await sb.uninstallPackage(input.packageName, input.type);
    return { ...result, autoInitialized: !wasAlreadyReady };
  },
});

const getSystemInfoTool = createTool({
  id: "get-system-info",
  description: "Get system information from the sandbox container (auto-initializes if needed using environment variables)",
  inputSchema: z.object({}),
  outputSchema: z.object({
    os: z.string(),
    kernel: z.string(),
    python: z.string(),
    node: z.string(),
    disk: z.string(),
    memory: z.string(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    const result = await sb.getSystemInfo();
    return { ...result, autoInitialized: !wasAlreadyReady };
  },
});

const getResourceUsageTool = createTool({
  id: "get-resource-usage",
  description: "Get resource usage (CPU, memory, disk) of the sandbox container (auto-initializes if needed using environment variables)",
  inputSchema: z.object({}),
  outputSchema: z.object({
    cpu: z.string(),
    memory: z.string(),
    disk: z.string(),
    autoInitialized: z.boolean().describe("Whether sandbox was auto-initialized"),
  }),
  execute: async (input) => {
    const wasAlreadyReady = sandbox?.isReady() || false;
    const sb = await ensureInitialized();
    const result = await sb.getResourceUsage();
    return { ...result, autoInitialized: !wasAlreadyReady };
  },
});

const getWorkspaceInfoTool = createTool({
  id: "get-workspace-info",
  description: "Get information about the sandbox workspace",
  inputSchema: z.object({}),
  outputSchema: z.object({
    path: z.string(),
    exists: z.boolean(),
    size: z.object({
      bytes: z.number(),
      human: z.string(),
    }),
    files: z.array(z.string()),
  }),
  execute: async () => {
    if (!sandbox) {
      throw new Error("Sandbox not initialized. Call initialize-sandbox first.");
    }

    const [exists, size, files] = await Promise.all([
      sandbox.workspaceExists(),
      sandbox.getWorkspaceSize(),
      sandbox.listWorkspaceFromHost(),
    ]);

    return {
      path: sandbox.getWorkspacePath(),
      exists,
      size,
      files,
    };
  },
});

const cleanWorkspaceTool = createTool({
  id: "clean-workspace",
  description: "Clean all files from the sandbox workspace (keeps directory)",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async () => {
    if (!sandbox) {
      throw new Error("Sandbox not initialized. Call initialize-sandbox first.");
    }
    await sandbox.cleanWorkspace();
    return {
      success: true,
      message: "Workspace cleaned successfully",
    };
  },
});

const cleanupSandboxTool = createTool({
  id: "cleanup-sandbox",
  description: "Stop and cleanup the sandbox container",
  inputSchema: z.object({
    deleteWorkspace: z.boolean().optional().describe("Also delete the workspace directory"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async (input) => {
    if (!sandbox) {
      throw new Error("Sandbox not initialized.");
    }
    await sandbox.cleanup({ deleteWorkspace: input.deleteWorkspace });
    sandbox = null;
    return {
      success: true,
      message: input.deleteWorkspace
        ? "Sandbox and workspace cleaned up"
        : "Sandbox container stopped (workspace preserved)",
    };
  },
});

const checkPodmanTool = createTool({
  id: "check-podman",
  description: "Check if Podman is available on the system",
  inputSchema: z.object({}),
  outputSchema: z.object({
    available: z.boolean(),
  }),
  execute: async () => {
    const available = await PodmanSandbox.isPodmanAvailable();
    return { available };
  },
});

const buildImageTool = createTool({
  id: "build-image",
  description: "Build the sandbox Docker image if it doesn't exist",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async () => {
    try {
      await PodmanSandbox.buildImage();
      return {
        success: true,
        message: "Sandbox image built successfully",
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message,
      };
    }
  },
});

// ==================== MCP SERVER ====================

export const podmanWorkspaceMCPServer = new MCPServer({
  id: "podman-workspace-server",
  name: "Podman Workspace MCP Server",
  version: "1.0.0",
  description: "MCP server for running code in isolated Podman containers with persistent workspaces",
  instructions: `
This MCP server provides tools for managing Podman sandbox containers with persistent workspaces.

SECURITY MODEL - COMPLETE ISOLATION:
- Container filesystem is COMPLETELY ISOLATED from host (only /workspace is shared)
- Installed packages PERSIST within the container until cleanup/rebuild
- ONLY /workspace directory connects to host filesystem
- NO access to any host files outside workspace
- NO ability to execute commands on host OS
- User namespace isolation: "root" in container = your user on host
- Capabilities dropped, no privilege escalation possible
- Network access enabled (set to "none" if you want offline mode)
- Resource limits: 512MB RAM, 0.5 CPU, 100 process limit

WHAT AGENTS CAN DO:
✅ Read/write/execute files in /workspace (visible on host)
✅ Install packages (pip, npm, apk) - persist in container
✅ Modify container filesystem (isolated from host)
✅ Run Python, Node.js, bash scripts
✅ Make network requests (if network enabled)
✅ Use temporary files in /tmp

WHAT AGENTS CANNOT DO:
❌ Access any host files outside workspace
❌ Modify host system configuration
❌ Execute commands on host OS
❌ Access host devices or hardware
❌ Escape the container sandbox
❌ Affect other containers or host processes

PERSISTENCE MODEL:
- Files in /workspace → PERSISTENT on host (your actual workspace folder)
- Installed packages → PERSISTENT in container (until cleanup-sandbox or rebuild)
- Container state → PERSISTENT (until you destroy/rebuild container)
- /tmp directory → TMPFS (in-memory only)

CONTAINER LIFECYCLE:
- Packages installed with pip/npm/apk stay until: cleanup-sandbox or build-image
- To fully reset container: call cleanup-sandbox (destroys container)
- To rebuild base image: call build-image (fresh Alpine image)
- Workspace files always persist on host regardless of container state

CRITICAL - WORKSPACE PATH RULES:
- The workspace is mounted at /workspace inside the container
- ALWAYS use paths starting with /workspace (e.g., /workspace/myfile.txt, /workspace/project/src)
- ✅ CORRECT: /workspace/myfile.txt, /workspace/project/src/app.js
- ❌ WRONG: workspace/myfile.txt, ./myfile.txt, /Users/.../workspace/myfile.txt
- All file operations (writeFile, readFile, listFiles, createDirectory, deleteFile) require /workspace paths
- Commands execute from /workspace by default (workingDir: '/workspace')

Workflow:
1. Tools automatically initialize the sandbox when called (no need to call initialize-sandbox first)
2. Optional: call check-podman to verify Podman is available before starting
3. Use execute-python, execute-javascript, execute-bash, or execute-command to run code
4. Use write-file, read-file, list-files to manage workspace files (ALWAYS with /workspace paths)
5. Use install-package to add dependencies
6. Call cleanup-sandbox when done to stop the container

Features:
- Auto-initialization: All tools automatically create and start the sandbox if not already running
- Persistent workspace: Files persist even after the container is stopped
- Environment-based configuration: Use PODMAN_AGENT_ID and PODMAN_WORKSPACE_DIR environment variables to configure the sandbox

Example Usage:
- createDirectory({dirPath: "/workspace/project/src"})
- writeFile({filename: "/workspace/project/package.json", content: "..."})
- listFiles({dirPath: "/workspace/project"})
- executeCommand({command: "npm install", workingDir: "/workspace/project"})

The workspace persists even after the container is stopped.
  `,
  tools: {
    // Lifecycle
    checkPodman: checkPodmanTool,
    buildImage: buildImageTool,
    initializeSandbox: initializeSandboxTool,
    cleanupSandbox: cleanupSandboxTool,
    
    // Execution
    executeCommand: executeCommandTool,
    executePython: executePythonTool,
    executeJavaScript: executeJavaScriptTool,
    executeBash: executeBashTool,
    
    // File operations
    writeFile: writeFileTool,
    readFile: readFileTool,
    listFiles: listFilesTool,
    deleteFile: deleteFileTool,
    createDirectory: createDirectoryTool,
    
    // Package management
    installPackage: installPackageTool,
    uninstallPackage: uninstallPackageTool,
    
    // System info
    getSystemInfo: getSystemInfoTool,
    getResourceUsage: getResourceUsageTool,
    getWorkspaceInfo: getWorkspaceInfoTool,
    cleanWorkspace: cleanWorkspaceTool,
  },
});

// Export tools for individual use
export {
  initializeSandboxTool,
  executeCommandTool,
  executePythonTool,
  executeJavaScriptTool,
  executeBashTool,
  writeFileTool,
  readFileTool,
  listFilesTool,
  deleteFileTool,
  createDirectoryTool,
  installPackageTool,
  uninstallPackageTool,
  getSystemInfoTool,
  getResourceUsageTool,
  getWorkspaceInfoTool,
  cleanWorkspaceTool,
  cleanupSandboxTool,
  checkPodmanTool,
  buildImageTool,
};

// Export sandbox class for advanced use
export { PodmanSandbox };

// Export server as default
export default podmanWorkspaceMCPServer;
