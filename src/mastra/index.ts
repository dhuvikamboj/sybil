import { Mastra } from "@mastra/core/mastra";
import { createMemoryInstance, getMemoryStorage,memory } from "./memory.js";
import { plannerWorkflow } from "../workflows/planner-workflow.js";
import { skillBuilderWorkflow } from "../workflows/skill-builder-workflow.js";
import { workspace } from "../workspace/index.js";
import { autonomousAgent } from "../agents/autonomous-agent.js";
import {
  plannerAgent,
  researcherAgent,
  executorAgent,
  whatsappAgent,
  routingAgent,
} from "../agents/network.js";
import { PinoLogger } from "@mastra/loggers";

// Get storage and memory
const storage = getMemoryStorage();


export const mastra: Mastra = new Mastra({
  agents: {
    autonomousAgent,
    plannerAgent,
    researcherAgent,
    executorAgent,
    whatsappAgent,
    routingAgent,
  },
  workflows: {
    plannerWorkflow,
    skillBuilderWorkflow,
  },
  logger: new PinoLogger({
    name: "Mastra",
    level: "debug",
  }),
  memory:{
    instance: memory,
  },
  storage,
  workspace,
});

export type MastraInstance = Mastra;
