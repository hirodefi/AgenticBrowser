/**
 * Navigate command.
 * Back, forward, reload, goto.
 */

import { getPage } from '../core/browser.js';
import { getConfig } from '../core/config.js';
import { autoSolveChallenges } from '../solver/solver.js';
import { classifyAccessState } from '../state-machine/classifier.js';
import { AccessState } from '../state-machine/types.js';

export interface NavigateResult {
  success: boolean;
  url: string;
  title: string;
  accessState: AccessState;
}

export async function navigate(
  action: 'back' | 'forward' | 'reload' | 'goto',
  url?: string,
): Promise<NavigateResult> {
  const page = await getPage();
  const config = getConfig();

  try {
    switch (action) {
      case 'back':
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: config.navigationTimeout });
        break;
      case 'forward':
        await page.goForward({ waitUntil: 'domcontentloaded', timeout: config.navigationTimeout });
        break;
      case 'reload':
        await page.reload({ waitUntil: 'domcontentloaded', timeout: config.navigationTimeout });
        break;
      case 'goto':
        if (!url) throw new Error('URL required for goto action');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeout });
        break;
    }

    await page.waitForTimeout(1000);

    // Auto-solve any challenges
    await autoSolveChallenges(page);

    const finalState = await classifyAccessState(page);
    const title = await page.title();

    return {
      success: finalState.state === AccessState.READABLE || finalState.state === AccessState.INTERACTIVE,
      url: page.url(),
      title,
      accessState: finalState.state,
    };
  } catch (error: any) {
    return {
      success: false,
      url: page.url(),
      title: '',
      accessState: AccessState.BROKEN,
    };
  }
}
