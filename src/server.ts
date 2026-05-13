/**
 * MCP Server — exposes AgenticBrowser as MCP tools for AI agents.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { openUrl } from './commands/open.js';
import { observePage } from './commands/observe.js';
import { readContent } from './commands/read.js';
import { actOnPage } from './commands/act.js';
import { extractData } from './commands/extract.js';
import { verifyGoal } from './commands/verify.js';
import { recoverAccess } from './commands/recover.js';
import { debugPage } from './commands/debug.js';
import { navigate } from './commands/navigate.js';
import { closeBrowser } from './core/browser.js';
import { closeDb, cleanExpiredCache } from './cache/store.js';

const server = new McpServer({
  name: 'agentic-browser',
  version: '0.1.0',
});

// === Tool: browser_open ===
server.tool(
  'browser_open',
  'Open a URL in the browser. Automatically handles Cloudflare, CAPTCHAs, and other challenges. Returns page state and metadata.',
  {
    url: z.string().describe('The URL to open'),
    goal: z.string().optional().describe('What you want to accomplish on this page'),
  },
  async ({ url, goal }) => {
    const result = await openUrl(url, { goal });
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// === Tool: browser_observe ===
server.tool(
  'browser_observe',
  'Observe the current page. Returns summary, interactive elements, forms, links, and access state.',
  {
    level: z.enum(['compact', 'standard', 'detailed']).optional().describe('Detail level (default: compact)'),
  },
  async ({ level }) => {
    const result = await observePage({ level: level || 'compact' });
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// === Tool: browser_read ===
server.tool(
  'browser_read',
  'Read and extract clean content from the current page. Returns markdown with tables and links.',
  {
    scope: z.enum(['main_content', 'full_page', 'visible_only', 'article']).optional().describe('Content scope (default: main_content)'),
    format: z.enum(['markdown', 'text', 'html']).optional().describe('Output format (default: markdown)'),
    max_length: z.number().optional().describe('Max content length in characters (default: 50000)'),
  },
  async ({ scope, format, max_length }) => {
    const result = await readContent({
      scope: scope || 'main_content',
      format: format || 'markdown',
      maxLength: max_length || 50000,
    });
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// === Tool: browser_act ===
server.tool(
  'browser_act',
  'Perform an action on the page by natural language intent. Supports click, type, scroll, select, hover, press.',
  {
    action: z.enum(['click', 'type', 'scroll', 'select', 'hover', 'press']).describe('The action to perform'),
    intent: z.string().describe('Natural language description of the target element (e.g., "the login button", "search input")'),
    value: z.string().optional().describe('Value to type/select (for type and select actions)'),
  },
  async ({ action, intent, value }) => {
    const result = await actOnPage({ action, intent, value });
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// === Tool: browser_extract ===
server.tool(
  'browser_extract',
  'Extract structured data from the page using a schema. Provide a JSON schema describing the data shape you want.',
  {
    schema: z.string().describe('JSON schema describing the data to extract (e.g., \'{"products": [{"name": "", "price": ""}]}\')'),
  },
  async ({ schema }) => {
    let parsedSchema: any;
    try {
      parsedSchema = JSON.parse(schema);
    } catch {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: 'Invalid JSON schema' }),
        }],
        isError: true,
      };
    }
    const result = await extractData(parsedSchema);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// === Tool: browser_verify ===
server.tool(
  'browser_verify',
  'Verify a goal or condition on the current page.',
  {
    goal: z.string().describe('The condition to verify (e.g., "user is logged in", "page contains pricing")'),
  },
  async ({ goal }) => {
    const result = await verifyGoal(goal);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// === Tool: browser_recover ===
server.tool(
  'browser_recover',
  'Try to recover access to the current page if it is blocked, broken, or has a challenge. Tries multiple strategies automatically.',
  {
    goal: z.string().optional().describe('What you want to accomplish (e.g., "read the article")'),
  },
  async ({ goal }) => {
    const result = await recoverAccess(goal);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// === Tool: browser_debug ===
server.tool(
  'browser_debug',
  'Get diagnostic information about the current page: console logs, network requests, DOM stats, screenshot.',
  {
    include_console: z.boolean().optional().describe('Include console logs (default: true)'),
    include_network: z.boolean().optional().describe('Include network log (default: true)'),
    include_screenshot: z.boolean().optional().describe('Include screenshot (default: true)'),
    include_html: z.boolean().optional().describe('Include full HTML (default: false)'),
  },
  async ({ include_console, include_network, include_screenshot, include_html }) => {
    const result = await debugPage({
      includeConsole: include_console !== false,
      includeNetwork: include_network !== false,
      includeScreenshot: include_screenshot !== false,
      includeHtml: include_html === true,
    });
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// === Tool: browser_navigate ===
server.tool(
  'browser_navigate',
  'Navigate: go back, forward, reload, or goto a new URL.',
  {
    action: z.enum(['back', 'forward', 'reload', 'goto']).describe('Navigation action'),
    url: z.string().optional().describe('URL for goto action'),
  },
  async ({ action, url }) => {
    const result = await navigate(action, url);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// === Start server ===
async function main() {
  // Cleanup old cache
  cleanExpiredCache();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await closeBrowser();
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await closeBrowser();
    closeDb();
    process.exit(0);
  });
}

main().catch(console.error);
