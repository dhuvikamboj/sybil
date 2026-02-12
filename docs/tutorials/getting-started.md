# Getting Started with Sybil

Complete guide to setting up and running Sybil for the first time.

## 1. Environment Setup

### Install Dependencies

```bash
cd /path/to/sybil
npm install
```

### Configure Environment

```bash
cp .env.example .env
nano .env  # Or your preferred editor
```

### Minimum Required Configuration

```env
# Required
TELEGRAM_BOT_TOKEN=<your_telegram_bot_token>  # Get from @BotFather

# AI Provider (choose one)
AI_PROVIDER=openai
OPENAI_API_KEY=<your_openai_key>
OPENAI_MODEL=gpt-4o

# Telegram Bot Token Setup
1. Open Telegram
2. Search for @BotFather
3. Send /newbot
4. Follow instructions
5. Copy bot token
```

### Recommended AI Providers by Use Case

| Use Case | Provider | Cost | Speed | Quality |
|---------|----------|------|-------|--------|
| Best Quality | OpenAI | High | Medium | ⭐⭐⭐⭐⭐ |
| Speed | Groq | Free tier fast | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Privacy | Ollama | Free (local) | ⭐⭐⭐ | ⭐⭐⭐ | |
| GPU Accelerated | NVIDIA AI | Paid (fast) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

## 2. Authenticate Your Bot Users

Sybil uses OTP-based authentication to allow access only to approved users.

### Generate a User OTP

```bash
sybil otp
# Select: 🆕 Generate New OTP
# Enter Chat ID (or leave blank for pending mode)
# Share the displayed 6-digit code with user
```

### User Authentication Flow

**User sends first message:**
```
You: Hi there!
Bot: 🔐 Send 6-digit code from admin to unlock Sybil Bot

You: 123456
Bot: ✅ Welcome to Sybil! Just start chatting!
```

### Manage Users

```bash
# List authenticated users
sybil otp --list

# Revoke user access
sybil otp --revoke <chatId>

# Show pending OTPs
sybil otp
```

## 3. Basic Conversation

After authentication, users can chat naturally:

**Examples:**

```
You: What's 15 * 7?
Bot: 105

You: Remember my name is Alice
Bot: Got it, Alice! I've saved that.

You: Plan my day - I need to learn Python, do grocery shopping, and reply to emails.
Bot: [Creates structured plan for the day]
```

## 4. Common First Tasks

### Task: Change AI Provider

```bash
# Interactive method
sybil config --edit
# Select: Change AI Provider
# Choose: groq, anthropic, google, ollama, etc.
```

### Task: Check Bot Status

```bash
sybil status
# Shows: Configuration, Process Status, Resource Usage
```

### Task: View Logs

```bash
sybil logs --follow
# Stream logs in real-time
sybil logs --level error  # Only errors
```

### Task: Backup Data

```bash
# Create backup
sybil backup

# Restore from backup
sybil restore backup-2026-02-12
```

## 5. Enable Additional Features

### WhatsApp Integration

1. Edit `.env`:
```env
ENABLE_WHATSAPP=true
```

2. Initialize WhatsApp:
```bash
# Start bot
npm start

# On another terminal:
sybil whatsapp --initialize

# Scan QR code with WhatsApp on phone
```

3. Verify connection:
```bash
sybil whatsapp --status
```

### Vector Memory (Semantic Search)

Enable intelligent memory retrieval via embeddings:

```env
# In .env:
EMBEDDING_MODEL=openai/text-embedding-3-small
SEMANTIC_RECALL_TOPK=5
SEMANTIC_RECALL_RANGE=2
```

### Browser Control

Browser tools are automatically available to agents. Try:

```
User: Research the latest AI news and save to a file
→ Agent will:
  1. Search Google
  2. Navigate to articles
  3. Extract content
  4. Convert to Markdown
  5. Save to workspace/ai-news.md
```

## Troubleshooting

### "Bot not responding"
```bash
# Check if running
sybil status

# View logs
sybil logs --follow
```

### "Could not connect to Ollama"
```bash
# Start Ollama
ollama serve

# Verify
curl http://localhost:11434/api/tags
```

### "Missing API key"
```bash
# Verify env file loaded
cat .env | grep API_KEY

# Check which provider you're using
cat .env | grep AI_PROVIDER
```

### "Memory not working"
```bash
# Check database
ls -la ./mastra.db

# Check storage path
cat .env | grep DATABASE_URL
```

### "Browser tools failing"
```bash
# Install Playwright browsers
npx playwright install chromium

# Verify installation
npx playwright --version
```

## Next Steps

Now that Sybil is running:

1. **Try these commands:**
   - `/network Research AI trends` - Multi-agent research
   - `/model groq` - Switch to faster provider
   - `/create-tool weather checker` - Create new tool

2. **Try asking:**
   - "Create a skill for managing GitHub projects"
   - "Browse tech.com and save the article"
   - "Generate a plan to learn Rust"

3. **Explore:**
   - Vector memory - `/memory` shows semantic search results
   - Dynamic skills - `/create-skill` creates persistent skills
   - Agent networks - `/network` coordinates specialized agents

## Support

- Issues: https://github.com/anomalyco/opencode/issues
- Documentation: See README.md and docs/ folder
- Mastra Docs: https://mastra.ai/docs

---

**Enjoy using Sybil! 🤖**
