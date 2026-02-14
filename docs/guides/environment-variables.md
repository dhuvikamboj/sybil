# Environment Variables Configuration

Complete guide to configuring Sybil through environment variables.

---

## Quick Start

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your settings

3. Restart Sybil for changes to take effect

---

## Required Variables

### TELEGRAM_BOT_TOKEN

**Required** - Your Telegram bot token from [@BotFather](https://t.me/BotFather)

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxyz
```

**How to get:**
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`
3. Follow prompts to create bot
4. Copy the token (starts with numbers followed by colon)

---

## AI Provider Configuration

Choose one provider by setting `AI_PROVIDER`:

### Ollama (Recommended - Free & Private)

```bash
AI_PROVIDER=ollama
OLLAMA_MODEL=llama3.2
OLLAMA_BASE_URL=http://localhost:11434
```

**Setup:**
1. Install [Ollama](https://ollama.ai)
2. Pull a model: `ollama pull llama3.2`
3. Start Ollama: `ollama serve`

**Available Models:**
- `llama3.2` (Recommended - fast, capable)
- `llama3.1` (Larger, more capable)
- `mistral` (Good balance)
- `codellama` (Code-focused)
- `mixtral` (Powerful)

---

### OpenAI

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

**Models:**
- `gpt-4o` (Recommended - fast, capable)
- `gpt-4o-mini` (Cheaper, faster)
- `gpt-4-turbo` (Most capable)
- `gpt-3.5-turbo` (Budget option)

---

### Anthropic (Claude)

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

**Models:**
- `claude-3-5-sonnet-20241022` (Recommended)
- `claude-3-opus-20240229` (Most capable)
- `claude-3-haiku-20240307` (Fastest)

---

### Google (Gemini)

```bash
AI_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=...
GOOGLE_MODEL=gemini-1.5-flash
```

**Models:**
- `gemini-1.5-flash` (Recommended)
- `gemini-1.5-pro` (Most capable)
- `gemini-1.0-pro` (Stable)

---

### NVIDIA

```bash
AI_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-...
NVIDIA_MODEL=nvidia/llama-3.1-nemotron-70b-instruct
```

---

### Groq (Fastest)

```bash
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
```

**Models:**
- `llama-3.3-70b-versatile` (Recommended)
- `mixtral-8x7b-32768`
- `gemma-7b-it`

---

### Mistral

```bash
AI_PROVIDER=mistral
MISTRAL_API_KEY=...
MISTRAL_MODEL=mistral-large-latest
```

---

### DeepSeek

```bash
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-chat
```

---

### xAI (Grok)

```bash
AI_PROVIDER=xai
XAI_API_KEY=...
XAI_MODEL=grok-2-1212
```

---

### Perplexity

```bash
AI_PROVIDER=perplexity
PERPLEXITY_API_KEY=pplx-...
PERPLEXITY_MODEL=llama-3.1-sonar-small-128k-online
```

---

### Cohere

```bash
AI_PROVIDER=cohere
COHERE_API_KEY=...
COHERE_MODEL=command-r-plus
```

---

### Hugging Face

```bash
AI_PROVIDER=huggingface
HUGGINGFACE_API_KEY=hf_...
HUGGINGFACE_MODEL=meta-llama/Llama-3.2-90B-Vision-Instruct
```

---

### Together AI

```bash
AI_PROVIDER=togetherai
TOGETHER_API_KEY=...
TOGETHERAI_MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo
```

---

### Fireworks AI

```bash
AI_PROVIDER=fireworks-ai
FIREWORKS_API_KEY=...
FIREWORKS_MODEL=accounts/fireworks/models/llama-3.3-70b-instruct
```

---

### Cerebras

```bash
AI_PROVIDER=cerebras
CEREBRAS_API_KEY=...
CEREBRAS_MODEL=cerebras/llama-3.3-70b
```

---

### OpenRouter

```bash
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
```

---

### Custom OpenAI-Compatible

For any OpenAI-compatible API:

```bash
AI_PROVIDER=custom
CUSTOM_BASE_URL=https://api.your-provider.com/v1
CUSTOM_MODEL=your-model-name
CUSTOM_API_KEY=your-api-key
```

---

## Memory Configuration

### Vector Database

```bash
# Database location (default: ./mastra.db)
DATABASE_URL=file:./mastra.db
```

### Embedding Model

```bash
# Embedding model for semantic search
EMBEDDING_MODEL=openai/text-embedding-3-small
```

**Options:**
- `openai/text-embedding-3-small` (Default, recommended)
- `openai/text-embedding-3-large` (Higher quality)
- `openai/text-embedding-ada-002` (Legacy)
- `google/gemini-embedding-001` (Google)

### Semantic Recall

```bash
# Number of similar messages to retrieve
SEMANTIC_RECALL_TOPK=5

# Messages before/after each match for context
SEMANTIC_RECALL_RANGE=2
```

---

## Workspace Configuration

### Podman Workspace (Optional)

For sandboxed code execution:

```bash
# Agent identifier
PODMAN_AGENT_ID=sybil-agent

# Workspace directory on host
PODMAN_WORKSPACE_DIR=/path/to/workspace
```

**Note:** Code execution runs in `/workspace` inside the container.

---

## WhatsApp Configuration

### Puppeteer (Optional)

```bash
# Custom Chromium executable path (if needed)
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

**Auto-detected on:**
- macOS: `/Applications/Google Chrome.app`
- Linux: `/usr/bin/chromium-browser` or `/usr/bin/google-chrome`
- Windows: Registry lookup

### Session Persistence

WhatsApp sessions are automatically saved to:
- **Session:** `~/.sybil/whatsapp-session/`
- **Settings:** `~/.sybil/settings.json`

---

## Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | - | Telegram bot token |
| `AI_PROVIDER` | ✅ | `ollama` | AI provider name |
| `OLLAMA_MODEL` | If Ollama | `llama3.2` | Ollama model name |
| `OLLAMA_BASE_URL` | If Ollama | `http://localhost:11434` | Ollama server URL |
| `OPENAI_API_KEY` | If OpenAI | - | OpenAI API key |
| `OPENAI_MODEL` | If OpenAI | `gpt-4o` | OpenAI model |
| `ANTHROPIC_API_KEY` | If Anthropic | - | Anthropic API key |
| `ANTHROPIC_MODEL` | If Anthropic | - | Anthropic model |
| `GOOGLE_GENERATIVE_AI_API_KEY` | If Google | - | Google API key |
| `GOOGLE_MODEL` | If Google | - | Google model |
| `GROQ_API_KEY` | If Groq | - | Groq API key |
| `GROQ_MODEL` | If Groq | - | Groq model |
| `MISTRAL_API_KEY` | If Mistral | - | Mistral API key |
| `MISTRAL_MODEL` | If Mistral | - | Mistral model |
| `DATABASE_URL` | ❌ | `file:./mastra.db` | Database location |
| `EMBEDDING_MODEL` | ❌ | `openai/text-embedding-3-small` | Embedding model |
| `PODMAN_AGENT_ID` | ❌ | - | Podman agent ID |
| `PODMAN_WORKSPACE_DIR` | ❌ | - | Workspace directory |
| `PUPPETEER_EXECUTABLE_PATH` | ❌ | Auto | Chromium path |

---

## Provider Selection Guide

### For Beginners

**Recommended:** Ollama with `llama3.2`
- Free
- Private (runs locally)
- No API keys needed
- Works offline

### For Production

**Recommended:** OpenAI with `gpt-4o` or Anthropic with `claude-3-5-sonnet`
- Most reliable
- Best performance
- Good balance of speed/quality

### For Speed

**Recommended:** Groq with `llama-3.3-70b-versatile`
- Extremely fast responses
- Good quality
- Competitive pricing

### For Budget

**Options:**
- Ollama (Free, local)
- OpenAI `gpt-4o-mini` (Cheapest)
- Groq (Fast, low cost)

### For Privacy

**Recommended:** Ollama
- All data stays on your machine
- No API calls to external services
- Complete control

---

## Troubleshooting

### "AI Provider not configured"

**Problem:** Missing or invalid AI provider configuration

**Solution:**
1. Check `AI_PROVIDER` is set
2. Verify provider-specific API keys
3. Restart Sybil

### "Telegram bot token invalid"

**Problem:** Invalid or expired Telegram token

**Solution:**
1. Message [@BotFather](https://t.me/BotFather)
2. Send `/token` to get new token
3. Update `TELEGRAM_BOT_TOKEN`

### "Cannot connect to Ollama"

**Problem:** Ollama not running or wrong URL

**Solution:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve

# Verify model is downloaded
ollama pull llama3.2
```

### "Embedding model not available"

**Problem:** Embedding model requires different provider

**Solution:**
- OpenAI embeddings: Set `OPENAI_API_KEY`
- Or use Ollama for both LLM and embeddings

---

## Security Best Practices

1. **Never commit `.env` file**
   ```bash
   # Ensure .env is in .gitignore
   echo ".env" >> .gitignore
   ```

2. **Use environment-specific files**
   ```bash
   .env.development
   .env.production
   ```

3. **Rotate API keys regularly**

4. **Use least-privilege tokens**
   - Telegram bot: Only bot token needed
   - API keys: Use restricted keys when possible

5. **Secure file permissions**
   ```bash
   chmod 600 .env
   ```

---

## Advanced Configuration

### Multiple Providers

You can configure multiple providers but only one is active:

```bash
# Set the active provider
AI_PROVIDER=openai

# But configure others for easy switching
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GROQ_API_KEY=...

# Switch via CLI or Telegram
sybil config --set AI_PROVIDER=anthropic
```

### Custom Model Parameters

Add to agent configuration in code:

```typescript
// src/agents/autonomous-agent.ts
export const autonomousAgent = new Agent({
  model: openai("gpt-4o", {
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.9,
  }),
  // ...
});
```

---

## References

- [Getting Started](../tutorials/getting-started.md) - Setup guide
- [CLI Guide](../cli-tui.md) - Configuration commands
- [.env.example](../../../.env.example) - Complete example file
