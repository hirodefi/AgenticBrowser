/**
 * Access State Machine types.
 * Every page is classified into exactly one state.
 */

export enum AccessState {
  READABLE = 'READABLE',
  INTERACTIVE = 'INTERACTIVE',
  LOADING = 'LOADING',
  CHALLENGE_REQUIRED = 'CHALLENGE_REQUIRED',
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',
  PAYWALL_REQUIRED = 'PAYWALL_REQUIRED',
  RATE_LIMITED = 'RATE_LIMITED',
  BLOCKED = 'BLOCKED',
  BROKEN = 'BROKEN',
  REDIRECTING = 'REDIRECTING',
  UNKNOWN = 'UNKNOWN',
}

export type ChallengeType =
  | 'cloudflare_turnstile'
  | 'cloudflare_js'
  | 'cloudflare_managed'
  | 'recaptcha_v2'
  | 'recaptcha_v3'
  | 'hcaptcha'
  | 'simple_click'
  | 'unknown';

export interface AccessResult {
  state: AccessState;
  confidence: number;
  challengeType?: ChallengeType;
  canRecover: boolean;
  recommendedAction: string;
  details?: Record<string, any>;
}

export interface PageObservation {
  title: string;
  url: string;
  accessState: AccessState;
  summary: string;
  interactiveElements: InteractiveElement[];
  forms: FormInfo[];
  links: LinkInfo[];
  contentPreview: string;
  metadata: PageMetadata;
}

export interface InteractiveElement {
  id: string;
  role: string;
  text: string;
  tag: string;
  href?: string;
  placeholder?: string;
  type?: string;
  visible: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface FormInfo {
  id: string;
  action?: string;
  method?: string;
  inputs: { name: string; type: string; placeholder?: string; required: boolean }[];
}

export interface LinkInfo {
  text: string;
  href: string;
  internal: boolean;
}

export interface PageMetadata {
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonicalUrl?: string;
  author?: string;
  publishedDate?: string;
  jsonLd?: any[];
  openGraph?: Record<string, string>;
}

export interface ReadResult {
  title: string;
  content: string;
  format: 'markdown' | 'text' | 'html';
  confidence: number;
  source: string;
  wordCount: number;
  tables: TableData[];
  links: { text: string; href: string }[];
}

export interface TableData {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface ActionResult {
  success: boolean;
  description: string;
  beforeState?: string;
  afterState?: string;
  screenshot?: string;
}

export interface VerifyResult {
  verified: boolean;
  evidence: string;
  details?: Record<string, any>;
}

export interface ExtractResult {
  data: any;
  schema: string;
  count: number;
}

export interface DebugBundle {
  url: string;
  title: string;
  console: ConsoleEntry[];
  network: NetworkEntry[];
  domStats: DomStats;
  screenshot?: string;
  html?: string;
  cookies: { name: string; domain: string; value: string }[];
}

export interface ConsoleEntry {
  type: 'log' | 'warn' | 'error' | 'info';
  text: string;
  timestamp: number;
}

export interface NetworkEntry {
  url: string;
  method: string;
  status: number;
  mimeType: string;
  size: number;
  duration: number;
}

export interface DomStats {
  nodeCount: number;
  depth: number;
  iframeCount: number;
  scriptCount: number;
  stylesheetCount: number;
  imageSize: number;
}
