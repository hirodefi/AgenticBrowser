/**
 * Structured data extraction.
 * Extracts JSON-LD, OpenGraph, schema.org, meta tags.
 */

import { type Page } from 'playwright';
import { type PageMetadata } from '../state-machine/types.js';

export async function extractMetadata(page: Page): Promise<PageMetadata> {
  return page.evaluate(() => {
    function getMeta(name: string): string {
      const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return el?.getAttribute('content') || '';
    }

    function extractJsonLd(): any[] {
      const results: any[] = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        try {
          const data = JSON.parse(script.textContent || '{}');
          if (Array.isArray(data)) results.push(...data);
          else results.push(data);
        } catch {}
      });
      return results;
    }

    const meta: any = {};
    meta.description = getMeta('description');
    meta.author = getMeta('author');
    meta.publishedDate = getMeta('article:published_time') || getMeta('datePublished');
    meta.ogTitle = getMeta('og:title');
    meta.ogDescription = getMeta('og:description');
    meta.ogImage = getMeta('og:image');

    const canonical = document.querySelector('link[rel="canonical"]');
    meta.canonicalUrl = canonical?.getAttribute('href') || '';

    meta.jsonLd = extractJsonLd();

    meta.openGraph = {};
    document.querySelectorAll('meta[property^="og:"]').forEach(el => {
      const key = el.getAttribute('property')?.replace('og:', '') || '';
      const val = el.getAttribute('content') || '';
      if (key && val) meta.openGraph[key] = val;
    });

    return meta;
  });
}
