/**
 * Workspace Configuration for Sybil
 * 
 * Provides persistent environment for:
 * - File storage and management
 * - Command execution in sandbox
 * - Skill-based agent capabilities
 */

import { Workspace, LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS } from "@mastra/core/workspace";

// Base path for all workspace operations
const WORKSPACE_BASE_PATH = "./workspace";

/**
 * Create workspace with filesystem and sandbox capabilities
 */
export function createWorkspace() {
  return new Workspace({
    id: "sybil-workspace",
    name: "Sybil Workspace",
    filesystem: new LocalFilesystem({
      basePath: WORKSPACE_BASE_PATH,
    }),
    sandbox: new LocalSandbox({
      workingDirectory: WORKSPACE_BASE_PATH,
    }),
    skills: ["./skills"],
    tools: {
      // Global defaults
      enabled: true,
      requireApproval: false,
      // Per-tool overrides for safety
      [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
        requireApproval: true,
        requireReadBeforeWrite: true,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
        enabled: true,
        requireApproval: true,
      },
      [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
        requireApproval: true,
      },
    },
  });
}

/**
 * Initialize workspace (optional - for pre-provisioning)
 */
export async function initializeWorkspace() {
  const workspace = createWorkspace();
  await workspace.init();
  console.log("✅ Workspace initialized at:", WORKSPACE_BASE_PATH);
  return workspace;
}

/**
 * Workspace instance for global use
 */
export const workspace = createWorkspace();

export default workspace;
