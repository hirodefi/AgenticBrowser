/**
 * Extract command.
 * Schema-driven structured data extraction from the page.
 */

import { type Page } from 'playwright';
import { getPage } from '../core/browser.js';
import { type ExtractResult } from '../state-machine/types.js';

export async function extractData(schema: Record<string, any>): Promise<ExtractResult> {
  const page = await getPage();

  // Extract data based on schema
  const data = await page.evaluate((schemaJson: string) => {
    const schema = JSON.parse(schemaJson);
    const result: Record<string, any> = {};

    for (const [key, template] of Object.entries(schema)) {
      if (Array.isArray(template)) {
        // Extract a list of items
        result[key] = extractArray(key, template[0]);
      } else if (typeof template === 'object' && template !== null) {
        // Extract a single item
        result[key] = extractObject(key, template);
      } else {
        // Extract a single value
        result[key] = extractValue(key);
      }
    }

    function extractArray(key: string, template: any): any[] {
      // Try to find repeating elements
      const containerSelectors = [
        `[class*="${key}"]`,
        `[id*="${key}"]`,
        `[data-type="${key}"]`,
        'tbody tr',
        '.item',
        '.card',
        '.row',
        '.entry',
        '.product',
        '.article',
        '.post',
        '.result',
        'li',
      ];

      for (const selector of containerSelectors) {
        const items = document.querySelectorAll(selector);
        if (items.length > 1) {
          const results: any[] = [];
          items.forEach(item => {
            const extracted = extractFromElement(item, template);
            if (extracted && Object.values(extracted).some(v => v !== '' && v !== null)) {
              results.push(extracted);
            }
          });
          if (results.length > 0) return results;
        }
      }

      return [];
    }

    function extractObject(key: string, template: Record<string, any>): any {
      return extractFromElement(document.body, template);
    }

    function extractFromElement(root: Element, template: Record<string, any>): any {
      const result: Record<string, any> = {};

      for (const [field, example] of Object.entries(template)) {
        const fieldLower = field.toLowerCase();

        // Try multiple strategies to find the field value
        const strategies = [
          // By data attribute
          () => {
            const el = root.querySelector(`[data-field="${field}"], [data-name="${field}"]`);
            return el?.textContent?.trim() || '';
          },
          // By class name
          () => {
            const el = root.querySelector(`[class*="${fieldLower}"], [class*="${fieldLower.replace(/_/g, '-')}"]`);
            return el?.textContent?.trim() || '';
          },
          // By label
          () => {
            const label = Array.from(root.querySelectorAll('label, th, dt, strong, b'))
              .find(el => el.textContent?.toLowerCase().includes(fieldLower));
            if (label) {
              // Value is usually next sibling or associated input
              const next = label.nextElementSibling;
              if (next) return next.textContent?.trim() || '';
              const parent = label.parentElement;
              if (parent) {
                const text = parent.textContent?.trim() || '';
                const labelLen = label.textContent?.trim().length || 0;
                return text.substring(labelLen).trim();
              }
            }
            return '';
          },
          // By heading + content pattern
          () => {
            const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
            for (const h of headings) {
              if (h.textContent?.toLowerCase().includes(fieldLower)) {
                const next = h.nextElementSibling;
                if (next) return next.textContent?.trim() || '';
                const parent = h.parentElement;
                if (parent) {
                  const text = parent.textContent?.trim() || '';
                  const headingLen = h.textContent?.trim().length || 0;
                  return text.substring(headingLen).trim();
                }
              }
            }
            return '';
          },
        ];

        for (const strategy of strategies) {
          const value = strategy();
          if (value) {
            result[field] = value;
            break;
          }
        }

        if (!result[field]) result[field] = '';
      }

      return result;
    }

    function extractValue(key: string): string {
      const el = document.querySelector(`[data-field="${key}"], [class*="${key.toLowerCase()}"]`);
      return el?.textContent?.trim() || '';
    }

    return result;
  }, JSON.stringify(schema));

  // Count items
  let count = 0;
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) count += value.length;
    else count++;
  }

  return {
    data,
    schema: JSON.stringify(schema),
    count,
  };
}
