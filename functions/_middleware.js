import { sha256 } from '../js/sha256.js';

/**
 * Cloudflare Pages Middleware:
 * - For HTML responses only,
 *   replaces `window.__ENV__.PASSWORD = "{{PASSWORD}}";`
 *   with `window.__ENV__.PASSWORD = "<sha256>"` (env.PASSWORD hash, or empty string).
 */
export async function onRequest(context) {
  const { next, env } = context;

  try {
    // Let other middlewares/route run first, get resulting response
    const response = await next();

    // Only process for text/html content-type
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const html = await response.text();
    // env.PASSWORD may be undefined/null/empty; result is "" (as-is)
    let passwordHash = "";
    if (typeof env.PASSWORD === "string" && env.PASSWORD) {
      try {
        passwordHash = await sha256(env.PASSWORD);
      } catch (e) {
        // Failsafe: treat as blank hash
        passwordHash = "";
      }
    }

    // Only replace the first occurrence (template guarantees only one)
    const replacedHtml = html.replace(
      'window.__ENV__.PASSWORD = "{{PASSWORD}}";',
      `window.__ENV__.PASSWORD = "${passwordHash}"; // SHA-256 hash`
    );

    return new Response(replacedHtml, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (e) {
    // In case of error, log and return the original (unmodified) response (re-running next() could repeat downstream logic)
    console.error("Cloudflare Middleware error:", e);
    return await context.next();
  }
}
