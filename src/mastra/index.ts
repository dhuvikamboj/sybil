import { Mastra } from "@mastra/core/mastra";
import { createMemoryInstance, getMemoryStorage } from "./memory.js";
import { plannerWorkflow } from "../workflows/planner-workflow.js";
import { skillBuilderWorkflow } from "../workflows/skill-builder-workflow.js";
import { workspace } from "../workspace/index.js";

// Get storage and memory
const storage = getMemoryStorage();
export const memory = createMemoryInstance();

export const mastra: Mastra = new Mastra({
  agents: {
    // Agents will be registered individually to avoid circular deps
  },
  workflows: {
    plannerWorkflow,
    skillBuilderWorkflow,
  },
  storage,
  workspace,
});

export type MastraInstance = Mastra;
