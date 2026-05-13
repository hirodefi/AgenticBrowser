/**
 * Stealth patches injected before any page loads.
 * Makes the browser indistinguishable from a real human browser.
 */

// All patches bundled into one init script for performance
export const stealthInitScript = `
// === LAYER 1: Remove automation markers ===

// navigator.webdriver — the #1 detection vector
Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
  configurable: true,
});

// === LAYER 2: Chrome object simulation ===

if (!window.chrome) {
  window.chrome = {};
}

window.chrome.runtime = {
  connect: function() {},
  sendMessage: function() {},
  onMessage: { addListener: function() {} },
  id: undefined,
};

window.chrome.loadTimes = function() {
  return {
    commitLoadTime: Date.now() / 1000,
    connectionInfo: 'h2',
    finishDocumentLoadTime: Date.now() / 1000 - 0.1,
    finishLoadTime: Date.now() / 1000,
    firstPaintAfterLoadTime: 0,
    firstPaintTime: Date.now() / 1000 - 0.2,
    navigationType: 'Other',
    npnNegotiatedProtocol: 'h2',
    requestTime: Date.now() / 1000 - 0.5,
    startLoadTime: Date.now() / 1000 - 0.5,
    wasAlternateProtocolAvailable: false,
    wasFetchedViaSpdy: true,
    wasNpnNegotiated: true,
  };
};

window.chrome.csi = function() {
  return {
    onloadT: Date.now(),
    startE: Date.now() - 500,
    pageT: 500 + Math.random() * 100,
    tran: 15,
  };
};

window.chrome.app = {
  isInstalled: false,
  InstallState: {
    DISABLED: 'disabled',
    INSTALLED: 'installed',
    NOT_INSTALLED: 'not_installed',
  },
  RunningState: {
    CANNOT_RUN: 'cannot_run',
    READY_TO_RUN: 'ready_to_run',
    RUNNING: 'running',
  },
};

// === LAYER 3: Permissions API ===

const origPermQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
window.navigator.permissions.query = function(parameters) {
  if (parameters.name === 'notifications') {
    return Promise.resolve({ state: Notification.permission });
  }
  return origPermQuery(parameters);
};

// === LAYER 4: Plugins (mimic real Chrome) ===

Object.defineProperty(navigator, 'plugins', {
  get: function() {
    const plugins = [
      Object.create(Plugin.prototype, {
        name: { value: 'Chrome PDF Plugin', enumerable: true },
        description: { value: 'Portable Document Format', enumerable: true },
        filename: { value: 'internal-pdf-viewer', enumerable: true },
        length: { value: 1, enumerable: true },
      }),
      Object.create(Plugin.prototype, {
        name: { value: 'Chrome PDF Viewer', enumerable: true },
        description: { value: '', enumerable: true },
        filename: { value: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', enumerable: true },
        length: { value: 1, enumerable: true },
      }),
      Object.create(Plugin.prototype, {
        name: { value: 'Native Client', enumerable: true },
        description: { value: '', enumerable: true },
        filename: { value: 'internal-nacl-plugin', enumerable: true },
        length: { value: 2, enumerable: true },
      }),
    ];
    return plugins;
  },
  configurable: true,
});

// === LAYER 5: MIME types ===

Object.defineProperty(navigator, 'mimeTypes', {
  get: function() {
    return [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
      { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' },
    ];
  },
  configurable: true,
});

// === LAYER 6: Hardware properties ===

Object.defineProperty(navigator, 'hardwareConcurrency', {
  get: () => 8,
  configurable: true,
});

Object.defineProperty(navigator, 'deviceMemory', {
  get: () => 8,
  configurable: true,
});

Object.defineProperty(navigator, 'languages', {
  get: () => ['en-US', 'en'],
  configurable: true,
});

Object.defineProperty(navigator, 'platform', {
  get: () => 'Win32',
  configurable: true,
});

Object.defineProperty(navigator, 'maxTouchPoints', {
  get: () => 0,
  configurable: true,
});

// === LAYER 7: WebGL fingerprint ===

const getParameterOrig = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(param) {
  if (param === 37445) return 'Google Inc. (Intel)';
  if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
  return getParameterOrig.call(this, param);
};

const getParameter2Orig = WebGL2RenderingContext.prototype.getParameter;
WebGL2RenderingContext.prototype.getParameter = function(param) {
  if (param === 37445) return 'Google Inc. (Intel)';
  if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
  return getParameter2Orig.call(this, param);
};

// === LAYER 8: Fix toString for patched functions ===

const nativeToString = Function.prototype.toString;
const patchedFunctions = new WeakMap();

Function.prototype.toString = function() {
  if (patchedFunctions.has(this)) {
    return patchedFunctions.get(this);
  }
  return nativeToString.call(this);
};

// Mark our patches as native
patchedFunctions.set(window.chrome.loadTimes, 'function loadTimes() { [native code] }');
patchedFunctions.set(window.chrome.csi, 'function csi() { [native code] }');
patchedFunctions.set(
  window.navigator.permissions.query,
  'function query() { [native code] }'
);

// === LAYER 9: Remove automation-related properties ===

delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

// === LAYER 10: Fix iframe contentWindow detection ===

const origAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function() {
  return origAttachShadow.apply(this, arguments);
};

// Prevent detection via console.debug stripping
const origDebug = console.debug;
console.debug = function() {
  return origDebug.apply(console, arguments);
};

// Fix Notification permission in headless
if (Notification.permission === 'denied') {
  Object.defineProperty(Notification, 'permission', {
    get: () => 'default',
    configurable: true,
  });
}
`;

/**
 * Chrome launch arguments for stealth
 */
export const stealthArgs: string[] = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-infobars',
  '--disable-breakpad',
  '--disable-hang-monitor',
  '--disable-prompt-on-repost',
  '--disable-client-side-phishing-detection',
  '--disable-domain-reliability',
  '--disable-sync',
  '--metrics-recording-only',
  '--no-service-autorun',
  '--password-store=basic',
  '--use-mock-keychain',
  '--window-size=1920,1080',
];

/**
 * Default Chrome args that must be ignored
 */
export const ignoreDefaultArgs: string[] = [
  '--enable-automation',
  '--enable-blink-features=IdleDetection',
];

/**
 * Realistic user agent (matches Chrome on Windows)
 */
export const defaultUserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

/**
 * CDP commands to remove webdriver flag at protocol level
 */
export async function applyCDPStealth(cdp: any): Promise<void> {
  // Remove navigator.webdriver via CDP
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
    `,
  });

  // Override navigator.platform, languages via CDP
  await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' });
  await cdp.send('Network.setUserAgentOverride', {
    userAgent: '${defaultUserAgent}',
    platform: 'Win32',
    userAgentMetadata: {
      brands: [
        { brand: 'Chromium', version: '136' },
        { brand: 'Google Chrome', version: '136' },
        { brand: 'Not-A.Brand', version: '99' },
      ],
      fullVersion: '136.0.0.0',
      platform: 'Windows',
      platformVersion: '15.0.0',
      architecture: 'x86',
      model: '',
      mobile: false,
    },
  });
}
