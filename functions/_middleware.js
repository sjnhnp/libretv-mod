import { sha256 } from '../js/sha256.js';

// Cloudflare Pages Middleware to inject environment variables
export async function onRequest(context) {
  const { request, env, next } = context;
  
  try {
    // Proceed to the next middleware or route handler
    const response = await next();
    
    // Check if the response is HTML
    const contentType = response.headers.get("content-type") || "";
    
    if (!contentType.includes("text/html")) {
      // Return the original response for non-HTML content
      return response;
    }

    // Process HTML content
    const html = await response.text();
    
    // Calculate password hash (empty string if PASSWORD is not set)
    const passwordHash = env.PASSWORD ? await sha256(env.PASSWORD) : "";
    
    // Replace the placeholder with the calculated hash
    const modifiedHtml = html.replace(
      'window.__ENV__.PASSWORD = "{{PASSWORD}}";',
      `window.__ENV__.PASSWORD = "${passwordHash}"; // SHA-256 hash`
    );
    
    // Create a new response with the modified HTML
    return new Response(modifiedHtml, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    console.error("Error in middleware:", error);
    // In case of error, return the original response or a fallback
    return next();
  }
}
