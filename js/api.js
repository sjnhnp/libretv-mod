// js/api.js - Handles API interactions for searching and fetching details.

// Ensure config variables (PROXY_URL, API_SITES, API_CONFIG, M3U8_PATTERN, etc.) are globally available
// These are expected to be loaded from config.js before this script runs.

const REQUEST_TIMEOUT = 10000; // 10 seconds timeout for API requests

/**
 * Handles API requests based on the URL path (/api/search or /api/detail).
 * @param {URL} url - The request URL object.
 * @returns {Promise<string>} A JSON string representing the API response.
 */
async function handleApiRequest(url) {
    const customApiUrl = url.searchParams.get('customApi') || '';
    const sourceCode = url.searchParams.get('source') || 'heimuer'; // Default source

    try {
        // --- Search Request ---
        if (url.pathname === '/api/search') {
            const searchQuery = url.searchParams.get('wd');
            if (!searchQuery || searchQuery.trim() === '') {
                throw new Error('Search query parameter (wd) is missing or empty.');
            }

            // Validate source or custom API URL
            if (sourceCode === 'custom' && !isValidHttpUrl(customApiUrl)) {
                throw new Error('A valid custom API URL must be provided when source is "custom".');
            }
            if (sourceCode !== 'custom' && !API_SITES[sourceCode]) {
                throw new Error(`Invalid API source code: ${sourceCode}`);
            }

            const apiBase = sourceCode === 'custom' ? customApiUrl : API_SITES[sourceCode].api;
            const apiUrl = `${apiBase}${API_CONFIG.search.path}${encodeURIComponent(searchQuery.trim())}`;
            const sourceName = sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode].name;

            const data = await fetchWithTimeout(apiUrl, API_CONFIG.search.headers);

            if (!data || !Array.isArray(data.list)) {
                 // Allow empty list for "no results", but throw error for invalid format
                 if (data && data.list === undefined) {
                    console.warn(`API response format invalid for ${sourceName}: Missing 'list' array.`, data);
                    throw new Error(`API response format invalid from ${sourceName}.`);
                 }
                 // If list is present but empty or null, return empty results
                 data.list = [];
            }

            // Add source information to each result
            data.list.forEach(item => {
                item.source_name = sourceName;
                item.source_code = sourceCode;
                if (sourceCode === 'custom') {
                    item.api_url = customApiUrl; // Store for detail requests
                }
                // Basic sanitization (simple example, more robust needed for production)
                item.vod_name = sanitizeString(item.vod_name);
                item.vod_remarks = sanitizeString(item.vod_remarks);
                item.type_name = sanitizeString(item.type_name);
            });

            return JSON.stringify({
                code: 200,
                list: data.list,
            });
        }

        // --- Detail Request ---
        if (url.pathname === '/api/detail') {
            const id = url.searchParams.get('id');
            if (!id || !/^[\w-]+$/.test(id)) { // Allow alphanumeric, underscore, hyphen
                throw new Error('Missing or invalid video ID parameter.');
            }

            // Validate source or custom API URL
            if (sourceCode === 'custom' && !isValidHttpUrl(customApiUrl)) {
                throw new Error('A valid custom API URL must be provided when source is "custom".');
            }
            if (sourceCode !== 'custom' && !API_SITES[sourceCode]) {
                 throw new Error(`Invalid API source code: ${sourceCode}`);
            }

            // Handle special sources needing direct HTML scraping
            const isSpecialSource = API_SITES[sourceCode]?.detail || (sourceCode === 'custom' && url.searchParams.get('useDetail') === 'true');
            if (isSpecialSource) {
                 const detailPageBaseUrl = sourceCode === 'custom' ? customApiUrl : API_SITES[sourceCode].detail;
                 if (!isValidHttpUrl(detailPageBaseUrl)) {
                     throw new Error(`Invalid detail page URL configured for source ${sourceCode}.`);
                 }
                 return await handleSpecialSourceDetail(id, sourceCode, detailPageBaseUrl);
            }

            // Standard detail request via API
            const apiBase = sourceCode === 'custom' ? customApiUrl : API_SITES[sourceCode].api;
            const detailUrl = `${apiBase}${API_CONFIG.detail.path}${id}`;
            const sourceName = sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode].name;

            const data = await fetchWithTimeout(detailUrl, API_CONFIG.detail.headers);

            if (!data || !Array.isArray(data.list) || data.list.length === 0) {
                console.warn(`No detail data found for ID ${id} from ${sourceName}.`);
                // Return empty details instead of throwing error, allows UI to show "not found"
                return JSON.stringify({
                    code: 404, // Use 404 to indicate not found
                    msg: 'Video details not found.',
                    episodes: [],
                    videoInfo: { source_name: sourceName, source_code: sourceCode },
                });
            }

            const videoDetail = data.list[0]; // Assume first item is the correct one
            const episodes = parseEpisodes(videoDetail);

            return JSON.stringify({
                code: 200,
                episodes: episodes,
                // detailUrl: detailUrl, // Maybe not needed externally?
                videoInfo: {
                    title: sanitizeString(videoDetail.vod_name),
                    cover: sanitizeUrl(videoDetail.vod_pic),
                    desc: sanitizeString(videoDetail.vod_content),
                    type: sanitizeString(videoDetail.type_name),
                    year: sanitizeString(videoDetail.vod_year),
                    area: sanitizeString(videoDetail.vod_area),
                    director: sanitizeString(videoDetail.vod_director),
                    actor: sanitizeString(videoDetail.vod_actor),
                    remarks: sanitizeString(videoDetail.vod_remarks),
                    source_name: sourceName,
                    source_code: sourceCode
                }
            });
        }

        // --- Unknown API Path ---
        throw new Error(`Unknown API path: ${url.pathname}`);

    } catch (error) {
        console.error(`API Error for ${url.pathname} (Source: ${sourceCode}, CustomAPI: ${customApiUrl}):`, error);
        // Return a structured error response
        return JSON.stringify({
            code: error.message.includes('timeout') ? 408 : 500, // Use 408 for timeout
            msg: error.message || 'API request failed.',
            list: [], // Ensure list/episodes are empty arrays on error
            episodes: [],
        });
    }
}

/**
 * Fetches data from a URL with a timeout.
 * @param {string} apiUrl - The URL to fetch.
 * @param {object} headers - Request headers.
 * @returns {Promise<object>} The JSON response data.
 * @throws {Error} If fetch fails or times out or response is not ok/json.
 */
async function fetchWithTimeout(apiUrl, headers) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
        console.warn(`Request timed out after ${REQUEST_TIMEOUT}ms for: ${apiUrl}`);
    }, REQUEST_TIMEOUT);

    let response;
    try {
        // Use the proxy for all API requests
        const proxyRequestUrl = PROXY_URL + encodeURIComponent(apiUrl);
        console.debug(`Fetching via proxy: ${proxyRequestUrl}`);

        response = await fetch(proxyRequestUrl, {
            headers: headers,
            signal: controller.signal,
            mode: 'cors' // Ensure CORS mode is set if interacting directly with proxy
        });
    } catch (fetchError) {
        clearTimeout(timeoutId);
        // Network errors or AbortError
        if (fetchError.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        console.error(`Fetch failed for ${apiUrl}:`, fetchError);
        throw new Error(`Network error: ${fetchError.message}`);
    } finally {
        // Always clear the timeout when fetch finishes or errors
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Failed to read error response body');
        console.error(`API request failed for ${apiUrl}: ${response.status} ${response.statusText}. Body: ${errorText.substring(0, 200)}`);
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    try {
        // Assume response is JSON
        return await response.json();
    } catch (jsonError) {
        console.error(`Failed to parse JSON response from ${apiUrl}:`, jsonError);
        throw new Error('Invalid JSON response from API');
    }
}

/**
 * Parses episodes from video detail data.
 * @param {object} videoDetail - The video detail object from the API.
 * @returns {string[]} An array of valid episode URLs.
 */
function parseEpisodes(videoDetail) {
    let episodes = [];
    if (videoDetail && videoDetail.vod_play_url) {
        try {
            // Split sources (e.g., source1$$$source2) and take the first one
            const playSources = videoDetail.vod_play_url.split('$$$');
            if (playSources.length > 0) {
                const mainSourceEpisodes = playSources[0].split('#');
                episodes = mainSourceEpisodes
                    .map(ep => {
                        const parts = ep.split('$');
                        // URL is usually the second part, check if it looks like a valid URL
                        return (parts.length > 1 && isValidHttpUrl(parts[1])) ? parts[1] : null;
                    })
                    .filter(url => url); // Filter out null/invalid URLs
            }
        } catch (e) {
            console.error("Error parsing vod_play_url:", e, videoDetail.vod_play_url);
            episodes = []; // Reset on error
        }
    }

    // Fallback: try regex on description if no episodes found yet (less reliable)
    if (episodes.length === 0 && videoDetail && videoDetail.vod_content) {
        try {
            const content = videoDetail.vod_content;
            const matches = content.match(M3U8_PATTERN) || [];
            episodes = matches
                .map(link => sanitizeUrl(link.replace(/^\$/, ''))) // Remove leading $ if present and sanitize
                .filter(url => isValidHttpUrl(url));
            if (episodes.length > 0) {
                console.warn("Parsed episodes using regex fallback on vod_content.");
            }
        } catch (e) {
             console.error("Error parsing episodes from vod_content regex:", e);
             episodes = [];
        }
    }

    // Deduplicate episodes
    return [...new Set(episodes)];
}

/**
 * Handles fetching and parsing details from special sources that require scraping HTML.
 * @param {string} id - The video ID.
 * @param {string} sourceCode - The source identifier ('custom' or key from API_SITES).
 * @param {string} detailPageBaseUrl - The base URL for the detail page.
 * @returns {Promise<string>} JSON string with parsed details.
 */
async function handleSpecialSourceDetail(id, sourceCode, detailPageBaseUrl) {
    const detailHtmlUrl = `${detailPageBaseUrl}/index.php/vod/detail/id/${id}.html`;
    const sourceName = sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode]?.name || '未知特殊源';

    console.log(`Fetching special source detail HTML: ${detailHtmlUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    let html = '';
    try {
        // Fetch HTML via proxy
        const response = await fetch(PROXY_URL + encodeURIComponent(detailHtmlUrl), {
            headers: { // Use a common user agent
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            },
            signal: controller.signal,
             mode: 'cors'
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Detail page request failed: ${response.status} ${response.statusText}`);
        }
        html = await response.text();

    } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
             throw new Error('Detail page request timeout');
        }
        throw new Error(`Failed to fetch detail page: ${fetchError.message}`);
    }

    // --- HTML Parsing (Simple Regex - Consider DOMParser for complex cases) ---
    let episodes = [];
    let title = '';
    let desc = '';

    try {
        // More robust regex for M3U8 links, capturing only the URL part
        const generalPattern = /\$(https?:\/\/[^$'"]+?\.m3u8)/g;
        let match;
        while ((match = generalPattern.exec(html)) !== null) {
            const url = sanitizeUrl(match[1]);
            if (url) episodes.push(url);
        }
        // Deduplicate
        episodes = [...new Set(episodes)];

        // Extract title (simple H1 extraction)
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        title = titleMatch ? sanitizeString(titleMatch[1].trim()) : '未知标题';

        // Extract description (look for common description class/structure)
        const descMatch = html.match(/<div[^>]*class=["'](?:content|sketch|vod_content|info)['"][^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch && descMatch[1]) {
            // Basic HTML tag removal and trimming
             desc = sanitizeString(descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        } else {
            desc = '暂无简介';
        }

    } catch (parseError) {
        console.error(`Error parsing HTML for ${detailHtmlUrl}:`, parseError);
        // Continue with potentially partial data
    }

    console.log(`Parsed ${episodes.length} episodes from special source ${sourceName}. Title: ${title}`);

    return JSON.stringify({
        code: 200,
        episodes: episodes,
        videoInfo: {
            title: title,
            desc: desc,
            source_name: sourceName,
            source_code: sourceCode,
            // Add other fields as 'N/A' or parse if possible
            cover: '', type: '', year: '', area: '', director: '', actor: '', remarks: ''
        }
    });
}

/**
 * Simple string sanitization (replace potential HTML tags).
 * More robust sanitization might be needed depending on the trust level of the API.
 * @param {string | undefined | null} str
 * @returns {string} Sanitized string or empty string.
 */
function sanitizeString(str) {
    if (!str) return '';
    // Basic sanitization: replace < and >
    return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Simple URL sanitization. Checks if it looks like a valid HTTP/HTTPS URL.
 * @param {string | undefined | null} url
 * @returns {string} Sanitized URL or empty string.
 */
function sanitizeUrl(url) {
    if (!url) return '';
    url = String(url).trim();
    if (isValidHttpUrl(url)) {
        // Potentially add more checks here if needed (e.g., against known malicious patterns)
        return url;
    }
    return ''; // Return empty if not a valid http/https URL
}

/**
 * Checks if a string is a valid HTTP/HTTPS URL.
 * @param {string} string
 * @returns {boolean}
 */
function isValidHttpUrl(string) {
  let url;
  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

// Intercept fetch calls to /api/* routes
(function() {
    // Ensure this runs only once
    if (window.originalFetch) return;

    window.originalFetch = window.fetch; // Store original fetch

    window.fetch = async function(input, init) {
        let requestUrl;
        try {
            // Handle both string and Request object inputs
            const urlString = (typeof input === 'string') ? input : input.url;
             // Use current origin as base if URL is relative
            requestUrl = new URL(urlString, window.location.origin);
        } catch (e) {
             console.error("Invalid URL passed to fetch:", input, e);
             // Fallback to original fetch for invalid URLs
             return window.originalFetch.apply(this, arguments);
        }

        // Check if it's an API call handled by this module
        if (requestUrl.pathname.startsWith('/api/')) {
            // Password protection check (assumes these functions exist globally)
            if (typeof window.isPasswordProtected === 'function' && typeof window.isPasswordVerified === 'function') {
                if (window.isPasswordProtected() && !window.isPasswordVerified()) {
                    console.warn('API request blocked due to missing password verification.');
                     // Show password modal (assumes function exists globally)
                    if (typeof window.showPasswordModal === 'function') {
                        window.showPasswordModal();
                    }
                    // Return a promise that never resolves or rejects, effectively blocking
                     return new Promise(() => {});
                     // Or return a specific error response:
                     // return new Response(JSON.stringify({ code: 401, msg: 'Password required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
                }
            }

            console.debug(`Intercepted API request: ${requestUrl.pathname}${requestUrl.search}`);
            try {
                // Handle the API request using the internal logic
                const responseData = await handleApiRequest(requestUrl);
                // Create a successful Response object
                return new Response(responseData, {
                    status: 200, // Assume success if handleApiRequest doesn't throw
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*', // Add CORS header
                    },
                });
            } catch (error) {
                // Catch errors from handleApiRequest itself (though it should return JSON string)
                console.error('Unhandled error in handleApiRequest:', error);
                return new Response(JSON.stringify({
                    code: 500,
                    msg: 'Internal Server Error during API handling.',
                }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }
        }

        // If not an API request, use the original fetch
        return window.originalFetch.apply(this, arguments);
    };
})();

// --- Utility Functions (Potentially used by other modules like app.js) ---

/**
 * Tests the availability of a given API URL.
 * @param {string} apiUrl - The base URL of the API to test.
 * @returns {Promise<boolean>} True if the API seems available, false otherwise.
 */
async function testSiteAvailability(apiUrl) {
     // Basic validation
     if (!isValidHttpUrl(apiUrl)) {
         console.warn(`Invalid URL provided for testing: ${apiUrl}`);
         return false;
     }
     try {
         // Use a simple, common search term for testing
         const testSearchUrl = `/api/search?wd=test&customApi=${encodeURIComponent(apiUrl)}&source=custom`;
         // Use a shorter timeout for availability tests
         const controller = new AbortController();
         const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

         const response = await window.fetch(testSearchUrl, { // Use the intercepted fetch
            signal: controller.signal
         });
         clearTimeout(timeoutId);

         if (!response.ok) {
            console.warn(`Site test failed for ${apiUrl}: Status ${response.status}`);
            return false;
         }

         const data = await response.json();
         // Check for a valid response structure (code 200 and list array)
         return data && data.code === 200 && Array.isArray(data.list);

     } catch (error) {
         console.error(`Site availability test failed for ${apiUrl}:`, error.message);
         return false;
     }
 }
