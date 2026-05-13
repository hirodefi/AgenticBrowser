/**
 * Verify command.
 * Verifies a goal or condition on the current page.
 */

import { getPage } from '../core/browser.js';
import { type VerifyResult } from '../state-machine/types.js';

export async function verifyGoal(goal: string): Promise<VerifyResult> {
  const page = await getPage();

  const result = await page.evaluate((goalText: string) => {
    const goal = goalText.toLowerCase();

    // Check various conditions based on goal text
    const checks: { condition: boolean; evidence: string }[] = [];

    // Logged in check
    if (goal.includes('logged in') || goal.includes('signed in')) {
      const hasAvatar = !!document.querySelector('[class*="avatar"], [class*="profile"], img[alt*="avatar"]');
      const hasLogout = !!document.querySelector('[href*="logout"], [href*="signout"], button:has-text("Sign out"), button:has-text("Log out")');
      const hasLoginLink = !!document.querySelector('[href*="login"], [href*="signin"]');
      checks.push({
        condition: hasAvatar || hasLogout || !hasLoginLink,
        evidence: hasAvatar ? 'Avatar/profile image visible' :
                  hasLogout ? 'Logout button visible' :
                  !hasLoginLink ? 'No login link found (likely logged in)' :
                  'Login link still present',
      });
    }

    // Page loaded check
    if (goal.includes('loaded') || goal.includes('page is')) {
      const hasContent = (document.body?.innerText?.length || 0) > 100;
      checks.push({
        condition: hasContent,
        evidence: hasContent ? `Page has ${document.body?.innerText?.length} chars` : 'Page seems empty',
      });
    }

    // Contains text check
    const textMatch = goal.match(/contains?["\s]+(.+)/);
    if (textMatch) {
      const searchText = textMatch[1].trim().replace(/['"]/g, '');
      const bodyText = document.body?.innerText?.toLowerCase() || '';
      const found = bodyText.includes(searchText);
      checks.push({
        condition: found,
        evidence: found ? `Text "${searchText}" found on page` : `Text "${searchText}" not found`,
      });
    }

    // Has element check
    const elementMatch = goal.match(/has\s+(?:a\s+)?(.+?)(?:\s*(?:button|link|input|element))?$/);
    if (elementMatch && checks.length === 0) {
      const searchText = elementMatch[1].trim();
      const found = !!document.querySelector(
        `button:has-text("${searchText}"), a:has-text("${searchText}"), [aria-label*="${searchText}"]`
      );
      checks.push({
        condition: found,
        evidence: found ? `Element "${searchText}" found` : `Element "${searchText}" not found`,
      });
    }

    // URL check
    if (goal.includes('url') || goal.includes('on page')) {
      const urlMatch = goal.match(/(?:url|page)\s+(?:is|contains?)\s+["']?(.+?)["']?$/);
      if (urlMatch) {
        const targetUrl = urlMatch[1].trim();
        const matches = location.href.includes(targetUrl);
        checks.push({
          condition: matches,
          evidence: matches ? `URL matches: ${location.href}` : `URL "${location.href}" doesn't contain "${targetUrl}"`,
        });
      }
    }

    // Default: check if goal keywords appear on page
    if (checks.length === 0) {
      const bodyText = document.body?.innerText?.toLowerCase() || '';
      const goalWords = goal.split(/\s+/).filter(w => w.length > 3);
      const matchedWords = goalWords.filter(w => bodyText.includes(w));
      const ratio = goalWords.length > 0 ? matchedWords.length / goalWords.length : 0;

      checks.push({
        condition: ratio > 0.5,
        evidence: `Goal keywords matched: ${matchedWords.join(', ')} (${Math.round(ratio * 100)}%)`,
      });
    }

    return checks;
  }, goal);

  // Aggregate results
  const allPassed = result.every(r => r.condition);
  const evidence = result.map(r => r.evidence).join('; ');

  return {
    verified: allPassed,
    evidence,
    details: { checks: result },
  };
}
