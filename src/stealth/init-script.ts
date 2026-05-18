/**
 * Stealth init script generator.
 *
 * Produces a single self-contained script that runs before any page JS,
 * applying all fingerprint overrides inside a closed scope so the page
 * can't introspect our helpers. Every override carries the property
 * descriptor shape Chrome itself uses, and every patched function is
 * registered in a toString-cloaking table so `fn.toString()` returns
 * the native source string instead of our implementation.
 *
 * Anti-detection focus: the *patches themselves* are the easiest tells
 * (wrong descriptors, leaked stack traces, fn.toString showing our code,
 * inconsistent property enumeration order). This script is built around
 * eliminating exactly those signals.
 */

import type { FingerprintProfile } from '../fingerprint/profile.js';

export function buildInitScript(p: FingerprintProfile): string {
  const data = JSON.stringify({
    ua: p.ua.ua,
    platform: p.ua.platform,
    uaPlatform: p.ua.uaPlatform,
    uaPlatformVersion: p.ua.uaPlatformVersion,
    architecture: p.ua.architecture,
    bitness: p.ua.bitness,
    fullVersion: p.ua.fullVersion,
    brands: p.ua.brands,
    languages: p.languages,
    locale: p.locale,
    hardwareConcurrency: p.hardwareConcurrency,
    deviceMemory: p.deviceMemory,
    maxTouchPoints: p.maxTouchPoints,
    screen: p.screen,
    gpu: p.gpu,
    audioNoise: p.audioNoise,
    canvasNoise: p.canvasNoise,
    fontSeed: p.fontSeed,
    timezone: p.timezone,
  });

  return `(() => {
'use strict';
const D = ${data};

// ---------- toString cloaking ----------
const nativeToString = Function.prototype.toString;
const cloaks = new WeakMap();
const applyApply = Function.prototype.apply;
const applyCall = Function.prototype.call;

function cloak(fn, name) {
  cloaks.set(fn, 'function ' + name + '() { [native code] }');
  return fn;
}

const proxiedToString = new Proxy(nativeToString, {
  apply(target, thisArg, argv) {
    if (cloaks.has(thisArg)) return cloaks.get(thisArg);
    return applyApply.call(target, thisArg, argv);
  },
});
cloaks.set(proxiedToString, 'function toString() { [native code] }');
Function.prototype.toString = proxiedToString;

// ---------- descriptor helpers ----------
function defineGetter(obj, prop, getter, name) {
  const fn = cloak(function() { return getter(); }, 'get ' + (name || prop));
  Object.defineProperty(obj, prop, {
    get: fn,
    set: undefined,
    enumerable: true,
    configurable: true,
  });
}

function replaceFn(obj, prop, impl, name) {
  const fn = cloak(impl, name || prop);
  Object.defineProperty(obj, prop, {
    value: fn,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

// ---------- automation marker removal (top priority) ----------
try {
  Object.defineProperty(Navigator.prototype, 'webdriver', {
    get: cloak(function() { return false; }, 'get webdriver'),
    set: undefined,
    enumerable: true,
    configurable: true,
  });
} catch (_) {}

// Remove inherited webdriver getter on the instance level too
try { delete Object.getPrototypeOf(navigator).webdriver; } catch (_) {}

// Driver-injected hooks (various detection libs scan for these prefixes)
const driverProps = Object.keys(window).filter(k =>
  /^(cdc_|_phantom|__nightmare|_selenium|callSelenium|driver-evaluate|webdriver-evaluate|selenium-evaluate)/i.test(k)
);
for (const k of driverProps) { try { delete window[k]; } catch (_) {} }

// ---------- navigator overrides ----------
const nav = Navigator.prototype;

defineGetter(nav, 'userAgent', () => D.ua, 'userAgent');
defineGetter(nav, 'appVersion', () => D.ua.replace(/^Mozilla\\/[\\d.]+\\s\\(/, '(').replace(/^\\(/, ''), 'appVersion');
defineGetter(nav, 'platform', () => D.platform);
defineGetter(nav, 'language', () => D.languages[0]);
defineGetter(nav, 'languages', () => Object.freeze(D.languages.slice()));
defineGetter(nav, 'hardwareConcurrency', () => D.hardwareConcurrency);
defineGetter(nav, 'deviceMemory', () => D.deviceMemory);
defineGetter(nav, 'maxTouchPoints', () => D.maxTouchPoints);
defineGetter(nav, 'vendor', () => 'Google Inc.');
defineGetter(nav, 'product', () => 'Gecko');
defineGetter(nav, 'productSub', () => '20030107');
defineGetter(nav, 'vendorSub', () => '');
defineGetter(nav, 'pdfViewerEnabled', () => true);
defineGetter(nav, 'doNotTrack', () => null);
defineGetter(nav, 'cookieEnabled', () => true);
defineGetter(nav, 'onLine', () => true);

// userAgentData (Client Hints) — coherent with UA string
if ('userAgentData' in nav || true) {
  const brands = Object.freeze(D.brands.map(b => Object.freeze({ brand: b.brand, version: b.version })));
  const uaData = {
    brands: brands,
    mobile: false,
    platform: D.uaPlatform,
    getHighEntropyValues: cloak(function(hints) {
      const out = { brands: brands, mobile: false, platform: D.uaPlatform };
      if (!Array.isArray(hints)) return Promise.resolve(out);
      if (hints.includes('architecture')) out.architecture = D.architecture;
      if (hints.includes('bitness')) out.bitness = D.bitness;
      if (hints.includes('model')) out.model = '';
      if (hints.includes('platformVersion')) out.platformVersion = D.uaPlatformVersion;
      if (hints.includes('uaFullVersion')) out.uaFullVersion = D.fullVersion;
      if (hints.includes('fullVersionList')) {
        out.fullVersionList = D.brands.map(b => ({ brand: b.brand, version: D.fullVersion }));
      }
      if (hints.includes('wow64')) out.wow64 = false;
      return Promise.resolve(out);
    }, 'getHighEntropyValues'),
    toJSON: cloak(function() { return { brands: brands, mobile: false, platform: D.uaPlatform }; }, 'toJSON'),
  };
  Object.defineProperty(nav, 'userAgentData', {
    get: cloak(() => uaData, 'get userAgentData'),
    set: undefined,
    enumerable: true,
    configurable: true,
  });
}

// ---------- plugins / mimeTypes (Chrome ships a fixed PDF viewer plugin set) ----------
const mimeProto = window.MimeType && MimeType.prototype;
const pluginProto = window.Plugin && Plugin.prototype;

function makeMime(type, suffixes, desc) {
  const m = Object.create(mimeProto || {});
  Object.defineProperties(m, {
    type: { value: type, enumerable: true },
    suffixes: { value: suffixes, enumerable: true },
    description: { value: desc, enumerable: true },
    enabledPlugin: { value: null, enumerable: true, writable: true },
  });
  return m;
}
function makePlugin(name, desc, filename, mimes) {
  const pl = Object.create(pluginProto || {});
  Object.defineProperties(pl, {
    name: { value: name, enumerable: true },
    description: { value: desc, enumerable: true },
    filename: { value: filename, enumerable: true },
    length: { value: mimes.length, enumerable: true },
  });
  mimes.forEach((m, i) => { pl[i] = m; m.enabledPlugin = pl; });
  return pl;
}

const pdfMime = makeMime('application/pdf', 'pdf', 'Portable Document Format');
const pdfMime2 = makeMime('text/pdf', 'pdf', 'Portable Document Format');
const plugins = [
  makePlugin('PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer', [pdfMime, pdfMime2]),
  makePlugin('Chrome PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer', [pdfMime, pdfMime2]),
  makePlugin('Chromium PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer', [pdfMime, pdfMime2]),
  makePlugin('Microsoft Edge PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer', [pdfMime, pdfMime2]),
  makePlugin('WebKit built-in PDF', 'Portable Document Format', 'internal-pdf-viewer', [pdfMime, pdfMime2]),
];

const pluginArray = Object.create(PluginArray.prototype || {});
plugins.forEach((p, i) => { pluginArray[i] = p; pluginArray[p.name] = p; });
Object.defineProperty(pluginArray, 'length', { value: plugins.length, enumerable: true });
replaceFn(pluginArray, 'item', function(i) { return plugins[i] || null; });
replaceFn(pluginArray, 'namedItem', function(n) { return plugins.find(p => p.name === n) || null; });
replaceFn(pluginArray, 'refresh', function() {});

const mimeArray = Object.create(MimeTypeArray.prototype || {});
const allMimes = [pdfMime, pdfMime2];
allMimes.forEach((m, i) => { mimeArray[i] = m; mimeArray[m.type] = m; });
Object.defineProperty(mimeArray, 'length', { value: allMimes.length, enumerable: true });
replaceFn(mimeArray, 'item', function(i) { return allMimes[i] || null; });
replaceFn(mimeArray, 'namedItem', function(n) { return allMimes.find(m => m.type === n) || null; });

defineGetter(nav, 'plugins', () => pluginArray);
defineGetter(nav, 'mimeTypes', () => mimeArray);

// ---------- screen ----------
const scr = D.screen;
defineGetter(Screen.prototype, 'width', () => scr.width);
defineGetter(Screen.prototype, 'height', () => scr.height);
defineGetter(Screen.prototype, 'availWidth', () => scr.availWidth);
defineGetter(Screen.prototype, 'availHeight', () => scr.availHeight);
defineGetter(Screen.prototype, 'availLeft', () => 0);
defineGetter(Screen.prototype, 'availTop', () => 0);
defineGetter(Screen.prototype, 'colorDepth', () => scr.colorDepth);
defineGetter(Screen.prototype, 'pixelDepth', () => scr.pixelDepth);

try {
  Object.defineProperty(window, 'devicePixelRatio', {
    get: cloak(() => scr.pixelRatio, 'get devicePixelRatio'),
    configurable: true,
  });
} catch (_) {}

// ---------- window.chrome ----------
if (!window.chrome) window.chrome = {};
const startNow = Date.now() / 1000;
const chromeObj = window.chrome;
if (!chromeObj.runtime) {
  chromeObj.runtime = {
    OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
    OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
    PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
    PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
    PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
    RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
    connect: cloak(() => undefined, 'connect'),
    sendMessage: cloak(() => undefined, 'sendMessage'),
    id: undefined,
  };
}
chromeObj.loadTimes = cloak(function() {
  return {
    commitLoadTime: startNow - 0.3,
    connectionInfo: 'h2',
    finishDocumentLoadTime: startNow - 0.1,
    finishLoadTime: startNow,
    firstPaintAfterLoadTime: 0,
    firstPaintTime: startNow - 0.2,
    navigationType: 'Other',
    npnNegotiatedProtocol: 'h2',
    requestTime: startNow - 0.5,
    startLoadTime: startNow - 0.5,
    wasAlternateProtocolAvailable: false,
    wasFetchedViaSpdy: true,
    wasNpnNegotiated: true,
  };
}, 'loadTimes');
chromeObj.csi = cloak(function() {
  return { onloadT: Date.now(), startE: Date.now() - 500, pageT: 200 + Math.random() * 300, tran: 15 };
}, 'csi');
chromeObj.app = {
  isInstalled: false,
  InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
  RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
  getDetails: cloak(() => null, 'getDetails'),
  getIsInstalled: cloak(() => false, 'getIsInstalled'),
};

// ---------- permissions (Notification quirk) ----------
const origQuery = window.Notification && Notification.permission;
if (navigator.permissions && navigator.permissions.query) {
  const origPermQuery = navigator.permissions.query.bind(navigator.permissions);
  replaceFn(Permissions.prototype, 'query', function(params) {
    if (params && params.name === 'notifications') {
      return Promise.resolve({ state: origQuery || 'default', name: 'notifications', onchange: null });
    }
    return origPermQuery(params);
  });
}

// ---------- WebGL (vendor / renderer / unmasked + small parameter noise) ----------
function patchGL(proto) {
  if (!proto || !proto.getParameter) return;
  const orig = proto.getParameter;
  replaceFn(proto, 'getParameter', function(param) {
    if (param === 0x9245) return D.gpu.unmaskedVendor;        // UNMASKED_VENDOR_WEBGL
    if (param === 0x9246) return D.gpu.unmaskedRenderer;      // UNMASKED_RENDERER_WEBGL
    if (param === 0x1F00) return D.gpu.vendor;                // VENDOR
    if (param === 0x1F01) return D.gpu.renderer;              // RENDERER
    return orig.call(this, param);
  });
  if (proto.getSupportedExtensions) {
    const origExt = proto.getSupportedExtensions;
    replaceFn(proto, 'getSupportedExtensions', function() {
      return origExt.call(this);
    });
  }
}
patchGL(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
patchGL(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);

// ---------- Canvas (per-pixel noise, deterministic from seed) ----------
const canvasNoise = D.canvasNoise;
function noisify(canvas, ctx) {
  try {
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return;
    const data = ctx.getImageData(0, 0, w, h);
    const buf = data.data;
    let seed = (D.fontSeed * 2654435761) >>> 0;
    for (let i = 0; i < buf.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      if ((seed & 0xff) < 8) {
        buf[i]   = Math.max(0, Math.min(255, buf[i]   ^ (seed & 1)));
        buf[i+1] = Math.max(0, Math.min(255, buf[i+1] ^ ((seed >> 1) & 1)));
        buf[i+2] = Math.max(0, Math.min(255, buf[i+2] ^ ((seed >> 2) & 1)));
      }
    }
    ctx.putImageData(data, 0, 0);
  } catch (_) {}
}

if (window.HTMLCanvasElement) {
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  replaceFn(HTMLCanvasElement.prototype, 'toDataURL', function(...args) {
    const ctx = this.getContext('2d');
    if (ctx) noisify(this, ctx);
    return origToDataURL.apply(this, args);
  });
  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  if (origToBlob) {
    replaceFn(HTMLCanvasElement.prototype, 'toBlob', function(...args) {
      const ctx = this.getContext('2d');
      if (ctx) noisify(this, ctx);
      return origToBlob.apply(this, args);
    });
  }
}
if (window.CanvasRenderingContext2D) {
  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  replaceFn(CanvasRenderingContext2D.prototype, 'getImageData', function(...args) {
    const data = origGetImageData.apply(this, args);
    const buf = data.data;
    let seed = (D.fontSeed * 2246822519) >>> 0;
    for (let i = 0; i < buf.length; i += 4) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      if ((seed & 0xff) < 6) {
        buf[i]   ^= (seed & 1);
        buf[i+1] ^= ((seed >> 1) & 1);
        buf[i+2] ^= ((seed >> 2) & 1);
      }
    }
    return data;
  });
}

// ---------- Audio (subtle scaling on output buffers) ----------
const audioFactor = D.audioNoise;
if (window.AudioBuffer) {
  const origGetChannelData = AudioBuffer.prototype.getChannelData;
  replaceFn(AudioBuffer.prototype, 'getChannelData', function(...args) {
    const data = origGetChannelData.apply(this, args);
    if (data && data.length) {
      for (let i = 0; i < data.length; i += 100) data[i] = data[i] * audioFactor;
    }
    return data;
  });
}
if (window.AnalyserNode) {
  const origGetFloat = AnalyserNode.prototype.getFloatFrequencyData;
  replaceFn(AnalyserNode.prototype, 'getFloatFrequencyData', function(arr) {
    origGetFloat.call(this, arr);
    for (let i = 0; i < arr.length; i += 50) arr[i] = arr[i] * audioFactor;
  });
}

// ---------- WebRTC IP scrubbing (don't leak local IPs through ICE) ----------
if (window.RTCPeerConnection) {
  const origCreate = RTCPeerConnection.prototype.createOffer;
  replaceFn(RTCPeerConnection.prototype, 'createOffer', function(...args) {
    return origCreate.apply(this, args);
  });
  const proto = RTCPeerConnection.prototype;
  const origSetLocal = proto.setLocalDescription;
  replaceFn(proto, 'setLocalDescription', function(desc) {
    if (desc && typeof desc.sdp === 'string') {
      desc.sdp = desc.sdp.replace(/\\r\\na=candidate:[^\\r]*typ host[^\\r]*/g, '');
    }
    return origSetLocal.call(this, desc);
  });
}

// ---------- Battery API removal (high entropy, not present in modern Chrome) ----------
try { delete Navigator.prototype.getBattery; } catch (_) {}

// ---------- Connection (NetworkInformation) ----------
if ('connection' in nav) {
  const conn = {
    effectiveType: '4g',
    rtt: 50 + ((D.fontSeed % 30) | 0),
    downlink: 10,
    saveData: false,
    type: 'wifi',
  };
  defineGetter(nav, 'connection', () => conn);
}

// ---------- Final consistency check: re-cloak any function still observable ----------
// Permissions.prototype.query was redefined above; re-register
try {
  if (Permissions.prototype && Permissions.prototype.query) {
    cloak(Permissions.prototype.query, 'query');
  }
} catch (_) {}

})();`;
}
