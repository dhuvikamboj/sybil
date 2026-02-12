import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { chromium, Browser, Page, BrowserContext } from "playwright";
import TurndownService from "turndown";
import { writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Browser session manager for controlling browser instances
 */
class BrowserManager {
  private static instances: Map<string, { browser: Browser; pages: Map<string, Page> }> = new Map();
  
  /**
   * Get or create a browser instance
   */
  static async getBrowser(sessionId: string = "default"): Promise<Browser> {
    if (!this.instances.has(sessionId)) {
      const browser = await chromium.launch({
        headless: process.env.BROWSER_HEADLESS !== "false",
      });
      this.instances.set(sessionId, {
        browser,
        pages: new Map(),
      });
    }
    return this.instances.get(sessionId)!.browser;
  }
  
  /**
   * Get a page for a URL
   */
  static async getPage(sessionId: string = "default", url?: string): Promise<Page> {
    const browser = await this.getBrowser(sessionId);
    const session = this.instances.get(sessionId)!;
    
    if (url) {
      // Try to find existing page with this URL
      for (const [pageUrl, page] of session.pages.entries()) {
        if (pageUrl === url && !page.isClosed()) {
          return page;
        }
      }
    }
    
    // Create new page
    const page = await browser.newPage();
    if (url) {
      await page.goto(url, { waitUntil: "networkidle" });
      session.pages.set(url, page);
    }
    
    return page;
  }
  
  /**
   * Close a page
   */
  static async closePage(sessionId: string, url: string): Promise<void> {
    const session = this.instances.get(sessionId);
    if (session) {
      const page = session.pages.get(url);
      if (page) {
        await page.close();
        session.pages.delete(url);
      }
    }
  }
  
  /**
   * Close all pages and browser for a session
   */
  static async closeSession(sessionId: string = "default"): Promise<void> {
    const session = this.instances.get(sessionId);
    if (session) {
      for (const page of session.pages.values()) {
        await page.close();
      }
      await session.browser.close();
      this.instances.delete(sessionId);
    }
  }
  
  /**
   * Close all browser instances
   */
  static async closeAll(): Promise<void> {
    const sessionIds = Array.from(this.instances.keys());
    await Promise.all(sessionIds.map(id => this.closeSession(id)));
  }
}

/**
 * Take a screenshot of a page
 */
export const browserScreenshot = createTool({
  id: "browser-screenshot",
  description: "Take a screenshot of a web page. Useful for capturing visual state of a page.",
  inputSchema: z.object({
    url: z.string().optional().describe("URL of the page to capture (if not provided, captures current page)"),
    sessionId: z.string().default("default").describe("Browser session ID"),
    filepath: z.string().optional().describe("Optional filepath to save screenshot"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    screenshot: z.string().optional().describe("Base64 encoded screenshot"),
    filepath: z.string().optional().describe("Filepath if saved"),
  }),
  execute: async ({ url, sessionId, filepath }) => {
    try {
      const page = await BrowserManager.getPage(sessionId, url);
      const screenshot = await page.screenshot({ 
        path: filepath,
        fullPage: true, 
      }) as Buffer;
      
      return {
        success: true,
        screenshot: screenshot.toString("base64"),
        filepath,
      };
    } catch (error) {
      return {
        success: false,
        screenshot: undefined,
      };
    }
  },
});

/**
 * Navigate to a URL
 */
export const browserNavigate = createTool({
  id: "browser-navigate",
  description: "Navigate to a specific URL in the browser. Returns page information after navigation.",
  inputSchema: z.object({
    url: z.string().describe("Full URL to navigate to"),
    sessionId: z.string().default("default").describe("Browser session ID"),
    waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).default("networkidle").describe("Navigation wait condition"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    url: z.string(),
    title: z.string(),
    loadTime: z.number(),
  }),
  execute: async ({ url, sessionId, waitUntil }) => {
    try {
      const start = Date.now();
      const page = await BrowserManager.getPage(sessionId, url);
      await page.waitForLoadState(waitUntil);
      const loadTime = Date.now() - start;
      
      const title = await page.title();
      
      return {
        success: true,
        url: page.url(),
        title,
        loadTime,
      };
    } catch (error) {
      return {
        success: false,
        url,
        title: "",
        loadTime: 0,
      };
    }
  },
});

/**
 * Extract page content
 */
export const browserGetContent = createTool({
  id: "browser-get-content",
  description: "Extract content from a web page. Returns text, HTML, and Markdown versions. Useful for reading and saving page content.",
  inputSchema: z.object({
    url: z.string().optional().describe("URL to extract content from (optional if already on page)"),
    sessionId: z.string().default("default").describe("Browser session ID"),
    selector: z.string().optional().describe("CSS selector to extract content from specific element"),
    includeHTML: z.boolean().default(false).describe("Include HTML in output"),
    includeMarkdown: z.boolean().default(true).describe("Include Markdown in output"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    title: z.string(),
    url: z.string(),
    content: z.string(),
    html: z.string().optional(),
    markdown: z.string().optional(),
  }),
  execute: async ({ url, sessionId, selector, includeHTML, includeMarkdown }) => {
    try {
      const page = await BrowserManager.getPage(sessionId, url);
      
      let content = "";
      let html = "";
      let markdown = "";
      const turndownService = new TurndownService();
      
      if (selector) {
        const element = page.locator(selector);
        content = await element.textContent() || "";
        if (includeHTML) {
          html = await element.innerHTML() || "";
        }
        if (includeMarkdown && html) {
          markdown = turndownService.turndown(html);
        }
      } else {
        const body = page.locator("body");
        content = await body.textContent() || "";
        if (includeHTML) {
          html = await page.content();
        }
        if (includeMarkdown && html) {
          markdown = turndownService.turndown(html);
        }
      }
      
      return {
        success: true,
        title: await page.title(),
        url: page.url(),
        content,
        html: includeHTML ? html : undefined,
        markdown: includeMarkdown ? markdown : undefined,
      };
    } catch (error) {
      return {
        success: false,
        title: "",
        url: url || "",
        content: "",
        html: undefined,
        markdown: undefined,
      };
    }
  },
});

/**
 * Execute JavaScript on the page
 */
export const browserExecuteScript = createTool({
  id: "browser-execute-script",
  description: "Execute JavaScript code on the current page. Useful for interacting with JavaScript-based websites, extracting data, or triggering events.",
  inputSchema: z.object({
    script: z.string().describe("JavaScript code to execute"),
    sessionId: z.string().default("default").describe("Browser session ID"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.any().describe("Result of JavaScript execution"),
  }),
  execute: async ({ script, sessionId }) => {
    try {
      const page = await BrowserManager.getPage(sessionId);
      const result = await page.evaluate(script);
      
      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        result: String(error),
      };
    }
  },
});

/**
 * Click on an element
 */
export const browserClick = createTool({
  id: "browser-click",
  description: "Click on an element on the page using a CSS selector. Useful for interacting with buttons, links, and other clickable elements.",
  inputSchema: z.object({
    selector: z.string().describe("CSS selector of element to click"),
    sessionId: z.string().default("default").describe("Browser session ID"),
    url: z.string().optional().describe("Navigate to URL before clicking (optional)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    selector: z.string(),
  }),
  execute: async ({ selector, sessionId, url }) => {
    try {
      const page = await BrowserManager.getPage(sessionId, url);
      await page.click(selector);
      
      return {
        success: true,
        selector,
      };
    } catch (error) {
      return {
        success: false,
        selector,
      };
    }
  },
});

/**
 * Type text into an input field
 */
export const browserType = createTool({
  id: "browser-type",
  description: "Type text into an input field using a CSS selector. Useful for filling forms, search boxes, and other text inputs.",
  inputSchema: z.object({
    selector: z.string().describe("CSS selector of input field"),
    text: z.string().describe("Text to type"),
    sessionId: z.string().default("default").describe("Browser session ID"),
    clear: z.boolean().default(true).describe("Clear field before typing"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    selector: z.string(),
    typed: z.boolean(),
  }),
  execute: async ({ selector, text, sessionId, clear }) => {
    try {
      const page = await BrowserManager.getPage(sessionId);
      
      if (clear) {
        await page.fill(selector, "");
      }
      
      await page.fill(selector, text);
      
      return {
        success: true,
        selector,
        typed: true,
      };
    } catch (error) {
      return {
        success: false,
        selector,
        typed: false,
      };
    }
  },
});

/**
 * Wait for an element
 */
export const browserWaitFor = createTool({
  id: "browser-wait-for",
  description: "Wait for an element to appear on the page. Useful when waiting for page load, dynamic content, or async operations.",
  inputSchema: z.object({
    selector: z.string().describe("CSS selector to wait for"),
    sessionId: z.string().default("default").describe("Browser session ID"),
    timeout: z.number().default(30000).describe("Timeout in milliseconds"),
    state: z.enum(["attached", "detached", "visible", "hidden"]).default("visible").describe("Element state to wait for"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    selector: z.string(),
    found: z.boolean(),
  }),
  execute: async ({ selector, sessionId, timeout, state }) => {
    try {
      const page = await BrowserManager.getPage(sessionId);
      
      try {
        await page.waitForSelector(selector, {
          timeout,
          state,
        });
        
        return {
          success: true,
          selector,
          found: true,
        };
      } catch {
        return {
          success: true,
          selector,
          found: false,
        };
      }
    } catch (error) {
      return {
        success: false,
        selector,
        found: false,
      };
    }
  },
});

/**
 * Extract all links from a page
 */
export const browserGetLinks = createTool({
  id: "browser-get-links",
  description: "Extract all links (anchors) from a page. Returns href and text for each link.",
  inputSchema: z.object({
    url: z.string().optional().describe("URL to extract links from"),
    sessionId: z.string().default("default").describe("Browser session ID"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    title: z.string(),
    url: z.string(),
    links: z.array(z.object({
      text: z.string(),
      href: z.string(),
    })),
  }),
  execute: async ({ url, sessionId }) => {
    try {
      const page = await BrowserManager.getPage(sessionId, url);
      
      const links = await page.evaluate(() => {
        const anchorTags = Array.from(document.querySelectorAll("a[href]"));
        return anchorTags.map(link => ({
          text: link.textContent?.trim() || "",
          href: (link as HTMLAnchorElement).href,
        }));
      });
      
      return {
        success: true,
        title: await page.title(),
        url: page.url(),
        links,
      };
    } catch (error) {
      return {
        success: false,
        title: "",
        url: url || "",
        links: [],
      };
    }
  },
});

/**
 * Search Google
 */
export const browserGoogleSearch = createTool({
  id: "browser-google-search",
  description: "Perform a Google search and return top results. Useful for finding information programmatically.",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    sessionId: z.string().default("default").describe("Browser session ID"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    query: z.string(),
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    })),
  }),
  execute: async ({ query, sessionId }) => {
    try {
      const page = await BrowserManager.getPage(sessionId, `https://www.google.com/search?q=${encodeURIComponent(query)}`);
      
      const results = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(".g")).slice(0, 10).map(result => {
          const titleEl = result.querySelector("h3");
          const linkEl = result.querySelector("a");
          const snippetEl = result.querySelector(".VwiC3b");
          
          return {
            title: titleEl?.textContent?.trim() || "",
            url: linkEl?.getAttribute("href") || "",
            snippet: snippetEl?.textContent?.trim() || "",
          };
        });
      });
      
      return {
        success: true,
        query,
        results: results.filter(r => r.url),
      };
    } catch (error) {
      return {
        success: false,
        query,
        results: [],
      };
    }
  },
});

/**
 * Scroll to element
 */
export const browserScrollTo = createTool({
  id: "browser-scroll-to",
  description: "Scroll the page to a specific element or position. Useful for bringing elements into view.",
  inputSchema: z.object({
    selector: z.string().optional().describe("CSS selector of element to scroll to"),
    sessionId: z.string().default("default").describe("Browser session ID"),
    position: z.enum(["top", "center", "bottom"]).default("top").describe("Scroll position to selector"),
    pixels: z.number().optional().describe("Scroll specific number of pixels"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    scrolled: z.boolean(),
  }),
  execute: async ({ selector, sessionId, position, pixels }) => {
    try {
      const page = await BrowserManager.getPage(sessionId);
      
      if (selector) {
        await page.locator(selector).scrollIntoViewIfNeeded({ timeout: 5000 });
      } else if (pixels) {
        await page.evaluate((p) => window.scrollBy(0, p), pixels);
      } else {
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      
      return {
        success: true,
        scrolled: true,
      };
    } catch (error) {
      return {
        success: false,
        scrolled: false,
      };
    }
  },
});

/**
 * Convert HTML to Markdown
 */
export const htmlToMarkdown = createTool({
  id: "html-to-markdown",
  description: "Convert HTML content to Markdown format. Useful for cleaning up web content for easier reading and storage.",
  inputSchema: z.object({
    html: z.string().describe("HTML content to convert"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    markdown: z.string(),
    wordCount: z.number(),
  }),
  execute: async ({ html }) => {
    try {
      const turndownService = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
      });
      
      const markdown = turndownService.turndown(html);
      
      return {
        success: true,
        markdown,
        wordCount: markdown.split(/\s+/).length,
      };
    } catch (error) {
      return {
        success: false,
        markdown: "",
        wordCount: 0,
      };
    }
  },
});

/**
 * Save page content to file
 */
export const browserSaveContent = createTool({
  id: "browser-save-content",
  description: "Extract and save page content as Markdown file to the workspace. Useful for archiving web pages or research notes.",
  inputSchema: z.object({
    url: z.string().optional().describe("URL to save content from"),
    sessionId: z.string().default("default").describe("Browser session ID"),
    filename: z.string().describe("Filename to save to (without extension, .md will be added)"),
    selector: z.string().optional().describe("CSS selector to extract content from specific element"),
    overwrite: z.boolean().default(false).describe("Overwrite existing file"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filepath: z.string(),
    wordCount: z.number(),
  }),
  execute: async ({ url, sessionId, filename, selector, overwrite }) => {
    try {
      const page = await BrowserManager.getPage(sessionId, url);
      
      const turndownService = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
      });
      
      let html = "";
      let title = "";
      
      if (selector) {
        html = await page.locator(selector).innerHTML() || "";
      } else {
        html = await page.content();
        title = await page.title();
      }
      
      const markdown = turndownService.turndown(html);
      
      // Add title header
      const content = title ? `# ${title}\n\n${markdown}` : markdown;
      
      // Save to workspace
      const filepath = join(process.cwd(), "workspace", `${filename}.md`);
      
      // Check if file exists
      if (!overwrite && existsSync(filepath)) {
        return {
          success: false,
          filepath,
          wordCount: 0,
        };
      }
      
      await writeFile(filepath, content, "utf-8");
      
      return {
        success: true,
        filepath,
        wordCount: content.split(/\s+/).length,
      };
    } catch (error) {
      return {
        success: false,
        filepath: "",
        wordCount: 0,
      };
    }
  },
});

/**
 * Close browser session
      const content = title ? `# ${title}\n\n${markdown}` : markdown;
      
      // Save to workspace
      const filepath = join(process.cwd(), "workspace", `${filename}.md`);
      
      // Check if file exists
      if (!overwrite && existsSync(filepath)) {
        return {
          success: false,
          filepath,
          wordCount: 0,
        };
      }
      
      await writeFile(filepath, content, "utf-8");
      
      return {
        success: true,
        filepath,
        wordCount: content.split(/\s+/).length,
      };
    } catch (error) {
      return {
        success: false,
        filepath: "",
        wordCount: 0,
      };
    }
  },
});
      
      let html = "";
      let title = "";
      
      if (selector) {
        html = await page.locator(selector).innerHTML() || "";
      } else {
        html = await page.content();
        title = await page.title();
      }
      
      const markdown = turndownService.turndown(html);
      
      // Add title header
      const content = title ? `# ${title}\n\n${markdown}` : markdown;
      
      // Save to workspace
      const { writeFile } = await import("fs/promises");
      const { join } = await import("path");
      
      const filepath = join(process.cwd(), "workspace", `${filename}.md`);
      
      // Check if file exists
      const { existsSync } = await import("fs");
      if (!overwrite && existsSync(filepath)) {
        return {
          success: false,
          filepath,
          wordCount: 0,
        };
      }
      
      await writeFile(filepath, content, "utf-8");
      
      return {
        success: true,
        filepath,
        wordCount: content.split(/\s+/).length,
      };
    } catch (error) {
      return {
        success: false,
        filepath: "",
        wordCount: 0,
      };
    }
  },
});

/**
 * Close browser session
 */
export const browserCloseSession = createTool({
  id: "browser-close-session",
  description: "Close a browser session and all its pages. Useful for cleaning up resources.",
  inputSchema: z.object({
    sessionId: z.string().default("default").describe("Browser session ID to close"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    sessionId: z.string(),
  }),
  execute: async ({ sessionId }) => {
    try {
      await BrowserManager.closeSession(sessionId);
      
      return {
        success: true,
        sessionId,
      };
    } catch (error) {
      return {
        success: false,
        sessionId,
      };
    }
  },
});

// Close all browsers on process exit
process.on("exit", () => {
  BrowserManager.closeAll().catch(() => {});
});

process.on("SIGINT", () => {
  BrowserManager.closeAll().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  BrowserManager.closeAll().then(() => process.exit(0));
});

export const browserTools = {
  browserScreenshot,
  browserNavigate,
  browserGetContent,
  browserExecuteScript,
  browserClick,
  browserType,
  browserWaitFor,
  browserGetLinks,
  browserGoogleSearch,
  browserScrollTo,
  htmlToMarkdown,
  browserSaveContent,
  browserCloseSession,
};

export default browserTools;
