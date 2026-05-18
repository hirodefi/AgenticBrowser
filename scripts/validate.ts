/**
 * Detection-site validation harness.
 *
 * Drives the current stealth stack against well-known bot-detection sites
 * and reports per-signal pass/fail. Output is both a JSON report
 * (machine-readable) and a console summary (human-readable).
 *
 * Run: `npx tsx scripts/validate.ts`
 * Output: scripts/validation-report.json + console
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, closeBrowser, getPage, getFingerprint, updateConfig } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Probe {
  name: string;
  url: string;
  read: (page: any) => Promise<Record<string, any>>;
}

const PROBES: Probe[] = [
  {
    name: 'self-signal-check',
    url: 'about:blank',
    read: async (page) => {
      return await page.evaluate(() => ({
        stealthApplied: (window as any).__ab_stealth_applied === true,
        webdriver: (navigator as any).webdriver,
        languages: (navigator as any).languages,
        platform: (navigator as any).platform,
        userAgent: (navigator as any).userAgent,
        hardwareConcurrency: (navigator as any).hardwareConcurrency,
        deviceMemory: (navigator as any).deviceMemory,
        pluginsLength: (navigator as any).plugins.length,
        pluginNames: Array.from((navigator as any).plugins, (p: any) => p.name),
        mimeTypesLength: (navigator as any).mimeTypes.length,
        chromeObject: typeof (window as any).chrome,
        chromeRuntime: typeof (window as any).chrome?.runtime,
        userAgentDataBrands: (navigator as any).userAgentData?.brands,
        userAgentDataPlatform: (navigator as any).userAgentData?.platform,
        screenWidth: screen.width,
        screenHeight: screen.height,
        screenAvailWidth: screen.availWidth,
        devicePixelRatio: window.devicePixelRatio,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: navigator.language,
        webglVendor: ((): string | null => {
          try {
            const c = document.createElement('canvas');
            const gl: any = c.getContext('webgl');
            const ext = gl?.getExtension('WEBGL_debug_renderer_info');
            return ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null;
          } catch { return null; }
        })(),
        webglRenderer: ((): string | null => {
          try {
            const c = document.createElement('canvas');
            const gl: any = c.getContext('webgl');
            const ext = gl?.getExtension('WEBGL_debug_renderer_info');
            return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
          } catch { return null; }
        })(),
        getWebdriverDescriptor: (() => {
          const d = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
          return d ? { get: typeof d.get, set: typeof d.set, configurable: d.configurable, enumerable: d.enumerable } : null;
        })(),
        functionToStringSelfCheck: (() => {
          try {
            const fn = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver')?.get;
            return fn ? fn.toString() : null;
          } catch { return 'error'; }
        })(),
      }));
    },
  },
  {
    name: 'incolumitas-bot-detection',
    url: 'https://bot.incolumitas.com/',
    read: async (page) => {
      await page.waitForTimeout(8000);
      return await page.evaluate(() => {
        const out: Record<string, any> = {};
        const newTestsEl = document.querySelector('#new-tests');
        if (newTestsEl) out.newTests = (newTestsEl.textContent || '').trim().slice(0, 2000);
        const oldTestsEl = document.querySelector('#detection-tests');
        if (oldTestsEl) out.oldTests = (oldTestsEl.textContent || '').trim().slice(0, 2000);
        const scoreEl = document.querySelector('#fp_score');
        if (scoreEl) out.score = (scoreEl.textContent || '').trim();
        return out;
      });
    },
  },
  {
    name: 'browserscan',
    url: 'https://www.browserscan.net/bot-detection',
    read: async (page) => {
      await page.waitForTimeout(10000);
      return await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return {
          containsRobot: /robot/i.test(text),
          containsNormal: /normal/i.test(text),
          containsHuman: /human/i.test(text),
          textSnippet: text.slice(0, 1500),
        };
      });
    },
  },
  {
    name: 'creepjs',
    url: 'https://abrahamjuliot.github.io/creepjs/',
    read: async (page) => {
      await page.waitForTimeout(15000);
      return await page.evaluate(() => {
        const trust = document.querySelector('.unblurred .stat-result, .stat-result');
        const lies = document.querySelector('[id*="lies"]');
        return {
          trustScore: trust?.textContent?.trim().slice(0, 200),
          lies: lies?.textContent?.trim().slice(0, 500),
          fp: (document.querySelector('.fingerprint') as any)?.innerText?.slice(0, 500),
        };
      });
    },
  },
  {
    name: 'deviceandbrowserinfo',
    url: 'https://deviceandbrowserinfo.com/are_you_a_bot',
    read: async (page) => {
      await page.waitForTimeout(8000);
      return await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return {
          isBot: /isBot[:\s]+true/i.test(text),
          isBotMatch: text.match(/isBot[:\s]+\w+/i)?.[0],
          textSnippet: text.slice(0, 1500),
        };
      });
    },
  },
];

async function main() {
  const headless = process.env.HEADLESS !== 'false';
  updateConfig({ headless, behaviorPreset: 'relaxed', persistentProfile: false });

  await launchBrowser();
  const profile = getFingerprint();
  console.log(`\n=== AgenticBrowser validation ===`);
  console.log(`Backend:    ${process.env.AGENTIC_BROWSER_BACKEND ?? 'auto'}`);
  console.log(`Platform:   ${profile?.platform}`);
  console.log(`UA:         ${profile?.ua.ua}`);
  console.log(`Locale:     ${profile?.locale}`);
  console.log(`Timezone:   ${profile?.timezone}`);
  console.log(`GPU:        ${profile?.gpu.renderer}`);
  console.log(`Screen:     ${profile?.screen.width}x${profile?.screen.height} @${profile?.screen.pixelRatio}x`);
  console.log(`Headless:   ${headless}\n`);

  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    backend: process.env.AGENTIC_BROWSER_BACKEND ?? 'auto',
    headless,
    profile: profile ? {
      platform: profile.platform,
      ua: profile.ua.ua,
      locale: profile.locale,
      timezone: profile.timezone,
      gpu: profile.gpu,
      screen: profile.screen,
    } : null,
    probes: {} as Record<string, any>,
  };

  for (const probe of PROBES) {
    process.stdout.write(`[${probe.name}] running… `);
    const start = Date.now();
    const page = await getPage();
    try {
      if (probe.url !== 'about:blank') {
        await page.goto(probe.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      }
      const data = await probe.read(page);
      results.probes[probe.name] = {
        ok: true,
        ms: Date.now() - start,
        data,
      };
      console.log(`ok (${Date.now() - start}ms)`);
    } catch (e: any) {
      results.probes[probe.name] = {
        ok: false,
        ms: Date.now() - start,
        error: e.message,
      };
      console.log(`FAILED: ${e.message}`);
    }
  }

  const reportDir = __dirname;
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, 'validation-report.json');
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nReport saved to ${reportPath}`);

  printSummary(results);

  await closeBrowser();
}

function printSummary(results: any) {
  console.log('\n=== Signal summary ===');
  const self = results.probes['self-signal-check']?.data;
  if (self) {
    console.log(`webdriver:               ${self.webdriver ?? 'undefined'}  ${self.webdriver === false || self.webdriver === undefined ? 'PASS' : 'FAIL'}`);
    console.log(`plugins.length:          ${self.pluginsLength}  ${self.pluginsLength >= 3 ? 'PASS' : 'FAIL'}`);
    console.log(`chrome object:           ${self.chromeObject}  ${self.chromeObject === 'object' ? 'PASS' : 'FAIL'}`);
    console.log(`chrome.runtime:          ${self.chromeRuntime}  ${self.chromeRuntime === 'object' ? 'PASS' : 'FAIL'}`);
    console.log(`userAgentData.brands:    ${self.userAgentDataBrands ? 'present' : 'missing'}  ${self.userAgentDataBrands ? 'PASS' : 'FAIL'}`);
    console.log(`webgl vendor/renderer:   ${self.webglVendor ? 'present' : 'missing'}`);
    console.log(`timezone:                ${self.timezone}`);
    console.log(`locale:                  ${self.locale}`);
    console.log(`devicePixelRatio:        ${self.devicePixelRatio}`);
    console.log(`fn.toString cloak:       ${self.functionToStringSelfCheck?.includes('[native code]') ? 'PASS' : 'FAIL'}`);
    if (self.getWebdriverDescriptor) {
      const d = self.getWebdriverDescriptor;
      console.log(`webdriver descriptor:    get=${d.get} set=${d.set} cfg=${d.configurable} enum=${d.enumerable}`);
    }
  }
  const inc = results.probes['incolumitas-bot-detection']?.data;
  if (inc?.newTests) {
    const fails = (inc.newTests.match(/FAIL/gi) || []).length;
    const passes = (inc.newTests.match(/OK/gi) || []).length;
    console.log(`incolumitas new tests:   ${passes} pass / ${fails} fail`);
  }
  const bs = results.probes['browserscan']?.data;
  if (bs) {
    console.log(`browserscan:             robot=${bs.containsRobot} normal=${bs.containsNormal} human=${bs.containsHuman}`);
  }
  const dab = results.probes['deviceandbrowserinfo']?.data;
  if (dab) {
    console.log(`deviceandbrowserinfo:    isBot=${dab.isBot} match='${dab.isBotMatch}'`);
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
