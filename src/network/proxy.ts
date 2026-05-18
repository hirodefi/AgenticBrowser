/**
 * Proxy URL parsing and routing.
 *
 * Accepts the four common shapes and normalizes them for Playwright + Chrome:
 *   - "host:port"
 *   - "user:pass@host:port"
 *   - "http(s)://[user:pass@]host:port"
 *   - "socks5://[user:pass@]host:port"
 *
 * SOCKS5 with auth cannot go through Playwright's proxy field (Chromium
 * rejects it). We route SOCKS5 via --proxy-server CLI arg and re-encode
 * credentials so Chromium's parser doesn't truncate at special chars.
 */

export interface ProxyDict {
  server: string;
  bypass?: string;
  username?: string;
  password?: string;
}

export type ProxyInput = string | ProxyDict;

export interface ResolvedProxy {
  playwrightProxy?: ProxyDict;
  chromeArgs: string[];
  hostname?: string;
}

const SOCKS_RE = /^socks5h?:\/\//i;

export function isSocks(input: ProxyInput | undefined | null): boolean {
  if (!input) return false;
  const s = typeof input === 'string' ? input : input.server;
  return SOCKS_RE.test(s);
}

function ensureScheme(s: string): string {
  return s.includes('://') ? s : `http://${s}`;
}

export function parseUrl(input: string): ProxyDict {
  const normalized = input.includes('@') && !input.includes('://') ? `http://${input}` : input;
  let url: URL;
  try { url = new URL(normalized); }
  catch { return { server: input }; }

  if (!url.username) {
    return { server: input.includes('://') ? input : `http://${input}` };
  }

  const server = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
  const result: ProxyDict = { server, username: decodeURIComponent(url.username) };
  if (url.password) result.password = decodeURIComponent(url.password);
  return result;
}

export function reencodeSocksUrl(input: string): string {
  const m = input.match(/^([a-z][a-z0-9+\-.]*):\/\/(.*)$/i);
  if (!m) return input;
  const [, scheme, rest] = m;
  const tailIdx = rest.search(/[/?#]/);
  const authority = tailIdx === -1 ? rest : rest.slice(0, tailIdx);
  const suffix = tailIdx === -1 ? '' : rest.slice(tailIdx);
  const at = authority.lastIndexOf('@');
  if (at === -1) return input;
  const userinfo = authority.slice(0, at);
  const host = authority.slice(at + 1);
  const colon = userinfo.indexOf(':');
  const user = colon === -1 ? userinfo : userinfo.slice(0, colon);
  const hasPass = colon !== -1;
  const pass = hasPass ? userinfo.slice(colon + 1) : '';
  const encUser = user ? encodeURIComponent(decodeURIComponent(user)) : '';
  const encPass = hasPass ? (pass ? encodeURIComponent(decodeURIComponent(pass)) : '') : null;
  const ui = encPass === null
    ? (encUser ? `${encUser}@` : '')
    : `${encUser}:${encPass}@`;
  return `${scheme}://${ui}${host}${suffix}`;
}

export function resolveProxy(input: ProxyInput | undefined): ResolvedProxy {
  if (!input) return { chromeArgs: [] };
  let hostname: string | undefined;
  try { hostname = new URL(ensureScheme(typeof input === 'string' ? input : input.server)).hostname; } catch {}

  if (isSocks(input)) {
    if (typeof input === 'string') {
      return { chromeArgs: [`--proxy-server=${reencodeSocksUrl(input)}`], hostname };
    }
    const u = new URL(input.server);
    if (input.username) {
      u.username = encodeURIComponent(input.username);
      if (input.password) u.password = encodeURIComponent(input.password);
    }
    const args = [`--proxy-server=${u.href.replace(/\/$/, '')}`];
    if (input.bypass) args.push(`--proxy-bypass-list=${input.bypass}`);
    return { chromeArgs: args, hostname };
  }

  const dict = typeof input === 'string' ? parseUrl(input) : input;
  return { playwrightProxy: dict, chromeArgs: [], hostname };
}
