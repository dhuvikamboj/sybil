import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const complexityEnum = z.enum(["simple", "medium", "complex"]);
const priorityEnum = z.enum(["low", "medium", "high", "critical"]);
const statusEnum = z.enum(["pending", "in-progress", "completed", "failed"]);

// Step 1: Analyze the goal
const analyzeGoalStep = createStep({
  id: "analyze-goal",
  description: "Analyze the user's goal and extract key requirements",
  inputSchema: z.object({
    goal: z.string(),
    userContext: z.string().optional(),
  }),
  outputSchema: z.object({
    goal: z.string(),
    complexity: complexityEnum,
    requirements: z.array(z.string()),
    estimatedSteps: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { goal } = inputData;
    
    // Simple analysis logic
    const wordCount = goal.split(" ").length;
    const complexity: "simple" | "medium" | "complex" = wordCount > 15 ? "complex" : wordCount > 8 ? "medium" : "simple";
    const estimatedSteps = complexity === "complex" ? 5 : complexity === "medium" ? 3 : 1;
    
    // Extract requirements (simplified)
    const requirements = [
      "Understand user intent",
      "Gather necessary information",
      "Execute relevant actions",
      "Report results",
    ];
    
    return {
      goal,
      complexity,
      requirements,
      estimatedSteps,
    };
  },
});

// Step 2: Create execution plan
const createPlanStep = createStep({
  id: "create-plan",
  description: "Create a detailed execution plan with steps",
  inputSchema: z.object({
    goal: z.string(),
    complexity: complexityEnum,
    requirements: z.array(z.string()),
    estimatedSteps: z.number(),
  }),
  outputSchema: z.object({
    planId: z.string(),
    steps: z.array(z.object({
      id: z.string(),
      order: z.number(),
      description: z.string(),
      action: z.string(),
      status: statusEnum,
    })),
    metadata: z.object({
      totalSteps: z.number(),
      estimatedDuration: z.string(),
      priority: priorityEnum,
    }),
  }),
  execute: async ({ inputData }) => {
    const { goal, complexity, estimatedSteps } = inputData;
    
    const steps = [];
    for (let i = 1; i <= estimatedSteps; i++) {
      steps.push({
        id: `step-${i}`,
        order: i,
        description: `Execute phase ${i} of the plan`,
        action: i === 1 ? "Initialize and gather context" : 
                i === estimatedSteps ? "Finalize and report results" : 
                `Execute intermediate action ${i}`,
        status: "pending" as const,
      });
    }
    
    return {
      planId: `plan-${Date.now()}`,
      steps,
      metadata: {
        totalSteps: estimatedSteps,
        estimatedDuration: complexity === "complex" ? "1 hour" : complexity === "medium" ? "30 mins" : "5 mins",
        priority: "medium" as const,
      },
    };
  },
});

// Step 3: Validate plan
const validatePlanStep = createStep({
  id: "validate-plan",
  description: "Validate the plan and identify potential issues",
  inputSchema: z.object({
    planId: z.string(),
    steps: z.array(z.object({
      id: z.string(),
      order: z.number(),
      description: z.string(),
      action: z.string(),
      status: statusEnum,
    })),
    metadata: z.object({
      totalSteps: z.number(),
      estimatedDuration: z.string(),
      priority: priorityEnum,
    }),
  }),
  outputSchema: z.object({
    planId: z.string(),
    isValid: z.boolean(),
    issues: z.array(z.string()),
    suggestions: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const { planId, steps, metadata } = inputData;
    
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    if (steps.length === 0) {
      issues.push("Plan has no steps");
    }
    
    if (metadata.estimatedDuration.includes("hour") && metadata.priority === "low") {
      suggestions.push("Consider breaking into smaller sub-plans");
    }
    
    return {
      planId,
      isValid: issues.length === 0,
      issues,
      suggestions,
    };
  },
});

// Create the planner workflow
export const plannerWorkflow = createWorkflow({
  id: "planner-workflow",
  description: "Creates an autonomous execution plan for complex tasks",
  inputSchema: z.object({
    goal: z.string(),
    userContext: z.string().optional(),
  }),
  outputSchema: z.object({
    planId: z.string(),
    isValid: z.boolean(),
    steps: z.array(z.object({
      id: z.string(),
      order: z.number(),
      description: z.string(),
      action: z.string(),
      status: statusEnum,
    })),
    metadata: z.object({
      totalSteps: z.number(),
      estimatedDuration: z.string(),
      priority: priorityEnum,
    }),
    issues: z.array(z.string()),
    suggestions: z.array(z.string()),
  }),
})
  .then(analyzeGoalStep)
  .then(createPlanStep)
  .then(validatePlanStep)
  .commit();
