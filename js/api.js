// --- File: js/api.js ---
// ================================
// API请求与聚合处理优化版 (来自 old.txt)
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
        if (error instanceof Error && !(error.message.includes(targetUrl))) {
            error.message = `Error fetching JSON from ${targetUrl}: ${error.message}`;
        }
        throw error;
    }
}

// 新增：通用fetch，支持超时并返回TEXT (用于HTML抓取)
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
        if (error instanceof Error && !(error.message.includes(targetUrl))) {
            error.message = `Error fetching text from ${targetUrl}: ${error.message}`;
        }
        throw error;
    }
}


// 处理特殊片源详情 (内置源，需要HTML抓取)
async function handleSpecialSourceDetail(id, sourceCode) {
    try {
        const detailPageUrl = `${API_SITES[sourceCode].detail}/index.php/vod/detail/id/${id}.html`;
        // 使用 fetchTextWithTimeout 获取 HTML 内容
        const htmlContent = await fetchTextWithTimeout(
            PROXY_URL + encodeURIComponent(detailPageUrl),
            { headers: { 'User-Agent': API_CONFIG.search.headers['User-Agent'] } }
        );

        let matches = [];
        if (sourceCode === 'ffzy') { // Example specific regex, adjust as needed
            matches = htmlContent.match(/\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g) || [];
        }
        if (matches.length === 0) { // Fallback generic m3u8 regex
            matches = htmlContent.match(/\$(https?:\/\/[^"'\s]+?\.m3u8)/g) || [];
        }
        matches = Array.from(new Set(matches)).map(link => {
            link = link.slice(1); // Remove leading '$'
            const idx = link.indexOf('('); // Remove potential episode names like (高清)
            return idx > -1 ? link.slice(0, idx) : link;
        });

        if (matches.length === 0) {
            throw new Error(`未能从${API_SITES[sourceCode].name}源获取到有效的播放地址`);
        }

        const title = (htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/) || [, ''])[1].trim();
        const desc = (htmlContent.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/) || [, ''])[1]
            .replace(/<[^>]+>/g, ' ').trim(); // Basic HTML tag stripping

        return JSON.stringify({
            code: 200, episodes: matches, detailUrl: detailPageUrl,
            videoInfo: {
                title,
                desc,
                source_name: API_SITES[sourceCode].name,
                source_code: sourceCode
            }
        });
    } catch (e) {
        console.error(`${API_SITES[sourceCode]?.name || sourceCode}详情获取失败:`, e);
        // 将原始错误信息传递出去，方便调试
        throw new Error(`获取${API_SITES[sourceCode]?.name || sourceCode}详情失败: ${e.message}`);
    }
}

// 处理自定义API特殊详情 (自定义源，需要HTML抓取)
// customApiDetailBaseUrl is the URL provided by the user for the custom API's detail page (if different from search base)
async function handleCustomApiSpecialDetail(id, customApiDetailBaseUrl) {
    try {
        const detailPageUrl = `${customApiDetailBaseUrl}/index.php/vod/detail/id/${id}.html`; // Assuming similar path structure
        const htmlContent = await fetchTextWithTimeout(
            PROXY_URL + encodeURIComponent(detailPageUrl),
            { headers: { 'User-Agent': API_CONFIG.search.headers['User-Agent'] } } // Removed 'Accept: application/json' as we expect HTML
        );

        const matches = (htmlContent && htmlContent.match(M3U8_PATTERN) || [])
            .map(link => {
                link = link.slice(1);
                const idx = link.indexOf('(');
                return idx > -1 ? link.slice(0, idx) : link;
            });

        if (matches.length === 0) {
            throw new Error('未能从自定义API源获取到有效的播放地址');
        }

        const title = (htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/) || [, ''])[1].trim();
        const desc = (htmlContent.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/) || [, ''])[1]
            .replace(/<[^>]+>/g, ' ').trim();

        return JSON.stringify({
            code: 200, episodes: matches, detailUrl: detailPageUrl,
            videoInfo: {
                title, desc,
                source_name: '自定义源', // Or get name from APISourceManager if available
                source_code: 'custom' // This might need adjustment if using custom_X
            }
        });
    } catch (e) {
        console.error('自定义API详情获取失败:', e);
        throw new Error(`获取自定义API详情失败: ${e.message}`);
    }
}


// ================================
// API请求主处理函数
// ================================
async function handleApiRequest(url) {
    // customApi parameter from the URL is the base URL for the custom API.
    const customApiBaseUrl = url.searchParams.get('customApi') || ''; 
    const source = url.searchParams.get('source') || 'heimuer'; // e.g., 'heimuer' or 'custom_0'

    try {
        if (url.pathname === '/api/search') {
            const searchQuery = url.searchParams.get('wd');
            if (!searchQuery) throw new Error('缺少搜索参数');

            // Determine the actual API endpoint URL for search
            let searchApiUrl;
            let sourceName;

            if (source.startsWith('custom_')) {
                if (!customApiBaseUrl) throw new Error('使用自定义API时必须提供API地址 (customApi参数)');
                // For custom APIs, customApiBaseUrl is the full base (e.g., http://custom.com/api.php/provide/vod)
                // API_CONFIG.search.path is then appended (e.g., ?ac=videolist&wd=)
                searchApiUrl = `${customApiBaseUrl}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
                const customIndex = parseInt(source.replace('custom_', ''), 10);
                sourceName = APISourceManager.getCustomApiInfo(customIndex)?.name || '自定义源';
            } else {
                if (!API_SITES[source]) throw new Error('无效的API来源');
                // For built-in APIs, API_SITES[source].api is the full base (e.g., https://json.heimuer.xyz/api.php/provide/vod)
                // API_CONFIG.search.path is then appended
                searchApiUrl = `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
                sourceName = API_SITES[source].name;
            }
            
            try {
                const result = await fetchWithTimeout( // Expects JSON
                    PROXY_URL + encodeURIComponent(searchApiUrl),
                    { headers: API_CONFIG.search.headers }
                );
                if (!result || !Array.isArray(result.list)) throw new Error('API返回的数据格式无效');

                result.list.forEach(item => {
                    item.source_name = sourceName;
                    item.source_code = source;
                    if (source.startsWith('custom_')) {
                        item.api_url = customApiBaseUrl; // Store the base URL used for this custom API
                    }
                });
                return JSON.stringify({ code: 200, list: result.list });
            } catch (error) {
                const errorMsg = error.name === 'AbortError' ? '搜索请求超时'
                    : error.name === 'SyntaxError' ? 'API返回的数据格式无效'
                    : error.message;
                return JSON.stringify({
                    code: 400,
                    msg: `搜索失败 (${sourceName || source}): ${errorMsg}`,
                    list: []
                });
            }
        }

        if (url.pathname === '/api/detail') {
            const id = url.searchParams.get('id');
            const sourceCode = url.searchParams.get('source') || 'heimuer'; // e.g., 'heimuer' or 'custom_0'
            if (!id) throw new Error('缺少视频ID参数');
            if (!/^[\w-]+$/.test(id)) throw new Error('无效的视频ID格式');

            let apiDetailInfo; // To store { name, url (base for JSON), detailScrapeUrl (for HTML) }

            if (sourceCode.startsWith('custom_')) {
                if (!customApiBaseUrl) throw new Error('获取自定义API详情时缺少 customApi 参数');
                const customIndex = parseInt(sourceCode.replace('custom_', ''), 10);
                const customApiMeta = APISourceManager.getCustomApiInfo(customIndex);
                if (!customApiMeta) throw new Error(`自定义API元数据未找到: ${sourceCode}`);
                apiDetailInfo = {
                    name: customApiMeta.name || '自定义源',
                    url: customApiBaseUrl, // Base URL for JSON detail endpoint
                    detailScrapeUrl: customApiMeta.detail || customApiBaseUrl // Fallback to base if specific detail scrape URL not set
                };
            } else {
                if (!API_SITES[sourceCode]) throw new Error(`未知内置API源: ${sourceCode}`);
                apiDetailInfo = {
                    name: API_SITES[sourceCode].name,
                    url: API_SITES[sourceCode].api, // Base URL for JSON detail endpoint
                    detailScrapeUrl: API_SITES[sourceCode].detail // URL for HTML scraping
                };
            }

            try {
                 // If useDetail=true (for custom) or API_SITES[sourceCode].detail is set (for built-in), try HTML scraping first.
                const shouldUseHtmlScraping = (sourceCode.startsWith('custom_') && url.searchParams.get('useDetail') === 'true' && apiDetailInfo.detailScrapeUrl) ||
                                             (!sourceCode.startsWith('custom_') && apiDetailInfo.detailScrapeUrl);

                if (shouldUseHtmlScraping) {
                    if (sourceCode.startsWith('custom_')) {
                        return await handleCustomApiSpecialDetail(id, apiDetailInfo.detailScrapeUrl);
                    } else {
                        return await handleSpecialSourceDetail(id, sourceCode); // sourceCode is enough for API_SITES lookup
                    }
                }
                // Standard JSON API detail
                else {
                    const detailJsonUrl = `${apiDetailInfo.url}${API_CONFIG.detail.path}${id}`;
                    
                    const result = await fetchWithTimeout( // Expects JSON
                        PROXY_URL + encodeURIComponent(detailJsonUrl),
                        { headers: API_CONFIG.detail.headers }
                    );
                    if (!result || !Array.isArray(result.list) || !result.list.length)
                        throw new Error('获取到的详情内容无效 (JSON)');
                    
                    const videoDetail = result.list[0];
                    let episodes = [];

                    if (videoDetail.vod_play_url) {
                        const mainSource = videoDetail.vod_play_url.split('$$$')[0] || '';
                        episodes = mainSource.split('#')
                            .map(ep => {
                                const parts = ep.split('$');
                                const link = parts[1];
                                return link && (link.startsWith('http://') || link.startsWith('https://')) ? link : '';
                            })
                            .filter(Boolean);
                    }
                    if (!episodes.length && videoDetail.vod_content) { // Fallback m3u8 regex on description
                        const matches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
                        episodes = matches.map(link => link.replace(/^\$/, ''));
                    }

                    return JSON.stringify({
                        code: 200,
                        episodes,
                        detailUrl: detailJsonUrl, 
                        videoInfo: {
                            vod_id: videoDetail.vod_id || id, // Ensure vod_id is present
                            title: videoDetail.vod_name,
                            cover: videoDetail.vod_pic,
                            desc: videoDetail.vod_content,
                            type: videoDetail.type_name,
                            year: videoDetail.vod_year,
                            area: videoDetail.vod_area,
                            director: videoDetail.vod_director,
                            actor: videoDetail.vod_actor,
                            remarks: videoDetail.vod_remarks,
                            source_name: apiDetailInfo.name,
                            source_code: sourceCode
                        }
                    });
                }
            } catch (error) {
                console.error(`详情处理错误 (source ${sourceCode}, id ${id}):`, error);
                const errorMsg = error.name === 'AbortError' ? '详情请求超时'
                    : error.name === 'SyntaxError' ? '详情数据格式无效'
                    : error.message;
                return JSON.stringify({
                    code: 400,
                    msg: `获取详情失败 (${apiDetailInfo.name || sourceCode}): ${errorMsg}`,
                    episodes: []
                });
            }
        }
        throw new Error('未知的API路径');
    } catch (error) { 
        console.error('API处理错误 (outer):', error);
        return JSON.stringify({
            code: 400,
            msg: error && error.message ? error.message : '请求处理失败',
            list: [],
            episodes: []
        });
    }
}

// 原始fetch函数
const originalFetch = window.fetch;

// 拦截全局fetch，处理API请求
window.fetch = async function (input, init) {
    let requestUrl;
    if (typeof input === 'string') {
        requestUrl = new URL(input, window.location.origin);
    } else if (input && input.url) { // Handle Request object input
        requestUrl = new URL(input.url, window.location.origin);
    }

    if (requestUrl && requestUrl.pathname.startsWith('/api/')) {
        if (window.isPasswordProtected && window.isPasswordVerified) {
            if (window.isPasswordProtected() && !window.isPasswordVerified()) {
                return new Response(JSON.stringify({
                    code: 401,
                    msg: 'Unauthorized: 需要密码验证',
                    list: [],
                    episodes: []
                }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
        try {
            const data = await handleApiRequest(requestUrl); // handleApiRequest now returns a stringified JSON
            return new Response(data, {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*', // CORS header
                }
            });
        } catch (err) { 
            console.error("Error during API request handling in fetch override:", err);
            return new Response(JSON.stringify({
                code: 500,
                msg: '服务器内部错误: ' + (err.message || '未知错误'),
                list: [],
                episodes: []
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    // For non-/api/ paths, use the original fetch
    return originalFetch.apply(this, arguments);
};

// 站点可用性测试 (Example, might not be used if search itself tests availability)
async function testSiteAvailability(apiUrl) {
    try {
        // Construct a test search URL. Note: 'customApi' here is the base URL of the site to test.
        const testSearchUrl = `/api/search?wd=test&source=custom_test&customApi=${encodeURIComponent(apiUrl)}`;
        const response = await fetch(testSearchUrl, { // This fetch will be intercepted
            signal: AbortSignal.timeout(5000) 
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data && data.code !== 400 && Array.isArray(data.list);
    } catch (e) {
        console.error('站点可用性测试失败:', e);
        return false;
    }
}
