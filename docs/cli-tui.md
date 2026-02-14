# Sybil TUI (Terminal User Interface)

Interactive terminal interface for managing Sybil AI Agent.

## Quick Start

```bash
# Launch interactive TUI (no arguments)
sybil

# Direct commands (with arguments)
sybil init     # Setup wizard
sybil start    # Start bot
sybil otp      # Generate OTP
sybil --help   # Show all commands
```

## Main Menu

```
┌─────────────────────────────────────┐
│              SYBIL                  │
│        AI Agent Management         │
└─────────────────────────────────────┘

1. 🚀 Quick Setup
2. 🤖 Bot Management
3. 🔐 Authentication
4. 📊 Monitoring & Logs
5. ⚙️ Configuration
6. 📱 WhatsApp Integration
7. 🔧 Advanced Tools
8. ❓ Help & Documentation

Choose an option: _
```

## Feature Overview

### 🚀 Quick Setup
- **Interactive Setup**: Step-by-step configuration wizard
- **Provider Selection**: Choose from 17+ AI providers
- **Telegram Bot**: Automatic bot token validation
- **Environment**: Create and validate `.env` file

### 🤖 Bot Management
- **Start/Stop**: Control bot lifecycle
- **Status Check**: Real-time bot health
- **Restart**: Clean restart with memory preservation
- **Logs**: Live streaming logs

### 🔐 Authentication System
- **OTP Generation**: Create secure 6-digit codes
- **User Management**: List authenticated users
- **Access Control**: Grant/revoke user access
- **Pending OTPs**: View and manage pending authentications

### 📊 Monitoring & Logs
- **Real-time Logs**: Live streaming with filtering
- **Performance Metrics**: Response times, error rates
- **Usage Stats**: Message counts, user activity
- **System Health**: Memory, CPU, network status

### ⚙️ Configuration
- **Provider Switching**: Change AI provider on-the-fly
- **Model Selection**: Switch between models
- **Memory Settings**: Adjust history length
- **Safety Settings**: Configure processors

### 📱 WhatsApp Integration
- **QR Code**: Connect WhatsApp via QR scan
- **Status Check**: WhatsApp connection status
- **Message Logs**: WhatsApp message history
- **Contact Management**: Manage allowed contacts

### 🔧 Advanced Tools
- **Backup/Restore**: Full system backup
- **Update System**: Check for updates and apply
- **Doctor**: Diagnose and fix issues
- **Memory Tools**: Clear memory, reset conversations

## TUI Commands

### Interactive Mode
```bash
sybil                    # Launch TUI menu
```

### Direct Commands
```bash
sybil init               # Setup wizard
sybil start              # Start bot
sybil stop               # Stop bot
sybil status             # Check status
sybil otp --generate     # Generate OTP
sybil otp --list         # List pending OTPs
sybil config --edit     # Interactive config
sybil logs --follow      # Live logs
```

## OTP Management

### Generate OTP
```bash
$ sybil otp
🔐 Telegram OTP Authentication

📱 Generate Authentication OTP

What would you like to do?
1. 🆕 Generate new OTP
2. 📋 Show pending OTPs
3. 👥 List authenticated users

Choose: 1

Enter user's Telegram Chat ID: 123456789

✅ OTP Generated!

📱 Share this code: 847291
⏰ Valid for: 10 minutes
```

### List Authenticated Users
```bash
$ sybil otp --list

👥 Authenticated Users:
✅ 123456789 - 2024-01-15 14:30:22
✅ 987654321 - 2024-01-15 15:45:10
```

### Revoke Access
```bash
$ sybil otp --revoke 123456789
🔐 Revoke authentication for chat 123456789? [y/N]: y
✅ Authentication revoked
```

## Configuration Management

### Provider Switching
```bash
$ sybil config --edit

⚙️ Configuration Management

Current Provider: groq
Model: llama-3.3-70b-versatile

1. Change AI Provider
2. Switch Model
3. Update Telegram Token
4. Configure Memory
5. Set Safety Preferences
```

### Environment Validation
```bash
$ sybil doctor

🏥 System Diagnostics

✅ Environment variables
✅ Database connection
✅ Telegram bot token
✅ AI provider connectivity
✅ Memory system
✅ Browser tools
✅ WhatsApp integration

All systems operational! 🎉
```

## WhatsApp Setup

### Connect WhatsApp
```bash
$ sybil whatsapp --setup

📱 WhatsApp Setup

1. Scan the QR code with your phone
2. Your WhatsApp will be connected
3. You can now chat with Sybil on WhatsApp
```

### Check Status
```bash
$ sybil whatsapp --status

📱 WhatsApp Status: Connected ✅
Phone: +1 (555) 123-4567
Ready to receive messages
```

## Browser Tools

### Interactive Browser Control
```bash
$ sybil tools browser

🖥️ Browser Control

1. Navigate to URL
2. Take screenshot
3. Extract content
4. Save as Markdown
5. Google search
6. Execute JavaScript

Choose action: 1

Enter URL: https://example.com
✅ Navigated to https://example.com
```

## Memory Management

### Memory Operations
```bash
$ sybil memory

🧠 Memory Management

1. View conversation history
2. Clear working memory
3. Search semantic memory
4. Export memories
5. Import from backup

Choose: 3

Search: "AI model discussions"
Found 5 relevant memories...
```

## Advanced Features

### Real-time Monitoring
```bash
$ sybil monitor

📊 Sybil Monitor

CPU: 12% | Memory: 256MB | Network: Connected
Messages: 1,247 | Users: 15 | Errors: 0

Provider: groq | Model: llama-3.3-70b-versatile
Uptime: 2h 34m | Response time: 1.2s avg

Live logs: [streaming...]
```

### Backup System
```bash
$ sybil backup

💾 Creating backup...
✅ Backup created: sybil-backup-2024-01-15-14-30-22.tar.gz
Location: ~/.sybil/backups/
Size: 2.3MB
```

## Keyboard Shortcuts

In TUI mode:
- `q` - Quit
- `h` - Help
- `r` - Restart bot
- `l` - View logs
- `c` - Configuration
- `o` - OTP management

## Error Handling

### Common Issues

```bash
# Missing API key
$ sybil doctor
❌ Missing OPENAI_API_KEY
Run: sybil config --edit

# Telegram bot not found
$ sybil status
❌ Telegram: Bot token invalid
Run: sybil config --edit

# Memory issues
$ sybil doctor
❌ Database: Connection failed
Run: sybil restore --latest
```

## Configuration Files

### `.env` Example
```env
# Required
TELEGRAM_BOT_TOKEN=your_bot_token_here
AI_PROVIDER=groq
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Optional
ENABLE_WHATSAPP=true
DATABASE_URL=file:./mastra.db
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `AI_PROVIDER` | ✅ | One of: openai, anthropic, google, groq, ollama, nvidia |
| `*_API_KEY` | ✅ | API key for chosen provider |
| `*_MODEL` | ✅ | Model name for provider |
| `ENABLE_WHATSAPP` | ❌ | Enable WhatsApp integration |
| `BROWSER_HEADLESS` | ❌ | Browser mode (true/false) |

## Troubleshooting

### Common Commands
```bash
# Check everything
sybil doctor

# Restart with clean state
sybil stop && sybil start

# View recent logs
sybil logs --tail 50

# Generate new OTP for user
sybil otp --generate

# Switch providers quickly
sybil config --provider openai --model gpt-4o
```

## Getting Help

```bash
# TUI help
sybil --help

# Command help
sybil otp --help
sybil config --help

# Documentation
sybil help docs
```

## Quick Setup Commands

```bash
# Complete setup in 3 commands
sybil init                    # Interactive setup
sybil start                   # Start bot
sybil otp --generate          # Generate first OTP

# Alternative: One-liner setup
sybil init && sybil start
```