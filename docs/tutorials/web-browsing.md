# Web Browsing with Sybil

Complete guide to controlling web browsers with Sybil agents.

## Overview

Sybil agents can now control real browsers to:
- Navigate to websites
- Extract page content (text, HTML, Markdown)
- Perform Google searches
- Fill forms and click buttons
- Take screenshots
- Download content as Markdown files
- Execute JavaScript
- Scroll pages

## Browser Tools Available

| Tool | Description |
|------|-------------|
| `browser-navigate` |Navigate to URLs|
| `browser-get-content` |Extract page content as Markdown|
| `browser-save-content` |Save page as Markdown file|
| `browser-google-search` |Google search with results|
| `browser-screenshot` |Capture page screenshots|
| `browser-click` |Click elements|
| `browser-type` |Fill input fields|
| `browser-wait-for` |Wait for elements to appear|
| `browser-scroll-to` |Scroll pages|
| `browser-execute-script` |Run JavaScript|
| `html-to-markdown` |Convert HTML to Markdown|
| `browser-close-session` |Close browser sessions|

## Example 1: Research and Save Articles

**Request:**
```
User: Research the latest AI news on arXiv and save to a file
```

**What the agent does:**

1. Navigate to arXiv.org
2. Find AI/ML papers section
3. Navigate to top results
4. Extract content as Markdown
5. Save as `workspace/arxiv-ai-news.md`

**Result:**
```json
{
  "success": true,
  "filepath": "/path/to/workspace/arxiv-ai-news.md",
  "wordCount": 4521
}
```

## Example 2: Google Search & Summarize

**Request:**
```
User: Search "Node.js performance tips 2026" and summarize
```

**What the agent does:**
```typescript
// 1. Google search
await browserGoogleSearch({
  query: "Node.js performance tips 2026"
});

// 2. Navigate to top results
await browserNavigate({ url: "https://some-blog.com/nodejs-performance-tips" });

// 3. Extract content with Markdown
const { markdown } = await browserGetContent({
  url,
  includeMarkdown: true,
});

// 4. Save
await browserSaveContent({
  filename: "nodejs-performance-tips"
});
```

## Example 3: Form Automation

**Request:**
```
User: Fill out the contact form on the website and submit it
```

**Agent code:**
```typescript
await browserNavigate({ url: "https://example.com/contact" });
await browserType({ 
  selector: "#name", 
  text: "John Doe" 
});
await browserType({ 
  selector: "#email", 
  text: "john@example.com" 
});
await browserClick({ selector: "button[type='submit']" });
await browserScreenshot({});
await browserCloseSession({ });
```

## Example 4: Screenshot

**Request:**
```
User: Screenshot the homepage
```

**Returns:**
```json
{
  "success": true,
  "screenshot": "base64-encoded-image-data...",
  "filepath": "workspace/screenshot.png"
}
```

## Example 5: Content Extraction Options

### Extract Just Text
```typescript
const { content } = await browserGetContent({
  url: "https://example.com",
  includeMarkdown: false,
  includeHTML: false
});
```

### Extract HTML and Markdown
```typescript
const { content, html, markdown } = await browserGetContent({
  url: "https://example.com",
  includeMarkdown: true,
  includeHTML: true
});
```

### Extract Specific Section
```typescript
const { content } = await browserGetContent({
  url: "https://example.com/article",
  selector: "article",
  includeMarkdown: true
});
```

## Managing Browser Sessions

Multiple sessions allow concurrent operations:

```typescript
// Session 1 - Research
await browserNavigation({ url: "https://arxiv.org", sessionId: "research" });
await browserSaveContent({ filename: "research-paper-1", sessionId: "research" });

// Session 2 - Documentation
await browserNavigation({ url: "https://example.com/docs", sessionId: "docs" });
await browserSaveContent({ filename: "docs-summary", sessionId: "docs" });

// Close one session
await browserCloseSession({ sessionId: "research" });
```

## HTML to Markdown Conversion

### Standalone Conversion

```typescript
const { markdown } = await htmlToMarkdown({
  html: "<h1>Title</h1><p>Content</p>"
});
// Returns: "# Title\n\nContent"
```

### Conversion Options

Turndown features are used:
- ATX headings (`#`, `##`)
- Fenced code blocks (````)
- Horizontal rules (`---`)
- Strikethrough (`~~text~~`)
- Bold (`**text**`)
- Italic (`_text_`)
- Links (`[text](url)`)

## Usage Patterns

### Pattern 1: Research & Save
```
User: Browse to techcrunch.com/latest and save the article about AI as markdown
→ [Navigates] → [Extracts markdown] → [Saves as techcrunch-ai.md]
```

### Pattern 2: Form Operations
```
User: Fill out the registration form and click submit
→ [Navigates] → [Fill inputs] → [Clicks button] → [Screenshots result]
```

### Pattern 3: Data Collection
```
User: Go to these 5 URLs and save the articles as markdown
→ [Loops through URLs] → [Extracts each] → [Saves with unique names]
```

### Pattern 4: Competitive Analysis
```
User: Compare pricing pages from 3 websites
→ [Navigate to each] → [Extract pricing tables] → [Save comparison.md]
```

## Best Practices

1. **Resource Management:**
   ```javascript
   await browserCloseSession({ sessionId }); // Always cleanup
   ```

2. **Wait for Elements:**
   ```javascript
   await browserWaitFor({ selector: "#load-more", timeout: 10000 });
   ```

3. **Error Handling:**
   ```javascript
   const { success } = await browserNavigate({ url });
   if (!success) {
     await browserCloseSession({ sessionId });
   }
   ```

4. **Session Isolation:**
   - Use different session IDs for independent tasks
   - Prevents interference between concurrent operations

## Browser Configuration

### Headless Mode (Default)

```bash
# Runs invisible browser
# Set in environment
# OR in code
```

### Visible Mode (Debugging)

```bash
# Run: VISUAL_BROWSER=true npm start
```

### Browser Options

Configured in `src/tools/browser-tools.ts`:
- Headless/Visible mode
- Timeout settings
- Cookie persistence (future)
- User agent customization

## Troubleshooting

### "Browser not supported"
- Installed: `npx playwright install chromium`
- Verified: `npx playwright --version`

### "Navigation timeout"
- Increase timeouts: `await browserWaitFor({ timeout: 30000 })`
- Check page loads: `browser.get-content` for errors

### "Element not found"
- Verify selector is correct
- Use `browserWaitFor` before interaction
- Check if element is in iframe (not yet supported)

### "Screenshot failed"
- Check disk space in workspace
- Ensure Chromium has permissions for screenshots

## Advanced Usage

### Execute JavaScript for Dynamic Content

```typescript
// Extract data from dynamic page
const { result } = await browserExecuteScript({
  script: `
    const data = window.__INITIAL_STATE__;
    return JSON.stringify(data);
  `
});
```

### Scroll to Load More Content

```typescript
await browserScrollTo({ pixels: 500 });
await browserWaitFor({ selector: "#load-more", state: "visible" });
await browserClick({ selector: "#load-more" });
```

### Extract All Links

```typescript
const { links } = await browserGetLinks({
  url: "https://example.com"
});
// Returns array of { text, href }
```

## Integration with Other Features

Browser tools work seamlessly with:
- ✅ **Agent Networks** - Researcher agent can browse
- ✅ **Skills** - Skills can browse as part of execution
- ✅ **Dynamic Tools** - Create browsing tools dynamically
- ✅ **Memory** - Save browsing results to memory
- ✅ **Workspace** - Save extracted content to workspace

---

**Now your agents can browse the web, extract content, and save structured Markdown! 🌐**
