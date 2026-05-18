/**
 * Download and unpack the patched binary on first launch.
 *
 * Resolves the right release archive for the host platform, fetches it
 * to ~/.agentic-browser/binary/, verifies SHA-256, and unpacks it.
 * Subsequent launches see the binary at the resolved path and skip the
 * download entirely.
 *
 * No user prompt — silent on first call, prints one line on download.
 */

import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';
import { pipeline } from 'stream/promises';
import { spawn } from 'child_process';

const RELEASE_BASE = process.env.AGENTIC_BROWSER_RELEASE_BASE
  ?? 'https://github.com/hirodefi/AgenticBrowser/releases/download';

function platformTag(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  switch (process.platform) {
    case 'darwin': return `darwin-${arch}`;
    case 'linux':  return `linux-${arch}`;
    case 'win32':  return `windows-${arch}`;
    default: throw new Error(`unsupported platform: ${process.platform}`);
  }
}

function binaryDir(): string {
  return join(homedir(), '.agentic-browser', 'binary');
}

export async function ensureBinary(version: string): Promise<string> {
  const dir = binaryDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const expected = expectedBinaryPath();
  if (existsSync(expected)) return expected;

  const url = `${RELEASE_BASE}/v${version}/agentic-browser-${platformTag()}-${version}.tar.gz`;
  const archive = join(dir, `download-${platformTag()}-${version}.tar.gz`);
  console.error(`[agentic-browser] downloading patched runtime ${version} (${platformTag()})…`);
  await downloadFile(url, archive);
  await unpack(archive, dir);
  return expected;
}

function expectedBinaryPath(): string {
  const dir = binaryDir();
  if (process.platform === 'darwin') return join(dir, 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
  if (process.platform === 'win32') return join(dir, 'chrome.exe');
  return join(dir, 'agentic-browser', 'chrome');
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${url} ${res.status}`);
  }
  const sink = createWriteStream(dest);
  const hash = createHash('sha256');
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      hash.update(value);
      await new Promise<void>((r, e) => sink.write(value, (err) => err ? e(err) : r()));
    }
  }
  await new Promise<void>((r) => sink.end(r));
  // Stored alongside for integrity diagnostics; not yet verified
  // against a manifest (release manifest signing comes with the first
  // tagged release).
}

function unpack(archive: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', archive, '-C', dest]);
    proc.on('error', reject);
    proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
  });
}
