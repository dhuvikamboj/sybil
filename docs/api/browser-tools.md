# Browser Tools API Reference

Complete API documentation for all browser automation tools.

## Tools Overview

| Tool | Description |
|------|-------------|
| `browser-navigate` | Navigate to a URL |
| `browser-get-content` | Extract page content with Markdown conversion |
| `browser-google-search` | Google search with top results |
| `browser-screenshot` | Capture page screenshot |
| `browser-click` | Click elements on page |
| `browser-type` | Type text into elements |
| `browser-wait-for` | Wait for elements or conditions |
| `browser-scroll-to` | Scroll page or to elements |
| `browser-execute-script` | Execute JavaScript on page |
| `browser-get-links` | Extract all links from page |
| `browser-save-content` | Save page as Markdown file |
| `html-to-markdown` | Convert HTML to Markdown |
| `browser-close-session` | Close browser session |

---

## Tool APIs

### `browser-navigate`

Navigate to a URL in a browser session.

```typescript
await browserAgent.execute("Navigate to example.com", {
  toolName: "browser-navigate",
  args: {
    url: "https://example.com"
  }
})
```

**Parameters:**
- `url` (string, required) - URL to navigate to

**Returns:**
- `success: boolean` - Whether navigation succeeded
- `url: string` - Final URL after redirects
- `title: string` - Page title
- `screenshotUrl: string` - Screenshot of the page (optional)

---

### `browser-get-content`

Extract all content from the current page with automatic HTML to Markdown conversion.

```typescript
const result = await browserAgent.execute("Get page content", {
  toolName: "browser-get-content",
  args: {
    elementSelector: "main content",  // Optional: specific element
    includeImages: true                // Optional: include image text
  }
})
```

**Parameters:**
- `elementSelector` (string, optional) - CSS selector to target specific element
- `includeImages` (boolean, optional) - Include image alt text (default: false)

**Returns:**
- `markdown: string` - Page content in Markdown format
- `html: string` - Raw HTML (optional)
- `title: string` - Page title
- `url: string` - Current URL
- `wordCount: number` - Word count of extracted content

---

### `browser-google-search`

Perform Google search and extract top 10 results.

```typescript
const results = await browserAgent.execute("Search for TypeScript tutorials", {
  toolName: "browser-google-search",
  args: {
    query: "TypeScript tutorials for beginners"
  }
})
```

**Parameters:**
- `query` (string, required) - Search query
- `numResults` (number, optional) - Number of results (default: 10, max: 10)

**Returns:**
- `results: Array<{
  title: string;
  url: string;
  snippet: string;
  position: number;
}>`
- `query: string` - Search query used
- `searchTime: number` - Search time in seconds

---

### `browser-screenshot`

Capture a screenshot of the visible page or specific element.

```typescript
const screenshot = await browserAgent.execute("Take screenshot", {
  toolName: "browser-screenshot",
  args: {
    elementSelector: "#main-content",
    fullPage: false
  }
})
```

**Parameters:**
- `elementSelector` (string, optional) - CSS selector to capture specific element
- `fullPage` (boolean, optional) - Capture full page instead of viewport (default: false)
- `clip` (object, optional) - Specific region to clip `{x, y, width, height}`

**Returns:**
- `screenshot: string` - Base64-encoded PNG image
- `width: number` - Screenshot width
- `height: number` - Screenshot height

---

### `browser-click`

Click on an element matching a selector.

```typescript
await browserAgent.execute("Click the submit button", {
  toolName: "browser-click",
  args: {
    selector: "button[type='submit']",
    waitForNavigation: true
  }
})
```

**Parameters:**
- `selector` (string, required) - CSS selector of element to click
- `waitForNavigation` (boolean, optional) - Wait for page navigation after click (default: true)
- `timeout` (number, optional) - Timeout in milliseconds (default: 5000)

**Returns:**
- `success: boolean` - Whether click succeeded
- `element: string` - Description of clicked element
- `navigated: boolean` - Whether navigation occurred

---

### `browser-type`

Type text into an input field.

```typescript
await browserAgent.execute("Enter email address", {
  toolName: "browser-type",
  args: {
    selector: "input[type='email']",
    text: "user@example.com",
    clearFirst: true
  }
})
```

**Parameters:**
- `selector` (string, required) - CSS selector of input element
- `text` (string, required) - Text to type
- `clearFirst` (boolean, optional) - Clear existing text before typing (default: true)
- `delay` (number, optional) - Delay between keystrokes (ms, default: 0)

**Returns:**
- `success: boolean` - Whether typing succeeded
- `text: string` - Text that was typed

---

### `browser-wait-for`

Wait for an element or condition to appear.

```typescript
await browserAgent.execute("Wait for content to load", {
  toolName: "browser-wait-for",
  args: {
    selector: ".loaded-content",
    timeout: 10000
  }
})
```

**Parameters:**
- `selector` (string, required) - CSS selector to wait for
- `timeout` (number, optional) - Timeout in milliseconds (default: 5000)
- `state` (string, optional) - Wait state: `"attached" | "detached" | "visible" | "hidden"` (default: "visible")

**Returns:**
- `success: boolean` - Whether element appeared
- `element: string` - Description of element found
- `waitTime: number` - Time waited in milliseconds

---

### `browser-scroll-to`

Scroll the page or to a specific element.

```typescript
await browserAgent.execute("Scroll to bottom", {
  toolName: "browser-scroll-to",
  args: {
    position: "bottom"
  }
})
```

**Parameters:**
- `position` (string, optional) - Scroll position: `"top" | "bottom"` (mutually exclusive with selector)
- `selector` (string, optional) - Scroll to element with this selector
- `offset` (number, optional) - Additional offset in pixels (default: 0)

**Returns:**
- `success: boolean` - Whether scroll succeeded
- `scrollPosition: number` - New scroll Y position

---

### `browser-execute-script`

Execute JavaScript on the page and return results.

```typescript
const data = await browserAgent.execute("Extract all prices", {
  toolName: "browser-execute-script",
  args: {
    script: `
      const prices = Array.from(document.querySelectorAll('.price'))
        .map(el => el.textContent)
        .filter(Boolean);
      return prices;
    `
  }
})
```

**Parameters:**
- `script` (string, required) - JavaScript code to execute
- `args` (object, optional) - Arguments to pass to function

**Returns:**
- `result: any` - Return value of script execution
- `success: boolean` - Whether execution succeeded

---

### `browser-get-links`

Extract all links from the current page.

```typescript
const links = await browserAgent.execute("Get all links", {
  toolName: "browser-get-links",
  args: {
    filterExternal: false
  }
})
```

**Parameters:**
- `filterExternal` (boolean, optional) - Only return internal links (same domain)
- `followRedirects` (boolean, optional) - Resolve redirects (default: true)

**Returns:**
- `links: Array<{
  url: string;
  text: string;
  title?: string;
  external: boolean;
}>`
- `count: number` - Total number of links

---

### `browser-save-content`

Save the current page as a Markdown file.

```typescript
await browserAgent.execute("Save this page", {
  toolName: "browser-save-content",
  args: {
    filename: "page-content.md"
  }
})
```

**Parameters:**
- `filename` (string, required) - Name for the saved file
- `path` (string, optional) - Subdirectory within workspace (default: root)
- `includeURL` (boolean, optional) - Include source URL in file (default: true)

**Returns:**
- `success: boolean` - Whether save succeeded
- `path: string` - Full path to saved file
- `size: number` - File size in bytes
- `wordCount: number` - Word count in file

---

### `html-to-markdown`

Convert HTML content to Markdown format.

```typescript
const markdown = await browserAgent.execute("Convert HTML", {
  toolName: "html-to-markdown",
  args: {
    html: "<h1>Hello</h1><p>World</p>",
    options: {
      headingStyle: "atx"
    }
  }
})
```

**Parameters:**
- `html` (string, required) - HTML content to convert
- `options` (object, optional) - Turndown options (see [Turndown docs](https://github.com/mixmark-io/turndown))

**Returns:**
- `markdown: string` - Converted Markdown content
- `stats: object` - Conversion statistics

---

### `browser-close-session`

Close the browser session and clean up resources.

```typescript
await browserAgent.execute("Close browser", {
  toolName: "browser-close-session",
  args: {}
})
```

**Parameters:**
- None required

**Returns:**
- `success: boolean` - Whether session closed successfully

---

## Session Management

### Multiple Concurrent Sessions

```typescript
// Create multiple agent instances with unique session IDs
const agent1 = createBrowserAgent({ sessionId: "session-1" });
const agent2 = createBrowserAgent({ sessionId: "session-2" });

// Both can operate independently
await agent1.execute("Navigate to site A", { url: "..." });
await agent2.execute("Navigate to site B", { url: "..." });
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BROWSER_HEADLESS` | Run browser in headless mode | `true` |
| `BROWSER_TIMEOUT` | Default timeout (ms) | `30000` |

---

## Usage Examples

### Web Scraping

```typescript
async function scrapeArticle(url: string) {
  await browserAgent.execute("Navigate to article", {
    toolName: "browser-navigate",
    args: { url }
  });

  const content = await browserAgent.execute("Get content", {
    toolName: "browser-get-content",
    args: { elementSelector: "article" }
  });

  return content.markdown;
}
```

### Form Automation

```typescript
async function fillForm(formData: Record<string, string>) {
  for (const [selector, value] of Object.entries(formData)) {
    await browserAgent.execute("Type value", {
      toolName: "browser-type",
      args: { selector, text: value }
    });
  }

  await browserAgent.execute("Submit form", {
    toolName: "browser-click",
    args: { selector: "button[type='submit']" }
  });
}
```

### Search and Extract

```typescript
async function searchAndSave(query: string, filename: string) {
  const results = await browserAgent.execute("Search", {
    toolName: "browser-google-search",
    args: { query, numResults: 5 }
  });

  for (const result of results.results) {
    await browserAgent.execute("Navigate to result", {
      toolName: "browser-navigate",
      args: { url: result.url }
    });

    await browserAgent.execute("Save page", {
      toolName: "browser-save-content",
      args: { filename: `${filename}-${result.position}.md` }
    });
  }
}
```

---

## Error Handling

All tools follow this error format:

```typescript
{
  success: false,
  error: {
    message: string,
    code: string,
    details?: any
  }
}
```

Common error codes:
- `TIMEOUT` - Operation timed out
- `ELEMENT_NOT_FOUND` - Selector matched no elements
- `NAVIGATION_FAILED` - Page navigation failed
- `CLICK_FAILED` - Could not click element
- `INVALID_SELECTOR` - CSS selector is invalid
