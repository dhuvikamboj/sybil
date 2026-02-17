# Sybil - Advanced Autonomous AI Agent

<p align="center">

  <img src="assets/logo.png" alt="Sybil Logo" width="400" />
</p>

An advanced autonomous AI agent built with [Mastra](https://mastra.ai).

## Core Features

🤖 **17+ AI Providers**: OpenAI, Anthropic, Google, NVIDIA, Groq, Mistral, xAI, DeepSeek, Perplexity, Cohere, Hugging Face, Together AI, Fireworks AI, Cerebras, OpenRouter, and Ollama.

🧠 **Vector Memory System**: LibSQL-based vector storage with FastEmbed embeddings for semantic search and intelligent memory retrieval.

🤖 **Agent Networks**: 4 specialized AI agents (Planner, Researcher, Executor, WhatsApp) coordinated by an intelligent Routing agent for complex multi-step workflows.

🔧 **Dynamic Tools**: Create custom tools on demand with automatic code generation and validation (33+ tools available).

📚 **Dynamic Skills**: Learn new capabilities from user interactions with persistent skill storage and activation.

🖥️ **Browser Control**: Full Playwright-based web browsing with page interaction, screenshots, form filling, and HTML-to-Markdown conversion.

🔐 **OTP Authentication**: Secure 6-digit one-time password system for user verification and access control.

📱 **Multi-Platform Messaging**: Telegram bot with streaming responses + WhatsApp Web integration with auto-reply capabilities.

💬 **Streaming Responses**: Real-time message streaming with live progress feedback and step-by-step execution visibility.

🗂️ **Sandboxed Workspace**: File operations with Podman containerized execution for safe code execution and workspace isolation.

💾 **CLI Tools**: Interactive TUI and 12 command-line management tools for complete bot administration.

## Quick Start

### Interactive Setup (Recommended)
```bash
#install sybilcli globally
npm i -g npm i @fortressllm/sybil
# create a directory where all your secrets and workspace will reside
mkdir sybil
cd sybil
# Complete setup in one command
sybilcli init

# Follow the interactive wizard:
# 1. Enter Telegram Bot Token
# 2. Choose AI provider
# 3. Add API key
# 4. Configure WhatsApp (optional)
```

### Manual Setup

#### 1. Clone the repo and Install Dependencies
```bash
git clone https://github.com/fortressllm/sybil.git


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

# Optional: Podman Workspace Configuration (for MCP server)
PODMAN_AGENT_ID=your-agent-id
PODMAN_WORKSPACE_DIR=/path/to/workspace
```

#### 5. Start Bot
```bash
npm start
# OR use CLI
sybilcli start
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
sybilcli otp
# Generate OTP → Share 6-digit code → User sends code to your bot
```

## CLI & TUI Commands

### Interactive Terminal Interface
```bash
sybilcli # Launch interactive TUI menu (no arguments)
```

### Available Commands (12 total)

| Command | Description |
|---------|-------------|
| `sybilcli init` | Interactive setup wizard with configuration prompts |
| `sybilcli start` | Start the bot service |
| `sybilcli stop` | Stop the bot service |
| `sybilcli status` | Check bot status and health |
| `sybilcli doctor` | Run system diagnostics and health checks |
| `sybilcli config` | Manage configuration (edit, list, validate) |
| `sybilcli logs` | View and filter bot logs |
| `sybilcli backup` | Create backup of data and configuration |
| `sybilcli restore` | Restore from backup |
| `sybilcli update` | Update Sybil to latest version |
| `sybilcli whatsapp` | Manage WhatsApp connection and sessions |
| `sybilcli otp` | OTP authentication management |

### Usage Examples
```bash
# Interactive mode (shows TUI menu)
sybil

# Setup and configuration
sybilcli init
sybilcli config --edit

# Service management
sybilcli start
sybilcli status
sybilcli stop

# Authentication
sybilcli otp                    # Interactive OTP menu
sybilcli otp --generate         # Generate new OTP code

# Monitoring
sybilcli logs --follow          # Live log streaming
sybilcli doctor                 # System health check

# WhatsApp management
sybilcli whatsapp               # Interactive WhatsApp menu

# Backup and maintenance
sybilcli backup
sybilcli update
```

### Quick Commands
```bash
# Setup & Management
sybilcli init         # Interactive setup wizard
sybilcli start        # Start bot
sybilcli stop         # Stop bot
sybilcli status       # Check status
sybilcli doctor       # System diagnostics

# Authentication
sybilcli otp --generate     # Generate OTP for user
sybilcli otp --list        # List pending/authorized users
sybilcli otp --revoke 123  # Revoke user access

# Configuration
sybilcli config --edit     # Interactive config
sybilcli config --list     # Show all settings

# Monitoring
sybilcli logs --follow     # Live logs
sybilcli whatsapp --status # WhatsApp connection
```

## Telegram Commands

### Basic Commands
```
/start          - Welcome message and bot introduction
/help           - Show all available commands
/status         - View your usage statistics and session info
/memory         - Show what the bot remembers about you
```

### AI Provider Commands
```
/model          - Change AI provider/model (interactive selection)
/models         - List all available AI providers
```

### Task Execution Commands
```
/plan <goal>    - Create a structured execution plan for complex tasks
/network <task> - Execute multi-agent coordinated tasks
/research <topic> - Activate research mode for information gathering
```

### Tool & Skill Management
```
/create-tool    - Generate a new custom tool dynamically
/list-tools    - View all available tools
/create-skill  - Create a new skill for specialized tasks
/list-skills   - View and activate available skills
```

### WhatsApp Integration
```
/whatsapp      - Check WhatsApp connection status
/whatsapp-send - Send a WhatsApp message
```

### Session Modes
```
/plan          - Switch to planning mode for complex tasks
/research      - Switch to research mode for information gathering
/agent         - Switch to agent network mode
/normal        - Return to normal chat mode
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
- 📖 [Getting Started](docs/tutorials/getting-started.md) - Complete setup and installation guide
- 💻 [CLI Guide](docs/cli-tui.md) - Interactive terminal interface and command reference
- 🔐 [OTP Authentication](TELEGRAM_OTP_AUTH.md) - User access control and verification

### Tutorials
- 🌐 [Web Browsing](docs/tutorials/web-browsing.md) - Browser automation with Playwright
- 🤖 [Agent Networks](docs/tutorials/agent-networks.md) - Multi-agent coordination and workflows
- 🔧 [Dynamic Tools](docs/tutorials/dynamic-tools.md) - Tool creation and management
- 📚 [Skills System](docs/tutorials/skills.md) - Dynamic skill creation and activation

### Architecture
- 🏗️ [Architecture Overview](docs/architecture/overview.md) - High-level system architecture
- 🧠 [Memory System](docs/architecture/memory.md) - Vector memory and semantic search
- 🤖 [Agent Networks](docs/architecture/agent-networks.md) - Agent coordination and routing
- 🔧 [Tools System](docs/architecture/tools.md) - Tool registry and dynamic loading

### API Reference
- 🖥️ [Browser Tools](docs/api/browser-tools.md) - Web automation API
- 🤖 [Agents](docs/api/agents.md) - Agent configuration and usage
- 🧠 [Memory](docs/api/memory.md) - Memory system API
- 📚 [Skills](docs/tutorials/skills.md) - Skills API (see tutorials)
- 🔧 [Tools](docs/architecture/tools.md) - Tool system reference

### Configuration
- 📋 [Environment Variables](.env.example) - Complete environment configuration
- 🗂️ [Podman Workspace](src/tools/podman-workspace-mcp.ts) - Sandboxed execution configuration

## ⚠️ Legal Disclaimer & Terms of Service Compliance

**IMPORTANT**: This software includes integrations with third-party services that may violate their Terms of Service. Use at your own risk.

### WhatsApp Integration
This project uses `whatsapp-web.js` to interact with WhatsApp Web. **WhatsApp automation is against WhatsApp's Terms of Service**. Using this feature may result in:
- Account suspension or permanent bans
- Legal action from Meta/WhatsApp
- Loss of access to your WhatsApp account

By using the WhatsApp integration, you acknowledge that:
- You are solely responsible for any consequences
- This tool is for educational and personal use only
- You will not use it for spam, harassment, or unauthorized messaging
- You have obtained consent from message recipients where required by law

### Telegram Bot API
This project uses the Telegram Bot API. Ensure your usage complies with:
- [Telegram Terms of Service](https://telegram.org/tos)
- [Telegram Bot Platform Terms](https://telegram.org/tos/bot-developers)
- Local laws regarding automated messaging and data handling

### Web Scraping & Browser Automation
Features using Playwright for web browsing and scraping may:
- Violate websites' Terms of Service
- Be prohibited by robots.txt files
- Infringe on copyrights or terms of use

Always:
- Check target website's Terms of Service before scraping
- Respect robots.txt directives
- Obtain permission when required
- Comply with applicable data protection laws (GDPR, CCPA, etc.)

### General Liability
The authors and contributors of this project:
- **Assume no liability** for any legal issues, account bans, or damages
- **Provide no warranty** - this software is provided "AS IS"
- **Are not responsible** for how you choose to use this software

### Compliance Recommendations
- Review all relevant Terms of Service before use
- Consult legal counsel if using for commercial purposes
- Use only on accounts/services you own or have explicit permission to access
- Consider using official APIs with proper authorization instead of unofficial methods

**By using this software, you agree to take full responsibility for ensuring your usage complies with all applicable laws and terms of service.**

## License

MIT
