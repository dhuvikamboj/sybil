# Troubleshooting Guide

Common issues and solutions for Sybil.

---

## Installation Issues

### npm install fails

**Error:** `npm ERR! code E404` or `npm ERR! code ENOENT`

**Solutions:**

1. **Clear npm cache:**
   ```bash
   npm cache clean --force
   npm install
   ```

2. **Delete node_modules and reinstall:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Check Node.js version:**
   ```bash
   node --version  # Should be v18+
   ```

4. **Use specific Node version:**
   ```bash
   # Using nvm
   nvm install 20
   nvm use 20
   npm install
   ```

---

### TypeScript compilation errors

**Error:** `Cannot find module` or `Type error`

**Solutions:**

1. **Rebuild TypeScript:**
   ```bash
   npm run build
   ```

2. **Check TypeScript version:**
   ```bash
   npx tsc --version  # Should be 5.x
   ```

3. **Install missing types:**
   ```bash
   npm install -D @types/node
   ```

4. **Clean build:**
   ```bash
   rm -rf dist
   npm run build
   ```

---

## Telegram Bot Issues

### Bot not responding

**Symptoms:** Messages to bot get no response

**Solutions:**

1. **Check bot token:**
   ```bash
   # Verify token format
   echo $TELEGRAM_BOT_TOKEN  # Should be like: 123456789:ABCdef...
   ```

2. **Test bot token:**
   ```bash
   curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe
   ```

3. **Check if bot is running:**
   ```bash
   sybil status
   # or
   ps aux | grep node
   ```

4. **Restart bot:**
   ```bash
   sybil stop
   sybil start
   ```

5. **Check logs:**
   ```bash
   sybil logs --follow
   ```

---

### "Telegram bot token invalid"

**Solution:**
1. Message [@BotFather](https://t.me/BotFather)
2. Send `/mybots`
3. Select your bot
4. Choose "API Token"
5. Copy new token
6. Update `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=new_token_here
   ```

---

### Bot webhook issues

**Symptoms:** Bot receives messages but doesn't respond

**Solutions:**

1. **Check for webhook conflicts:**
   ```bash
   # Remove webhook if set
   curl -X POST "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
   ```

2. **Verify polling mode:**
   - Sybil uses polling by default
   - Check logs for "polling" messages

---

## AI Provider Issues

### "AI Provider not configured"

**Symptoms:** Error on startup about missing AI configuration

**Solutions:**

1. **Check .env file:**
   ```bash
   cat .env | grep AI_PROVIDER
   ```

2. **Set provider:**
   ```bash
   echo "AI_PROVIDER=ollama" >> .env
   ```

3. **Verify provider-specific variables:**
   ```bash
   # For Ollama
   echo "OLLAMA_MODEL=llama3.2" >> .env

   # For OpenAI
   echo "OPENAI_API_KEY=sk-..." >> .env
   ```

---

### Ollama connection refused

**Error:** `connect ECONNREFUSED 127.0.0.1:11434`

**Solutions:**

1. **Start Ollama:**
   ```bash
   ollama serve
   ```

2. **Check if Ollama is running:**
   ```bash
   curl http://localhost:11434/api/tags
   ```

3. **Verify model exists:**
   ```bash
   ollama list
   ollama pull llama3.2
   ```

4. **Check Ollama version:**
   ```bash
   ollama --version
   ```

5. **Different port:**
   ```bash
   # If Ollama runs on different port
   OLLAMA_BASE_URL=http://localhost:11435
   ```

---

### "Model not found"

**Error:** Model returns 404 or not available

**Solutions:**

1. **Check model name:**
   ```bash
   # For Ollama
   ollama list

   # Should match OLLAMA_MODEL in .env
   ```

2. **Pull model:**
   ```bash
   ollama pull llama3.2
   ```

3. **Use correct model format:**
   ```bash
   # OpenAI
   OPENAI_MODEL=gpt-4o

   # Anthropic
   ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

   # Groq
   GROQ_MODEL=llama-3.3-70b-versatile
   ```

---

### API rate limits

**Error:** `429 Too Many Requests`

**Solutions:**

1. **Switch to different provider:**
   ```bash
   # Edit .env
   AI_PROVIDER=ollama  # Local, no rate limits
   ```

2. **Reduce concurrent requests:**
   - Limit number of simultaneous chats
   - Add delays between messages

3. **Check provider status:**
   - OpenAI: https://status.openai.com
   - Anthropic: https://status.anthropic.com

---

### "Embedding model error"

**Error:** Semantic search or memory fails

**Solutions:**

1. **Check embedding configuration:**
   ```bash
   cat .env | grep EMBEDDING
   ```

2. **Use OpenAI for embeddings:**
   ```bash
   EMBEDDING_MODEL=openai/text-embedding-3-small
   OPENAI_API_KEY=sk-...
   ```

3. **Or disable semantic search:**
   ```bash
   # Remove semantic recall from processors
   # Edit: src/processors/index.ts
   ```

---

## WhatsApp Issues

### QR code not scanning

**Symptoms:** QR code appears but WhatsApp won't scan

**Solutions:**

1. **Use WhatsApp on phone, not WhatsApp Business:**
   - Standard WhatsApp works better

2. **Clear browser cache:**
   ```bash
   rm -rf .wwebjs_cache
   ```

3. **Try again:**
   ```bash
   sybil whatsapp
   # Select "Reinitialize"
   ```

4. **Check session folder:**
   ```bash
   ls -la ~/.sybil/whatsapp-session/
   # Should contain session files
   ```

5. **Re-authenticate:**
   ```bash
   rm -rf ~/.sybil/whatsapp-session
   sybil whatsapp
   # Scan new QR code
   ```

---

### WhatsApp "Disconnected"

**Symptoms:** Status shows disconnected or "not ready"

**Solutions:**

1. **Check WhatsApp status:**
   ```bash
   sybil whatsapp
   ```

2. **Re-initialize:**
   ```bash
   # In Telegram
   /whatsapp
   # Or use CLI
   sybil whatsapp
   # Select "Initialize"
   ```

3. **Check Puppeteer:**
   ```bash
   # Verify Chrome/Chromium installed
   which google-chrome
   which chromium

   # Set custom path if needed
   echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium" >> .env
   ```

4. **Check logs:**
   ```bash
   sybil logs --follow | grep -i whatsapp
   ```

---

### Message not sending

**Error:** "Failed to send WhatsApp message"

**Solutions:**

1. **Check phone number format:**
   - Use international format: `+1234567890`
   - No spaces or special characters

2. **Verify contact exists:**
   ```bash
   # In Telegram
   "Check if +1234567890 is in my WhatsApp contacts"
   ```

3. **Check connection:**
   ```bash
   /whatsapp
   ```

4. **Wait for connection:**
   - WhatsApp Web takes time to sync
   - Try again in 30 seconds

---

## Memory Issues

### Memory not persisting

**Symptoms:** Bot doesn't remember previous conversations

**Solutions:**

1. **Check database:**
   ```bash
   ls -lh mastra.db
   ```

2. **Verify database URL:**
   ```bash
   cat .env | grep DATABASE
   # Should be: DATABASE_URL=file:./mastra.db
   ```

3. **Check permissions:**
   ```bash
   # Should be writable
   touch mastra.db
   ```

4. **Reset database (⚠️ loses all data):**
   ```bash
   rm mastra.db
   npm start
   ```

---

### Semantic search not working

**Symptoms:** "Memory" command returns nothing

**Solutions:**

1. **Check if semantic recall is enabled:**
   ```bash
   # Check src/processors/index.ts
   # Should include semanticRecall in inputProcessors
   ```

2. **Verify embedding model:**
   ```bash
   cat .env | grep EMBEDDING
   ```

3. **Check LibSQL:**
   ```bash
   # Should have vector extension
   sqlite3 mastra.db ".tables"
   ```

4. **Rebuild memory:**
   ```bash
   # Restart to reinitialize
   sybil restart
   ```

---

## Workspace/Podman Issues

### "Podman not found"

**Error:** Code execution fails

**Solutions:**

1. **Install Podman:**
   ```bash
   # macOS
   brew install podman

   # Ubuntu/Debian
   sudo apt-get install podman

   # Fedora
   sudo dnf install podman
   ```

2. **Start Podman machine (macOS):**
   ```bash
   podman machine init
   podman machine start
   ```

3. **Verify installation:**
   ```bash
   podman --version
   podman run hello-world
   ```

---

### Code execution fails

**Error:** "Failed to execute code"

**Solutions:**

1. **Check Podman:**
   ```bash
   podman ps
   ```

2. **Check workspace path:**
   ```bash
   # Must use /workspace/ prefix
   # Correct: /workspace/script.py
   # Wrong: ./script.py or /Users/.../script.py
   ```

3. **Check logs:**
   ```bash
   sybil logs --follow | grep -i podman
   ```

4. **Test manually:**
   ```bash
   podman run --rm -v $(pwd)/workspace:/workspace alpine ls /workspace
   ```

---

## CLI Issues

### "sybil command not found"

**Solutions:**

1. **Install globally:**
   ```bash
   npm install -g .
   ```

2. **Use npx:**
   ```bash
   npx sybil
   ```

3. **Check PATH:**
   ```bash
   # Add to shell config
   export PATH="$PATH:$(npm bin -g)"
   ```

4. **Link locally:**
   ```bash
   npm link
   ```

---

### CLI commands not working

**Solutions:**

1. **Build first:**
   ```bash
   npm run build
   ```

2. **Check dist folder:**
   ```bash
   ls dist/cli/
   ```

3. **Run directly:**
   ```bash
   node dist/cli/index.js
   ```

---

## Performance Issues

### Slow responses

**Solutions:**

1. **Switch to faster provider:**
   ```bash
   # Groq is fastest
   AI_PROVIDER=groq
   GROQ_API_KEY=...
   ```

2. **Use smaller model:**
   ```bash
   # OpenAI
   OPENAI_MODEL=gpt-4o-mini

   # Ollama
   OLLAMA_MODEL=llama3.2  # vs llama3.1
   ```

3. **Check token usage:**
   - Reduce conversation history
   - Clear old messages: `/memory clear`

4. **Disable streaming:**
   ```typescript
   // In code, set streaming: false
   ```

---

### High memory usage

**Solutions:**

1. **Reduce maxSteps:**
   ```typescript
   // src/agents/autonomous-agent.ts
   maxSteps: 5  // Instead of 10
   ```

2. **Clear memory:**
   ```bash
   # In Telegram
   /memory clear
   ```

3. **Use TokenLimiter:**
   ```bash
   # Already enabled in src/processors/index.ts
   ```

---

## Browser/Playwright Issues

### "Browser not found"

**Error:** Playwright MCP fails

**Solutions:**

1. **Install Playwright:**
   ```bash
   npx playwright install
   ```

2. **Install browsers:**
   ```bash
   npx playwright install chromium
   ```

3. **Check version:**
   ```bash
   npx playwright --version
   ```

---

### Browser automation fails

**Solutions:**

1. **Check if headless mode works:**
   ```bash
   # In agent configuration, check headless setting
   ```

2. **Check screenshot:**
   ```bash
   # Try simpler command first
   "Take a screenshot of google.com"
   ```

3. **Check logs:**
   ```bash
   sybil logs | grep -i playwright
   ```

---

## MCP Issues

### MCP server not connecting

**Error:** "MCP server failed to start"

**Solutions:**

1. **Check if npx is available:**
   ```bash
   which npx
   npx --version
   ```

2. **Install MCP packages:**
   ```bash
   npm install -g @playwright/mcp
   npm install -g @upstash/context7-mcp
   ```

3. **Check server status:**
   ```bash
   # Test manually
   npx @playwright/mcp@latest
   ```

---

### Context7 MCP errors

**Error:** "Context7 MCP failed"

**Solutions:**

1. **Check API key:**
   ```bash
   # Currently hardcoded in src/agents/network.ts
   # Should be: ctx7sk-78fe8c3e-9e31-4950-9774-2129910b7e60
   ```

2. **Use local docs instead:**
   - Context7 is optional
   - Agent works without it

---

## Authentication Issues

### OTP not working

**Solutions:**

1. **Generate OTP:**
   ```bash
   sybil otp --generate
   ```

2. **Check authorized users:**
   ```bash
   sybil otp --list
   ```

3. **Reset auth:**
   ```bash
   # Remove auth file
   rm ~/.sybil/settings.json
   ```

---

### User unauthorized

**Symptoms:** "You are not authorized"

**Solutions:**

1. **Check if OTP required:**
   ```bash
   # Check if OTP mode enabled in settings
   cat ~/.sybil/settings.json
   ```

2. **Authorize user:**
   ```bash
   sybil otp
   # Generate code
   # User sends code to bot
   ```

3. **Disable OTP (⚠️ less secure):**
   ```bash
   # Set in settings
   OTP_REQUIRED=false
   ```

---

## Debug Mode

### Enable verbose logging

```bash
# Set log level
LOG_LEVEL=debug npm start

# Or use CLI
sybil doctor --verbose
```

### Check all components

```bash
# Run diagnostics
sybil doctor
```

### View logs

```bash
# Follow logs
sybil logs --follow

# Filter for errors
sybil logs --level error

# Show last 100 lines
sybil logs --lines 100
```

---

## Getting Help

### Still stuck?

1. **Check logs:**
   ```bash
   sybil logs --follow
   ```

2. **Run diagnostics:**
   ```bash
   sybil doctor
   ```

3. **Enable debug mode:**
   ```bash
   LOG_LEVEL=debug npm start
   ```

4. **Check GitHub issues:**
   - Search existing issues
   - Create new issue with logs

5. **Community support:**
   - Telegram: [@BotFather](https://t.me/BotFather)
   - Mastra: [Discord](https://discord.gg/mastra)

---

## Quick Fixes

### Nuclear option (⚠️ resets everything)

```bash
# Stop bot
sybil stop

# Remove all data
rm -rf ~/.sybil
rm -rf .wwebjs_auth
rm -rf .wwebjs_cache
rm mastra.db

# Reinstall
npm install
npm run build

# Reconfigure
sybil init

# Start fresh
sybil start
```

### Common one-liners

```bash
# Quick restart
sybil stop && sybil start

# Clear WhatsApp
rm -rf ~/.sybil/whatsapp-session && sybil whatsapp

# Reset memory
rm mastra.db && npm start

# Rebuild
rm -rf dist && npm run build && npm start
```

---

## Error Code Reference

| Error | Likely Cause | Solution |
|-------|--------------|----------|
| `ECONNREFUSED` | Service not running | Start Ollama/Podman |
| `ENOENT` | File not found | Check paths, reinstall |
| `EACCES` | Permission denied | Check file permissions |
| `429` | Rate limited | Wait or switch provider |
| `401` | Unauthorized | Check API keys |
| `404` | Not found | Check model names |
| `500` | Server error | Check provider status |
