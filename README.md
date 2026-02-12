# Sybil - Advanced Autonomous AI Agent

An advanced autonomous AI agent built with [Mastra](https://mastra.ai).

## Core Features

🤖 **17+ AI Providers**: OpenAI, Anthropic, Google, NVIDIA, Groq, Mistral, xAI, DeepSeek, Perplexity, Cohere, Hugging Face, and more.

🧠 **Vector Memory System**: True semantic search with embeddings for intelligent memory retrieval and contextual understanding.

🤖 **Agent Networks**: 5 specialized AI agents (Planner, Researcher, Executor, WhatsApp, Routing) coordinated by an intelligent routing agent.

🔧 **Dynamic Tools**: Create custom tools on demand with automatic code generation and validation.

📚 **Dynamic Skills**: Learn new capabilities from user interactions with persistent skill storage.

🖥️ **Browser Control**: Full web browsing, page interaction, screenshots, and HTML to Markdown conversion.

🔐 **OTP Authentication**: Secure one-time password system for user verification.

📱 **Telegram Integration**: Simple, clean chat interface with simplified UX.

💬 **Streaming Responses**: Real-time message streaming with live progress feedback.

🔒 **Safety Processors**: PII detection, content moderation, and prompt injection blocking.

🗂️ **Workspace**: File operations with sandboxed execution for safe code execution.

💾 **CLI Tools**: Complete suite of command-line management tools (13 commands).

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Configure Telegram Bot

1. Create a Telegram bot:
   ```bash
   # Open Telegram and search for @BotFather
   # Send: /newbot
   # Follow prompts to create your bot
   # Copy the bot token (starts with "your_bot_token")
   ```

2. Set up configuration:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. Add your provider and Telegram token:
   ```env
   # OpenAI
   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o
   TELEGRAM_BOT_TOKEN=your_bot_token

   # Or Groq (Fast, Free)
   AI_PROVIDER=groq
   GROQ_API_KEY=gsk_...
   GROQ_MODEL=llama-3.3-70b-versatile
   TELEGRAM_BOT_TOKEN=your_bot_token

   # Or NVIDIA AI (GPU)
   AI_PROVIDER=nvidia
   NVIDIA_API_KEY=nvapi-...
   NVIDIA_MODEL=nvidia/llama-3.1-nemotron-70b-instruct
   TELEGRAM_BOT_TOKEN=your_bot_token

   # Or Ollama (Local, Free)
   AI_PROVIDER=ollama
   OLLAMA_MODEL=llama3.2
   OLLAMA_BASE_URL=http://localhost:11434
   TELEGRAM_BOT_TOKEN=your_bot_token
   ```

### 3. Start

```bash
npm start
```

### 4. Connect Your Telegram Bot

```bash
# Start a chat with your bot on Telegram
# Your bot will welcome you and ask for authentication
```

### 5. Authenticate Users (Optional)

For secure access control:

```bash
sybil otp
# Generate OTP → Share 6-digit code → User sends code to your bot
```

## CLI Commands

```bash
# Management
sybil init              # Setup wizard
sybil start              # Start bot
sybil stop               # Stop bot
sybil status              # Check status

# Configuration
sybil config --edit       # Interactive config
sybil config --list       # Show all config

# Logs
sybil logs --follow       # Stream logs

# Authentication
sybil otp                 # Generate OTP

# Data
sybil backup              # Create backup
sybil restore <name>     # Restore backup
```

## Telegram Commands

```
/start          - Welcome
/help           - Commands
/plan <goal>    - Create plan
/network <task>  - Multi-agent task
/status         - Your stats
/memory         - What I remember
/model <provider> - Change AI model

/create-tool    - New tool
/create-skill    - New skill
/list-tools     - All tools

/whatsapp       - WhatsApp status
```

## Documentation

- 📖 [Getting Started](docs/tutorials/getting-started.md)
- 🌐 [Web Browsing](docs/tutorials/web-browsing.md)
- 🤖 [Agent Networks](docs/tutorials/agent-networks.md)
- 🔧 [Dynamic Tools](docs/tutorials/dynamic-tools.md)
- 📚 [Skills System](docs/tutorials/skills.md)
- 🧠 **[Vector Memory Guide](/Users/davindersingh/projects/dokkubot/VECTOR_MEMORY.md)**
- 🖥️ **[Browser Control](/Users/davindersingh/projects/dokkubot/BROWSER_CONTROL.md)**

## Architecture

- 🏗️ [Architecture Overview](docs/architecture/overview.md)
- 🧠 [Memory System](docs/architecture/memory.md)
- 🤖 [Agent Networks](docs/architecture/agent-networks.md)
- 🔧 [Tools System](docs/architecture/tools.md)

## API Reference

- 🖥️ [Browser Tools API](docs/api/browser-tools.md)
- 🤖 [Agent API](docs/api/agents.md)
- 🧠 [Memory API](docs/api/memory.md)
- 📚 [Skills API](docs/api/skills.md)

## License

MIT
