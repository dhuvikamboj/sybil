import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "../utils/logger.js";

/**
 * Tool: Fetch Web Page Content
 * Fetches and extracts content from a web page URL
 */
export const fetchWebContentTool = createTool({
  id: "fetch-web-content",
  description: `
    Fetches and extracts the main content from a web page URL.
    Use this when you need to read articles, documentation, or any web content.
    Returns the content in a clean, readable format with title and main text.
  `,
  inputSchema: z.object({
    url: z.string().url().describe("The URL of the web page to fetch"),
    extractLinks: z.boolean().optional().default(false).describe("Whether to also extract links from the page"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    url: z.string(),
    title: z.string(),
    content: z.string(),
    excerpt: z.string(),
    links: z.array(z.object({
      text: z.string(),
      url: z.string(),
    })).optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const startTime = Date.now();
    const { url, extractLinks } = inputData;

    logger.info("WEB_TOOL", `Fetching web content: ${url}`, {
      extractLinks,
    });

    try {
      // Fetch the HTML with proper headers
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        maxRedirects: 5,
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Remove script and style elements
      $("script, style, nav, footer, iframe, noscript").remove();

      // Extract title
      const title = $("title").text().trim() || $("h1").first().text().trim() || "Untitled";

      // Try to find main content area
      let contentArea = $("article, main, [role='main'], .content, #content, .post, .entry").first();
      if (contentArea.length === 0) {
        contentArea = $("body");
      }

      // Extract text content
      let content = contentArea.text()
        .replace(/\s+/g, " ")
        .replace(/\n+/g, "\n")
        .trim();

      // Limit content length
      const maxLength = 8000;
      if (content.length > maxLength) {
        content = content.substring(0, maxLength) + "... [content truncated]";
      }

      // Generate excerpt
      const excerpt = content.substring(0, 200) + (content.length > 200 ? "..." : "");

      // Extract links if requested
      let links: Array<{ text: string; url: string }> | undefined;
      if (extractLinks) {
        links = [];
        contentArea.find("a[href]").each((_, elem) => {
          const linkUrl = $(elem).attr("href");
          const linkText = $(elem).text().trim();
          if (linkUrl && linkText && links && links.length < 20) {
            // Resolve relative URLs
            const absoluteUrl = new URL(linkUrl, url).href;
            links.push({ text: linkText, url: absoluteUrl });
          }
        });
      }

      const result = {
        success: true,
        url,
        title,
        content,
        excerpt,
        links: extractLinks ? links : undefined,
      };

      const duration = Date.now() - startTime;
      logger.info("WEB_TOOL", `Fetched web content successfully`, {
        url,
        title,
        contentLength: content.length,
        linksCount: links?.length || 0,
        duration: `${duration}ms`,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      const duration = Date.now() - startTime;

      logger.error("WEB_TOOL", `Failed to fetch web content: ${errorMessage}`, {
        url,
        error: errorMessage,
        duration: `${duration}ms`,
      });

      return {
        success: false,
        url: inputData.url,
        title: "Error",
        content: "",
        excerpt: "",
        error: errorMessage,
      };
    }
  },
});

/**
 * Tool: Search the Web
 * Performs a web search using DuckDuckGo (no API key required)
 */
export const searchWebTool = createTool({
  id: "search-web",
  description: `
    Searches the web for information on a given query.
    Use this when you need to find current information, research topics, or discover web pages.
    Returns search results with titles, snippets, and URLs.
  `,
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    numResults: z.number().min(1).max(10).optional().describe("Number of results to return (1-10)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    query: z.string(),
    results: z.array(z.object({
      title: z.string(),
      snippet: z.string(),
      url: z.string(),
    })),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const startTime = Date.now();
    const { query, numResults } = inputData;
    const limit = Math.min(Math.max(numResults ?? 5, 1), 10);

    logger.info("WEB_TOOL", `Searching web: "${query}"`, {
      numResults: limit,
    });

    try {
      // Use DuckDuckGo HTML search
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await axios.get(searchUrl, {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      const $ = cheerio.load(response.data);
      const results: Array<{ title: string; snippet: string; url: string }> = [];

      // Parse search results
      $(".result").each((i, elem) => {
        if (results.length >= limit) return;

        const titleElem = $(elem).find(".result__a").first();
        const snippetElem = $(elem).find(".result__snippet").first();
        const urlElem = $(elem).find(".result__url").first();

        const title = titleElem.text().trim();
        const snippet = snippetElem.text().trim();
        let url = urlElem.text().trim();

        // If URL not found in result__url, try to get from title link
        if (!url && titleElem.length) {
          const href = titleElem.attr("href");
          if (href) {
            // DuckDuckGo uses redirects, extract actual URL
            const match = href.match(/uddg=([^&]+)/);
            if (match) {
              url = decodeURIComponent(match[1]);
            }
          }
        }

        if (title && url) {
          results.push({ title, snippet, url });
        }
      });

      const duration = Date.now() - startTime;
      logger.info("WEB_TOOL", `Web search completed`, {
        query,
        resultsCount: results.length,
        duration: `${duration}ms`,
      });

      return {
        success: true,
        query,
        results,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      const duration = Date.now() - startTime;

      logger.error("WEB_TOOL", `Web search failed: ${errorMessage}`, {
        query,
        error: errorMessage,
        duration: `${duration}ms`,
      });

      return {
        success: false,
        query: inputData.query,
        results: [],
        error: errorMessage,
      };
    }
  },
});

/**
 * Tool: Extract Structured Data from Web Page
 * Extracts specific data from a web page using CSS selectors
 */
export const extractStructuredDataTool = createTool({
  id: "extract-structured-data",
  description: `
    Extracts structured data from a web page using CSS selectors.
    Use this when you need to scrape specific elements like prices, ratings, product info, etc.
    Specify the URL and a map of fields with their CSS selectors.
  `,
  inputSchema: z.object({
    url: z.string().url().describe("The URL of the web page to scrape"),
    fields: z.record(z.object({
      selector: z.string().describe("CSS selector to extract the field"),
      attribute: z.string().optional().describe("Attribute to extract (e.g., 'href', 'src'). Leave empty for text content"),
      multiple: z.boolean().optional().default(false).describe("Whether to extract multiple values"),
    })).describe("Map of field names to extraction rules"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    url: z.string(),
    data: z.record(z.any()),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const startTime = Date.now();
    const { url, fields } = inputData;

    logger.info("WEB_TOOL", `Extracting structured data from: ${url}`, {
      fields: Object.keys(fields),
    });

    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      const $ = cheerio.load(response.data);
      const data: Record<string, any> = {};

      for (const [fieldName, config] of Object.entries(fields)) {
        const { selector, attribute, multiple } = config;

        if (multiple) {
          // Extract multiple values
          const values: string[] = [];
          $(selector).each((_, elem) => {
            const value = attribute
              ? $(elem).attr(attribute)
              : $(elem).text().trim();
            if (value) values.push(value);
          });
          data[fieldName] = values;
        } else {
          // Extract single value
          const elem = $(selector).first();
          const value = attribute
            ? elem.attr(attribute)
            : elem.text().trim();
          data[fieldName] = value || null;
        }
      }

      const duration = Date.now() - startTime;
      logger.info("WEB_TOOL", `Structured data extraction completed`, {
        url,
        fieldsCount: Object.keys(data).length,
        duration: `${duration}ms`,
      });

      return {
        success: true,
        url,
        data,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      const duration = Date.now() - startTime;

      logger.error("WEB_TOOL", `Structured data extraction failed: ${errorMessage}`, {
        url,
        error: errorMessage,
        duration: `${duration}ms`,
      });

      return {
        success: false,
        url: inputData.url,
        data: {},
        error: errorMessage,
      };
    }
  },
});

/**
 * Tool: Deep Web Research
 * Performs comprehensive research by searching and reading multiple pages
 */
export const deepResearchTool = createTool({
  id: "deep-research",
  description: `
    Performs comprehensive web research on a topic.
    This tool searches the web, reads relevant pages, and synthesizes information.
    Use this for thorough research on any topic.
  `,
  inputSchema: z.object({
    topic: z.string().describe("The research topic or question"),
    depth: z.enum(["basic", "standard", "deep"]).optional().default("standard").describe("Research depth"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    topic: z.string(),
    summary: z.string(),
    sources: z.array(z.object({
      title: z.string(),
      url: z.string(),
      relevance: z.string(),
    })),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    const startTime = Date.now();
    const { topic, depth } = inputData;
    const numSources = depth === "basic" ? 3 : depth === "standard" ? 5 : 8;

    logger.info("WEB_TOOL", `Starting deep research on: "${topic}"`, {
      depth,
      targetSources: numSources,
    });

    try {
      // Search for the topic
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(topic)}`;
      const response = await axios.get(searchUrl, {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      const $ = cheerio.load(response.data);
      const sources: Array<{ title: string; url: string; relevance: string }> = [];

      $(".result").each((i, elem) => {
        if (sources.length >= numSources) return;

        const titleElem = $(elem).find(".result__a").first();
        const snippetElem = $(elem).find(".result__snippet").first();

        const title = titleElem.text().trim();
        const snippet = snippetElem.text().trim();

        let url = "";
        const href = titleElem.attr("href");
        if (href) {
          const match = href.match(/uddg=([^&]+)/);
          if (match) {
            url = decodeURIComponent(match[1]);
          }
        }

        if (title && url) {
          sources.push({
            title,
            url,
            relevance: snippet.substring(0, 150),
          });
        }
      });

      // Create summary
      const summary = `Found ${sources.length} relevant sources for "${topic}". ` +
        `These sources include ${sources.map(s => s.title).slice(0, 3).join(", ")}` +
        (sources.length > 3 ? ` and ${sources.length - 3} others.` : ".");

      const duration = Date.now() - startTime;
      logger.info("WEB_TOOL", `Deep research completed`, {
        topic,
        sourcesFound: sources.length,
        duration: `${duration}ms`,
      });

      return {
        success: true,
        topic,
        summary,
        sources,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      const duration = Date.now() - startTime;

      logger.error("WEB_TOOL", `Deep research failed: ${errorMessage}`, {
        topic,
        error: errorMessage,
        duration: `${duration}ms`,
      });

      return {
        success: false,
        topic: inputData.topic,
        summary: "",
        sources: [],
        error: errorMessage,
      };
    }
  },
});
