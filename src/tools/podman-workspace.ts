// podman-sandbox.ts - Complete cross-platform OS sandbox with persistent workspace
import { spawn, exec as execCallback } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const exec = promisify(execCallback);

/**
 * Complete Podman-based OS Sandbox with Persistent Workspace
 * 
 * The workspace directory on host is bind-mounted to container.
 * All files, including installed packages, persist even after container is destroyed.
 * 
 * Package Installation Persistence:
 * - npm packages: Installed to /workspace/.npm-global (persistent)
 * - Python packages: Installed to /workspace/.python-packages (persistent)
 * - Playwright browsers: Downloaded to /workspace/.playwright (persistent)
 * - Package caches: Stored in /workspace/.npm-cache and /workspace/.pip-cache (persistent)
 * 
 * Environment Variables Set in Container:
 * - HOME=/workspace
 * - NPM_CONFIG_PREFIX=/workspace/.npm-global
 * - NPM_CONFIG_CACHE=/workspace/.npm-cache
 * - PYTHONUSERBASE=/workspace/.python-packages
 * - PIP_CACHE_DIR=/workspace/.pip-cache
 * - PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright
 * - PATH includes /workspace/.npm-global/bin and /workspace/.python-packages/bin
 */
export class PodmanSandbox {
  private containerId: string | null = null;
  private imageName: string;
  private workspaceDir: string; // THIS PERSISTS ON HOST
  private agentId: string;
  private isInitialized: boolean = false;

  /**
   * @param agentId - Unique identifier for this sandbox
   * @param workspaceDir - Optional custom workspace path (persists on host)
   *                       If not provided, uses /tmp/podman-sandbox/{agentId}
   */
  constructor(agentId: string = 'default', workspaceDir?: string) {
    this.agentId = agentId;
    this.imageName = 'agent-sandbox:alpine';
    
    // Use custom workspace or default
    if (workspaceDir) {
      this.workspaceDir = path.resolve(workspaceDir);
    } else {
      // Default: temp directory (you can change this to any permanent location)
      this.workspaceDir = path.join(os.tmpdir(), 'podman-sandbox', agentId);
    }
  }

  // ==================== WORKSPACE MANAGEMENT ====================

  /**
   * Get the host workspace directory path
   * Files here persist even after container is destroyed
   */
  getWorkspacePath(): string {
    return this.workspaceDir;
  }

  /**
   * Set custom workspace directory (must be called before initialize)
   */
  setWorkspacePath(newPath: string): void {
    if (this.isInitialized) {
      throw new Error('Cannot change workspace path after initialization');
    }
    this.workspaceDir = path.resolve(newPath);
  }

  /**
   * Check if workspace exists on host
   */
  async workspaceExists(): Promise<boolean> {
    try {
      await fs.access(this.workspaceDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create workspace directory on host
   */
  async createWorkspace(): Promise<void> {
    await fs.mkdir(this.workspaceDir, { recursive: true });
    console.log(`✓ Workspace created at: ${this.workspaceDir}`);
  }

  /**
   * List all files in workspace (from host side)
   */
  async listWorkspaceFromHost(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.workspaceDir, { recursive: true });
      return files as string[];
    } catch {
      return [];
    }
  }

  /**
   * Get workspace size on host
   */
  async getWorkspaceSize(): Promise<{ bytes: number; human: string }> {
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

  /**
   * Clean workspace but keep the directory
   */
  async cleanWorkspace(): Promise<void> {
    const files = await fs.readdir(this.workspaceDir);
    await Promise.all(
      files.map(file => 
        fs.rm(path.join(this.workspaceDir, file), { recursive: true, force: true })
      )
    );
    console.log(`✓ Workspace cleaned: ${this.workspaceDir}`);
  }

  /**
   * Delete entire workspace directory
   */
  async deleteWorkspace(): Promise<void> {
    await fs.rm(this.workspaceDir, { recursive: true, force: true });
    console.log(`✓ Workspace deleted: ${this.workspaceDir}`);
  }

  /**
   * Copy files from another directory into workspace
   */
  async copyToWorkspace(sourcePath: string, destPath: string = '.'): Promise<void> {
    const sourceResolved = path.resolve(sourcePath);
    const destResolved = path.join(this.workspaceDir, destPath);

    await fs.mkdir(path.dirname(destResolved), { recursive: true });
    await fs.copyFile(sourceResolved, destResolved);
  }

  /**
   * Copy files from workspace to another directory
   */
  async copyFromWorkspace(sourcePath: string, destPath: string): Promise<void> {
    const sourceResolved = path.join(this.workspaceDir, sourcePath);
    const destResolved = path.resolve(destPath);

    await fs.mkdir(path.dirname(destResolved), { recursive: true });
    await fs.copyFile(sourceResolved, destResolved);
  }

  /**
   * Archive workspace to tar.gz
   */
  async archiveWorkspace(outputPath: string): Promise<void> {
    const tar = require('tar');
    await tar.create(
      {
        gzip: true,
        file: outputPath,
        cwd: path.dirname(this.workspaceDir),
      },
      [path.basename(this.workspaceDir)]
    );
    console.log(`✓ Workspace archived to: ${outputPath}`);
  }

  /**
   * Restore workspace from tar.gz
   */
  async restoreWorkspace(archivePath: string): Promise<void> {
    const tar = require('tar');
    await tar.extract({
      file: archivePath,
      cwd: path.dirname(this.workspaceDir),
    });
    console.log(`✓ Workspace restored from: ${archivePath}`);
  }

  // ==================== SETUP & INITIALIZATION ====================

  static async isPodmanAvailable(): Promise<boolean> {
    try {
      await exec('podman --version');
      return true;
    } catch {
      return false;
    }
  }

  private async isPodmanMachineRunning(): Promise<boolean> {
    const platform = os.platform();
    
    if (platform === 'linux') {
      return true;
    }

    try {
      const { stdout } = await exec('podman machine list --format json');
      const machines = JSON.parse(stdout);
      return machines.some((m: any) => m.Running);
    } catch {
      return false;
    }
  }

  private async startPodmanMachine(): Promise<void> {
    const platform = os.platform();
    
    if (platform === 'linux') {
      return;
    }

    console.log('Starting Podman machine...');
    
    try {
      const { stdout } = await exec('podman machine list --format json');
      const machines = JSON.parse(stdout);
      
      if (machines.length === 0) {
        console.log('Creating Podman machine...');
        await exec('podman machine init');
      }
      
      await exec('podman machine start', { timeout: 60000 });
      console.log('✓ Podman machine started');
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error: any) {
      throw new Error(`Failed to start Podman machine: ${error.message}`);
    }
  }

  static async buildImage(quiet = false): Promise<void> {
    if (!quiet) console.log('🔨 Building Alpine sandbox image...');

    const dockerfile = `
FROM alpine:3.19

RUN apk update && apk add --no-cache \\
    python3 py3-pip nodejs npm bash \\
    curl wget git gcc g++ make \\
    linux-headers musl-dev ca-certificates tzdata

RUN pip3 install --break-system-packages \\
    requests pandas numpy beautifulsoup4 lxml

RUN npm install -g typescript ts-node

RUN mkdir -p /workspace && chmod 777 /workspace
WORKDIR /workspace

RUN adduser -D -u 1000 -h /home/sandbox sandbox && \\
    chown -R sandbox:sandbox /workspace

USER sandbox

CMD ["/bin/sh", "-c", "while true; do sleep 1; done"]
`;

    const tmpDir = os.tmpdir();
    const dockerfilePath = path.join(tmpDir, 'Dockerfile.sandbox');
    await fs.writeFile(dockerfilePath, dockerfile);

    try {
      try {
        await exec('podman image inspect agent-sandbox:alpine');
        if (!quiet) console.log('✓ Image already exists');
        return;
      } catch {}

      console.log('Building sandbox image (this may take a few minutes)...');
      const buildCmd = `podman build -t agent-sandbox:alpine -f ${dockerfilePath} ${tmpDir}`;
      
      await new Promise<void>((resolve, reject) => {
        const process = spawn('podman', ['build', '-t', 'agent-sandbox:alpine', '-f', dockerfilePath, tmpDir], {
          stdio: quiet ? 'ignore' : 'inherit',
        });

        process.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Build failed with code ${code}`));
        });

        process.on('error', reject);
      });

      if (!quiet) console.log('✓ Image built successfully');
    } finally {
      await fs.unlink(dockerfilePath).catch(() => {});
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (!(await PodmanSandbox.isPodmanAvailable())) {
      throw new Error('Podman is not installed. Please install Podman first.');
    }

    if (!(await this.isPodmanMachineRunning())) {
      await this.startPodmanMachine();
    }

    try {
      await exec(`podman image inspect ${this.imageName}`);
    } catch {
      console.log('Image not found, building...');
      await PodmanSandbox.buildImage();
    }

    // Create workspace directory on host
    await fs.mkdir(this.workspaceDir, { recursive: true });
    
    // Create package directories in workspace for persistence
    const packageDirs = [
      path.join(this.workspaceDir, '.npm-global'),
      path.join(this.workspaceDir, '.npm-global', 'lib'),
      path.join(this.workspaceDir, '.npm-global', 'bin'),
      path.join(this.workspaceDir, '.npm-cache'),
      path.join(this.workspaceDir, '.python-packages'),
      path.join(this.workspaceDir, '.pip-cache'),
      path.join(this.workspaceDir, '.playwright'),
    ];
    
    for (const dir of packageDirs) {
      await fs.mkdir(dir, { recursive: true, mode: 0o777 });
    }
    
    // Ensure all package directories have proper permissions (readable/writable by container user)
    for (const dir of packageDirs) {
      await fs.chmod(dir, 0o777);
    }
    
    console.log(`✓ Workspace: ${this.workspaceDir}`);
    console.log(`✓ Package directories initialized for persistence`);

    // Use a consistent container name (no timestamp) for reusability
    const containerName = `sandbox-${this.agentId}`;
    
    // Check if container already exists
    try {
      const { stdout: inspectOutput } = await exec(`podman container inspect ${containerName} --format json`);
      const containerInfo = JSON.parse(inspectOutput)[0];
      
      if (containerInfo && containerInfo.Id) {
        this.containerId = containerInfo.Id;
        const isRunning = containerInfo.State?.Running || false;
        
        if (isRunning) {
          console.log(`✓ Reusing existing running container: ${this.containerId!.substring(0, 12)}`);
          this.isInitialized = true;
          return;
        } else {
          // Container exists but is stopped - restart it
          console.log(`✓ Found stopped container, restarting: ${this.containerId!.substring(0, 12)}`);
          await exec(`podman start ${containerName}`);
          console.log(`✓ Container restarted successfully`);
          this.isInitialized = true;
          return;
        }
      }
    } catch (error) {
      // Container doesn't exist, create a new one
      console.log('Creating new container...');
    }
    
    // IMPORTANT: The -v flag binds the host workspace to container
    // Files in workspaceDir persist on host even after container dies
    // NO --rm flag so container persists and can be reused
    const createCmd = [
      'podman', 'run',
      '-d',
      '--name', containerName,
      '-v', `${this.workspaceDir}:/workspace:Z`, // ← THIS IS THE MAGIC
      // Environment variables to redirect all package installations to /workspace
      '-e', 'HOME=/workspace',                              // Set home to workspace
      '-e', 'NPM_CONFIG_PREFIX=/workspace/.npm-global',     // npm global packages
      '-e', 'NPM_CONFIG_CACHE=/workspace/.npm-cache',       // npm cache
      '-e', 'PYTHONUSERBASE=/workspace/.python-packages',   // Python user packages
      '-e', 'PIP_CACHE_DIR=/workspace/.pip-cache',          // pip cache
      '-e', 'PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright', // Playwright browsers
      '-e', 'PATH=/workspace/.npm-global/bin:/workspace/.python-packages/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      '--memory', '512m',
      '--cpus', '0.5',
      '--network', 'bridge',
      '--security-opt', 'no-new-privileges',
      '--cap-drop', 'ALL',
      '--user', 'sandbox',
      this.imageName,
    ].join(' ');

    const { stdout } = await exec(createCmd);
    this.containerId = stdout.trim();

    console.log(`✓ Container created: ${this.containerId.substring(0, 12)}`);
    console.log(`✓ Files will persist at: ${this.workspaceDir}`);
    this.isInitialized = true;
  }

  // ==================== EXECUTION METHODS ====================

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
      throw new Error('Sandbox not initialized. Call initialize() first.');
    }

    const timeout = options.timeout || 30000;
    const user = options.user || 'sandbox';
    const workingDir = options.workingDir || '/workspace';

    const execArgs = [
      'podman', 'exec',
      '-u', user,
      '-w', workingDir,
    ];

    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        execArgs.push('-e', `${key}=${value}`);
      }
    }

    execArgs.push(this.containerId, '/bin/sh', '-c', command);

    return new Promise((resolve, reject) => {
      const process = spawn(execArgs[0], execArgs.slice(1));

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      process.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0,
        });
      });

      process.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  async executePython(
    code: string,
    options: { timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const filename = `script_${Date.now()}.py`;
    await this.writeFile(filename, code);

    try {
      const result = await this.executeCommand(`python3 /workspace/${filename}`, {
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
    const filename = `script_${Date.now()}.js`;
    await this.writeFile(filename, code);

    try {
      const result = await this.executeCommand(`node /workspace/${filename}`, {
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
    const filename = `script_${Date.now()}.sh`;
    await this.writeFile(filename, script);

    try {
      const result = await this.executeCommand(`chmod +x /workspace/${filename} && /workspace/${filename}`, {
        timeout: options.timeout || 30000,
      });
      return result;
    } finally {
      await this.deleteFile(filename).catch(() => {});
    }
  }

  // ==================== FILE OPERATIONS ====================

  async writeFile(filename: string, content: string): Promise<void> {
    const fullPath = path.join(this.workspaceDir, filename);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async readFile(filename: string): Promise<string> {
    const fullPath = path.join(this.workspaceDir, filename);
    return await fs.readFile(fullPath, 'utf-8');
  }

  async listFiles(dirPath: string = '.'): Promise<string[]> {
    const result = await this.executeCommand(`ls -1 ${dirPath}`);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list files: ${result.stderr}`);
    }
    
    return result.stdout.split('\n').filter(Boolean);
  }

  async deleteFile(filename: string): Promise<void> {
    const fullPath = path.join(this.workspaceDir, filename);
    await fs.unlink(fullPath);
  }

  async fileExists(filename: string): Promise<boolean> {
    const result = await this.executeCommand(`test -f /workspace/${filename} && echo "exists"`);
    return result.stdout.includes('exists');
  }

  async createDirectory(dirPath: string): Promise<void> {
    const fullPath = path.join(this.workspaceDir, dirPath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  // ==================== PACKAGE MANAGEMENT ====================

  async installPackage(
    packageName: string,
    type: 'python' | 'npm' | 'apk' = 'python',
    options: { timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    let command: string;
    let user: string = 'sandbox'; // Use sandbox user for workspace installations

    switch (type) {
      case 'python':
        // Install to user base in workspace (no root required)
        // Use --break-system-packages for Alpine's externally-managed environment
        command = `pip3 install --user --break-system-packages ${packageName}`;
        break;
      case 'npm':
        // Install globally to workspace npm prefix (no root required)
        command = `npm install -g ${packageName}`;
        break;
      case 'apk':
        // APK requires root and installs to system (not workspace)
        command = `apk add ${packageName}`;
        user = 'root';
        break;
    }

    return await this.executeCommand(command, {
      timeout: options.timeout || 120000,
      user,
    });
  }

  async uninstallPackage(
    packageName: string,
    type: 'python' | 'npm' | 'apk' = 'python'
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    let command: string;
    let user: string = 'sandbox'; // Use sandbox user for workspace installations

    switch (type) {
      case 'python':
        // Uninstall from user base
        command = `pip3 uninstall -y ${packageName}`;
        break;
      case 'npm':
        // Uninstall from workspace npm prefix
        command = `npm uninstall -g ${packageName}`;
        break;
      case 'apk':
        // APK requires root
        command = `apk del ${packageName}`;
        user = 'root';
        break;
    }

    return await this.executeCommand(command, {
      timeout: 60000,
      user,
    });
  }

  // ==================== SYSTEM INFO ====================

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
    result.stdout.split('\n').forEach((line) => {
      const [key, value] = line.split('=');
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
      throw new Error('Container not initialized');
    }

    const { stdout } = await exec(`podman stats ${this.containerId} --no-stream --format json`);
    const stats = JSON.parse(stdout);

    return {
      cpu: stats.CPUPerc || '0%',
      memory: stats.MemUsage || '0B / 0B',
      disk: stats.BlockIO || '0B / 0B',
    };
  }

  // ==================== CLEANUP ====================

  /**
   * Stop container (but keep it for reuse unless removeContainer is true)
   * Workspace always persists unless deleteWorkspace is true
   */
  async cleanup(options: { deleteWorkspace?: boolean; removeContainer?: boolean } = {}): Promise<void> {
    if (this.containerId) {
      try {
        console.log('Stopping container...');
        await exec(`podman stop ${this.containerId}`, { timeout: 10000 });
        
        if (options.removeContainer) {
          console.log('Removing container...');
          await exec(`podman rm ${this.containerId}`, { timeout: 10000 });
          console.log('✓ Container stopped and removed');
        } else {
          console.log('✓ Container stopped (will be reused on next initialize)');
        }
      } catch (error: any) {
        console.warn(`Warning: Failed to stop container: ${error.message}`);
      }
      this.containerId = null;
      this.isInitialized = false;
    }

    if (options.deleteWorkspace) {
      await this.deleteWorkspace();
    } else {
      console.log(`ℹ️  Workspace preserved at: ${this.workspaceDir}`);
    }
  }

  getContainerId(): string | null {
    return this.containerId;
  }

  isReady(): boolean {
    return this.isInitialized && this.containerId !== null;
  }
}

// ==================== DEMONSTRATION EXAMPLES ====================

/**
 * Example: Persistent workspace demo
 */
async function demonstratePersistence() {
  console.log('🔄 Demonstrating persistent workspace...\n');

  const workspacePath = path.join(process.cwd(), 'my-persistent-workspace');
  
  // Session 1: Create files
  console.log('=== Session 1: Creating files ===');
  const sandbox1 = new PodmanSandbox('demo', workspacePath);
  
  await sandbox1.initialize();
  
  // Create some files
  await sandbox1.writeFile('data.txt', 'This file will persist!');
  await sandbox1.executePython(`
with open('/workspace/results.json', 'w') as f:
    import json
    json.dump({'message': 'Generated by container 1'}, f)
  `);
  
  console.log('Files created:');
  const files1 = await sandbox1.listFiles();
  console.log(files1);
  
  console.log('\n✓ Destroying container 1...');
  await sandbox1.cleanup(); // Container destroyed, but files remain!
  
  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Session 2: Access same files in new container
  console.log('\n=== Session 2: New container, same workspace ===');
  const sandbox2 = new PodmanSandbox('demo', workspacePath);
  
  await sandbox2.initialize();
  
  // Read files from previous container
  const content = await sandbox2.readFile('data.txt');
  console.log(`Read from previous session: "${content}"`);
  
  const result = await sandbox2.executePython(`
import json
with open('/workspace/results.json', 'r') as f:
    data = json.load(f)
print(data['message'])
  `);
  console.log(`Python output: ${result.stdout}`);
  
  // List files
  console.log('\nFiles in new container:');
  const files2 = await sandbox2.listFiles();
  console.log(files2);
  
  // Add more files
  await sandbox2.writeFile('session2.txt', 'Added in second session');
  
  console.log('\n✓ Files persist across container lifecycles!');
  console.log(`✓ All files are in: ${workspacePath}`);
  
  await sandbox2.cleanup();
}

/**
 * Example: Using workspace from host
 */
async function workspaceFromHost() {
  console.log('📁 Accessing workspace from host...\n');

  const workspacePath = path.join(process.cwd(), 'shared-workspace');
  const sandbox = new PodmanSandbox('host-demo', workspacePath);

  await sandbox.initialize();

  // Write from container
  await sandbox.executePython(`
with open('/workspace/generated.csv', 'w') as f:
    f.write('name,age\\n')
    f.write('Alice,30\\n')
    f.write('Bob,25\\n')
  `);

  console.log('File created by container');

  // Read from host (Node.js)
  const hostFilePath = path.join(workspacePath, 'generated.csv');
  const content = await fs.readFile(hostFilePath, 'utf-8');
  console.log('\nReading from host:');
  console.log(content);

  // Write from host
  await fs.writeFile(
    path.join(workspacePath, 'from-host.txt'),
    'This was written by the host Node.js process'
  );

  // Read from container
  const result = await sandbox.executeCommand('cat /workspace/from-host.txt');
  console.log('\nReading in container:');
  console.log(result.stdout);

  console.log('\n✓ Both host and container share the same workspace!');

  await sandbox.cleanup();
}

/**
 * Example: Workspace management
 */
async function workspaceManagement() {
  console.log('🗂️  Workspace management demo...\n');

  const workspacePath = path.join(process.cwd(), 'managed-workspace');
  const sandbox = new PodmanSandbox('manager', workspacePath);

  await sandbox.initialize();

  // Create some files
  await sandbox.writeFile('file1.txt', 'Content 1');
  await sandbox.writeFile('file2.txt', 'Content 2');
  await sandbox.writeFile('subdir/file3.txt', 'Content 3');

  // Get workspace info
  console.log('Workspace path:', sandbox.getWorkspacePath());
  
  const size = await sandbox.getWorkspaceSize();
  console.log('Workspace size:', size.human);

  const files = await sandbox.listWorkspaceFromHost();
  console.log('Files:', files);

  // Archive workspace
  const archivePath = path.join(os.tmpdir(), 'workspace-backup.tar.gz');
  await sandbox.archiveWorkspace(archivePath);
  console.log(`\n✓ Workspace archived to: ${archivePath}`);

  // Clean workspace
  await sandbox.cleanWorkspace();
  console.log('✓ Workspace cleaned');

  // Restore from archive
  await sandbox.restoreWorkspace(archivePath);
  console.log('✓ Workspace restored from archive');

  const restoredFiles = await sandbox.listWorkspaceFromHost();
  console.log('Restored files:', restoredFiles);

  await sandbox.cleanup({ deleteWorkspace: true });
}

// ==================== SETUP HELPER ====================

// Global default sandbox instance
let defaultSandbox: PodmanSandbox | null = null;

/**
 * Get the default global Podman sandbox instance
 */
export function getDefaultSandbox(): PodmanSandbox | null {
  return defaultSandbox;
}

/**
 * Setup Podman and optionally start a persistent default container
 */
export async function setupPodman(quiet = false, options: {
  autoStart?: boolean;
  workspaceDir?: string;
} = {}): Promise<PodmanSandbox | null> {
  if (!quiet) console.log('🚀 Setting up Podman sandbox...\n');

  if (!(await PodmanSandbox.isPodmanAvailable())) {
    if (!quiet) {
      console.error('❌ Podman is not installed!\n');
      console.log('Please install Podman:');
      console.log('  Linux:   https://podman.io/getting-started/installation');
      console.log('  macOS:   brew install podman');
      console.log('  Windows: https://github.com/containers/podman/blob/main/docs/tutorials/podman-for-windows.md\n');
    }
    throw new Error('Podman not installed');
  }

  if (!quiet) console.log('✓ Podman is installed\n');

  await PodmanSandbox.buildImage(quiet);

  // Auto-start a persistent container if requested
  if (options.autoStart) {
    if (!quiet) console.log('🔄 Starting default persistent container...\n');
    
    const workspaceDir = options.workspaceDir || path.join(os.homedir(), '.sybil', 'podman-workspace');
    defaultSandbox = new PodmanSandbox('sybil-default', workspaceDir);
    
    await defaultSandbox.initialize();
    
    if (!quiet) {
      console.log(`✓ Default container started: ${defaultSandbox.getContainerId()?.substring(0, 12)}`);
      console.log(`✓ Workspace: ${defaultSandbox.getWorkspacePath()}`);
    }
    
    return defaultSandbox;
  }

  if (!quiet) console.log('\n✅ Setup complete!');
  return null;
}

/**
 * Cleanup the default sandbox instance
 * By default, stops the container but keeps it for reuse
 */
export async function cleanupDefaultSandbox(options: { deleteWorkspace?: boolean; removeContainer?: boolean } = {}): Promise<void> {
  if (defaultSandbox) {
    await defaultSandbox.cleanup(options);
    if (!options.removeContainer) {
      // Don't null out the reference if we're keeping the container for reuse
      console.log('ℹ️  Default sandbox will reuse container on next startup');
    } else {
      defaultSandbox = null;
    }
  }
}

export default PodmanSandbox;

// Auto-run if executed directly
const isMainModule = typeof process !== 'undefined' && process.argv[1] && import.meta.url && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  (async () => {
    try {
      await setupPodman();
      
      console.log('\n' + '='.repeat(60));
      await demonstratePersistence();
      
      console.log('\n' + '='.repeat(60));
      await workspaceFromHost();
      
      console.log('\n' + '='.repeat(60));
      await workspaceManagement();
      
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}