#!/usr/bin/env node

/**
 * AgenticBrowser CLI.
 */

import { Command } from 'commander';
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
import { closeDb } from './cache/store.js';
import { updateConfig } from './core/config.js';

const program = new Command();

program
  .name('agentic-browser')
  .description('Fully autonomous browser for AI agents')
  .version('0.1.0')
  .option('--headless', 'Run in headless mode')
  .option('--verbose', 'Verbose output');

program
  .command('open <url>')
  .description('Open a URL and auto-handle challenges')
  .option('-g, --goal <goal>', 'Goal for this page')
  .action(async (url: string, opts: any) => {
    applyGlobalOpts();
    try {
      const result = await openUrl(url, { goal: opts.goal });
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await cleanup();
    }
  });

program
  .command('observe')
  .description('Observe the current page')
  .option('-l, --level <level>', 'Detail level: compact, standard, detailed', 'compact')
  .action(async (opts: any) => {
    applyGlobalOpts();
    try {
      const result = await observePage({ level: opts.level });
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await cleanup();
    }
  });

program
  .command('read')
  .description('Read content from the current page')
  .option('-s, --scope <scope>', 'Scope: main_content, full_page, article', 'main_content')
  .option('-f, --format <format>', 'Format: markdown, text, html', 'markdown')
  .action(async (opts: any) => {
    applyGlobalOpts();
    try {
      const result = await readContent({ scope: opts.scope, format: opts.format });
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await cleanup();
    }
  });

program
  .command('act <action> <intent>')
  .description('Perform an action (click, type, scroll, select, hover, press)')
  .option('-v, --value <value>', 'Value for type/select actions')
  .action(async (action: string, intent: string, opts: any) => {
    applyGlobalOpts();
    try {
      const result = await actOnPage({
        action: action as any,
        intent,
        value: opts.value,
      });
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await cleanup();
    }
  });

program
  .command('extract <schema>')
  .description('Extract structured data using a JSON schema')
  .action(async (schema: string) => {
    applyGlobalOpts();
    try {
      const parsed = JSON.parse(schema);
      const result = await extractData(parsed);
      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      console.error('Error:', error.message);
    } finally {
      await cleanup();
    }
  });

program
  .command('verify <goal>')
  .description('Verify a condition on the current page')
  .action(async (goal: string) => {
    applyGlobalOpts();
    try {
      const result = await verifyGoal(goal);
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await cleanup();
    }
  });

program
  .command('recover')
  .description('Try to recover access to the current page')
  .option('-g, --goal <goal>', 'Recovery goal')
  .action(async (opts: any) => {
    applyGlobalOpts();
    try {
      const result = await recoverAccess(opts.goal);
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await cleanup();
    }
  });

program
  .command('debug')
  .description('Get diagnostic information about the current page')
  .option('--html', 'Include full HTML')
  .action(async (opts: any) => {
    applyGlobalOpts();
    try {
      const result = await debugPage({ includeHtml: !!opts.html });
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await cleanup();
    }
  });

program
  .command('navigate <action>')
  .description('Navigate: back, forward, reload, or goto <url>')
  .option('-u, --url <url>', 'URL for goto action')
  .action(async (action: string, opts: any) => {
    applyGlobalOpts();
    try {
      const result = await navigate(action as any, opts.url);
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await cleanup();
    }
  });

function applyGlobalOpts() {
  const opts = program.opts();
  updateConfig({
    headless: !!opts.headless,
  });
}

async function cleanup() {
  await closeBrowser();
  closeDb();
}

program.parse();
