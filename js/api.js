// --- File: js/api.js ---
// ================================
// API请求与聚合处理优化版 (来自 old.txt, 适配 APISourceManager)
// ================================

// 通用fetch，支持超时并返回JSON
async function fetchWithTimeout(targetUrl, options, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(targetUrl, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`请求失败: ${response.status} ${response.statusText} for ${targetUrl}`);
        return await response.json(); // 期望JSON响应
    } catch (error) {
        clearTimeout(timer);
        let errorMessage = error.message || 'Unknown fetch error';
        if (error.name === 'AbortError') {
            errorMessage = `请求超时 for ${targetUrl}`;
        } else if (!errorMessage.includes(targetUrl)) {
            errorMessage = `Error fetching JSON from ${targetUrl}: ${errorMessage}`;
        }
        // Create a new error to ensure the message is informative
        const newError = new Error(errorMessage);
        newError.name = error.name; // Preserve original error name if possible
        throw newError;
    }
}

// 通用fetch，支持超时并返回TEXT (用于HTML抓取)
async function fetchTextWithTimeout(targetUrl, options, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(targetUrl, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`请求失败: ${response.status} ${response.statusText} for ${targetUrl}`);
        return await response.text(); // 期望TEXT响应
    } catch (error) {
        clearTimeout(timer);
        let errorMessage = error.message || 'Unknown fetch error';
         if (error.name === 'AbortError') {
            errorMessage = `请求超时 for ${targetUrl}`;
        } else if (!errorMessage.includes(targetUrl)) {
            errorMessage = `Error fetching text from ${targetUrl}: ${errorMessage}`;
        }
        const newError = new Error(errorMessage);
        newError.name = error.name;
        throw newError;
    }
}


// 处理特殊片源详情 (内置源，需要HTML抓取)
// sourceCode is like 'heimuer', 'jisu'
async function handleSpecialSourceDetail(id, sourceCode) {
    // Ensure API_SITES and the specific sourceCode entry exist and have a 'detail' URL
    if (!API_SITES || !API_SITES[sourceCode] || !API_SITES[sourceCode].detail) {
        throw new Error(`Source ${sourceCode} is not configured for special detail fetching or API_SITES is undefined.`);
    }
    const detailPageBaseUrl = API_SITES[sourceCode].detail;
    // Assuming the ID is appended like /id/ID.html or similar, common in CMS
    // Adjust this path construction if the CMS structure is different
    const detailPageUrl = `${detailPageBaseUrl}/index.php/vod/detail/id/${id}.html`; 

    try {
        const htmlContent = await fetchTextWithTimeout(
            PROXY_URL + encodeURIComponent(detailPageUrl),
            { headers: { 'User-Agent': API_CONFIG.search.headers['User-Agent'] } } // Standard user agent
        );

        let matches = [];
        // Example: Specific regex for a source if needed, otherwise generic M3U8_PATTERN
        // if (sourceCode === 'ffzy') { 
        //     matches = htmlContent.match(/\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g) || [];
        // }
        if (matches.length === 0) { // Fallback to generic M3U8 pattern defined in config.js
            matches = htmlContent.match(M3U8_PATTERN) || [];
        }
        
        matches = Array.from(new Set(matches)).map(link => {
            link = link.slice(1); // Remove leading '$'
            const idx = link.indexOf('('); // Remove potential episode names like (高清)
            return idx > -1 ? link.slice(0, idx) : link;
        });

        if (matches.length === 0) {
            throw new Error(`未能从 ${API_SITES[sourceCode].name} 源获取到有效的播放地址 (URL: ${detailPageUrl})`);
        }

        const titleMatch = htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const title = titleMatch ? titleMatch[1].trim() : '未知标题';
        
        const descMatch = htmlContent.match(/<div[^>]*class=["'](?:content|txt|sketch|introduction)["'][^>]*>([\s\S]*?)<\/div>/i);
        let desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '无描述';
        if (desc.length > 200) desc = desc.substring(0, 200) + "...";


        return JSON.stringify({
            code: 200, 
            episodes: matches, 
            detailUrl: detailPageUrl, // The URL that was scraped
            videoInfo: {
                vod_id: id, // Ensure vod_id is present
                title: title,
                desc: desc,
                source_name: API_SITES[sourceCode].name,
                source_code: sourceCode
                // Other fields like cover, year, type might need more specific regexes if available on the page
            }
        });
    } catch (e) {
        console.error(`${API_SITES[sourceCode]?.name || sourceCode} 详情获取失败 (URL: ${detailPageUrl}):`, e);
        throw new Error(`获取 ${API_SITES[sourceCode]?.name || sourceCode} 详情失败: ${e.message}`);
    }
}

// 处理自定义API特殊详情 (自定义源，需要HTML抓取)
// customApiDetailScrapeUrl is the specific URL for HTML scraping for this custom API
async function handleCustomApiSpecialDetail(id, customApiDetailScrapeUrl, sourceName = '自定义源') {
     if (!customApiDetailScrapeUrl) {
        throw new Error(`Custom API detail scrape URL not provided for ID ${id}.`);
    }
    // Assuming the ID is appended similarly to built-in special sources
    const detailPageUrl = `${customApiDetailScrapeUrl}/index.php/vod/detail/id/${id}.html`;

    try {
        const htmlContent = await fetchTextWithTimeout(
            PROXY_URL + encodeURIComponent(detailPageUrl),
            { headers: { 'User-Agent': API_CONFIG.search.headers['User-Agent'] } }
        );

        const matches = (htmlContent && htmlContent.match(M3U8_PATTERN) || [])
            .map(link => {
                link = link.slice(1); // Remove leading '$'
                const idx = link.indexOf('(');
                return idx > -1 ? link.slice(0, idx) : link;
            });

        if (matches.length === 0) {
            throw new Error(`未能从自定义API源 ${sourceName} 获取到有效的播放地址 (URL: ${detailPageUrl})`);
        }

        const titleMatch = htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const title = titleMatch ? titleMatch[1].trim() : '未知标题';

        const descMatch = htmlContent.match(/<div[^>]*class=["'](?:content|txt|sketch|introduction)["'][^>]*>([\s\S]*?)<\/div>/i);
        let desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '无描述';
        if (desc.length > 200) desc = desc.substring(0, 200) + "...";


        return JSON.stringify({
            code: 200, 
            episodes: matches, 
            detailUrl: detailPageUrl,
            videoInfo: {
                vod_id: id,
                title: title, 
                desc: desc,
                source_name: sourceName,
                source_code: 'custom_special' // Differentiate from regular custom JSON API
            }
        });
    } catch (e) {
        console.error(`自定义API ${sourceName} 详情获取失败 (URL: ${detailPageUrl}):`, e);
        throw new Error(`获取自定义API ${sourceName} 详情失败: ${e.message}`);
    }
}


// ================================
// API请求主处理函数
// ================================
async function handleApiRequest(url) {
    // `customApi` URL parameter is the base URL for the custom API's JSON endpoint.
    const customApiJsonBaseUrl = url.searchParams.get('customApi') || ''; 
    const source = url.searchParams.get('source') || 'heimuer'; // e.g., 'heimuer' or 'custom_0'

    try {
        if (url.pathname === '/api/search') {
            const searchQuery = url.searchParams.get('wd');
            if (!searchQuery) throw new Error('缺少搜索参数 wd');

            let targetSearchUrl;
            let sourceNameForDisplay;

            if (source.startsWith('custom_')) {
                if (!customApiJsonBaseUrl) throw new Error('使用自定义API搜索时，必须提供 customApi 参数 (API基础URL)');
                // API_CONFIG.search.path (e.g., "?ac=videolist&wd=") is appended to the custom base URL
                targetSearchUrl = `${customApiJsonBaseUrl}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
                const customIndex = parseInt(source.replace('custom_', ''), 10);
                sourceNameForDisplay = APISourceManager.getCustomApiInfo(customIndex)?.name || '自定义源';
            } else {
                if (!API_SITES[source] || !API_SITES[source].api) throw new Error(`无效的API来源或配置: ${source}`);
                // API_SITES[source].api is the full base URL (e.g., "https://xyz.com/api.php/provide/vod")
                // API_CONFIG.search.path is appended
                targetSearchUrl = `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
                sourceNameForDisplay = API_SITES[source].name;
            }
            
            try {
                const result = await fetchWithTimeout( // Expects JSON
                    PROXY_URL + encodeURIComponent(targetSearchUrl),
                    { headers: API_CONFIG.search.headers }
                );
                if (!result || !Array.isArray(result.list)) throw new Error('API返回的搜索结果数据格式无效');

                result.list.forEach(item => {
                    item.source_name = sourceNameForDisplay;
                    item.source_code = source; // Keep original source code like 'custom_0' or 'heimuer'
                    if (source.startsWith('custom_')) {
                        item.api_url = customApiJsonBaseUrl; // Store the base JSON URL used for this custom API search
                    }
                });
                return JSON.stringify({ code: 200, list: result.list });
            } catch (error) {
                return JSON.stringify({
                    code: 400,
                    msg: `搜索失败 (${sourceNameForDisplay || source}): ${error.message}`,
                    list: []
                });
            }
        }

        if (url.pathname === '/api/detail') {
            const id = url.searchParams.get('id');
            const sourceCode = url.searchParams.get('source') || 'heimuer'; 
            if (!id) throw new Error('缺少视频ID参数');
            if (!/^[\w-]+$/.test(id)) throw new Error('无效的视频ID格式');

            let apiMetaInfo; // Will hold { name, jsonBaseUrl, detailScrapeBaseUrl? }

            if (sourceCode.startsWith('custom_')) {
                if (!customApiJsonBaseUrl) throw new Error('获取自定义API详情时缺少 customApi 参数 (API基础URL)');
                const customIndex = parseInt(sourceCode.replace('custom_', ''), 10);
                const customData = APISourceManager.getCustomApiInfo(customIndex);
                if (!customData) throw new Error(`自定义API元数据未找到: ${sourceCode}`);
                apiMetaInfo = {
                    name: customData.name || '自定义源',
                    jsonBaseUrl: customApiJsonBaseUrl, // Base URL for JSON detail endpoint
                    detailScrapeBaseUrl: customData.detail || customApiJsonBaseUrl // Fallback to jsonBaseUrl if specific scrape URL not set
                };
            } else {
                if (!API_SITES[sourceCode]) throw new Error(`未知内置API源: ${sourceCode}`);
                apiMetaInfo = {
                    name: API_SITES[sourceCode].name,
                    jsonBaseUrl: API_SITES[sourceCode].api, // Base URL for JSON detail endpoint
                    detailScrapeBaseUrl: API_SITES[sourceCode].detail // URL for HTML scraping, if defined
                };
            }

            try {
                // Determine if HTML scraping should be used
                const preferHtmlScraping = url.searchParams.get('useDetail') === 'true';
                const canScrape = !!apiMetaInfo.detailScrapeBaseUrl;

                if (preferHtmlScraping && canScrape && sourceCode.startsWith('custom_')) {
                    return await handleCustomApiSpecialDetail(id, apiMetaInfo.detailScrapeBaseUrl, apiMetaInfo.name);
                } else if (!sourceCode.startsWith('custom_') && canScrape) { // Built-in source with a .detail URL
                    return await handleSpecialSourceDetail(id, sourceCode);
                }
                // Default to JSON API detail
                else {
                    const detailJsonEndpointUrl = `${apiMetaInfo.jsonBaseUrl}${API_CONFIG.detail.path}${id}`;
                    const result = await fetchWithTimeout(
                        PROXY_URL + encodeURIComponent(detailJsonEndpointUrl),
                        { headers: API_CONFIG.detail.headers }
                    );
                    if (!result || !Array.isArray(result.list) || !result.list.length) {
                        throw new Error('获取到的JSON详情内容无效');
                    }
                    
                    const videoDetail = result.list[0];
                    let episodes = [];

                    if (videoDetail.vod_play_url) {
                        const mainSourcePlayUrl = videoDetail.vod_play_url.split('$$$')[0] || '';
                        episodes = mainSourcePlayUrl.split('#')
                            .map(ep => {
                                const parts = ep.split('$');
                                const link = parts[1]; // URL is usually the second part
                                return link && (link.startsWith('http://') || link.startsWith('https://')) ? link : '';
                            })
                            .filter(Boolean); // Remove any empty strings
                    }
                    // Fallback: if no episodes from vod_play_url, try to find m3u8 in vod_content
                    if (episodes.length === 0 && videoDetail.vod_content) {
                        const contentMatches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
                        episodes = contentMatches.map(link => link.replace(/^\$/, '')); // Remove leading '$'
                    }

                    return JSON.stringify({
                        code: 200,
                        episodes,
                        detailUrl: detailJsonEndpointUrl, 
                        videoInfo: {
                            vod_id: videoDetail.vod_id || id,
                            title: videoDetail.vod_name,
                            cover: videoDetail.vod_pic,
                            desc: videoDetail.vod_content,
                            type: videoDetail.type_name,
                            year: videoDetail.vod_year,
                            area: videoDetail.vod_area,
                            director: videoDetail.vod_director,
                            actor: videoDetail.vod_actor,
                            remarks: videoDetail.vod_remarks,
                            source_name: apiMetaInfo.name,
                            source_code: sourceCode
                        }
                    });
                }
            } catch (error) {
                console.error(`详情处理错误 (source ${sourceCode}, id ${id}):`, error);
                return JSON.stringify({
                    code: 400,
                    msg: `获取详情失败 (${apiMetaInfo.name || sourceCode}): ${error.message}`,
                    episodes: []
                });
            }
        }
        throw new Error(`未知的API路径: ${url.pathname}`);
    } catch (error) { 
        console.error('API请求处理层顶层错误:', error);
        return JSON.stringify({
            code: 500, // Indicate a server-side or handler-level issue
            msg: error.message || 'API请求处理失败',
            list: [], // Ensure these arrays are present for client-side destructuring
            episodes: []
        });
    }
}

// 原始fetch函数
const originalFetch = window.fetch;

// 拦截全局fetch，处理API请求
window.fetch = async function (input, init) {
    let requestUrl;
    let isApiRequest = false;

    if (typeof input === 'string') {
        // Check if it's an absolute URL or needs to be resolved
        if (input.startsWith('/api/')) {
            requestUrl = new URL(input, window.location.origin);
            isApiRequest = true;
        } else {
            // For other requests, proceed with original fetch or handle as needed
            // If it might be a relative path that resolves to /api/, this logic might need adjustment
            // For now, assume only explicit /api/ paths are intercepted this way.
        }
    } else if (input instanceof Request) { // Handle Request object input
        if (input.url.includes('/api/')) { // A bit broad, but catches relative /api/ too
             try {
                requestUrl = new URL(input.url, window.location.origin); // Ensure it's a full URL
                if (requestUrl.pathname.startsWith('/api/')) {
                    isApiRequest = true;
                }
            } catch (e) { /* Not a valid URL, let original fetch handle */ }
        }
    }


    if (isApiRequest && requestUrl) {
        if (window.isPasswordProtected && window.isPasswordVerified) {
            if (window.isPasswordProtected() && !window.isPasswordVerified()) {
                return new Response(JSON.stringify({
                    code: 401,
                    msg: 'Unauthorized: 需要密码验证',
                    list: [], episodes: []
                }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }
        }
        try {
            const dataString = await handleApiRequest(requestUrl); // handleApiRequest returns a stringified JSON
            return new Response(dataString, {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        } catch (err) { 
            console.error("拦截的fetch中handleApiRequest执行错误:", err, "请求URL:", requestUrl.toString());
            return new Response(JSON.stringify({
                code: 500, msg: '服务器内部错误 (fetch override): ' + (err.message || '未知错误'),
                list: [], episodes: []
            }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }
    // For non-/api/ paths or if requestUrl couldn't be formed, use the original fetch
    return originalFetch.apply(this, arguments);
};

// 站点可用性测试 (Example)
async function testSiteAvailability(apiUrl) {
    try {
        // This will be intercepted by the overridden fetch if apiUrl is for an /api/ path
        const testSearchUrl = `/api/search?wd=test&source=custom_test&customApi=${encodeURIComponent(apiUrl)}`;
        const response = await fetch(testSearchUrl, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) return false;
        const data = await response.json();
        return data && data.code === 200 && Array.isArray(data.list); // Check for successful response structure
    } catch (e) {
        console.error(`站点可用性测试失败 for ${apiUrl}:`, e);
        return false;
    }
}
