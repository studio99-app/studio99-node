/**
 * Official Node.js client for the Studio99 Indic Typography API.
 * https://studio99.app/developers/docs
 *
 * Server-side only: your API key must never reach a browser.
 */

import type {
  Capabilities, ErrorCode, FontsQuery, FontsResponse, GenerateRequest, GenerateResponse, Health,
  LibraryDownload, LibraryItemDetail, LibraryRenderSvg, LibrarySearchQuery, LibrarySearchResponse,
  RateLimit, RenderRequest, RenderResponse, Studio99Response, Usage,
} from './types.js';

export * from './types.js';

export const VERSION = '0.1.0';
const DEFAULT_BASE_URL = 'https://studio99.app/api/v1';

export interface Studio99Options {
  /** Defaults to process.env.STUDIO99_API_KEY. */
  apiKey?: string;
  baseUrl?: string;
  /** Per-request timeout. Default 60 000 ms (generation can take several seconds). */
  timeoutMs?: number;
  /**
   * Automatic retries. Default 2. Retried: 429 RATE_LIMIT_EXCEEDED (the request was not
   * processed, so nothing was charged), and for GET requests also network errors and 502-504.
   * A POST that may have reached the engine is never retried, so you are never charged twice.
   */
  maxRetries?: number;
  /** Custom fetch (tests, proxies). Defaults to the global fetch. */
  fetch?: typeof fetch;
  /**
   * The client refuses to run in a browser, because that would expose your key.
   * Set this only if the key is a throwaway you are happy to publish.
   */
  dangerouslyAllowBrowser?: boolean;
}

export class Studio99Error extends Error {
  readonly code: ErrorCode;
  /** HTTP status, or 0 for network and timeout errors. */
  readonly status: number;
  readonly rateLimit?: RateLimit;

  constructor(message: string, code: ErrorCode, status: number, rateLimit?: RateLimit) {
    super(message);
    this.name = 'Studio99Error';
    this.code = code;
    this.status = status;
    this.rateLimit = rateLimit;
  }
}

type Query = Record<string, string | number | undefined>;
type Envelope<T> = { success?: boolean; data?: T; usage?: Usage; error?: { code?: string; message?: string } };

export class Studio99 {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  /** Ready-made artworks. */
  readonly library = {
    /** Free read. */
    search: (query: LibrarySearchQuery = {}): Promise<Studio99Response<LibrarySearchResponse>> =>
      this.request('GET', '/library/search', { query: query as Query }),
    /** Free read. `id` may be the id, shortId or slug. */
    get: (id: string): Promise<Studio99Response<LibraryItemDetail>> =>
      this.request('GET', `/library/${encodeURIComponent(id)}`),
    /** 1 credit. Returns a signed URL valid for 5 minutes. */
    download: (id: string, format: 'PNG' | 'JPG' | 'SVG' = 'PNG'): Promise<Studio99Response<LibraryDownload>> =>
      this.request('GET', `/library/${encodeURIComponent(id)}/download`, { query: { format } }),
    /** 1 credit. Only for artworks whose detail has `canRenderSvg: true`. */
    renderSvg: (id: string): Promise<Studio99Response<LibraryRenderSvg>> =>
      this.request('GET', `/library/${encodeURIComponent(id)}/render-svg`),
  };

  constructor(options: Studio99Options = {}) {
    if (typeof (globalThis as { window?: unknown }).window !== 'undefined' && !options.dangerouslyAllowBrowser) {
      throw new Error(
        'Studio99: this client runs on the server only. Calling the API from a browser would expose your API key. ' +
          'Call it from your backend (an API route or server action) instead.',
      );
    }
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const apiKey = options.apiKey ?? env?.STUDIO99_API_KEY;
    if (!apiKey) {
      throw new Error('Studio99: missing API key. Pass { apiKey } or set STUDIO99_API_KEY.');
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) throw new Error('Studio99: no fetch available. Use Node 18+ or pass { fetch }.');
  }

  /** Styled calligraphy variants of a phrase. 1 credit per variant returned. */
  generate(body: GenerateRequest): Promise<Studio99Response<GenerateResponse>> {
    return this.request('POST', '/generate', { body });
  }

  /** The phrase in one exact font. Deterministic. 1 credit. */
  render(body: RenderRequest): Promise<Studio99Response<RenderResponse>> {
    return this.request('POST', '/render', { body });
  }

  /** The curated font slate. Free read. */
  fonts(query: FontsQuery = {}): Promise<Studio99Response<FontsResponse>> {
    return this.request('GET', '/fonts', { query: query as Query });
  }

  /** Languages, formats and vocabularies. Never metered. */
  capabilities(): Promise<Studio99Response<Capabilities>> {
    return this.request('GET', '/capabilities');
  }

  /** Never metered. */
  health(): Promise<Studio99Response<Health>> {
    return this.request('GET', '/health', { unwrapped: true });
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    opts: { query?: Query; body?: unknown; unwrapped?: boolean } = {},
  ): Promise<Studio99Response<T>> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const idempotent = method === 'GET';

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < this.maxRetries;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: {
            'X-API-Key': this.apiKey,
            Accept: 'application/json',
            'User-Agent': `studio99-node/${VERSION}`,
            ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (idempotent && canRetry) {
          await sleep(backoff(attempt));
          continue;
        }
        const timedOut = (err as Error)?.name === 'AbortError';
        throw new Studio99Error(
          timedOut ? `Request timed out after ${this.timeoutMs} ms` : `Network error: ${(err as Error)?.message}`,
          timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
          0,
        );
      }
      clearTimeout(timer);

      const rateLimit = readRateLimit(res.headers);
      const json = (await res.json().catch(() => null)) as Envelope<T> | null;

      if (res.ok && json && opts.unwrapped) return { data: json as T, rateLimit };
      if (res.ok && json?.success) return { data: json.data as T, usage: json.usage, rateLimit };

      const code = (json?.error?.code as ErrorCode | undefined) ?? 'UNKNOWN';
      const message = json?.error?.message ?? `HTTP ${res.status}`;

      if (canRetry && res.status === 429 && code === 'RATE_LIMIT_EXCEEDED') {
        const untilReset = rateLimit.reset ? rateLimit.reset * 1000 - Date.now() + 250 : backoff(attempt);
        await sleep(Math.min(Math.max(untilReset, 250), 60_000));
        continue;
      }
      if (canRetry && idempotent && res.status >= 502 && res.status <= 504) {
        await sleep(backoff(attempt));
        continue;
      }
      throw new Studio99Error(message, code, res.status, rateLimit);
    }
  }
}

function readRateLimit(h: Headers): RateLimit {
  const n = (name: string) => {
    const v = h.get(name);
    return v === null ? null : Number(v);
  };
  return { limit: n('x-ratelimit-limit'), remaining: n('x-ratelimit-remaining'), reset: n('x-ratelimit-reset') };
}

function backoff(attempt: number): number {
  return 500 * 2 ** attempt + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default Studio99;
