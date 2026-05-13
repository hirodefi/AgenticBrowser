/**
 * Structured data extraction.
 * Extracts JSON-LD, OpenGraph, schema.org, meta tags.
 */

import { type Page } from 'playwright';
import { type PageMetadata } from '../state-machine/types.js';

export async function extractMetadata(page: Page): Promise<PageMetadata> {
  return page.evaluate(() => {
    const meta: any = {};

    // Standard meta tags
    meta.description = getMeta('description');
    meta.author = getMeta('author');
    meta.publishedDate = getMeta('article:published_time') || getMeta('datePublished');

    // OpenGraph
    meta.ogTitle = getMeta('og:title');
    meta.ogDescription = getMeta('og:description');
    meta.ogImage = getMeta('og:image');

    // Canonical URL
    const canonical = document.querySelector('link[rel="canonical"]');
    meta.canonicalUrl = canonical?.getAttribute('href') || '';

    // JSON-LD
    meta.jsonLd = extractJsonLd();

    // OpenGraph as map
    meta.openGraph = {};
    document.querySelectorAll('meta[property^="og:"]').forEach(el => {
      const key = el.getAttribute('property')?.replace('og:', '') || '';
      const val = el.getAttribute('content') || '';
      if (key && val) meta.openGraph[key] = val;
    });

    return meta;
  });
}

function getMeta(name: string): string {
  const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
  return el?.getAttribute('content') || '';
}

function extractJsonLd(): any[] {
  const results: any[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent || '{}');
      if (Array.isArray(data)) {
        results.push(...data);
      } else {
        results.push(data);
      }
    } catch {}
  });
  return results;
}
