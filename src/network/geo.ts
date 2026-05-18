/**
 * Resolve timezone and locale from a proxy's exit IP.
 *
 * Calls a free public IP geolocation API. Cached per-IP for the process
 * lifetime. Used to make timezone/locale match the proxy's apparent country
 * so a US-targeted site doesn't see a US IP from a Tokyo timezone.
 *
 * Defaults to a no-op when no proxy is configured.
 */

import { lookup as dnsLookup } from 'dns/promises';
import type { ProxyInput } from './proxy.js';

export interface GeoResult {
  timezone?: string;
  locale?: string;
  exitIp?: string;
  countryCode?: string;
}

const COUNTRY_LOCALE: Record<string, string> = {
  US: 'en-US', GB: 'en-GB', AU: 'en-AU', CA: 'en-CA', NZ: 'en-NZ', IE: 'en-IE',
  DE: 'de-DE', AT: 'de-AT', CH: 'de-CH',
  FR: 'fr-FR', BE: 'fr-BE',
  ES: 'es-ES', MX: 'es-MX', AR: 'es-AR',
  BR: 'pt-BR', PT: 'pt-PT',
  IT: 'it-IT', NL: 'nl-NL',
  JP: 'ja-JP', KR: 'ko-KR', CN: 'zh-CN', TW: 'zh-TW',
  RU: 'ru-RU', PL: 'pl-PL', SE: 'sv-SE', NO: 'nb-NO', DK: 'da-DK', FI: 'fi-FI',
  IN: 'hi-IN', ID: 'id-ID', TH: 'th-TH', VN: 'vi-VN', PH: 'en-PH',
  TR: 'tr-TR', IL: 'he-IL', SA: 'ar-SA', AE: 'ar-AE',
};

const cache = new Map<string, GeoResult>();

async function resolveHostIp(hostname: string): Promise<string | undefined> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return hostname;
  try {
    const { address } = await dnsLookup(hostname);
    return address;
  } catch { return undefined; }
}

async function fetchGeo(ip: string, timeoutMs: number): Promise<GeoResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,timezone,query`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; countryCode?: string; timezone?: string; query?: string };
    if (data.status !== 'success') return null;
    return {
      timezone: data.timezone,
      locale: data.countryCode ? COUNTRY_LOCALE[data.countryCode] : undefined,
      exitIp: data.query ?? ip,
      countryCode: data.countryCode,
    };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export async function geoFromProxy(
  proxy: ProxyInput | undefined,
  opts: { timeoutMs?: number } = {},
): Promise<GeoResult> {
  if (!proxy) return {};
  const hostname = typeof proxy === 'string'
    ? safeUrlHost(proxy)
    : safeUrlHost(proxy.server);
  if (!hostname) return {};
  if (cache.has(hostname)) return cache.get(hostname)!;
  const ip = await resolveHostIp(hostname);
  if (!ip) return {};
  const result = await fetchGeo(ip, opts.timeoutMs ?? 5000) ?? { exitIp: ip };
  cache.set(hostname, result);
  return result;
}

function safeUrlHost(s: string): string | undefined {
  const normalized = s.includes('://') ? s : `http://${s}`;
  try { return new URL(normalized).hostname; } catch { return undefined; }
}
