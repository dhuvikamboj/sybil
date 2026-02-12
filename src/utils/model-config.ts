import { createOllama } from "ollama-ai-provider-v2";

/**
 * Supported AI providers
 */
export type AIProvider = 
  | "openai" 
  | "anthropic" 
  | "google" 
  | "deepseek" 
  | "groq" 
  | "mistral" 
  | "xai" 
  | "ollama" 
  | "ollama-cloud"
  | "perplexity"
  | "cohere"
  | "huggingface"
  | "togetherai"
  | "fireworks-ai"
  | "cerebras"
  | "openrouter"
  | "nvidia"
  | "custom";

/**
 * Model configuration options
 */
export interface ModelConfig {
  provider: AIProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Provider information
 */
export interface ProviderInfo {
  id: AIProvider;
  name: string;
  envKey: string;
  defaultModel: string;
  requiresApiKey: boolean;
  supportsBaseUrl?: boolean;
}

/**
 * Provider configuration
 */
const providers: Record<AIProvider, ProviderInfo> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
    requiresApiKey: true,
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic (Claude)",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-4-5-sonnet",
    requiresApiKey: true,
  },
  google: {
    id: "google",
    name: "Google (Gemini)",
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    defaultModel: "gemini-2.5-flash",
    requiresApiKey: true,
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-r1",
    requiresApiKey: true,
  },
  groq: {
    id: "groq",
    name: "Groq",
    envKey: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
    requiresApiKey: true,
  },
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    envKey: "MISTRAL_API_KEY",
    defaultModel: "mistral-large-latest",
    requiresApiKey: true,
  },
  xai: {
    id: "xai",
    name: "xAI (Grok)",
    envKey: "XAI_API_KEY",
    defaultModel: "grok-4",
    requiresApiKey: true,
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    envKey: "",
    defaultModel: "llama3.2",
    requiresApiKey: false,
    supportsBaseUrl: true,
  },
  "ollama-cloud": {
    id: "ollama-cloud",
    name: "Ollama Cloud",
    envKey: "OLLAMA_API_KEY",
    defaultModel: "ollama-cloud/cogito-2.1:671b",
    requiresApiKey: true,
  },
  perplexity: {
    id: "perplexity",
    name: "Perplexity",
    envKey: "PERPLEXITY_API_KEY",
    defaultModel: "llama-3.1-sonar-small-128k-online",
    requiresApiKey: true,
  },
  cohere: {
    id: "cohere",
    name: "Cohere",
    envKey: "COHERE_API_KEY",
    defaultModel: "command-r-plus",
    requiresApiKey: true,
  },
  huggingface: {
    id: "huggingface",
    name: "Hugging Face",
    envKey: "HUGGINGFACE_API_KEY",
    defaultModel: "meta-llama/Llama-3.2-90B-Vision-Instruct",
    requiresApiKey: true,
  },
  togetherai: {
    id: "togetherai",
    name: "Together AI",
    envKey: "TOGETHER_API_KEY",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    requiresApiKey: true,
  },
  "fireworks-ai": {
    id: "fireworks-ai",
    name: "Fireworks AI",
    envKey: "FIREWORKS_API_KEY",
    defaultModel: "accounts/fireworks/models/llama-3.3-70b-instruct",
    requiresApiKey: true,
  },
  cerebras: {
    id: "cerebras",
    name: "Cerebras",
    envKey: "CEREBRAS_API_KEY",
    defaultModel: "cerebras/llama-3.3-70b",
    requiresApiKey: true,
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    defaultModel: "anthropic/claude-haiku-4-5",
    requiresApiKey: true,
  },
  nvidia: {
    id: "nvidia",
    name: "NVIDIA AI",
    envKey: "NVIDIA_API_KEY",
    defaultModel: "nvidia/llama-3.1-nemotron-70b-instruct",
    requiresApiKey: true,
  },
  custom: {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    envKey: "",
    defaultModel: "custom-model",
    requiresApiKey: false,
    supportsBaseUrl: true,
  },
};

/**
 * Get model configuration from environment variables
 */
export function getModelConfig(): ModelConfig {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase() as AIProvider;
  const providerConfig = providers[provider];

  if (!providerConfig) {
    console.warn(`Unknown provider "${provider}", defaulting to "openai"`);
    return {
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o",
      apiKey: process.env.OPENAI_API_KEY,
    };
  }

  switch (provider) {
    case "ollama":
      return {
        provider: "ollama",
        model: process.env.OLLAMA_MODEL || providerConfig.defaultModel,
        baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      };

    case "custom":
      return {
        provider: "custom",
        model: process.env.CUSTOM_MODEL || process.env.MODEL || providerConfig.defaultModel,
        baseUrl: process.env.CUSTOM_BASE_URL || process.env.BASE_URL || "http://localhost:8000/v1",
        apiKey: process.env.CUSTOM_API_KEY,
      };

    default:
      return {
        provider,
        model: process.env[`${provider.toUpperCase()}_MODEL`] || providerConfig.defaultModel,
        apiKey: process.env[`${provider.toUpperCase()}_API_KEY`] || process.env[providerConfig.envKey],
      };
  }
}

/**
 * Create model instance based on configuration
 */
export function createModel(config: ModelConfig = getModelConfig()): any {
  switch (config.provider) {
    case "ollama": {
      const ollama = createOllama({
        baseURL: config.baseUrl,
      });
      return ollama(config.model);
    }

    case "custom":
      // Custom OpenAI-compatible endpoint
      return {
        id: `custom/${config.model}`,
        url: config.baseUrl,
        apiKey: config.apiKey,
      };

    case "ollama-cloud":
    case "openai":
    case "anthropic":
    case "google":
    case "deepseek":
    case "groq":
    case "mistral":
    case "xai":
    case "perplexity":
    case "cohere":
    case "huggingface":
    case "togetherai":
    case "fireworks-ai":
    case "cerebras":
    case "openrouter":
    default:
      // All standard providers use the "provider/model" string format
      return `${config.provider}/${config.model}`;
  }
}

/**
 * Get optimized generation parameters for faster responses
 */
export function getOptimizedGenerationParams(provider: ModelConfig | AIProvider = getModelConfig()): Record<string, any> {
  const providerId = typeof provider === "string" ? provider : provider.provider;
  
  switch (providerId) {
    case "ollama":
      return {
        temperature: 0.1,
        top_p: 0.9,
        repeat_penalty: 1.1,
        num_predict: 2048,
        num_ctx: 4096,
        seed: 42,
      };
    
    case "groq":
    case "cerebras":
      // Ultra-fast providers can handle more
      return {
        temperature: 0.1,
        max_tokens: 4096,
      };
    
    case "anthropic":
      return {
        temperature: 0.1,
        max_tokens: 4096,
        top_p: 0.9,
      };
    
    case "custom":
      return {
        temperature: 0.1,
        max_tokens: 2048,
        top_p: 0.9,
      };
    
    case "openai":
    case "google":
    case "deepseek":
    case "mistral":
    case "xai":
    case "perplexity":
    case "cohere":
    case "huggingface":
    case "togetherai":
    case "fireworks-ai":
    case "openrouter":
    case "ollama-cloud":
    default:
      return {
        temperature: 0.1,
        max_tokens: 2048,
      };
  }
}

/**
 * Get provider name for display
 */
export function getProviderDisplayName(config: ModelConfig = getModelConfig()): string {
  const providerConfig = providers[config.provider];
  
  if (config.provider === "ollama") {
    return `Ollama (${config.baseUrl})`;
  }
  
  if (config.provider === "custom") {
    return `Custom (${config.baseUrl})`;
  }
  
  return providerConfig?.name || config.provider;
}

/**
 * Validate model configuration
 */
export function validateModelConfig(config: ModelConfig = getModelConfig()): { valid: boolean; error?: string } {
  const providerConfig = providers[config.provider];
  
  if (!providerConfig) {
    return { valid: false, error: `Unknown provider: ${config.provider}` };
  }
  
  // Check for API key if required
  if (providerConfig.requiresApiKey && (!config.apiKey && !process.env[providerConfig.envKey])) {
    return { 
      valid: false, 
      error: `${providerConfig.envKey} is required for ${providerConfig.name} provider` 
    };
  }
  
  // Check for base URL if required/provided
  if (providerConfig.supportsBaseUrl && !config.baseUrl) {
    return { 
      valid: false, 
      error: `Base URL is required for ${providerConfig.name} provider` 
    };
  }
  
  return { valid: true };
}

/**
 * List available model providers
 */
export function listAvailableProviders(): Array<{ id: string; name: string; envVars: string[]; defaultModel: string }> {
  return Object.values(providers).map(p => ({
    id: p.id,
    name: p.name,
    envVars: p.requiresApiKey 
      ? [p.envKey, `${p.id.toUpperCase()}_MODEL`] 
      : p.supportsBaseUrl 
        ? [`${p.id.toUpperCase()}_MODEL`, `${p.id.toUpperCase()}_BASE_URL`]
        : [],
    defaultModel: p.defaultModel,
  }));
}

/**
 * Get provider information
 */
export function getProviderInfo(providerId: AIProvider): ProviderInfo | undefined {
  return providers[providerId];
}

/**
 * Get all providers
 */
export function getAllProviders(): Record<AIProvider, ProviderInfo> {
  return { ...providers };
}

/**
 * Get recommended Ollama models
 */
export function getRecommendedOllamaModels(): Array<{ id: string; name: string; description: string }> {
  return [
    {
      id: "llama3.2",
      name: "Llama 3.2",
      description: "Meta's latest model, good balance of quality and speed",
    },
    {
      id: "llama3.2:1b",
      name: "Llama 3.2 (1B)",
      description: "Lightweight version for faster responses",
    },
    {
      id: "mistral",
      name: "Mistral",
      description: "High quality general-purpose model",
    },
    {
      id: "qwen2.5",
      name: "Qwen 2.5",
      description: "Alibaba's model, excellent for coding",
    },
    {
      id: "deepseek-coder",
      name: "DeepSeek Coder",
      description: "Specialized for code generation",
    },
    {
      id: "phi4",
      name: "Phi-4",
      description: "Microsoft's compact model, good reasoning",
    },
  ];
}
