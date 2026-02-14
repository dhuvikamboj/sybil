#!/usr/bin/env node
// podman-workspace-mcp-cli.ts - CLI entry point for Podman Workspace MCP Server
import { podmanWorkspaceMCPServer } from "./podman-workspace-mcp.js";

async function main() {
  console.error("Starting Podman Workspace MCP Server...");
  
  await podmanWorkspaceMCPServer.startStdio();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
