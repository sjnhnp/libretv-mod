// functions/proxy/[[path]].js

// --- 配置 (现在从 Cloudflare 环境变量读取) ---
// 在 Cloudflare Pages 设置 -> 函数 -> 环境变量绑定 中设置以下变量:
// CACHE_TTL (例如 86400)
// MAX_RECURSION (例如 5)
// FILTER_DISCONTINUITY (不再需要，设为 false 或移除)
// USER_AGENTS_JSON (例如 ["UA1", "UA2"]) - JSON 字符串数组
// DEBUG (例如 false 或 true)
// --- 配置结束 ---

// functions/proxy/[[path]].js

/**
 * Cloudflare Pages Function - Proxy for M3U8 and other resources.
 *
 * Reads configuration from Environment Variables:
 * - `DEBUG`: ('true' or 'false') Enable verbose logging.
 * - `CACHE_TTL`: (Number) Cache duration in seconds for KV and browser cache (default: 86400).
 * - `MAX_RECURSION`: (Number) Max depth for processing nested M3U8 playlists (default: 5).
 * - `USER_AGENTS_JSON`: (JSON String Array) User agents to use for fetching (default: Chrome UA).
 * - `LIBRETV_PROXY_KV`: (KV Namespace Binding) Namespace for caching responses.
 */

// --- Constants ---
const MEDIA_FILE_EXTENSIONS = [
    '.mp4', '.webm', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.f4v', '.m4v', '.3gp', '.3g2', '.ts', '.mts', '.m2ts',
    '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac', '.wma', '.alac', '.aiff', '.opus',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg', '.avif', '.heic',
    '.vtt', '.srt', '.ass' // Add subtitle extensions
];
const MEDIA_CONTENT_TYPES = ['video/', 'audio/', 'image/', 'text/vtt', 'application/x-subrip', 'text/plain']; // Add subtitle MIME types
const M3U8_CONTENT_TYPES = ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl'];
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_CACHE_TTL = 86400; // 24 hours
const DEFAULT_MAX_RECURSION = 5;
// --- Constants End ---

// --- Global State (Initialized in onRequest) ---
let DEBUG_ENABLED = false;
let CACHE_TTL = DEFAULT_CACHE_TTL;
let MAX_RECURSION = DEFAULT_MAX_RECURSION;
let USER_AGENTS = [DEFAULT_USER_AGENT];
let KV_NAMESPACE = null;
// --- Global State End ---


/**
 * Debug Logger
 * @param {string} message - Message to log
 */
function logDebug(message) {
    if (DEBUG_ENABLED) {
        console.log(`[Proxy Func DEBUG] ${message}`);
    }
}

/**
 * Error Logger
 * @param {string} message - Error message
 * @param {Error} [error] - Optional error object
 */
function logError(message, error) {
    console.error(`[Proxy Func ERROR] ${message}`, error || '');
}


/**
 * Initializes configuration from environment variables.
 * @param {object} env - Cloudflare environment object.
 * @param {function} waitUntil - Cloudflare waitUntil function.
 */
function initializeConfig(env) {
    DEBUG_ENABLED = (env.DEBUG === 'true');
    CACHE_TTL = parseInt(env.CACHE_TTL, 10);
    if (isNaN(CACHE_TTL) || CACHE_TTL <= 0) {
        CACHE_TTL = DEFAULT_CACHE_TTL;
        logDebug(`Invalid or missing CACHE_TTL env var, using default: ${CACHE_TTL}s`);
    }

    MAX_RECURSION = parseInt(env.MAX_RECURSION, 10);
     if (isNaN(MAX_RECURSION) || MAX_RECURSION <= 0) {
        MAX_RECURSION = DEFAULT_MAX_RECURSION;
        logDebug(`Invalid or missing MAX_RECURSION env var, using default: ${MAX_RECURSION}`);
    }

    // Parse User Agents JSON
    try {
        const agentsJson = env.USER_AGENTS_JSON;
        if (agentsJson) {
            const parsedAgents = JSON.parse(agentsJson);
            if (Array.isArray(parsedAgents) && parsedAgents.length > 0) {
                USER_AGENTS = parsedAgents;
                logDebug(`Loaded ${USER_AGENTS.length} user agents from env var.`);
            } else {
                 logDebug("USER_AGENTS_JSON env var is invalid or empty, using default UA.");
                 USER_AGENTS = [DEFAULT_USER_AGENT];
            }
        } else {
            USER_AGENTS = [DEFAULT_USER_AGENT];
            logDebug("USER_AGENTS_JSON env var not set, using default UA.");
        }
    } catch (e) {
        logError(`Failed to parse USER_AGENTS_JSON env var: ${e.message}. Using default UA.`, e);
        USER_AGENTS = [DEFAULT_USER_AGENT];
    }

    // Setup KV Namespace
    try {
        KV_NAMESPACE = env.LIBRETV_PROXY_KV;
        if (!KV_NAMESPACE) {
           logDebug("KV Namespace 'LIBRETV_PROXY_KV' not bound or configured.");
        } else {
            logDebug("KV Namespace 'LIBRETV_PROXY_KV' successfully bound.");
        }
    } catch (e) {
        logError(`Error accessing KV Namespace 'LIBRETV_PROXY_KV': ${e.message}`, e);
        KV_NAMESPACE = null;
    }
}

/**
 * Extracts the target URL from the request path.
 * @param {string} pathname - The request path (e.g., /proxy/encodedUrl).
 * @returns {string | null} The decoded target URL or null if invalid.
 */
function getTargetUrlFromPath(pathname) {
    const prefix = '/proxy/';
    if (!pathname || !pathname.startsWith(prefix)) {
        logDebug(`Path does not start with ${prefix}: ${pathname}`);
        return null;
    }

    const encodedUrl = pathname.substring(prefix.length);
    if (!encodedUrl) {
        logDebug("Encoded URL part is empty.");
        return null;
    }

    try {
        const decodedUrl = decodeURIComponent(encodedUrl);
        // Basic validation: must start with http:// or https://
        if (!decodedUrl.match(/^https?:\/\//i)) {
            logDebug(`Invalid URL format after decoding: ${decodedUrl}`);
            // Allow fallback if the *original* encodedUrl looked like a URL (common mistake)
             if (encodedUrl.match(/^https?:\/\//i)) {
                 logDebug(`Warning: Path seems unencoded but looks like a valid URL. Using: ${encodedUrl}`);
                 return encodedUrl;
             }
            return null;
        }
        return decodedUrl;
    } catch (e) {
        logError(`Error decoding URL: ${encodedUrl}`, e);
        return null;
    }
}

/**
 * Creates a standard Response object with CORS headers.
 * @param {BodyInit | null} body - Response body.
 * @param {number} status - HTTP status code.
 * @param {HeadersInit} headers - Additional headers.
 * @returns {Response}
 */
function createResponse(body, status = 200, headers = {}) {
    const responseHeaders = new Headers(headers);
    // Essential CORS Headers
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*"); // Allow common headers
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Type"); // Expose necessary headers

    // Add Cache-Control for non-M3U8 responses if not already set
    if (!responseHeaders.has("Cache-Control") && status === 200 && body) {
         responseHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
    }

    return new Response(body, { status, headers: responseHeaders });
}

/**
 * Creates an M3U8 specific response.
 * @param {string} content - The M3U8 content.
 * @returns {Response}
 */
function createM3u8Response(content) {
    return createResponse(content, 200, {
        "Content-Type": "application/vnd.apple.mpegurl", // Standard M3U8 MIME type
        "Cache-Control": `public, max-age=${CACHE_TTL}`   // Cache M3U8 playlists
    });
}

/**
 * Gets a random User-Agent from the configured list.
 * @returns {string}
 */
function getRandomUserAgent() {
    if (USER_AGENTS.length === 0) return DEFAULT_USER_AGENT;
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Gets the base URL (directory path) from a full URL string.
 * @param {string} urlStr - The full URL.
 * @returns {string} The base URL ending with '/'.
 */
function getBaseUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        url.pathname = url.pathname.substring(0, url.pathname.lastIndexOf('/') + 1);
        return url.toString();
    } catch (e) {
        logError(`Failed to parse base URL from: ${urlStr}`, e);
        // Fallback: Find the last slash, excluding protocol slashes
        const lastSlash = urlStr.lastIndexOf('/');
        if (lastSlash > urlStr.indexOf('://') + 2) {
            return urlStr.substring(0, lastSlash + 1);
        }
        return urlStr.endsWith('/') ? urlStr : urlStr + '/'; // Append slash if needed
    }
}

/**
 * Resolves a relative URL against a base URL.
 * @param {string} baseUrl - The base URL (should end with '/').
 * @param {string} relativeUrl - The relative URL to resolve.
 * @returns {string} The absolute URL.
 */
function resolveUrl(baseUrl, relativeUrl) {
    if (!relativeUrl) return baseUrl; // Handle empty relative URL case
    // If already absolute, return it
    if (/^https?:\/\//i.test(relativeUrl)) {
        return relativeUrl;
    }
    try {
        // URL constructor handles most cases (absolute base, relative path)
        return new URL(relativeUrl, baseUrl).toString();
    } catch (e) {
        logError(`Failed to resolve URL: base='${baseUrl}', relative='${relativeUrl}'`, e);
        // Basic fallback for paths starting with '/' or same-level paths
        if (relativeUrl.startsWith('/')) {
            const origin = new URL(baseUrl).origin;
            return origin + relativeUrl;
        } else {
            return baseUrl + relativeUrl; // Assumes baseUrl ends with '/'
        }
    }
}

/**
 * Rewrites a target URL to the internal proxy path.
 * @param {string} targetUrl - The URL to proxy.
 * @returns {string} The proxy path (e.g., /proxy/encodedUrl).
 */
function rewriteUrlToProxy(targetUrl) {
    return `/proxy/${encodeURIComponent(targetUrl)}`;
}

/**
 * Fetches content from the target URL.
 * @param {string} targetUrl - The URL to fetch.
 * @param {Headers} requestHeaders - Original request headers to potentially forward.
 * @returns {Promise<{content: string, contentType: string, responseHeaders: Headers}>}
 */
async function fetchContentWithType(targetUrl, requestHeaders) {
    const headers = new Headers({
        'User-Agent': getRandomUserAgent(),
        'Accept': requestHeaders.get('Accept') || '*/*', // Forward Accept header if present
        'Accept-Language': requestHeaders.get('Accept-Language') || 'en-US,en;q=0.9', // Forward Accept-Language
        'Referer': requestHeaders.get('Referer') || new URL(targetUrl).origin // Use original Referer or target origin
        // Avoid forwarding Range headers directly unless specifically handled for byte serving
    });

    logDebug(`Fetching: ${targetUrl} with UA: ${headers.get('User-Agent')} and Referer: ${headers.get('Referer')}`);

    try {
        // Use Cloudflare's fetch with automatic redirect handling
        const response = await fetch(targetUrl, { headers, redirect: 'follow' });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => '(Could not read error body)');
            logError(`Fetch failed for ${targetUrl}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 200)}`);
            throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }

        // Determine content type, default to octet-stream if missing
        const contentType = (response.headers.get('Content-Type') || 'application/octet-stream').toLowerCase();
        const content = await response.text(); // Read as text initially for M3U8 check
        logDebug(`Fetched successfully: ${targetUrl}, Type: ${contentType}, Length: ${content.length}`);

        return { content, contentType, responseHeaders: response.headers };

    } catch (error) {
        logError(`Fetch completely failed for ${targetUrl}`, error);
        throw new Error(`Failed to fetch target URL ${targetUrl}: ${error.message}`); // Re-throw for main handler
    }
}

/**
 * Checks if the content is likely M3U8.
 * @param {string} content - The content string.
 * @param {string} contentType - The Content-Type header value.
 * @returns {boolean}
 */
function isM3u8Content(content, contentType) {
    // Check Content-Type first (more reliable)
    if (contentType && M3U8_CONTENT_TYPES.some(type => contentType.includes(type))) {
        return true;
    }
    // Fallback: Check if content starts with #EXTM3U
    return typeof content === 'string' && content.trimStart().startsWith('#EXTM3U');
}

/**
 * Processes a line containing a URI (e.g., #EXT-X-KEY, #EXT-X-MAP, segment URL).
 * @param {string} line - The line from the M3U8 file.
 * @param {string} baseUrl - The base URL for resolving relative paths.
 * @param {string} uriAttribute - The attribute containing the URI (e.g., "URI", "SRC", or null for segment URLs).
 * @returns {string} The processed line with the URI rewritten to the proxy path.
 */
function processUriLine(line, baseUrl, uriAttribute = null) {
    if (uriAttribute) {
        // Handle attributes like URI="...", SRC="..."
        const regex = new RegExp(`${uriAttribute}="([^"]+)"`);
        return line.replace(regex, (match, uri) => {
            const absoluteUri = resolveUrl(baseUrl, uri);
            logDebug(`Rewriting ${uriAttribute}: '${uri}' -> Proxy(${absoluteUri})`);
            return `${uriAttribute}="${rewriteUrlToProxy(absoluteUri)}"`;
        });
    } else {
        // Handle segment URLs (lines not starting with #)
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            const absoluteUrl = resolveUrl(baseUrl, trimmedLine);
            logDebug(`Rewriting segment: '${trimmedLine}' -> Proxy(${absoluteUrl})`);
            return rewriteUrlToProxy(absoluteUrl);
        }
    }
    // Return unmodified line if no URI found or it's a comment/tag
    return line;
}

/**
 * Processes the content of a media M3U8 playlist (contains segments).
 * @param {string} url - The original URL of the media playlist.
 * @param {string} content - The M3U8 content.
 * @returns {string} The processed M3U8 content with URLs rewritten.
 */
function processMediaPlaylist(url, content) {
    const baseUrl = getBaseUrl(url);
    return content.split('\n').map(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return line; // Preserve empty lines

        if (trimmedLine.startsWith('#EXT-X-KEY')) {
            return processUriLine(line, baseUrl, 'URI');
        }
        if (trimmedLine.startsWith('#EXT-X-MAP')) {
            return processUriLine(line, baseUrl, 'URI');
        }
        // Handle other potential URIs if needed in the future, e.g., #EXT-X-MEDIA with URI
        // if (trimmedLine.startsWith('#EXT-X-MEDIA') && line.includes('URI="')) {
        //     return processUriLine(line, baseUrl, 'URI');
        // }
        if (!trimmedLine.startsWith('#')) {
            return processUriLine(line, baseUrl, null); // Process segment URL
        }
        // Return other tags/comments unmodified
        return line;
    }).join('\n');
}

/**
 * Recursively processes M3U8 content, handling master and media playlists.
 * @param {string} targetUrl - The URL of the M3U8 being processed.
 * @param {string} content - The M3U8 content.
 * @param {object} context - The Cloudflare context object { env, waitUntil }.
 * @param {number} recursionDepth - Current recursion depth.
 * @returns {Promise<string>} Processed M3U8 content.
 */
async function processM3u8Content(targetUrl, content, context, recursionDepth = 0) {
    if (recursionDepth > MAX_RECURSION) {
        throw new Error(`Maximum recursion depth (${MAX_RECURSION}) exceeded for ${targetUrl}`);
    }

    // Detect if it's a master playlist (heuristic: contains stream info or media tags)
    if (content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:')) {
        logDebug(`[Depth ${recursionDepth}] Detected Master Playlist: ${targetUrl}`);
        // In this simplified proxy, we don't select streams. Process as media playlist to rewrite URLs.
        // A more advanced proxy might parse BANDWIDTH/RESOLUTION here.
        // return processMediaPlaylist(targetUrl, content); // Treat master like media to rewrite potential sub-playlist URLs
        // Correction: If it's a master, we *must* fetch a variant or rewrite variants.
        // Let's rewrite all variant URLs in the master playlist instead of picking one.
        return processMasterPlaylistVariants(targetUrl, content);

    } else {
        logDebug(`[Depth ${recursionDepth}] Detected Media Playlist: ${targetUrl}`);
        return processMediaPlaylist(targetUrl, content);
    }

    // --- Removed logic to select highest bandwidth variant ---
    // This proxy will now just rewrite all URLs in master/media playlists.
}


/**
 * Processes a master M3U8 playlist, rewriting all variant URIs.
 * @param {string} url - The original URL of the master playlist.
 * @param {string} content - The M3U8 content.
 * @returns {string} The processed master M3U8 content with variant URLs rewritten.
 */
function processMasterPlaylistVariants(url, content) {
    const baseUrl = getBaseUrl(url);
    const lines = content.split('\n');
    const output = [];
    let processingVariant = false;

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('#EXT-X-STREAM-INF')) {
            processingVariant = true;
            output.push(line); // Keep the stream info line
        } else if (processingVariant && !trimmedLine.startsWith('#') && trimmedLine) {
            // This is the variant URI line
            const absoluteUrl = resolveUrl(baseUrl, trimmedLine);
            logDebug(`Rewriting Master Variant: '${trimmedLine}' -> Proxy(${absoluteUrl})`);
            output.push(rewriteUrlToProxy(absoluteUrl));
            processingVariant = false; // Reset flag after processing URI
        } else if (trimmedLine.startsWith('#EXT-X-MEDIA') && line.includes('URI="')) {
             // Handle #EXT-X-MEDIA URIs (audio, subtitles etc.)
             output.push(processUriLine(line, baseUrl, 'URI'));
        } else {
            // Keep other lines (comments, headers, other tags)
            output.push(line);
            processingVariant = false; // Reset if we encounter another tag before URI
        }
    }
    return output.join('\n');
}


/**
 * Handles OPTIONS preflight requests for CORS.
 * @returns {Response}
 */
function handleOptionsRequest() {
    return new Response(null, {
        status: 204, // No Content
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*", // Allow all requested headers
            "Access-Control-Max-Age": "86400", // Cache preflight response for 1 day
        },
    });
}

/**
 * Gets data from KV cache.
 * @param {string} key - The cache key.
 * @returns {Promise<object | null>} Cached data { body, headers } or null if not found/error.
 */
async function getFromCache(key) {
    if (!KV_NAMESPACE) return null;
    try {
        const cachedDataJson = await KV_NAMESPACE.get(key);
        if (cachedDataJson) {
            logDebug(`[Cache HIT] Key: ${key}`);
            return JSON.parse(cachedDataJson); // Assumes stored data is JSON stringified {body, headers}
        }
        logDebug(`[Cache MISS] Key: ${key}`);
        return null;
    } catch (error) {
        logError(`KV Cache GET error for key ${key}`, error);
        return null; // Treat cache error as a miss
    }
}

/**
 * Puts data into KV cache.
 * @param {string} key - The cache key.
 * @param {object} data - Data to cache { body, headers }.
 * @param {function} waitUntil - Cloudflare waitUntil function.
 */
async function putToCache(key, data, waitUntil) {
    if (!KV_NAMESPACE || !waitUntil) return;
    try {
        const cacheValue = JSON.stringify(data);
        // Use waitUntil to perform cache write asynchronously
        waitUntil(KV_NAMESPACE.put(key, cacheValue, { expirationTtl: CACHE_TTL }));
        logDebug(`[Cache PUT] Key: ${key} scheduled.`);
    } catch (error) {
        logError(`KV Cache PUT error for key ${key}`, error);
    }
}

// --- Main Request Handler ---

export async function onRequest(context) {
    const { request, env, next, waitUntil } = context;
    const url = new URL(request.url);

    // Initialize configuration on first request (or re-init if needed)
    initializeConfig(env); // Pass env directly

    // Handle CORS Preflight (OPTIONS) requests immediately
    if (request.method === "OPTIONS") {
        return handleOptionsRequest();
    }

    // Extract target URL
    const targetUrl = getTargetUrlFromPath(url.pathname);
    if (!targetUrl) {
        return createResponse("Invalid proxy request path.", 400);
    }

    logDebug(`Proxy request for: ${targetUrl}`);

    // --- Cache Check ---
    const cacheKey = `proxy_v2:${targetUrl}`; // Use a versioned cache key
    const cachedData = await getFromCache(cacheKey);

    if (cachedData) {
        const { body: cachedContent, headers: cachedHeadersJson } = cachedData;
        let cachedHeaders = {};
        try { cachedHeaders = JSON.parse(cachedHeadersJson); } catch(e){ logError("Failed to parse cached headers JSON", e); }
        const cachedContentType = cachedHeaders['content-type'] || '';

        if (isM3u8Content(cachedContent, cachedContentType)) {
            logDebug(`Processing cached M3U8: ${targetUrl}`);
            try {
                // Reprocess cached M3U8 content to ensure URLs are current proxy format
                const processedM3u8 = await processM3u8Content(targetUrl, cachedContent, context, 0);
                return createM3u8Response(processedM3u8);
            } catch (error) {
                 logError(`Error processing cached M3U8 for ${targetUrl}. Fetching fresh.`, error);
                 // Fall through to fetch fresh if reprocessing fails
            }
        } else {
            logDebug(`Serving non-M3U8 from cache: ${targetUrl}`);
            return createResponse(cachedContent, 200, new Headers(cachedHeaders));
        }
    }

    // --- Fetch Fresh Content ---
    try {
        const { content, contentType, responseHeaders } = await fetchContentWithType(targetUrl, request.headers);

        // Prepare headers for caching and response
        const headersToCache = {};
        const responseHeadersToSend = new Headers();
         responseHeaders.forEach((value, key) => {
             const lowerKey = key.toLowerCase();
             headersToCache[lowerKey] = value; // Store headers lowercase for consistency
             responseHeadersToSend.set(key, value); // Preserve original case for response
         });
         // Ensure Content-Type is correctly set
         if (!responseHeadersToSend.has('Content-Type')) {
             responseHeadersToSend.set('Content-Type', contentType || 'application/octet-stream');
             headersToCache['content-type'] = contentType || 'application/octet-stream';
         }

        // Cache the raw fetched content
        const dataToCache = { body: content, headers: JSON.stringify(headersToCache) };
        await putToCache(cacheKey, dataToCache, waitUntil); // Use await here? No, use waitUntil.

        // Process if M3U8
        if (isM3u8Content(content, contentType)) {
            logDebug(`Processing fetched M3U8: ${targetUrl}`);
            const processedM3u8 = await processM3u8Content(targetUrl, content, context, 0);
            return createM3u8Response(processedM3u8);
        } else {
            logDebug(`Serving fetched non-M3U8: ${targetUrl}`);
            // Add cache control and CORS to the final response headers
             responseHeadersToSend.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
             responseHeadersToSend.set("Access-Control-Allow-Origin", "*");
             responseHeadersToSend.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
             responseHeadersToSend.set("Access-Control-Allow-Headers", "*");
            return createResponse(content, 200, responseHeadersToSend);
        }

    } catch (error) {
        logError(`Failed to handle proxy request for ${targetUrl}`, error);
        return createResponse(`Proxy error: ${error.message}`, 500);
    }
}

// --- OPTIONS Handler Export (Explicitly handling OPTIONS method) ---
// While the main handler can process OPTIONS, this makes it clearer.
export async function onOptions(context) {
    return handleOptionsRequest();
}

