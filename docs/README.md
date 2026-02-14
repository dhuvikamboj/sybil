# Sybil Documentation

Complete documentation for Sybil AI Agent.

---

## Quick Links

### Getting Started
- **[Getting Started](tutorials/getting-started.md)** - Setup and installation guide
- **[Environment Variables](guides/environment-variables.md)** - Configuration reference
- **[Troubleshooting](guides/troubleshooting.md)** - Common issues and solutions

### User Guides
- **[CLI TUI](cli-tui.md)** - Command-line interface guide
- **[Agent Networks Tutorial](tutorials/agent-networks.md)** - Multi-agent coordination
- **[Web Browsing](tutorials/web-browsing.md)** - Browser automation
- **[Dynamic Tools](tutorials/dynamic-tools.md)** - Tool creation
- **[Skills System](tutorials/skills.md)** - Skill creation and management

### Architecture
- **[Overview](architecture/overview.md)** - System architecture
- **[Agent Networks](architecture/agent-networks.md)** - Agent coordination
- **[Memory System](architecture/memory.md)** - Vector memory and semantic search
- **[Tools System](architecture/tools.md)** - Tool ecosystem

### API Reference
- **[Agents](api/agents.md)** - Agent configuration
- **[Memory](api/memory.md)** - Memory system API
- **[Browser Tools](api/browser-tools.md)** - Browser automation API

### Configuration
- **Environment Variables** - See `docs/guides/environment-variables.md`
- **OTP Authentication** - See `TELEGRAM_OTP_AUTH.md` (root)

---

## Documentation Structure

```
docs/
├── README.md                    # This file
├── cli-tui.md                   # CLI documentation
├── architecture/               # System architecture
│   ├── overview.md            # High-level architecture
│   ├── agent-networks.md      # Multi-agent coordination
│   ├── memory.md              # Memory system
│   └── tools.md               # Tool ecosystem
├── tutorials/                 # Step-by-step guides
│   ├── getting-started.md     # Installation
│   ├── agent-networks.md      # Agent usage
│   ├── web-browsing.md        # Browser tools
│   ├── dynamic-tools.md       # Tool creation
│   └── skills.md              # Skills tutorial
├── api/                       # API documentation
│   ├── agents.md              # Agent API
│   ├── memory.md              # Memory API
│   └── browser-tools.md       # Browser API
├── guides/                    # Reference guides
│   ├── environment-variables.md
│   └── troubleshooting.md
└── features/                  # Feature documentation
    └── (feature-specific docs)
```

---

## Key Features

### 🤖 AI Providers
- 17+ providers supported
- Easy switching between models
- Local (Ollama) and cloud options

### 🧠 Memory System
- Vector storage with LibSQL
- Semantic search with embeddings
- Persistent conversation history

### 🤖 Agent Networks
- 5 specialized agents
- Intelligent task routing
- Multi-agent workflows

### 🔧 Tools
- 33+ built-in tools
- Dynamic tool generation
- Web, WhatsApp, and file operations

### 🔐 Security
- OTP authentication
- Sandboxed execution (Podman)
- PII detection (available)

---

## Quick Commands

```bash
# Start bot
sybil start

# Interactive TUI
sybil

# Check status
sybil status

# View logs
sybil logs --follow

# System diagnostics
sybil doctor
```

---

## Contributing

See the main [README](../README.md) for project overview.

To add documentation:
1. Create `.md` files in appropriate folder
2. Follow existing formatting
3. Update this README with links
4. Test all links work

---

## Support

- **Issues:** Check [troubleshooting guide](guides/troubleshooting.md)
- **Configuration:** See [environment variables guide](guides/environment-variables.md)
- **Logs:** Run `sybil logs --follow`
- **Diagnostics:** Run `sybil doctor`

---

*Documentation version: 1.0.0*
*Last updated: February 14, 2026*
