/**
 * Observe command.
 * Returns a compact summary of the current page state.
 */

import { type Page } from 'playwright';
import { getPage } from '../core/browser.js';
import { classifyAccessState } from '../state-machine/classifier.js';
import { type PageObservation, type InteractiveElement } from '../state-machine/types.js';
import { getAccessibilityTree } from '../interaction/accessibility-tree.js';

export interface ObserveOptions {
  level: 'compact' | 'standard' | 'detailed';
  includeElements: boolean;
  includeForms: boolean;
  includeLinks: boolean;
}

export async function observePage(options: Partial<ObserveOptions> = {}): Promise<PageObservation> {
  const opts = { level: 'compact', includeElements: true, includeForms: true, includeLinks: true, ...options };
  const page = await getPage();

  const [accessResult, title, url, interactiveElements, contentPreview, forms, links] = await Promise.all([
    classifyAccessState(page),
    page.title(),
    Promise.resolve(page.url()),
    opts.includeElements ? getAccessibilityTree(page) : Promise.resolve([]),
    getPageSummary(page),
    opts.includeForms ? extractForms(page) : Promise.resolve([]),
    opts.includeLinks ? extractPageLinks(page) : Promise.resolve([]),
  ]);

  // Filter interactive elements based on level
  let filteredElements = interactiveElements;
  if (opts.level === 'compact') {
    filteredElements = interactiveElements.filter(el => el.visible).slice(0, 30);
  } else if (opts.level === 'standard') {
    filteredElements = interactiveElements.filter(el => el.visible).slice(0, 80);
  }

  return {
    title,
    url,
    accessState: accessResult.state,
    summary: generateSummary(title, url, accessResult.state, contentPreview, filteredElements, forms),
    interactiveElements: filteredElements,
    forms,
    links,
    contentPreview,
    metadata: {} as any,
  };
}

async function getPageSummary(page: Page): Promise<string> {
  return page.evaluate(() => {
    const body = document.body;
    if (!body) return '';
    const text = body.innerText || '';
    return text.substring(0, 500).trim();
  });
}

async function extractForms(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    const forms: any[] = [];
    document.querySelectorAll('form').forEach((form, idx) => {
      const inputs: any[] = [];
      form.querySelectorAll('input, select, textarea').forEach(input => {
        const el = input as HTMLInputElement;
        inputs.push({
          name: el.name || '',
          type: el.type || el.tagName.toLowerCase(),
          placeholder: el.placeholder || '',
          required: el.required,
        });
      });
      forms.push({
        id: form.id || `form_${idx}`,
        action: form.action || '',
        method: form.method || 'GET',
        inputs,
      });
    });
    return forms;
  });
}

async function extractPageLinks(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    const links: any[] = [];
    const currentHost = location.hostname;
    document.querySelectorAll('a[href]').forEach(a => {
      const text = (a.textContent || '').trim().substring(0, 80);
      const href = a.getAttribute('href') || '';
      if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          const linkHost = new URL(href, location.href).hostname;
          links.push({
            text,
            href,
            internal: linkHost === currentHost,
          });
        } catch {}
      }
    });
    return links.slice(0, 50);
  });
}

function generateSummary(
  title: string,
  url: string,
  state: string,
  preview: string,
  elements: InteractiveElement[],
  forms: any[],
): string {
  const parts: string[] = [];

  parts.push(`Page: "${title}" (${url})`);
  parts.push(`State: ${state}`);
  parts.push(`Elements: ${elements.length} interactive`);

  if (forms.length > 0) {
    parts.push(`Forms: ${forms.length} found`);
  }

  if (preview) {
    parts.push(`Preview: ${preview.substring(0, 200)}`);
  }

  return parts.join('\n');
}
