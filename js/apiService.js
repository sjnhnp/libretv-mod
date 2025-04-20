// /js/apiService.js
import { PROXY_URL, API_SITES, API_CONFIG, CUSTOM_API_CONFIG } from './config.js';
import { getState } from './store.js'; // Might need store for custom API configs

// --- Helper Functions ---

function validateApiInput(value, type) {
    if (type === 'query' && (!value || typeof value !== 'string')) {
        console.error('Invalid search query:', value);
        return false;
    }
    if (type === 'id' && (!value || typeof value !== 'string')) {
        console.error('Invalid video ID:', value);
        return false;
    }
    if (type === 'source' && (!value || typeof value !== 'string')) {
        console.error('Invalid source identifier:', value);
        return false;
    }
    return true;
}

async function safeFetchJson(url, options = {}, timeout = 10000) {
    console.log(`Fetching JSON: ${url.substring(0, 100)}...`, options); // Log fetch start
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        clearTimeout(timeoutId); // Clear timeout if fetch completes

        if (!response.ok) {
            // Try reading error message from body if possible
            let errorMsg = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorData.msg || JSON.stringify(errorData);
            } catch (e) {
                // Ignore if body isn't JSON or empty
            }
             console.error(`Fetch failed for ${url.substring(0,100)}: ${errorMsg} (Status: ${response.status})`);
            throw new Error(errorMsg);
        }

        const data = await response.json();
        console.log(`Fetch success for ${url.substring(0, 100)}`);
        return data;
    } catch (error) {
        clearTimeout(timeoutId); // Clear timeout on error too
        if (error.name === 'AbortError') {
             console.error(`Fetch timed out for ${url.substring(0,100)}`);
            throw new Error('请求超时');
        }
        console.error(`Fetch error for ${url.substring(0,100)}:`, error);
        throw error; // Re-throw original or wrapped error
    }
}

// Simplified safeFetchText - might need adjustment based on actual usage
async function safeFetchText(url, options = {}, timeout = 10000) {
     console.log(`Fetching Text: ${url.substring(0, 100)}...`, options);
     const controller = new AbortController();
     const timeoutId = setTimeout(() => controller.abort(), timeout);
     try {
          const response = await fetch(url, { ...options, signal: controller.signal });
          clearTimeout(timeoutId);
          if (!response.ok) {
               console.error(`Fetch failed for ${url.substring(0,100)}: (Status: ${response.status})`);
               throw new Error(`HTTP error! status: ${response.status}`);
          }
          const text = await response.text();
           console.log(`Fetch text success for ${url.substring(0, 100)}`);
          return text;
     } catch (error) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
               console.error(`Fetch text timed out for ${url.substring(0,100)}`);
               throw new Error('请求超时');
          }
          console.error(`Fetch text error for ${url.substring(0,100)}:`, error);
          throw error;
     }
}


function getApiConfig(sourceIdentifier) {
     // Check built-in APIs first
     if (API_SITES[sourceIdentifier]) {
          return { ...API_SITES[sourceIdentifier], key: sourceIdentifier, is_custom: false };
     }
     // Check custom APIs from store
     const customAPIs = getState().customAPIs || [];
     const customApi = customAPIs.find(api => api.id === sourceIdentifier);
     if (customApi) {
          return { ...customApi, is_custom: true }; // Ensure is_custom flag
     }
     console.warn(`API config not found for source: ${sourceIdentifier}`);
     return null; // Not found
}


// --- Exported API Functions ---

export async function searchVideos(query, selectedSources = []) {
    console.log('apiService.searchVideos called with query:', query, 'and sources:', selectedSources); // DEBUG LOG
    if (!validateApiInput(query, 'query')) {
        return Promise.reject(new Error('无效的搜索查询'));
    }
    if (!Array.isArray(selectedSources) || selectedSources.length === 0) {
        return Promise.resolve([]); // Return empty if no sources selected
    }

    setLoading(true); // Use store action

    const apis = selectedSources.map(getApiConfig).filter(Boolean); // Get config for selected sources

    const searchPromises = apis.map(async (apiConfig) => {
        const apiUrl = apiConfig.url;
        const searchPath = apiConfig.search?.path || API_CONFIG.search.path; // Use specific or default path
        const headers = apiConfig.search?.headers || {};
        const targetUrl = `${apiUrl}${searchPath}${encodeURIComponent(query)}`;
        const proxyRequestUrl = PROXY_URL + encodeURIComponent(targetUrl);

        try {
            const data = await safeFetchJson(proxyRequestUrl, { headers });
            // Basic validation of response structure
            if (!data || typeof data !== 'object') {
                 console.warn(`Invalid response structure from ${apiConfig.name || apiConfig.key}`);
                 return []; // Return empty array for this source on bad structure
            }
            // Standardize results (assuming 'list' or 'data' property contains the array)
            const resultsList = data.list || data.data || [];
            if (!Array.isArray(resultsList)) {
                 console.warn(`Results list not an array from ${apiConfig.name || apiConfig.key}`);
                 return [];
            }
            // Add source identifier to each result item
            return resultsList.map(item => ({
                ...item,
                source: apiConfig.key || apiConfig.id, // Identify source by key or custom ID
                is_custom: apiConfig.is_custom
            }));
        } catch (error) {
            console.error(`Search failed for API "${apiConfig.name || apiConfig.key}":`, error.message);
            // Optionally return an error marker or just empty results for this source
            return []; // Return empty array on error for this source
        }
    });

    try {
        const resultsByApi = await Promise.all(searchPromises);
        const aggregatedResults = resultsByApi.flat(); // Combine results from all APIs
        console.log('Aggregated search results:', aggregatedResults.length);
        setLoading(false);
        return aggregatedResults;
    } catch (error) {
        // Should not happen if individual promises catch errors, but as a fallback
        console.error('Error aggregating search results:', error);
        setLoading(false);
        return Promise.reject(new Error('聚合搜索结果时出错'));
    }
}


export async function getVideoDetails(videoId, sourceIdentifier) {
     if (!validateApiInput(videoId, 'id') || !validateApiInput(sourceIdentifier, 'source')) {
         return Promise.reject(new Error('无效的视频ID或来源标识符'));
     }

     setLoading(true);
     const apiConfig = getApiConfig(sourceIdentifier);

     if (!apiConfig) {
          setLoading(false);
         return Promise.reject(new Error(`未找到来源 "${sourceIdentifier}" 的配置`));
     }

     const apiUrl = apiConfig.url;
     const detailPath = apiConfig.detail?.path || API_CONFIG.detail.path; // Use specific or default path
     const headers = apiConfig.detail?.headers || {};
     const targetUrl = `${apiUrl}${detailPath}&ids=${videoId}`; // Assuming detail API uses 'ids' param
     const proxyRequestUrl = PROXY_URL + encodeURIComponent(targetUrl);

     try {
         const data = await safeFetchJson(proxyRequestUrl, { headers });
         // Assume details are in the first item of the list/data array
         const detailData = data?.list?.[0] || data?.data?.[0];
         if (!detailData) {
              throw new Error('未在响应中找到视频详情');
         }
         // TODO: Handle special source parsing (ffzy, jisu etc.) if needed, based on apiConfig
         // This logic was complex in the original api.js interceptor and needs careful reimplementation here if required.
         // Example placeholder:
         // if (apiConfig.key === 'ffzy' || apiConfig.special_flag === 'ffzy') {
         //    detailData = parseFFZYDetails(detailData);
         // }

          console.log('Video details fetched:', detailData);
          setLoading(false);
         return detailData; // Return the first item containing details
     } catch (error) {
         console.error(`Failed to get video details for ID ${videoId} from ${sourceIdentifier}:`, error);
          setLoading(false);
         return Promise.reject(error);
     }
}


/**
 * Tests if an API endpoint seems available by making a HEAD request via proxy.
 * NOTE: This function might be unused in the current application flow.
 * If confirmed unused, it can be safely removed.
 */
export async function testApiAvailability(apiUrl) {
    console.warn("Usage of testApiAvailability needs verification. It might be unused.");
    if (!apiUrl || typeof apiUrl !== 'string' || !apiUrl.startsWith('http')) {
        return false;
    }
    try {
        const testUrl = PROXY_URL + encodeURIComponent(apiUrl);
        const response = await fetch(testUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        // Consider available if status is not a server error (5xx)
        // OK (2xx), Redirects (3xx), Client Errors (4xx) might still indicate the server is running.
        return response.status < 500;
    } catch (e) {
        // Network errors or timeouts indicate unavailability
        console.warn(`API availability test failed for ${apiUrl}:`, e.message);
        return false;
    }
}
