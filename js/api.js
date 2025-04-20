// /js/api.js (Refactored)

import { PROXY_URL, API_SITES, API_CONFIG, M3U8_PATTERN, CUSTOM_API_CONFIG, ERROR_MESSAGES } from './config.js';

/**
 * Configuration for request timeouts.
 */
const REQUEST_TIMEOUT = 15000; // 15 seconds timeout for API requests

/**
 * Fetches content through the proxy with timeout and error handling.
 * @param {string} targetUrl - The URL to fetch.
 * @param {object} options - Fetch options (headers, etc.).
 * @param {number} [timeout=REQUEST_TIMEOUT] - Timeout duration in ms.
 * @returns {Promise<Response>} - The fetch Response object.
 * @throws {Error} - Throws specific error messages on failure (timeout, fetch error).
 */
async function fetchViaProxy(targetUrl, options = {}, timeout = REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const proxyRequestUrl = `${PROXY_URL}${encodeURIComponent(targetUrl)}`;

    try {
        console.debug(`[API Fetch] Requesting: ${targetUrl} via proxy`);
        const response = await fetch(proxyRequestUrl, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId); // Clear timeout if fetch succeeds

        if (!response.ok) {
            console.error(`[API Fetch] Proxy request failed for ${targetUrl}: ${response.status} ${response.statusText}`);
            // Try to read the error message from the proxy if available
            let errorMsg = ERROR_MESSAGES.FETCH_FAILED(`Status ${response.status}`);
            try {
                const errData = await response.json();
                if (errData && errData.error) {
                    errorMsg = `Proxy Error: ${errData.error}`;
                }
            } catch (e) { /* Ignore if response is not JSON */ }
            throw new Error(errorMsg);
        }
        console.debug(`[API Fetch] Success: ${targetUrl}`);
        return response;
    } catch (error) {
        clearTimeout(timeoutId); // Clear timeout on error as well
        if (error.name === 'AbortError') {
            console.error(`[API Fetch] Timeout fetching ${targetUrl}`);
            throw new Error(ERROR_MESSAGES.TIMEOUT);
        }
        console.error(`[API Fetch] Network error fetching ${targetUrl}:`, error);
        // Rethrow specific errors or a generic one
        throw new Error(error.message || ERROR_MESSAGES.FETCH_FAILED('Network Error'));
    }
}

/**
 * Creates a standard JSON error response.
 * @param {string} message - Error message.
 * @param {number} [code=500] - HTTP status code (e.g., 400 for client error, 500 for server error).
 * @returns {Response} - A Response object with JSON error payload.
 */
function createErrorResponse(message, code = 500) {
    console.error(`[API Response Error] Code: ${code}, Message: ${message}`);
    return new Response(JSON.stringify({ code: code, msg: message }), {
        headers: { 'Content-Type': 'application/json' },
        status: code // Reflect the error code in HTTP status
    });
}

/**
 * Creates a standard JSON success response.
 * @param {object} data - The data payload (e.g., { list: [], ... }).
 * @param {number} [code=200] - Success code.
 * @returns {Response} - A Response object with JSON success payload.
 */
function createSuccessResponse(data, code = 200) {
    return new Response(JSON.stringify({ code: code, ...data }), {
        headers: { 'Content-Type': 'application/json' },
        status: code
    });
}

/**
 * Handles search requests for standard and custom APIs.
 * @param {URLSearchParams} params - URL parameters.
 * @param {object|null} customApiConfig - Configuration for the custom API, if applicable.
 * @returns {Promise<Response>} - The Response object.
 */
async function handleSearch(params, customApiConfig = null) {
    const query = params.get('wd');
    if (!query) {
        return createErrorResponse(ERROR_MESSAGES.MISSING_QUERY, 400);
    }

    const sourceKey = customApiConfig ? customApiConfig.key : params.get('source');
    if (!sourceKey) {
        return createErrorResponse(ERROR_MESSAGES.MISSING_SOURCE, 400);
    }

    const apiConfig = customApiConfig ? customApiConfig : API_CONFIG[sourceKey];
    if (!apiConfig || !apiConfig.searchUrl) {
        return createErrorResponse(ERROR_MESSAGES.INVALID_SOURCE, 400);
    }

    const targetUrl = apiConfig.searchUrl.replace('{wd}', encodeURIComponent(query));
    const headers = apiConfig.headers || {};

    try {
        const response = await fetchViaProxy(targetUrl, { headers });
        const data = await response.json();
        // Basic validation of expected structure
        if (data === null || typeof data !== 'object') {
             throw new Error(ERROR_MESSAGES.INVALID_RESPONSE_FORMAT);
        }
        console.debug(`[API Search] Received data for "${query}" from ${sourceKey}`);
        // Ensure 'list' property exists, even if empty
        if (!data.list) {
            data.list = [];
        }
        return createSuccessResponse(data);
    } catch (error) {
        return createErrorResponse(`${ERROR_MESSAGES.SEARCH_FAILED} (${sourceKey}): ${error.message}`);
    }
}

/**
 * Handles detail requests for standard and custom APIs.
 * @param {URLSearchParams} params - URL parameters.
 * @param {object|null} customApiConfig - Configuration for the custom API, if applicable.
 * @returns {Promise<Response>} - The Response object.
 */
async function handleDetail(params, customApiConfig = null) {
    const id = params.get('id');
    if (!id) {
        return createErrorResponse(ERROR_MESSAGES.MISSING_ID, 400);
    }

    const sourceKey = customApiConfig ? customApiConfig.key : params.get('source');
     if (!sourceKey) {
        return createErrorResponse(ERROR_MESSAGES.MISSING_SOURCE, 400);
    }

    const apiConfig = customApiConfig ? customApiConfig : API_CONFIG[sourceKey];
    if (!apiConfig || !apiConfig.detailUrl) {
        return createErrorResponse(ERROR_MESSAGES.INVALID_SOURCE, 400);
    }

    const targetUrl = apiConfig.detailUrl.replace('{id}', encodeURIComponent(id));
    const headers = apiConfig.headers || {};

    try {
        const response = await fetchViaProxy(targetUrl, { headers });
        let data = await response.json();

        // Basic validation of expected structure
        if (data === null || typeof data !== 'object' || !Array.isArray(data.list) || data.list.length === 0) {
             throw new Error(ERROR_MESSAGES.INVALID_RESPONSE_FORMAT);
        }

        console.debug(`[API Detail] Received details for ID "${id}" from ${sourceKey}`);

        // Extract video info and episodes (assuming standard structure)
        // The original code had complex logic for different sources (ffzy, jisu, etc.)
        // This simplified version assumes a more standard response structure.
        // TODO: Re-implement special source handling if necessary, ideally driven by config.
        const videoInfo = data.list[0]; // Assume first item is the main video info
        const episodes = parseEpisodes(videoInfo.vod_play_url);

        return createSuccessResponse({ videoInfo, episodes });

    } catch (error) {
        return createErrorResponse(`${ERROR_MESSAGES.DETAIL_FAILED} (${sourceKey}): ${error.message}`);
    }
}


/**
 * Handles aggregated search across multiple standard APIs.
 * @param {URLSearchParams} params - URL parameters containing 'wd'.
 * @returns {Promise<Response>} - The Response object.
 */
async function handleAggregatedSearch(params) {
    const query = params.get('wd');
    if (!query) {
        return createErrorResponse(ERROR_MESSAGES.MISSING_QUERY, 400);
    }

    const searchPromises = API_SITES
        .filter(site => site.searchable && API_CONFIG[site.key] && API_CONFIG[site.key].searchUrl) // Ensure config exists
        .map(async (site) => {
            const siteParams = new URLSearchParams(params); // Clone params
            siteParams.set('source', site.key);
            try {
                // Call the standard search handler for each site
                const response = await handleSearch(siteParams);
                if (response.ok) {
                    const data = await response.json();
                    // Add source key to each result item for identification
                    (data.list || []).forEach(item => item.source = site.key);
                    return data.list || [];
                }
                return []; // Ignore failed searches for aggregation
            } catch (error) {
                console.warn(`[API Aggregated Search] Failed search for ${site.key}: ${error.message}`);
                return []; // Return empty array on error
            }
        });

    try {
        const results = await Promise.all(searchPromises);
        const combinedList = results.flat(); // Combine results from all sources
        console.debug(`[API Aggregated Search] Found ${combinedList.length} total results for "${query}"`);
        return createSuccessResponse({ list: combinedList });
    } catch (error) {
        // This catch is unlikely to be hit if individual promises handle errors, but good practice
        console.error(`[API Aggregated Search] Error during Promise.all: ${error.message}`);
        return createErrorResponse(`${ERROR_MESSAGES.SEARCH_FAILED} (Aggregated): ${error.message}`);
    }
}

/**
 * Handles search across multiple custom APIs.
 * @param {URLSearchParams} params - URL parameters containing 'wd' and 'customApi' (comma-separated keys).
 * @returns {Promise<Response>} - The Response object.
 */
async function handleMultipleCustomSearch(params) {
    const query = params.get('wd');
    if (!query) {
        return createErrorResponse(ERROR_MESSAGES.MISSING_QUERY, 400);
    }
    const customApiKeys = params.get('customApi')?.split(',');
    if (!customApiKeys || customApiKeys.length === 0) {
        return createErrorResponse(ERROR_MESSAGES.MISSING_CUSTOM_API, 400);
    }

    // Retrieve custom API configurations (assuming they are stored or passed somehow)
    // For this example, we'll mock fetching them based on keys.
    // In a real scenario, this might come from localStorage or a config object.
    const getCustomApis = () => {
         try {
            return JSON.parse(localStorage.getItem('customAPIs') || '[]');
        } catch (e) {
            console.error("Failed to parse custom APIs from localStorage", e);
            return [];
        }
    };
    const allCustomApis = getCustomApis();
    const selectedCustomApis = allCustomApis.filter(api => customApiKeys.includes(api.key));

    if (selectedCustomApis.length === 0) {
        return createErrorResponse(ERROR_MESSAGES.INVALID_CUSTOM_API, 400);
    }

    const searchPromises = selectedCustomApis.map(async (apiConfig) => {
        try {
            const response = await handleSearch(params, apiConfig); // Pass config directly
             if (response.ok) {
                const data = await response.json();
                 // Add source key to each result item
                (data.list || []).forEach(item => {
                    item.source = apiConfig.key;
                    item.isCustom = true; // Mark as custom
                 });
                return data.list || [];
            }
            return [];
        } catch (error) {
            console.warn(`[API Custom Search] Failed search for ${apiConfig.key}: ${error.message}`);
            return [];
        }
    });

    try {
        const results = await Promise.all(searchPromises);
        const combinedList = results.flat();
        console.debug(`[API Custom Search] Found ${combinedList.length} total results for "${query}"`);
        return createSuccessResponse({ list: combinedList });
    } catch (error) {
         console.error(`[API Custom Search] Error during Promise.all: ${error.message}`);
        return createErrorResponse(`${ERROR_MESSAGES.SEARCH_FAILED} (Custom): ${error.message}`);
    }
}


/**
 * Parses episode strings (e.g., "Episode 1$url1\nEpisode 2$url2") into an array of objects.
 * Also handles single M3U8 URLs.
 * @param {string} episodesString - The raw episode string from the API.
 * @returns {Array<{ name: string, url: string }>} - Array of episode objects.
 */
function parseEpisodes(episodesString) {
    if (!episodesString || typeof episodesString !== 'string') {
        return [];
    }
    episodesString = episodesString.trim();

    // Handle single M3U8 URL case
    if (M3U8_PATTERN.test(episodesString) && !episodesString.includes('$') && !episodesString.includes('\n')) {
        return [{ name: '播放', url: episodesString }];
    }

    // Handle standard "name$url" format, separated by newline or sometimes #
    const lines = episodesString.split(/[\n#]+/).filter(line => line.trim());
    return lines.map(line => {
        const parts = line.split('$');
        const name = parts[0]?.trim() || '未知剧集';
        const url = parts[1]?.trim() || '';
        return { name, url };
    }).filter(episode => episode.url); // Filter out episodes without URLs
}

/**
 * Main request router/handler that intercepts fetch calls.
 * @param {Request} request - The incoming Fetch request object.
 * @returns {Promise<Response>} - A promise resolving to a Response object.
 */
async function handleApiRequest(request) {
    const url = new URL(request.url);
    const params = url.searchParams;

    try {
        switch (url.pathname) {
            case '/api/search':
                const source = params.get('source');
                const customApi = params.get('customApi');

                if (source === 'aggregated') {
                    return await handleAggregatedSearch(params);
                } else if (customApi && customApi.includes(',')) { // Multiple custom APIs
                    return await handleMultipleCustomSearch(params);
                } else if (customApi) { // Single custom API
                    const customApis = JSON.parse(localStorage.getItem('customAPIs') || '[]');
                    const apiConfig = customApis.find(api => api.key === customApi);
                    if (!apiConfig) return createErrorResponse(ERROR_MESSAGES.INVALID_CUSTOM_API, 400);
                     // Add necessary custom API config details if not fully present
                    const fullCustomConfig = {
                        ...CUSTOM_API_CONFIG.DEFAULT_CONFIG, // Apply defaults
                        ...apiConfig,
                         searchUrl: apiConfig.searchUrl || CUSTOM_API_CONFIG.DEFAULT_CONFIG.searchUrl.replace('{url}', apiConfig.url),
                         detailUrl: apiConfig.detailUrl || CUSTOM_API_CONFIG.DEFAULT_CONFIG.detailUrl.replace('{url}', apiConfig.url),
                         headers: apiConfig.headers || CUSTOM_API_CONFIG.DEFAULT_CONFIG.headers,
                         key: apiConfig.key // Ensure key is present
                    };
                    return await handleSearch(params, fullCustomConfig);
                } else { // Standard API source
                    return await handleSearch(params);
                }

            case '/api/detail':
                 const detailCustomApi = params.get('customApi');
                 if (detailCustomApi) {
                     const customApis = JSON.parse(localStorage.getItem('customAPIs') || '[]');
                     const apiConfig = customApis.find(api => api.key === detailCustomApi);
                     if (!apiConfig) return createErrorResponse(ERROR_MESSAGES.INVALID_CUSTOM_API, 400);
                      const fullCustomConfig = {
                         ...CUSTOM_API_CONFIG.DEFAULT_CONFIG,
                         ...apiConfig,
                         searchUrl: apiConfig.searchUrl || CUSTOM_API_CONFIG.DEFAULT_CONFIG.searchUrl.replace('{url}', apiConfig.url),
                         detailUrl: apiConfig.detailUrl || CUSTOM_API_CONFIG.DEFAULT_CONFIG.detailUrl.replace('{url}', apiConfig.url),
                         headers: apiConfig.headers || CUSTOM_API_CONFIG.DEFAULT_CONFIG.headers,
                         key: apiConfig.key
                     };
                     // Note: The special detail handling logic (ffzy, jisu etc.) from the original
                     // code is currently simplified in `handleDetail`. Re-introduce if needed,
                     // potentially by adding a 'handlerType' to API_CONFIG/customApiConfig.
                     return await handleDetail(params, fullCustomConfig);
                 } else {
                     // Standard detail request
                     // Add special handling routing here if needed based on source
                     // const detailSource = params.get('source');
                     // if (detailSource === 'ffzy') return await handleFFZYDetail(params);
                     return await handleDetail(params);
                 }

            default:
                // If the path doesn't match /api/*, let the original fetch proceed.
                // This case should ideally not be hit if the interceptor logic is correct.
                console.warn(`[API Intercept] Unhandled path: ${url.pathname}`);
                return fetch(request);
        }
    } catch (error) {
        // Catch unexpected errors during routing/handler execution
        console.error(`[API Router] Unexpected error: ${error.message}`, error);
        return createErrorResponse(ERROR_MESSAGES.UNEXPECTED_ERROR);
    }
}

// --- Fetch Interception Logic ---
// Store the original fetch function
const originalFetch = window.fetch;

// Override the global fetch function
window.fetch = function(input, init) {
    let request;
    if (input instanceof Request) {
        request = input;
    } else {
        // Create a Request object if URL/options are provided
        request = new Request(input, init);
    }

    const url = new URL(request.url, window.location.origin); // Ensure URL is absolute

    // Check if the request URL path starts with /api/
    if (url.pathname.startsWith('/api/')) {
        console.debug(`[API Intercept] Intercepting request to: ${url.pathname}${url.search}`);
        // Handle the API request using our custom logic
        return handleApiRequest(request);
    } else {
        // For all other requests, use the original fetch function
        // console.debug(`[API Intercept] Passing through request to: ${url.href}`);
        return originalFetch.call(this, request);
    }
};

// --- Globally Exposed Test Function (Constraint: Keep signature and behavior) ---
/**
 * Tests the availability of a given API site by making a simple request (e.g., search for 'test').
 * Note: This function is kept outside the fetch interceptor logic as it seems intended for direct use.
 * @param {string} siteUrl - The base URL or configured search URL of the site.
 * @param {string} [sourceKey='test'] - A key for logging purposes.
 * @returns {Promise<boolean>} - True if the site responds successfully within timeout, false otherwise.
 */
export async function testSiteAvailability(siteUrl, sourceKey = 'test') {
    // Construct a test URL (e.g., search for 'test' or just fetch the base URL)
    // Using a search might be better to test the actual API endpoint.
    // Let's use a simple search if the URL pattern includes '{wd}'.
    let testTargetUrl = siteUrl;
    if (siteUrl.includes('{wd}')) {
        testTargetUrl = siteUrl.replace('{wd}', 'test'); // Simple test query
    } else if (siteUrl.includes('{id}')) {
        // Cannot easily test detail URLs without a valid ID, maybe just try fetching root?
        // Or assume the base URL is derivable? For now, just use the provided URL.
        console.warn(`[API Test] Testing detail URL ${siteUrl} directly, might not be effective.`);
        testTargetUrl = siteUrl; // Or potentially derive base URL if possible
    }


    // Find headers if sourceKey matches API_CONFIG
    const apiConfig = API_CONFIG[sourceKey] || Object.values(API_CONFIG).find(cfg => cfg.searchUrl === siteUrl || cfg.detailUrl === siteUrl);
    const headers = apiConfig?.headers || {};

    try {
        const response = await fetchViaProxy(testTargetUrl, { headers }, 5000); // Shorter timeout for testing
        return response.ok; // Simple check for successful status code
    } catch (error) {
        console.warn(`[API Test] Availability test failed for ${sourceKey} (${testTargetUrl}): ${error.message}`);
        return false;
    }
}

console.log("api.js loaded and fetch intercepted.");
