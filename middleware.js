import { sha256 } from './js/sha256.js';

// Vercel Edge Middleware to inject environment variables
export async function middleware(request) {
  // Get the URL from the request
  const url = new URL(request.url);

  // Only process HTML pages
  const isHtmlPage = url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (!isHtmlPage) {
    return; // Let the request pass through unchanged
  }

  // Fetch the original response
  const response = await fetch(request);

  // Check if it's an HTML response
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response; // Return the original response if not HTML
  }

  // Get the HTML content
  const originalHtml = await response.text();

  // Get environment variables
  const password = process.env.PASSWORD || '';
  const settingsPassword = process.env.SETTINGS_PASSWORD || '';

  let passwordHash = '';
  let settingsPasswordHash = '';

  if (password) {
    passwordHash = await sha256(password);
  }
  if (settingsPassword) {
    settingsPasswordHash = await sha256(settingsPassword);
  }

  // Replace PASSWORD placeholder
  let modifiedHtml = originalHtml.replace(
    /window\.__ENV__\.PASSWORD\s*=\s*["']\{\{PASSWORD\}\}["'];?/g,
    `window.__ENV__.PASSWORD = "${passwordHash}";`
  );

  // Replace SETTINGS_PASSWORD placeholder
  modifiedHtml = modifiedHtml.replace(
    /window\.__ENV__\.SETTINGS_PASSWORD\s*=\s*["']\{\{SETTINGS_PASSWORD\}\}["'];?/g,
    `window.__ENV__.SETTINGS_PASSWORD = "${settingsPasswordHash}";`
  );

  // Create a new response with the modified HTML
  return new Response(modifiedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

export const config = {
  matcher: ['/', '/((?!api|_next/static|_vercel|favicon.ico).*)'],
};
