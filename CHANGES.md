# Changes & Fixes

## Bug Fixes

### Metadata extraction was always broken
`extractMetadata` in `src/reading/structured-data.ts` called `getMeta()` and `extractJsonLd()` inside a `page.evaluate()` callback. These were TypeScript module-level functions that reference `document`. Playwright serializes only the callback body when sending code to the browser — outer scope functions are not included. Every call threw `ReferenceError: getMeta is not defined` in the browser context. Fixed by moving both functions inside the evaluate callback where they belong.

### Two of four content extraction methods always returned empty
`extractFromMainContent` and `extractFromBody` in `src/reading/engine.ts` called `cleanHtml()` inside `page.evaluate()` blocks. The function was only declared as a TypeScript ambient declaration (`declare function cleanHtml`) — it never existed in browser scope. Both methods caught the resulting `ReferenceError` silently and returned empty strings on every call. The reading engine was effectively running on half its extraction pipeline. Fixed by defining `cleanHtml` properly inside each evaluate block.

### CDP stealth was sending wrong user agent to every request
`applyCDPStealth` in `src/core/stealth.ts` had this line:
```
userAgent: '${defaultUserAgent}',
```
Single quotes, not backticks. The browser protocol received the literal string `${defaultUserAgent}` instead of the actual user agent value. Every page request went out with a broken UA string, undermining the stealth setup. Fixed by removing the quotes so the imported constant is used directly.

### avgLoadTime rolling average was doubling a value before dividing
`recordSiteSuccess` in `src/cache/store.ts` computed:
```
Math.round((existing.avgLoadTime || loadTime + loadTime) / 2)
```
Operator precedence meant `loadTime + loadTime` was evaluated before the `||`, so when `avgLoadTime` was falsy, it used `loadTime * 2` as the fallback. Fixed with explicit parentheses:
```
Math.round(((existing.avgLoadTime || loadTime) + loadTime) / 2)
```

---

## Performance Improvements

### Content cache was never used
`src/cache/store.ts` had a full SQLite-backed content cache with `getCachedContent` and `setCachedContent` — but `readPage` in `src/reading/engine.ts` never called either function. Every read was a cold extraction regardless of whether the same URL had been read recently. Wired in cache lookup at the start of `readPage` and cache storage after a successful extraction (threshold: confidence > 0.3 and content length > 100 chars). Default TTL is 1 hour.

### Forms and links in observe ran sequentially instead of in parallel
`observePage` in `src/commands/observe.ts` ran `classifyAccessState`, `getAccessibilityTree`, and `getPageSummary` in parallel via `Promise.all`, then awaited `extractForms` and `extractPageLinks` sequentially afterward. Both of those are independent DOM queries with no dependencies on the parallel results. Moved them into the initial `Promise.all` — they now run alongside the other queries instead of after them.

### Type action typed character by character
The `type` case in `src/interaction/actions.ts` iterated over each character with a random 50–130ms delay per keystroke. Typing a 20-character value took up to 2.6 seconds. Replaced with `el.fill(value)` which completes instantly. The stealth concern this was solving (human-like input timing) is better handled at the browser profile and CDP level — character delays on internal interactions add latency without meaningful stealth benefit.

### DOM depth traversal was recursive and could stack overflow
`getDomStats` in `src/commands/debug.ts` used recursive depth-first traversal to calculate DOM depth. On pages with deeply nested structures this would hit JavaScript's call stack limit and throw. Replaced with an iterative stack-based traversal.

### Console entry collection was always empty
`getConsoleEntries` in `src/commands/debug.ts` set up a CDP `Log.entryAdded` event listener and then immediately returned `entries` — which was still empty since no events had fired yet. The async listener would have populated it later, but the function had already returned. Replaced with synchronous DOM-based collection of visible error and warning elements on the page, which actually returns data.

### Unused CDP session in network entry collection
`getNetworkEntries` created a CDP session (`const cdp = ...`) and never used it. Removed.

### URL hash collisions in cache
`hashUrl` in `src/cache/store.ts` used a 32-bit djb2-style hash. With a 32-bit output space, the birthday problem gives roughly 50% collision probability after ~65,000 URLs — enough to corrupt cached content. Replaced with SHA-256 truncated to 16 hex characters (64 bits), which gives negligible collision probability in practice.
