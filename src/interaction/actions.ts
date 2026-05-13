/**
 * Element resolver and interaction engine.
 * Resolves elements by intent (natural language) and performs actions.
 */

import { type Page, type Locator } from 'playwright';

export interface ElementCandidate {
  selector: string;
  text: string;
  role: string;
  tag: string;
  href?: string;
  score: number;
}

/**
 * Find the best element matching a natural language intent.
 */
export async function resolveElement(page: Page, intent: string): Promise<Locator | null> {
  const candidates = await findCandidates(page, intent);
  if (candidates.length === 0) return null;

  // Pick highest scored candidate
  const best = candidates[0];
  return page.locator(best.selector).first();
}

/**
 * Find multiple candidates matching an intent.
 */
async function findCandidates(page: Page, intent: string): Promise<ElementCandidate[]> {
  const normalizedIntent = intent.toLowerCase().trim();

  return page.evaluate((query: string) => {
    const candidates: any[] = [];
    const q = query.toLowerCase();

    // All interactive elements
    const interactives = document.querySelectorAll(
      'a[href], button, input, select, textarea, [role="button"], [role="link"], ' +
      '[role="tab"], [role="menuitem"], [onclick], [tabindex]'
    );

    interactives.forEach((el, idx) => {
      const text = (el.textContent || '').trim().substring(0, 100);
      const ariaLabel = el.getAttribute('aria-label') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const title = el.getAttribute('title') || '';
      const href = el.getAttribute('href') || '';
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const tag = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type || '';

      // Build searchable text
      const searchText = [text, ariaLabel, placeholder, title, href]
        .join(' ').toLowerCase();

      // Score the match
      let score = 0;

      // Exact text match (highest)
      if (text.toLowerCase() === q) score += 10;

      // Partial text match
      const words = q.split(/\s+/);
      for (const word of words) {
        if (word.length < 2) continue;
        if (searchText.includes(word)) score += 2;
        // Exact word boundary match
        if (new RegExp(`\\b${word}\\b`).test(searchText)) score += 1;
      }

      // Role/type bonus
      if (q.includes('click') && (tag === 'button' || role === 'button')) score += 1;
      if (q.includes('link') && tag === 'a') score += 1;
      if (q.includes('input') && tag === 'input') score += 1;
      if (q.includes('tab') && (role === 'tab' || text.toLowerCase().includes('tab'))) score += 1;

      if (score > 0) {
        // Generate a unique selector
        const id = el.id;
        let selector: string;
        if (id) {
          selector = `#${id}`;
        } else {
          // Use nth-of-type for uniqueness
          const parent = el.parentElement;
          const siblings = parent ? Array.from(parent.children).filter(c => c.tagName === el.tagName) : [el];
          const index = siblings.indexOf(el) + 1;
          selector = `${tag}:nth-of-type(${index})`;
          // Add text for disambiguation if possible
          if (text) {
            selector = `${tag}:has-text("${text.substring(0, 50).replace(/"/g, '\\"')}")`;
          }
        }

        candidates.push({
          selector,
          text: text.substring(0, 100),
          role,
          tag,
          href,
          score,
        });
      }
    });

    return candidates.sort((a, b) => b.score - a.score).slice(0, 10);
  }, normalizedIntent);
}

/**
 * Perform an action by intent.
 */
export async function performAction(
  page: Page,
  action: 'click' | 'type' | 'scroll' | 'select' | 'hover' | 'press',
  intent: string,
  value?: string,
): Promise<{ success: boolean; description: string }> {
  switch (action) {
    case 'click': {
      const el = await resolveElement(page, intent);
      if (!el) return { success: false, description: `No element found matching: ${intent}` };

      // Human-like click
      const box = await el.boundingBox();
      if (box) {
        const x = box.x + box.width / 2 + (Math.random() * 4 - 2);
        const y = box.y + box.height / 2 + (Math.random() * 4 - 2);
        await humanMouseMove(page, x, y);
        await page.waitForTimeout(100 + Math.random() * 200);
        await page.mouse.click(x, y);
      } else {
        await el.click();
      }

      await page.waitForTimeout(500);
      return { success: true, description: `Clicked: ${intent}` };
    }

    case 'type': {
      const el = await resolveElement(page, intent);
      if (!el) return { success: false, description: `No input found matching: ${intent}` };

      await el.click();
      if (value) {
        // Clear existing text
        await el.fill('');
        // Type with human-like delays
        for (const char of value) {
          await page.keyboard.type(char, { delay: 50 + Math.random() * 80 });
        }
      }
      return { success: true, description: `Typed "${value}" into: ${intent}` };
    }

    case 'scroll': {
      const direction = intent.toLowerCase();
      if (direction.includes('up')) {
        await page.mouse.wheel(0, -300);
      } else if (direction.includes('bottom') || direction.includes('end')) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      } else {
        await page.mouse.wheel(0, 300);
      }
      await page.waitForTimeout(500);
      return { success: true, description: `Scrolled: ${intent}` };
    }

    case 'select': {
      const el = await resolveElement(page, intent);
      if (!el) return { success: false, description: `No select found matching: ${intent}` };
      if (value) {
        await el.selectOption({ label: value });
      }
      return { success: true, description: `Selected "${value}" in: ${intent}` };
    }

    case 'hover': {
      const el = await resolveElement(page, intent);
      if (!el) return { success: false, description: `No element found matching: ${intent}` };

      const box = await el.boundingBox();
      if (box) {
        await humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await el.hover();
      }
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

async function humanMouseMove(page: Page, targetX: number, targetY: number): Promise<void> {
  const steps = 10 + Math.floor(Math.random() * 10);
  const startX = Math.random() * 300;
  const startY = Math.random() * 200;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Ease-in-out
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = startX + (targetX - startX) * ease;
    const y = startY + (targetY - startY) * ease;
    await page.mouse.move(x, y);
    await page.waitForTimeout(Math.max(2, 10 + Math.random() * 10));
  }
}
