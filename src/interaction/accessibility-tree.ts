/**
 * Accessibility tree extraction.
 * Extracts the page's accessibility tree for element targeting and observation.
 */

import { type Page } from 'playwright';
import { type InteractiveElement } from '../state-machine/types.js';

export async function getAccessibilityTree(page: Page): Promise<InteractiveElement[]> {
  return page.evaluate(() => {
    const elements: InteractiveElement[] = [];
    const seen = new Set<string>();

    const interactives = document.querySelectorAll(
      'a[href], button, input, select, textarea, [role="button"], [role="link"], ' +
      '[role="tab"], [role="menuitem"], [role="checkbox"], [role="radio"], ' +
      '[role="switch"], [role="textbox"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
    );

    interactives.forEach((el, idx) => {
      // Skip hidden elements
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;

      const rect = el.getBoundingClientRect();
      const text = (el.textContent || '').trim().substring(0, 100);
      const ariaLabel = el.getAttribute('aria-label') || '';
      const placeholder = (el as HTMLInputElement).placeholder || el.getAttribute('placeholder') || '';
      const type = (el as HTMLInputElement).type || '';
      const href = el.getAttribute('href') || '';
      const role = el.getAttribute('role') || '';

      // Generate unique ID
      let id = el.id || `el_${idx}`;
      if (seen.has(id)) id = `el_${idx}_${el.tagName.toLowerCase()}`;
      seen.add(id);

      // Ensure it's visible in viewport
      const visible = rect.width > 0 && rect.height > 0 &&
        rect.top < window.innerHeight && rect.bottom > 0;

      elements.push({
        id,
        role: role || el.tagName.toLowerCase(),
        text: text || ariaLabel || placeholder,
        tag: el.tagName.toLowerCase(),
        href: href || undefined,
        placeholder: placeholder || undefined,
        type: type || undefined,
        visible,
        bounds: visible ? {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        } : undefined,
      });
    });

    return elements;
  });
}

/**
 * Get a compact accessibility snapshot for LLM consumption.
 */
export async function getCompactA11yTree(page: Page): Promise<string> {
  const elements = await getAccessibilityTree(page);
  const lines: string[] = [];

  for (const el of elements) {
    if (!el.visible) continue;
    let line = `[${el.id}] ${el.tag}`;
    if (el.role !== el.tag) line += ` (${el.role})`;
    if (el.text) line += ` "${el.text.substring(0, 50)}"`;
    if (el.href) line += ` → ${el.href.substring(0, 80)}`;
    if (el.placeholder) line += ` placeholder="${el.placeholder}"`;
    if (el.type) line += ` type=${el.type}`;
    lines.push(line);
  }

  return lines.join('\n');
}
