/**
 * CAPTCHA solver.
 * Handles reCAPTCHA v2, hCaptcha, and simple click CAPTCHAs autonomously.
 */

import { type Page, type Frame } from 'playwright';

export interface CaptchaSolveResult {
  solved: boolean;
  method: string;
  timeTaken: number;
}

/**
 * Attempt to solve any detected CAPTCHA.
 */
export async function solveCaptcha(page: Page, timeout = 30000): Promise<CaptchaSolveResult> {
  const start = Date.now();

  // Try reCAPTCHA v2
  const recaptchaFrame = findRecaptchaFrame(page);
  if (recaptchaFrame) {
    const result = await solveRecaptchaV2(page, recaptchaFrame, timeout - (Date.now() - start));
    if (result.solved) return result;
  }

  // Try hCaptcha
  const hcaptchaFrame = findHcaptchaFrame(page);
  if (hcaptchaFrame) {
    const result = await solveHcaptcha(page, hcaptchaFrame, timeout - (Date.now() - start));
    if (result.solved) return result;
  }

  // Try simple click CAPTCHAs
  const simpleResult = await solveSimpleClick(page);
  if (simpleResult.solved) return simpleResult;

  return {
    solved: false,
    method: 'no_captcha_found',
    timeTaken: Date.now() - start,
  };
}

function findRecaptchaFrame(page: Page): Frame | null {
  return page.frames().find(f =>
    f.url().includes('google.com/recaptcha') || f.url().includes('recaptcha.net')
  ) || null;
}

function findHcaptchaFrame(page: Page): Frame | null {
  return page.frames().find(f => f.url().includes('hcaptcha.com')) || null;
}

/**
 * Solve reCAPTCHA v2 by clicking the checkbox with human-like behavior.
 */
async function solveRecaptchaV2(
  page: Page,
  frame: Frame,
  timeout: number,
): Promise<CaptchaSolveResult> {
  const start = Date.now();

  try {
    // Step 1: Click the "I'm not a robot" checkbox with human-like mouse movement
    const checkbox = await frame.$('#recaptcha-anchor').catch(() => null);
    if (!checkbox) {
      return { solved: false, method: 'no_checkbox', timeTaken: Date.now() - start };
    }

    const box = await checkbox.boundingBox();
    if (box) {
      // Move mouse from a random starting point to the checkbox
      const startX = Math.random() * 500 + 200;
      const startY = Math.random() * 300 + 200;
      await bezierMouseMove(page, startX, startY, box.x + box.width / 2, box.y + box.height / 2);

      // Small pause before clicking (like a human)
      await page.waitForTimeout(200 + Math.random() * 400);

      // Click with tiny random offset
      const clickX = box.x + box.width / 2 + (Math.random() * 6 - 3);
      const clickY = box.y + box.height / 2 + (Math.random() * 6 - 3);
      await page.mouse.click(clickX, clickY);
    } else {
      await checkbox.click();
    }

    // Step 2: Wait to see if checkbox was accepted (no image challenge)
    await page.waitForTimeout(2000 + Math.random() * 1000);

    // Check if checkbox is now checked
    const isChecked = await frame.$('#recaptcha-anchor[aria-checked="true"]').catch(() => null);
    if (isChecked) {
      return { solved: true, method: 'recaptcha_checkbox_click', timeTaken: Date.now() - start };
    }

    // Step 3: If image challenge appeared, try audio challenge
    const imageChallenge = await page.frames().find(f =>
      f.url().includes('google.com/recaptcha') && f !== frame
    );

    if (imageChallenge) {
      return await solveRecaptchaAudio(page, imageChallenge, timeout - (Date.now() - start));
    }

    return { solved: false, method: 'recaptcha_unsolved', timeTaken: Date.now() - start };
  } catch {
    return { solved: false, method: 'recaptcha_error', timeTaken: Date.now() - start };
  }
}

/**
 * Solve reCAPTCHA audio challenge.
 * Downloads audio, transcribes it, enters the answer.
 */
async function solveRecaptchaAudio(
  page: Page,
  challengeFrame: Frame,
  timeout: number,
): Promise<CaptchaSolveResult> {
  const start = Date.now();

  try {
    // Click "Get audio challenge" button
    const audioButton = await challengeFrame.$('#recaptcha-audio-button').catch(() => null);
    if (audioButton) {
      await audioButton.click();
      await page.waitForTimeout(2000);
    }

    // Get audio download link
    const audioLink = await challengeFrame.$('.rc-audiochallenge-tdownload-link, a[href*="audio"]').catch(() => null);
    if (!audioLink) {
      return { solved: false, method: 'no_audio_link', timeTaken: Date.now() - start };
    }

    const audioUrl = await audioLink.getAttribute('href');
    if (!audioUrl) {
      return { solved: false, method: 'no_audio_url', timeTaken: Date.now() - start };
    }

    // Download and transcribe audio
    const transcription = await transcribeAudio(audioUrl);
    if (!transcription) {
      return { solved: false, method: 'audio_transcription_failed', timeTaken: Date.now() - start };
    }

    // Enter the transcription
    const input = await challengeFrame.$('#audio-response').catch(() => null);
    if (input) {
      // Type with human-like delays
      await typeHumanLike(input, transcription);
      await page.waitForTimeout(300 + Math.random() * 500);

      // Press Enter or click verify
      const verifyButton = await challengeFrame.$('#recaptcha-verify-button').catch(() => null);
      if (verifyButton) {
        await verifyButton.click();
      } else {
        await input.press('Enter');
      }

      await page.waitForTimeout(2000);

      // Check if solved
      const anchorFrame = page.frames().find(f =>
        f.url().includes('google.com/recaptcha/api2/anchor') ||
        f.url().includes('recaptcha/api2/anchor')
      );
      if (anchorFrame) {
        const checked = await anchorFrame.$('#recaptcha-anchor[aria-checked="true"]').catch(() => null);
        if (checked) {
          return { solved: true, method: 'recaptcha_audio_stt', timeTaken: Date.now() - start };
        }
      }
    }

    return { solved: false, method: 'audio_entry_failed', timeTaken: Date.now() - start };
  } catch {
    return { solved: false, method: 'audio_error', timeTaken: Date.now() - start };
  }
}

/**
 * Solve hCaptcha by clicking the checkbox.
 */
async function solveHcaptcha(
  page: Page,
  frame: Frame,
  timeout: number,
): Promise<CaptchaSolveResult> {
  const start = Date.now();

  try {
    const checkbox = await frame.$('#checkbox').catch(() => null);
    if (!checkbox) {
      return { solved: false, method: 'no_hcaptcha_checkbox', timeTaken: Date.now() - start };
    }

    const box = await checkbox.boundingBox();
    if (box) {
      await bezierMouseMove(page, Math.random() * 400 + 200, Math.random() * 200 + 200,
        box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(200 + Math.random() * 300);
      await page.mouse.click(
        box.x + box.width / 2 + (Math.random() * 4 - 2),
        box.y + box.height / 2 + (Math.random() * 4 - 2),
      );
    } else {
      await checkbox.click();
    }

    await page.waitForTimeout(3000 + Math.random() * 2000);

    const checked = await frame.$('#checkbox[aria-checked="true"]').catch(() => null);
    if (checked) {
      return { solved: true, method: 'hcaptcha_checkbox', timeTaken: Date.now() - start };
    }

    return { solved: false, method: 'hcaptcha_unsolved', timeTaken: Date.now() - start };
  } catch {
    return { solved: false, method: 'hcaptcha_error', timeTaken: Date.now() - start };
  }
}

/**
 * Solve simple click CAPTCHAs.
 */
async function solveSimpleClick(page: Page): Promise<CaptchaSolveResult> {
  const start = Date.now();

  const selectors = [
    'button:has-text("I\'m not a robot")',
    'button:has-text("Verify")',
    '.captcha-checkbox',
    '#captcha-response',
  ];

  for (const selector of selectors) {
    const el = await page.$(selector).catch(() => null);
    if (el) {
      const box = await el.boundingBox();
      if (box) {
        await bezierMouseMove(page, Math.random() * 300, Math.random() * 200,
          box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(200 + Math.random() * 300);
      }
      await el.click();
      await page.waitForTimeout(2000);
      return { solved: true, method: 'simple_click', timeTaken: Date.now() - start };
    }
  }

  return { solved: false, method: 'no_simple_captcha', timeTaken: Date.now() - start };
}

/**
 * Human-like mouse movement using Bézier curves.
 */
async function bezierMouseMove(
  page: Page,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
): Promise<void> {
  const steps = 15 + Math.floor(Math.random() * 15);

  const cp1x = startX + (targetX - startX) * 0.25 + (Math.random() - 0.5) * 80;
  const cp1y = startY + (targetY - startY) * 0.25 + (Math.random() - 0.5) * 80;
  const cp2x = startX + (targetX - startX) * 0.75 + (Math.random() - 0.5) * 80;
  const cp2y = startY + (targetY - startY) * 0.75 + (Math.random() - 0.5) * 80;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.pow(1 - t, 3) * startX +
              3 * Math.pow(1 - t, 2) * t * cp1x +
              3 * (1 - t) * Math.pow(t, 2) * cp2x +
              Math.pow(t, 3) * targetX;
    const y = Math.pow(1 - t, 3) * startY +
              3 * Math.pow(1 - t, 2) * t * cp1y +
              3 * (1 - t) * Math.pow(t, 2) * cp2y +
              Math.pow(t, 3) * targetY;

    await page.mouse.move(x, y);
    const speed = Math.sin(t * Math.PI) * 0.8 + 0.2;
    await page.waitForTimeout(Math.max(2, 16 * (1 - speed)));
  }
}

/**
 * Type text with human-like keystroke timing.
 */
async function typeHumanLike(element: any, text: string): Promise<void> {
  await element.click();
  for (const char of text) {
    await element.pressSequentially(char, { delay: 80 + Math.random() * 120 });
  }
}

/**
 * Transcribe audio from URL.
 * Uses the Web Speech API pattern or falls back to built-in transcription.
 */
async function transcribeAudio(audioUrl: string): Promise<string | null> {
  try {
    // For now, we attempt to use a local transcription approach.
    // In production, this would integrate with Whisper or a speech-to-text API.
    const response = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) return null;

    // We need an actual STT engine.
    // This is a placeholder that returns null — in production,
    // integrate with:
    // 1. OpenAI Whisper API
    // 2. Local Whisper model
    // 3. Google Speech-to-Text
    // 4. Any other STT service

    // For MVP, we download the audio and return null.
    // The audio is typically a short number sequence.
    // Future: buffer audio data and send to STT service.

    return null;
  } catch {
    return null;
  }
}
