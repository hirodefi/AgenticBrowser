/**
 * Read command.
 * Extracts clean content from the current page.
 */

import { getPage } from '../core/browser.js';
import { readPage, type ReadingOptions } from '../reading/engine.js';
import { type ReadResult } from '../state-machine/types.js';

export async function readContent(options: Partial<ReadingOptions> = {}): Promise<ReadResult> {
  const page = await getPage();
  return readPage(page, options);
}
