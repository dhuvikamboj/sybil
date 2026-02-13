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

### Interactive Setup (Recommended)
```bash
# Complete setup in one command
sybil init

# Follow the interactive wizard:
# 1. Enter Telegram Bot Token
# 2. Choose AI provider
# 3. Add API key
# 4. Configure WhatsApp (optional)
```

### Manual Setup

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Create Telegram Bot (Required)
```bash
# Open Telegram and message @BotFather
# Send: /newbot
# Follow prompts to create your bot
# Copy the bot token (starts with a number followed by a colon)
```

#### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your credentials
```

#### 4. Environment Variables
```env
# Required: Telegram Bot Token (get from @BotFather)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxyz

# Required: Choose AI provider and add API key
AI_PROVIDER=groq  # or openai, anthropic, google, nvidia, ollama
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
```

#### 5. Start Bot
```bash
npm start
# OR use CLI
sybil start
```

#### 6. Connect to Bot
```bash
# Find your bot on Telegram and start a chat
# Bot will welcome you and guide next steps
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

## CLI & TUI Commands

### Interactive Terminal Interface
```bash
sybil              # Launch interactive TUI menu (no arguments)
```

### Quick Commands
```bash
# Setup & Management
sybil init         # Interactive setup wizard
sybil start        # Start bot
sybil stop         # Stop bot
sybil status       # Check status
sybil doctor       # System diagnostics

# Authentication
sybil otp --generate     # Generate OTP for user
sybil otp --list        # List pending/authorized users
sybil otp --revoke 123  # Revoke user access

# Configuration
sybil config --edit     # Interactive config
sybil config --list     # Show all settings

# Monitoring
sybil logs --follow     # Live logs
sybil whatsapp --status # WhatsApp connection
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

### Quick Start
- 📖 [Getting Started](docs/tutorials/getting-started.md) - Complete setup guide
- 💻 [CLI TUI Guide](docs/cli-tui.md) - Interactive terminal interface

### Tutorials
- 🌐 [Web Browsing](docs/tutorials/web-browsing.md) - Browser automation
- 🤖 [Agent Networks](docs/tutorials/agent-networks.md) - Multi-agent coordination
- 🔧 [Dynamic Tools](docs/tutorials/dynamic-tools.md) - Tool creation
- 📚 [Skills System](docs/tutorials/skills.md) - Skills creation
- 🔐 [OTP Authentication](docs/cli-tui.md#otp-management) - User access control

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
