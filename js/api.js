// ===================== API Handling Logic: /js/api.js =====================

/**
 * 对字符串做参数有效性校验
 */
function validateApiInput(input, type = 'query') {
    if (typeof input !== 'string' || !input.trim()) return false;
    if (type === 'query' && input.length > 64) return false;
    if (type === 'id' && !/^[\w-]+$/.test(input)) return false;
    if (type === 'apiUrl' && !/^https?:\/\/[\w\-\.]+/.test(input)) return false;
    return true;
}

/**
 * 通用fetch json，可带超时
 */
async function safeFetchJson(url, { headers = {}, signal = undefined, timeout = 10000 } = {}) {
    const controller = signal ? null : new AbortController();
    const usedSignal = signal || (controller && controller.signal);
    let timeoutId;
    try {
        timeoutId = setTimeout(() => controller && controller.abort(), timeout);
        const resp = await fetch(url, { headers, signal: usedSignal });
        clearTimeout(timeoutId);
        if (!resp.ok) throw new Error('API请求失败: ' + resp.status);
        return await resp.json();
    } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        throw e;
    }
}

async function safeFetchText(url, { headers = {}, signal = undefined, timeout = 10000 } = {}) {
    const controller = signal ? null : new AbortController();
    const usedSignal = signal || (controller && controller.signal);
    let timeoutId;
    try {
        timeoutId = setTimeout(() => controller && controller.abort(), timeout);
        const resp = await fetch(url, { headers, signal: usedSignal });
        clearTimeout(timeoutId);
        if (!resp.ok) throw new Error('请求失败: ' + resp.status);
        return await resp.text();
    } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        throw e;
    }
}

/**
 * 通用聚合API fetch器（标准/自定义API聚合共用）
 * @param {Array} apis - [{ name, code, apiUrl }]
 */
async function aggregateSearchApis(searchQuery, apis) {
    const promises = apis.map(async ({ name, code, apiUrl }, idx) => {
        try {
            const url = `${apiUrl}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
            const json = await safeFetchJson(PROXY_URL + encodeURIComponent(url), {
                headers: API_CONFIG.search.headers,
                timeout: 8000
            });
            if (!json || !Array.isArray(json.list)) throw new Error('返回格式无效');
            return json.list.map(item => ({
                ...item,
                source_name: name,
                source_code: code,
                api_url: code === 'custom' ? apiUrl : undefined
            }));
        } catch (e) {
            // 本源失败返回空，警告上报
            console.warn(`${name || code}源搜索失败:`, e);
            return [];
        }
    });
    const allResults = (await Promise.all(promises)).flat();
    // 去重(标准：source_code+vod_id; 自定义：api_url+vod_id)
    const seen = new Set();
    return allResults.filter(item => {
        const key = (item.api_url || item.source_code || '') + '_' + (item.vod_id || item.id || '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ---------------- 主API请求分发 ----------------

async function handleApiRequest(url) {
    try {
        switch (url.pathname) {
            case '/api/search':
                return await handleApiSearch(url);
            case '/api/detail':
                return await handleApiDetail(url);
            default:
                throw new Error('未知的API路径');
        }
    } catch (e) {
        console.error('API处理错误:', e);
        return JSON.stringify({
            code: 400,
            msg: e.message || '请求处理失败',
            list: [],
            episodes: []
        });
    }
}

// ---------- API /api/search ----------

async function handleApiSearch(url) {
    const searchQuery = url.searchParams.get('wd');
    const customApi = url.searchParams.get('customApi') || '';
    const source = url.searchParams.get('source') || 'heimuer';

    if (!validateApiInput(searchQuery, 'query')) throw new Error('缺少或无效的搜索参数');

    // 多自定义API聚合搜索
    if (customApi.includes(CUSTOM_API_CONFIG.separator)) {
        return await handleMultipleCustomSearch(searchQuery, customApi);
    }

    // 聚合内置源
    if (source === 'aggregated') {
        return await handleAggregatedSearch(searchQuery);
    }

    // 单一标准API/自定义API
    let apiUrl, apiName, apiCode;
    if (source === 'custom') {
        // 校验
        if (!validateApiInput(customApi, 'apiUrl')) throw new Error('无效的自定义API地址');
        apiUrl = customApi;
        apiName = '自定义源';
        apiCode = 'custom';
    } else {
        if (!API_SITES[source]) throw new Error('无效的API来源');
        apiUrl = API_SITES[source].api;
        apiName = API_SITES[source].name;
        apiCode = source;
    }
    const finalUrl = `${apiUrl}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;

    // 超时与异常统一处理
    try {
        const json = await safeFetchJson(PROXY_URL + encodeURIComponent(finalUrl), {
            headers: API_CONFIG.search.headers,
            timeout: 10000
        });
        if (!json || !Array.isArray(json.list)) throw new Error('API返回的数据格式无效');
        for (const item of json.list) {
            item.source_name = apiName;
            item.source_code = apiCode;
            if (apiCode === 'custom') item.api_url = apiUrl;
        }
        return JSON.stringify({
            code: 200,
            list: json.list
        });
    } catch (e) {
        throw new Error('搜索请求失败: ' + e.message);
    }
}

// ---------- API /api/detail ----------

async function handleApiDetail(url) {
    const id = url.searchParams.get('id');
    const customApi = url.searchParams.get('customApi') || '';
    const sourceCode = url.searchParams.get('source') || 'heimuer';
    const useDetail = url.searchParams.get('useDetail');
    if (!validateApiInput(id, 'id')) throw new Error('缺少或无效视频ID参数');

    if (sourceCode === 'custom' && !validateApiInput(customApi, 'apiUrl'))
        throw new Error('无效的自定义API地址');

    if (!API_SITES[sourceCode] && sourceCode !== 'custom')
        throw new Error('无效的API来源');

    // 特殊源独立逻辑
    if ((sourceCode === 'ffzy' || sourceCode === 'jisu' || sourceCode === 'huangcang') && API_SITES[sourceCode].detail)
        return await handleSpecialSourceDetail(id, sourceCode);

    if (sourceCode === 'custom' && useDetail === 'true')
        return await handleCustomApiSpecialDetail(id, customApi);

    // 标准API模式
    const baseUrl = sourceCode === 'custom' ? customApi : API_SITES[sourceCode].api;
    const detailUrl = `${baseUrl}${API_CONFIG.detail.path}${id}`;
    try {
        const data = await safeFetchJson(PROXY_URL + encodeURIComponent(detailUrl), {
            headers: API_CONFIG.detail.headers,
            timeout: 10000
        });

        // 检查与解析
        if (!data || !data.list || !Array.isArray(data.list) || !data.list.length)
            throw new Error('获取到的详情内容无效');
        const videoDetail = data.list[0];

        // episode 兼容解析
        let episodes = [];
        if (videoDetail.vod_play_url) {
            const playSources = videoDetail.vod_play_url.split('$$$');
            if (playSources.length) {
                const mainSource = playSources[0];
                episodes = mainSource.split('#').map(ep => {
                    const parts = ep.split('$');
                    return parts.length > 1 ? parts[1] : '';
                }).filter(u => /^https?:\/\//.test(u));
            }
        }
        // 若还没有集数，尝试内容区M3U8正则补抓
        if (!episodes.length && videoDetail.vod_content) {
            const matches = videoDetail.vod_content.match(M3U8_PATTERN);
            episodes = matches ? matches.map(m => m.replace(/^\$/, '')) : [];
        }

        return JSON.stringify({
            code: 200,
            episodes,
            detailUrl,
            videoInfo: {
                title: videoDetail.vod_name,
                cover: videoDetail.vod_pic,
                desc: videoDetail.vod_content,
                type: videoDetail.type_name,
                year: videoDetail.vod_year,
                area: videoDetail.vod_area,
                director: videoDetail.vod_director,
                actor: videoDetail.vod_actor,
                remarks: videoDetail.vod_remarks,
                source_name: sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode].name,
                source_code: sourceCode
            }
        });
    } catch (e) {
        throw new Error('详情请求失败: ' + e.message);
    }
}

// --------------- 特殊源详情解析统一入口 ---------------

async function handleSpecialSourceDetail(id, sourceCode) {
    try {
        const site = API_SITES[sourceCode];
        const detailUrl = `${site.detail}/index.php/vod/detail/id/${id}.html`;
        const html = await safeFetchText(PROXY_URL + encodeURIComponent(detailUrl), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        // 匹配m3u8（优先特殊格式，否则退回通用）
        let matches = [];
        if (sourceCode === 'ffzy') {
            const ffzyPattern = /\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g;
            matches = html.match(ffzyPattern) || [];
        }
        if (!matches.length) {
            const generalPattern = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
            matches = html.match(generalPattern) || [];
        }
        matches = [...new Set(matches)].map(link => {
            link = link.substring(1);
            const paren = link.indexOf('(');
            return paren > 0 ? link.slice(0, paren) : link;
        });

        // 安全提取标题/简介
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const descMatch = html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);
        const title = titleMatch ? titleMatch[1].trim() : '';
        const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : '';

        return JSON.stringify({
            code: 200,
            episodes: matches,
            detailUrl,
            videoInfo: {
                title,
                desc,
                source_name: site.name,
                source_code: sourceCode
            }
        });
    } catch (e) {
        throw new Error(`${API_SITES[sourceCode]?.name || sourceCode}详情获取失败: ${e.message}`);
    }
}

// --------------- 自定义API特殊详情解析 ---------------

async function handleCustomApiSpecialDetail(id, customApi) {
    try {
        const detailUrl = `${customApi}/index.php/vod/detail/id/${id}.html`;
        const html = await safeFetchText(PROXY_URL + encodeURIComponent(detailUrl), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const generalPattern = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
        let matches = html.match(generalPattern) || [];
        matches = matches.map(link => {
            link = link.substring(1);
            const paren = link.indexOf('(');
            return paren > 0 ? link.slice(0, paren) : link;
        });

        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const descMatch = html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);
        const title = titleMatch ? titleMatch[1].trim() : '';
        const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : '';

        return JSON.stringify({
            code: 200,
            episodes: matches,
            detailUrl,
            videoInfo: {
                title,
                desc,
                source_name: '自定义源',
                source_code: 'custom'
            }
        });
    } catch (e) {
        throw new Error('自定义API详情获取失败: ' + e.message);
    }
}

// ----------- 聚合内置API搜索实现 ------------

async function handleAggregatedSearch(searchQuery) {
    // 全有效API（非聚合/非custom）
    const apis = Object.entries(API_SITES).filter(([k, v]) => k !== 'aggregated' && k !== 'custom')
        .map(([k, v]) => ({ name: v.name, code: k, apiUrl: v.api }));
    const results = await aggregateSearchApis(searchQuery, apis);
    if (!results.length) return JSON.stringify({
        code: 200,
        list: [],
        msg: '所有源均无搜索结果'
    });
    // 结果排序
    results.sort((a, b) => {
        const aName = a.vod_name || '', bName = b.vod_name || '';
        const cmp = aName.localeCompare(bName);
        return cmp || ((a.source_name || '').localeCompare(b.source_name || ''));
    });
    return JSON.stringify({
        code: 200,
        list: results
    });
}

// ------------- 多自定义API聚合搜索 --------------

async function handleMultipleCustomSearch(searchQuery, customApiUrls) {
    const apiUrls = customApiUrls.split(CUSTOM_API_CONFIG.separator)
        .map(url => url.trim())
        .filter(url => validateApiInput(url, 'apiUrl'))
        .slice(0, CUSTOM_API_CONFIG.maxSources);

    if (apiUrls.length === 0) throw new Error('没有提供有效的自定义API地址');

    const apis = apiUrls.map((apiUrl, idx) => ({
        name: `${CUSTOM_API_CONFIG.namePrefix}${idx + 1}`,
        code: 'custom',
        apiUrl
    }));
    const results = await aggregateSearchApis(searchQuery, apis);
    if (!results.length) return JSON.stringify({
        code: 200,
        list: [],
        msg: '所有自定义API源均无搜索结果'
    });
    return JSON.stringify({
        code: 200,
        list: results
    });
}

// ------- fetch拦截器：API路径拦截 --------

(function () {
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
        let reqUrl;
        if (typeof input === 'string') reqUrl = new URL(input, window.location.origin);
        else if (input instanceof Request) reqUrl = new URL(input.url, window.location.origin);
        if (reqUrl && reqUrl.pathname.startsWith('/api/')) {
            if (window.isPasswordProtected && window.isPasswordVerified) {
                if (window.isPasswordProtected() && !window.isPasswordVerified()) return;
            }
            try {
                const data = await handleApiRequest(reqUrl);
                return new Response(data, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            } catch (e) {
                return new Response(JSON.stringify({ code: 500, msg: '服务器内部错误' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
        // 非API回到原始fetch
        return originalFetch.apply(this, arguments);
    }
})();

// ----------- API站（自定义/标准API）可用性探测 -----------
async function testSiteAvailability(apiUrl) {
    try {
        const resp = await fetch('/api/search?wd=test&customApi=' + encodeURIComponent(apiUrl), {
            signal: AbortSignal.timeout(5000)
        });
        if (!resp.ok) return false;
        const data = await resp.json();
        return data && data.code !== 400 && Array.isArray(data.list);
    } catch (e) {
        return false;
    }
}
window.testSiteAvailability = testSiteAvailability;
