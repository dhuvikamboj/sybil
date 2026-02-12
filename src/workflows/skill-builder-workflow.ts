import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const difficultyEnum = z.enum(["easy", "medium", "hard"]);
const priorityEnum = z.enum(["low", "medium", "high"]);

// Step 1: Identify skill gaps
const identifySkillGapsStep = createStep({
  id: "identify-skill-gaps",
  description: "Analyze user interactions to identify potential skills to learn",
  inputSchema: z.object({
    recentTasks: z.array(z.string()),
    userGoals: z.array(z.string()),
    currentSkills: z.array(z.string()),
  }),
  outputSchema: z.object({
    potentialSkills: z.array(z.object({
      name: z.string(),
      relevance: z.number(),
      difficulty: difficultyEnum,
      priority: priorityEnum,
    })),
    analysis: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { recentTasks, userGoals } = inputData;
    
    // Simple skill identification logic
    const potentialSkills: Array<{
      name: string;
      relevance: number;
      difficulty: "easy" | "medium" | "hard";
      priority: "low" | "medium" | "high";
    }> = [];
    
    if (recentTasks.some(t => t.includes("code") || t.includes("program"))) {
      potentialSkills.push({
        name: "code-review",
        relevance: 0.9,
        difficulty: "medium",
        priority: "high",
      });
    }
    
    if (recentTasks.some(t => t.includes("research") || t.includes("find"))) {
      potentialSkills.push({
        name: "research-assistant",
        relevance: 0.85,
        difficulty: "easy",
        priority: "high",
      });
    }
    
    if (userGoals.some(g => g.includes("learn") || g.includes("study"))) {
      potentialSkills.push({
        name: "tutor",
        relevance: 0.8,
        difficulty: "medium",
        priority: "medium",
      });
    }
    
    return {
      potentialSkills,
      analysis: `Identified ${potentialSkills.length} potential skills based on ${recentTasks.length} recent tasks`,
    };
  },
});

// Step 2: Build skill knowledge
const buildSkillKnowledgeStep = createStep({
  id: "build-skill-knowledge",
  description: "Build knowledge base for identified skills",
  inputSchema: z.object({
    potentialSkills: z.array(z.object({
      name: z.string(),
      relevance: z.number(),
      difficulty: difficultyEnum,
      priority: priorityEnum,
    })),
    analysis: z.string(),
  }),
  outputSchema: z.object({
    skills: z.array(z.object({
      name: z.string(),
      knowledge: z.object({
        concepts: z.array(z.string()),
        patterns: z.array(z.string()),
        examples: z.array(z.string()),
      }),
      proficiency: z.number(),
      created: z.string(),
    })),
    buildSummary: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { potentialSkills } = inputData;
    
    const skills = potentialSkills.map(skill => ({
      name: skill.name,
      knowledge: {
        concepts: [`${skill.name} fundamentals`, `${skill.name} best practices`],
        patterns: [`${skill.name} workflow`, `Common ${skill.name} patterns`],
        examples: [`${skill.name} example 1`, `${skill.name} example 2`],
      },
      proficiency: 0.3, // Starting proficiency
      created: new Date().toISOString(),
    }));
    
    return {
      skills,
      buildSummary: `Built knowledge base for ${skills.length} skills`,
    };
  },
});

// Step 3: Update skill registry
const updateSkillRegistryStep = createStep({
  id: "update-skill-registry",
  description: "Update the skill registry with new capabilities",
  inputSchema: z.object({
    skills: z.array(z.object({
      name: z.string(),
      knowledge: z.object({
        concepts: z.array(z.string()),
        patterns: z.array(z.string()),
        examples: z.array(z.string()),
      }),
      proficiency: z.number(),
      created: z.string(),
    })),
    buildSummary: z.string(),
  }),
  outputSchema: z.object({
    registeredSkills: z.array(z.string()),
    totalSkills: z.number(),
    averageProficiency: z.number(),
    summary: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { skills } = inputData;
    
    const registeredSkills = skills.map(s => s.name);
    const totalSkills = skills.length;
    const averageProficiency = skills.reduce((acc, s) => acc + s.proficiency, 0) / totalSkills;
    
    return {
      registeredSkills,
      totalSkills,
      averageProficiency,
      summary: `Successfully registered ${totalSkills} new skills with avg proficiency ${(averageProficiency * 100).toFixed(0)}%`,
    };
  },
});

// Create the skill builder workflow
export const skillBuilderWorkflow = createWorkflow({
  id: "skill-builder-workflow",
  description: "Builds new skills based on user interactions and goals",
  inputSchema: z.object({
    recentTasks: z.array(z.string()),
    userGoals: z.array(z.string()),
    currentSkills: z.array(z.string()),
  }),
  outputSchema: z.object({
    registeredSkills: z.array(z.string()),
    totalSkills: z.number(),
    averageProficiency: z.number(),
    summary: z.string(),
  }),
})
  .then(identifySkillGapsStep)
  .then(buildSkillKnowledgeStep)
  .then(updateSkillRegistryStep)
  .commit();
