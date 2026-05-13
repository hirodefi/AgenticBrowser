/**
 * Smart Reading Engine.
 * Multi-source content extraction with confidence scoring.
 */

import { type Page } from 'playwright';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { type ReadResult, type TableData } from '../state-machine/types.js';
import { getCachedContent, setCachedContent } from '../cache/store.js';

export interface ReadingOptions {
  scope: 'main_content' | 'full_page' | 'visible_only' | 'article';
  format: 'markdown' | 'text' | 'html';
  includeTables: boolean;
  includeLinks: boolean;
  maxLength: number;
}

const DEFAULT_OPTIONS: ReadingOptions = {
  scope: 'main_content',
  format: 'markdown',
  includeTables: true,
  includeLinks: true,
  maxLength: 50000,
};

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

turndown.remove(['script', 'style', 'nav', 'footer', 'header', 'iframe']);

/**
 * Read page content using the best available method.
 */
export async function readPage(page: Page, options: Partial<ReadingOptions> = {}): Promise<ReadResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const url = page.url();

  // Check cache first
  const cached = getCachedContent(url);
  if (cached) {
    return {
      title: cached.title,
      content: cached.content,
      format: opts.format,
      confidence: cached.confidence,
      source: cached.source,
      wordCount: cached.content.split(/\s+/).length,
      tables: [],
      links: [],
    };
  }

  // Try multiple sources and pick the best
  const sources = await Promise.all([
    extractFromReadability(page),
    extractFromMainContent(page),
    extractFromStructuredData(page),
    extractFromBody(page),
  ]);

  // Score each source
  const scored = sources
    .filter(s => s.content.length > 50)
    .map(s => ({ ...s, score: scoreContent(s) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0] || sources[sources.length - 1];

  // Extract tables if requested
  let tables: TableData[] = [];
  if (opts.includeTables) {
    tables = await extractTables(page);
  }

  // Extract links if requested
  let links: { text: string; href: string }[] = [];
  if (opts.includeLinks) {
    links = await extractLinks(page);
  }

  // Format output
  let content = best.content;
  if (opts.format === 'markdown' && best.source !== 'readability') {
    content = turndown.turndown(content);
  } else if (opts.format === 'text') {
    content = content.replace(/<[^>]*>/g, '').trim();
  }

  // Truncate if needed
  if (content.length > opts.maxLength) {
    content = content.substring(0, opts.maxLength) + '\n\n[Content truncated...]';
  }

  const result: ReadResult = {
    title: best.title,
    content,
    format: opts.format,
    confidence: best.score,
    source: best.source,
    wordCount: content.split(/\s+/).length,
    tables,
    links,
  };

  // Cache successful reads
  if (best.score > 0.3 && content.length > 100) {
    setCachedContent(url, content, best.title, best.source, best.score);
  }

  return result;
}

interface ExtractionResult {
  title: string;
  content: string;
  source: string;
  textLength: number;
  hasStructure: boolean;
}

/**
 * Method 1: Mozilla Readability — best for articles
 */
async function extractFromReadability(page: Page): Promise<ExtractionResult> {
  try {
    const html = await page.evaluate(() => {
      // Clone the document to avoid modifying the page
      const clone = document.cloneNode(true) as Document;
      return clone.documentElement?.outerHTML || '';
    });

    const dom = new JSDOM(html, { url: page.url() });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent || article.textContent.length < 50) {
      return { title: '', content: '', source: 'readability', textLength: 0, hasStructure: false };
    }

    // Convert to markdown
    const content = turndown.turndown(article.content || '');

    return {
      title: article.title || '',
      content,
      source: 'readability',
      textLength: article.textContent.length,
      hasStructure: !!(article.content && article.content.includes('<h')),
    };
  } catch {
    return { title: '', content: '', source: 'readability', textLength: 0, hasStructure: false };
  }
}

/**
 * Method 2: Main content extraction via DOM analysis
 */
async function extractFromMainContent(page: Page): Promise<ExtractionResult> {
  try {
    const result = await page.evaluate(() => {
      const cleanHtml = (element: Element): string => {
        const clone = element.cloneNode(true) as Element;
        clone.querySelectorAll('script, style, nav, footer, header, iframe, noscript, svg').forEach(el => el.remove());
        return clone.innerHTML;
      };

      const selectors = [
        'article', 'main', '[role="main"]', '.post-content', '.article-content',
        '.entry-content', '.content', '#content', '#main', '.main-content',
        '.post-body', '.story-body',
      ];

      let container: Element | null = null;
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent && el.textContent.length > 100) {
          container = el;
          break;
        }
      }

      if (!container) {
        const candidates = Array.from(document.querySelectorAll('div, section'));
        let maxLen = 0;
        for (const el of candidates) {
          const text = el.textContent || '';
          if (text.length > maxLen && text.length > 200) {
            const directText = Array.from(el.childNodes)
              .filter(n => n.nodeType === Node.TEXT_NODE)
              .map(n => n.textContent || '')
              .join('').length;
            if (directText > 50 || el.children.length > 3) {
              maxLen = text.length;
              container = el;
            }
          }
        }
      }

      if (!container) {
        return { title: document.title, content: '', textLength: 0, hasStructure: false };
      }

      return {
        title: document.title,
        content: cleanHtml(container),
        textLength: container.textContent?.length || 0,
        hasStructure: container.querySelectorAll('h1, h2, h3, p').length > 3,
      };
    });

    return { ...result, source: 'main_content' };
  } catch {
    return { title: '', content: '', source: 'main_content', textLength: 0, hasStructure: false };
  }
}

/**
 * Method 3: Structured data (JSON-LD, etc.)
 */
async function extractFromStructuredData(page: Page): Promise<ExtractionResult> {
  try {
    const data = await page.evaluate(() => {
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      const results: string[] = [];

      jsonLdScripts.forEach(script => {
        try {
          const parsed = JSON.parse(script.textContent || '{}');
          if (parsed.text || parsed.articleBody || parsed.description) {
            results.push(
              parsed.articleBody || parsed.text || parsed.description || ''
            );
          }
        } catch {}
      });

      return results.join('\n\n');
    });

    return {
      title: '',
      content: data,
      source: 'structured_data',
      textLength: data.length,
      hasStructure: false,
    };
  } catch {
    return { title: '', content: '', source: 'structured_data', textLength: 0, hasStructure: false };
  }
}

/**
 * Method 4: Full body extraction (fallback)
 */
async function extractFromBody(page: Page): Promise<ExtractionResult> {
  try {
    const html = await page.evaluate(() => {
      const cleanHtml = (element: Element): string => {
        const clone = element.cloneNode(true) as Element;
        clone.querySelectorAll('script, style, nav, footer, header, iframe, noscript, svg').forEach(el => el.remove());
        return clone.innerHTML;
      };
      const body = document.body;
      if (!body) return '';
      return cleanHtml(body);
    });

    return {
      title: '',
      content: html,
      source: 'body',
      textLength: html.replace(/<[^>]*>/g, '').length,
      hasStructure: false,
    };
  } catch {
    return { title: '', content: '', source: 'body', textLength: 0, hasStructure: false };
  }
}

function scoreContent(result: ExtractionResult): number {
  let score = 0;

  // Readability is the gold standard for articles
  if (result.source === 'readability') score += 0.3;
  if (result.source === 'main_content') score += 0.2;

  // Longer content is generally better (up to a point)
  if (result.textLength > 500) score += 0.2;
  if (result.textLength > 2000) score += 0.1;

  // Structured content is better
  if (result.hasStructure) score += 0.2;

  // Penalize very short extractions
  if (result.textLength < 100) score -= 0.3;

  return Math.max(0, Math.min(1, score));
}

async function extractTables(page: Page): Promise<TableData[]> {
  return page.evaluate(() => {
    const tables: TableData[] = [];
    document.querySelectorAll('table').forEach(table => {
      const headers: string[] = [];
      const rows: string[][] = [];

      const thElements = table.querySelectorAll('thead th, tr:first-child th');
      thElements.forEach(th => headers.push(th.textContent?.trim() || ''));

      const trElements = table.querySelectorAll('tbody tr, tr');
      trElements.forEach(tr => {
        const cells: string[] = [];
        tr.querySelectorAll('td, th').forEach(cell => {
          cells.push(cell.textContent?.trim() || '');
        });
        if (cells.length > 0) {
          if (headers.length === 0 && rows.length === 0) {
            // First row might be headers
            cells.forEach(c => headers.push(c));
          } else {
            rows.push(cells);
          }
        }
      });

      if (rows.length > 0) {
        tables.push({
          headers,
          rows,
          caption: table.querySelector('caption')?.textContent?.trim(),
        });
      }
    });
    return tables;
  });
}

async function extractLinks(page: Page): Promise<{ text: string; href: string }[]> {
  return page.evaluate(() => {
    const links: { text: string; href: string }[] = [];
    document.querySelectorAll('a[href]').forEach(a => {
      const text = a.textContent?.trim() || '';
      const href = a.getAttribute('href') || '';
      if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        links.push({ text, href });
      }
    });
    return links.slice(0, 100); // Limit to 100 links
  });
}

