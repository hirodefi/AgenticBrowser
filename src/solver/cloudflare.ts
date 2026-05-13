/**
 * Cloudflare challenge solver.
 * Waits for challenges to resolve using the stealth browser.
 * With proper stealth, most Cloudflare challenges auto-resolve.
 */

import { type Page } from 'playwright';

export interface SolveResult {
  solved: boolean;
  method: string;
  timeTaken: number;
}

/**
 * Solve Cloudflare challenges by waiting + simulating human interaction.
 */
export async function solveCloudflareChallenge(page: Page, timeout = 30000): Promise<SolveResult> {
  const start = Date.now();

  // Step 1: Wait for the challenge page to load
  await page.waitForTimeout(1000);

  // Step 2: Check if there's a Turnstile checkbox to click
  const turnstileClicked = await clickTurnstileCheckbox(page);
  if (turnstileClicked) {
    // Wait for resolution after clicking
    const resolved = await waitForChallengeResolution(page, timeout - (Date.now() - start));
    if (resolved) {
      return { solved: true, method: 'turnstile_click', timeTaken: Date.now() - start };
    }
  }

  // Step 3: Try clicking any visible challenge button
  const buttonClicked = await clickChallengeButton(page);
  if (buttonClicked) {
    const resolved = await waitForChallengeResolution(page, timeout - (Date.now() - start));
    if (resolved) {
      return { solved: true, method: 'challenge_button_click', timeTaken: Date.now() - start };
    }
  }

  // Step 4: Simulate human-like mouse movement (some managed challenges detect this)
  await simulateHumanPresence(page);
  const resolved = await waitForChallengeResolution(page, timeout - (Date.now() - start));

  return {
    solved: resolved,
    method: resolved ? 'auto_resolve_with_human_simulation' : 'timeout',
    timeTaken: Date.now() - start,
  };
}

async function clickTurnstileCheckbox(page: Page): Promise<boolean> {
  try {
    // Turnstile can be in an iframe
    const frames = page.frames();
    for (const frame of frames) {
      if (frame.url().includes('challenges.cloudflare.com')) {
        const checkbox = await frame.$('input[type="checkbox"], .mark, button').catch(() => null);
        if (checkbox) {
          // Human-like mouse movement to the checkbox
          const box = await checkbox.boundingBox();
          if (box) {
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;
            await humanMouseMove(page, x, y);
            await page.waitForTimeout(200 + Math.random() * 300);
            await page.mouse.click(x + (Math.random() * 4 - 2), y + (Math.random() * 4 - 2));
            return true;
          }
          await checkbox.click().catch(() => {});
          return true;
        }
      }
    }

    // Also check for Turnstile in shadow DOM or main frame
    const mainCheckbox = await page.$('.cf-turnstile input[type="checkbox"], #turnstile-wrapper input').catch(() => null);
    if (mainCheckbox) {
      const box = await mainCheckbox.boundingBox();
      if (box) {
        await humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(200 + Math.random() * 300);
        await mainCheckbox.click();
      } else {
        await mainCheckbox.click();
      }
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function clickChallengeButton(page: Page): Promise<boolean> {
  try {
    const selectors = [
      '#challenge-stage input[type="button"]',
      '#challenge-stage button',
      '.challenge-platform button',
      'input[value="Verify"]',
      'input[value="Continue"]',
      'button:has-text("Verify")',
      'button:has-text("Continue")',
    ];

    for (const selector of selectors) {
      const button = await page.$(selector).catch(() => null);
      if (button) {
        const visible = await button.isVisible().catch(() => false);
        if (visible) {
          const box = await button.boundingBox();
          if (box) {
            await humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2);
            await page.waitForTimeout(150 + Math.random() * 200);
          }
          await button.click();
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function simulateHumanPresence(page: Page): Promise<void> {
  // Move mouse in natural curves across the page
  const viewport = page.viewportSize() || { width: 1920, height: 1080 };

  // Random starting point
  let x = Math.random() * viewport.width;
  let y = Math.random() * viewport.height;

  // Make several natural movements
  for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
    const targetX = 100 + Math.random() * (viewport.width - 200);
    const targetY = 100 + Math.random() * (viewport.height - 200);
    await humanMouseMove(page, targetX, targetY, x, y);
    x = targetX;
    y = targetY;
    await page.waitForTimeout(200 + Math.random() * 500);
  }

  // Small scroll
  await page.mouse.wheel(0, 50 + Math.random() * 100);
  await page.waitForTimeout(300);
}

async function waitForChallengeResolution(page: Page, remainingTimeout: number): Promise<boolean> {
  const deadline = Date.now() + Math.max(remainingTimeout, 5000);

  while (Date.now() < deadline) {
    try {
      const title = await page.title();
      const url = page.url();

      // If we're no longer on a challenge page, we're done
      const isChallengePage =
        /just a moment|checking your browser|verify you are human|attention required/i.test(title) ||
        url.includes('challenges.cloudflare.com') ||
        !!(await page.$('#challenge-running, #challenge-stage, .challenge-platform').catch(() => null));

      if (!isChallengePage) {
        return true;
      }

      // Check for success indicator
      const successEl = await page.$('#challenge-success, .cf-success').catch(() => null);
      if (successEl) {
        await page.waitForTimeout(1000); // Let redirect happen
        return true;
      }
    } catch {
      // Page might have navigated — that's actually success
      return true;
    }

    await page.waitForTimeout(1000);
  }

  return false;
}

async function humanMouseMove(
  page: Page,
  targetX: number,
  targetY: number,
  startX = 0,
  startY = 0,
): Promise<void> {
  const steps = 15 + Math.floor(Math.random() * 15);

  // Generate Bézier control points for natural movement
  const cp1x = startX + (targetX - startX) * 0.25 + (Math.random() - 0.5) * 100;
  const cp1y = startY + (targetY - startY) * 0.25 + (Math.random() - 0.5) * 100;
  const cp2x = startX + (targetX - startX) * 0.75 + (Math.random() - 0.5) * 100;
  const cp2y = startY + (targetY - startY) * 0.75 + (Math.random() - 0.5) * 100;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Cubic Bézier curve
    const x = Math.pow(1 - t, 3) * startX +
              3 * Math.pow(1 - t, 2) * t * cp1x +
              3 * (1 - t) * Math.pow(t, 2) * cp2x +
              Math.pow(t, 3) * targetX;
    const y = Math.pow(1 - t, 3) * startY +
              3 * Math.pow(1 - t, 2) * t * cp1y +
              3 * (1 - t) * Math.pow(t, 2) * cp2y +
              Math.pow(t, 3) * targetY;

    await page.mouse.move(x, y);
    // Variable speed — slower at start and end, faster in middle
    const speed = Math.sin(t * Math.PI) * 0.8 + 0.2;
    await page.waitForTimeout(Math.max(2, 16 * (1 - speed)));
  }
}
