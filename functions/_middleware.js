/**
 * Cloudflare Pages Middleware
 * 
 * Intercepts outgoing HTML responses to inject the SHA-256 hash 
 * of the password (if provided via the `PASSWORD` environment variable) 
 * into the frontend JavaScript environment.
 */
import { sha256 } from '../js/sha256.js';

export async function onRequest(context) {
  const { env, next } = context; // `request` is unused, so omitted from destructuring for clarity

  try {
    // Fetch the next asset or function response
    const response = await next();

    // Only process HTML responses
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return response; // Pass through non-HTML responses unmodified
    }

    // Clone the response to safely read the body
    // (response.text() consumes the body, making the original response unusable)
    const originalResponse = response.clone(); 
    const html = await originalResponse.text();

    // Define the placeholder string to be replaced
    const placeholder = 'window.__ENV__.PASSWORD = "{{PASSWORD}}";';

    // Check if the placeholder exists in the HTML
    if (!html.includes(placeholder)) {
        // If the placeholder isn't found, return the original response
        // This avoids unnecessary work and potential issues if the template changes.
        // Log a warning during development/debugging if needed.
        // console.warn("Middleware: Placeholder not found in HTML response.");
        return response; 
    }

    // Calculate the password hash. Use an empty string if no password is set.
    const password = env.PASSWORD;
    let passwordHash = ""; // Default to empty string
    if (password && typeof password === 'string' && password.length > 0) {
        try {
            passwordHash = await sha256(password);
        } catch (hashError) {
            console.error("Middleware: Error calculating SHA-256 hash:", hashError);
            // Decide on behavior: return original response or error? 
            // Returning original might be safer for user experience.
            return response; 
        }
    }
    
    // Construct the replacement string with the calculated hash
    const replacement = `window.__ENV__.PASSWORD = "${passwordHash}"; // Injected by middleware`;

    // Replace the placeholder in the HTML content
    const modifiedHtml = html.replace(placeholder, replacement);

    // Return a new response with the modified HTML content
    // and original headers/status.
    return new Response(modifiedHtml, {
      headers: response.headers, // Use headers from the original response object
      status: response.status,
      statusText: response.statusText,
    });

  } catch (error) {
    // Log any unexpected errors during middleware processing
    console.error("Middleware Error:", error);
    
    // In case of an error *during* middleware processing (e.g., reading response body),
    // it's safer to return a generic error response than trying to call `next()` again 
    // or returning potentially broken/incomplete original response.
    return new Response("An internal error occurred in the middleware.", { status: 500 });
  }
}
