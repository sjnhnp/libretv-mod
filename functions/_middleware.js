、// functions/_middleware.js - Cloudflare Pages Middleware

// Note: Ensure 'sha256.js' exists at the correct relative path '../js/sha256.js'
// or adjust the import path accordingly.
import { sha256 } from '../js/sha256.js';

/**
 * Cloudflare Pages Middleware to inject the SHA-256 hash of the PASSWORD
 * environment variable into HTML responses.
 */
export async function onRequest(context) {
    const { request, env, next, waitUntil } = context;

    // Proceed to get the response from the next handler or static asset fetch
    const response = await next();

    // Check if the response is HTML
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
        // Not HTML, return the original response
        return response;
    }

    // Only modify successful HTML responses
    if (response.status !== 200) {
        return response;
    }

    try {
        // Get the original HTML content
        let html = await response.text();

        // Get the password from environment variables
        const password = env.PASSWORD || "";
        let passwordHash = "";

        // Calculate hash only if password is set and not empty
        if (password) {
            // Use waitUntil to compute hash asynchronously if needed, though sha256 is usually fast
            passwordHash = await sha256(password);
            console.log("Password environment variable found, injecting hash."); // Log for debugging
        } else {
            console.log("Password environment variable not set or empty."); // Log for debugging
            // Ensure the placeholder is replaced even if no password is set
            // Replace with empty string or a specific indicator if preferred
            passwordHash = ""; // Represents "no password set"
        }

        // Define the placeholder pattern more reliably
        const placeholder = 'window.__ENV__.PASSWORD = "{{PASSWORD}}";';
        const replacement = `window.__ENV__.PASSWORD = "${passwordHash}"; /* SHA-256 hash injected by middleware */`;

        // Check if the placeholder exists before replacing
        if (html.includes(placeholder)) {
            html = html.replace(placeholder, replacement);
            console.log("Placeholder found and replaced."); // Log for debugging
        } else {
            console.warn("Password placeholder not found in HTML. Injection skipped."); // Warn if placeholder missing
        }


        // Create a new response with the modified HTML
        // Important: Clone headers and status from the original response
        const newHeaders = new Headers(response.headers);
        // Ensure correct Content-Length if changed significantly (usually not the case here)
        // newHeaders.set('Content-Length', new TextEncoder().encode(html).length); // Optional, usually handled

        return new Response(html, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
        });

    } catch (error) {
        console.error("Error processing HTML in middleware:", error);
        // Return the original response in case of error during processing
        return response;
    }
}
