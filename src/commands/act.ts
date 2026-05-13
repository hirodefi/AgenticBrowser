/**
 * Act command.
 * Performs intent-based browser interaction.
 */

import { getPage } from '../core/browser.js';
import { performAction } from '../interaction/actions.js';
import { type ActionResult } from '../state-machine/types.js';

export interface ActOptions {
  action: 'click' | 'type' | 'scroll' | 'select' | 'hover' | 'press';
  intent: string;
  value?: string;
}

export async function actOnPage(options: ActOptions): Promise<ActionResult> {
  const page = await getPage();
  const result = await performAction(page, options.action, options.intent, options.value);

  // Get after-state
  const afterUrl = page.url();
  const afterTitle = await page.title();

  return {
    success: result.success,
    description: result.description,
    afterState: `URL: ${afterUrl}\nTitle: ${afterTitle}`,
  };
}
