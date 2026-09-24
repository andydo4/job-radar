export interface HttpResponse {
  status: number;
  json(): Promise<unknown>;
  /** Raw body (careers-site feeds and job pages are XML/HTML, not JSON). */
  text?(): Promise<string>;
}

/** Minimal fetch signature so tests and dry runs can swap in fixtures. */
export type FetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<HttpResponse>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}

export interface HttpContext {
  fetch: FetchFn;
  userAgent: string;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET or POST JSON with a timeout and one polite retry on 429 / 5xx.
 * Throws HttpError on any other non-2xx status.
 */
export async function requestJson(
  ctx: HttpContext,
  url: string,
  opts: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    "User-Agent": ctx.userAgent,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ctx.fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: AbortSignal.timeout(ctx.timeoutMs ?? 15_000),
    });
    if (res.status >= 200 && res.status < 300) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 1) throw new HttpError(res.status, url);
    await sleep(2_000 + Math.random() * 2_000);
  }
  throw new Error("unreachable");
}

/** GET a text document (XML feed, HTML page) with the same timeout and retry rules as requestJson. */
export async function requestText(ctx: HttpContext, url: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ctx.fetch(url, {
      method: "GET",
      headers: { "User-Agent": ctx.userAgent, Accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(ctx.timeoutMs ?? 30_000),
    });
    if (res.status >= 200 && res.status < 300) return res.text ? res.text() : String(await res.json());
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 1) throw new HttpError(res.status, url);
    await sleep(2_000 + Math.random() * 2_000);
  }
  throw new Error("unreachable");
}

/** Run async tasks with at most `limit` in flight. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
}
