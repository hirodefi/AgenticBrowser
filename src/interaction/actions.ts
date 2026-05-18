/**
 * Intent-driven page actions.
 *
 * Resolves an element from a natural-language intent, then drives it
 * through the behavior layer so every interaction looks human at the
 * dispatch and timing level.
 */

import { type Page, type Locator } from 'playwright';
import { getBehavior } from '../core/browser.js';
import { pointerTo, clickAt, hoverAt } from '../behavior/pointer.js';
import { typeHuman } from '../behavior/typing.js';
import { scrollBy, scrollToBottom } from '../behavior/scrolling.js';
import { sleep, rand } from '../behavior/timing.js';

export interface ElementCandidate {
  selector: string;
  text: string;
  role: string;
  tag: string;
  href?: string;
  score: number;
}

export async function resolveElement(page: Page, intent: string): Promise<Locator | null> {
  const candidates = await findCandidates(page, intent);
  if (candidates.length === 0) return null;
  return page.locator(candidates[0].selector).first();
}

async function findCandidates(page: Page, intent: string): Promise<ElementCandidate[]> {
  const normalizedIntent = intent.toLowerCase().trim();
  return page.evaluate((query: string) => {
    const candidates: any[] = [];
    const q = query.toLowerCase();
    const interactives = document.querySelectorAll(
      'a[href], button, input, select, textarea, [role="button"], [role="link"], ' +
      '[role="tab"], [role="menuitem"], [onclick], [tabindex]'
    );
    interactives.forEach((el) => {
      const text = (el.textContent || '').trim().substring(0, 100);
      const ariaLabel = el.getAttribute('aria-label') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const title = el.getAttribute('title') || '';
      const href = el.getAttribute('href') || '';
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const tag = el.tagName.toLowerCase();
      const searchText = [text, ariaLabel, placeholder, title, href].join(' ').toLowerCase();
      let score = 0;
      if (text.toLowerCase() === q) score += 10;
      const words = q.split(/\s+/);
      for (const word of words) {
        if (word.length < 2) continue;
        if (searchText.includes(word)) score += 2;
        if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(searchText)) score += 1;
      }
      if (q.includes('click') && (tag === 'button' || role === 'button')) score += 1;
      if (q.includes('link') && tag === 'a') score += 1;
      if (q.includes('input') && tag === 'input') score += 1;
      if (q.includes('tab') && role === 'tab') score += 1;
      if (score > 0) {
        const id = (el as HTMLElement).id;
        let selector: string;
        if (id) selector = `#${CSS.escape(id)}`;
        else if (text) selector = `${tag}:has-text("${text.substring(0, 50).replace(/"/g, '\\"')}")`;
        else {
          const parent = el.parentElement;
          const siblings = parent ? Array.from(parent.children).filter(c => c.tagName === el.tagName) : [el];
          const index = siblings.indexOf(el) + 1;
          selector = `${tag}:nth-of-type(${index})`;
        }
        candidates.push({ selector, text, role, tag, href, score });
      }
    });
    return candidates.sort((a, b) => b.score - a.score).slice(0, 10);
  }, normalizedIntent);
}

export async function performAction(
  page: Page,
  action: 'click' | 'type' | 'scroll' | 'select' | 'hover' | 'press',
  intent: string,
  value?: string,
): Promise<{ success: boolean; description: string }> {
  const cfg = getBehavior();
  switch (action) {
    case 'click': {
      const el = await resolveElement(page, intent);
      if (!el) return { success: false, description: `No element found matching: ${intent}` };
      const box = await el.boundingBox();
      if (box) {
        const isInput = await el.evaluate((n: any) => {
          const tag = (n.tagName || '').toLowerCase();
          return tag === 'input' || tag === 'textarea' || n.isContentEditable === true;
        }).catch(() => false);
        await clickAt(page, { x: box.x, y: box.y, width: box.width, height: box.height, isInput }, cfg);
      } else {
        await el.click();
      }
      await sleep(rand(280, 720));
      return { success: true, description: `Clicked: ${intent}` };
    }
    case 'type': {
      const el = await resolveElement(page, intent);
      if (!el) return { success: false, description: `No input found matching: ${intent}` };
      const box = await el.boundingBox();
      if (box) {
        await clickAt(page, { x: box.x, y: box.y, width: box.width, height: box.height, isInput: true }, cfg);
      } else {
        await el.click();
      }
      if (value) {
        await sleep(rand(80, 220));
        await typeHuman(page, value, cfg);
      }
      return { success: true, description: `Typed "${value}" into: ${intent}` };
    }
    case 'scroll': {
      const dir = intent.toLowerCase();
      if (dir.includes('bottom') || dir.includes('end')) {
        await scrollToBottom(page, cfg);
      } else if (dir.includes('up')) {
        await scrollBy(page, -Math.round(rand(300, 600)), cfg);
      } else {
        await scrollBy(page, Math.round(rand(300, 600)), cfg);
      }
      return { success: true, description: `Scrolled: ${intent}` };
    }
    case 'select': {
      const el = await resolveElement(page, intent);
      if (!el) return { success: false, description: `No select found matching: ${intent}` };
      if (value) await el.selectOption({ label: value });
      return { success: true, description: `Selected "${value}" in: ${intent}` };
    }
    case 'hover': {
      const el = await resolveElement(page, intent);
      if (!el) return { success: false, description: `No element found matching: ${intent}` };
      const box = await el.boundingBox();
      if (box) await hoverAt(page, { x: box.x, y: box.y, width: box.width, height: box.height }, cfg);
      else await el.hover();
      return { success: true, description: `Hovered: ${intent}` };
    }
    case 'press': {
      await page.keyboard.press(value || 'Enter');
      return { success: true, description: `Pressed: ${value || 'Enter'}` };
    }
    default:
      return { success: false, description: `Unknown action: ${action}` };
  }
}
