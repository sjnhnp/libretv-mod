// ================================
// API请求与聚合处理优化版
// ================================

// 通用fetch，支持超时
async function fetchWithTimeout(targetUrl, options, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(targetUrl, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`请求失败: ${response.status}`);
        return await response.json();
    } catch (error) {
        clearTimeout(timer);
        throw error;
    }
}

// 处理特殊片源详情
async function handleSpecialSourceDetail(id, sourceCode) {
    try {
        const detailUrl = `${API_SITES[sourceCode].detail}/index.php/vod/detail/id/${id}.html`;
        const result = await fetchWithTimeout(
            PROXY_URL + encodeURIComponent(detailUrl),
            { headers: { 'User-Agent': API_CONFIG.search.headers['User-Agent'] } }
        );
        // 一级正则优先，二级通配兜底
        let matches = [];
        if (sourceCode === 'ffzy') {
            matches = result.html.match(/\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g) || [];
        }
        if (matches.length === 0) {
            matches = result.html.match(/\$(https?:\/\/[^"'\s]+?\.m3u8)/g) || [];
        }
        matches = Array.from(new Set(matches)).map(link => {
            link = link.slice(1);
            const idx = link.indexOf('(');
            return idx > -1 ? link.slice(0, idx) : link;
        });

        const title = (result.html.match(/<h1[^>]*>([^<]+)<\/h1>/) || [,''])[1].trim();
        const desc = (result.html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/) || [,''])[1]
            .replace(/<[^>]+>/g, ' ').trim();

        return JSON.stringify({
            code: 200, episodes: matches, detailUrl,
            videoInfo: {
                title,
                desc,
                source_name: API_SITES[sourceCode].name,
                source_code: sourceCode
            }
        });
    } catch (e) {
        console.error(`${API_SITES[sourceCode].name}详情获取失败:`, e);
        throw e;
    }
}

// 处理自定义API特殊详情
async function handleCustomApiSpecialDetail(id, customApi) {
    try {
        const detailUrl = `${customApi}/index.php/vod/detail/id/${id}.html`;
        const result = await fetchWithTimeout(
            PROXY_URL + encodeURIComponent(detailUrl),
            { headers: { 'User-Agent': API_CONFIG.search.headers['User-Agent'], 'Accept': 'application/json' } }
        );

        // 通用m3u8匹配
        const matches = (result.html && result.html.match(/\$https?:\/\/[^"'\s]+?\.m3u8/g) || [])
            .map(link => {
                link = link.slice(1);
                const idx = link.indexOf('(');
                return idx > -1 ? link.slice(0, idx) : link;
            });

        const title = (result.html.match(/<h1[^>]*>([^<]+)<\/h1>/) || [,''])[1].trim();
        const desc = (result.html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/) || [,''])[1]
            .replace(/<[^>]+>/g, ' ').trim();

        return JSON.stringify({
            code: 200, episodes: matches, detailUrl,
            videoInfo: {
                title, desc,
                source_name: '自定义源',
                source_code: 'custom'
            }
        });
    } catch (e) {
        console.error('自定义API详情获取失败:', e);
        throw e;
    }
}

// 处理聚合搜索：支持并发、超时、自动去重
async function handleAggregatedSearch(searchQuery) {
    const availableSources = Object.keys(API_SITES)
        .filter(key => key !== 'aggregated' && key !== 'custom');
    if (availableSources.length === 0) throw new Error('没有可用的API源');

    const requests = availableSources.map(source =>
        fetchWithTimeout(
            PROXY_URL + encodeURIComponent(`${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`),
            { headers: API_CONFIG.search.headers },
            AGGREGATED_SEARCH_CONFIG.timeout
        ).catch(err => {
            console.warn(`${source}源搜索失败:`, err);
            return null;
        })
    );
    try {
        const results = await Promise.all(requests);
        let all = [];
        results.forEach((r, i) => {
            if (r && Array.isArray(r.list))
                all.push(...r.list.map(item => ({
                    ...item,
                    source_name: API_SITES[availableSources[i]].name,
                    source_code: availableSources[i]
                })));
        });
        if (!all.length) {
            return JSON.stringify({
                code: 200, list: [], msg: '所有源均无搜索结果'
            });
        }
        // 去重：vod_id & source_code
        const seen = new Set(), unique = [];
        for (const item of all) {
            const k = `${item.source_code}_${item.vod_id}`;
            if (!seen.has(k)) {
                seen.add(k); unique.push(item);
            }
        }
        unique.sort((a, b) => {
            const na = a.vod_name || '', nb = b.vod_name || '';
            const cmp = na.localeCompare(nb);
            return cmp !== 0 ? cmp :
                (a.source_name || '').localeCompare(b.source_name || '');
        });
        return JSON.stringify({ code: 200, list: unique });
    } catch (err) {
        console.error('聚合搜索处理错误:', err);
        return JSON.stringify({
            code: 400,
            msg: '聚合搜索处理失败: ' + err.message, list: []
        });
    }
}

// 处理多个自定义API源的聚合
async function handleMultipleCustomSearch(searchQuery, customApiUrls) {
    const apiUrls = customApiUrls.split(CUSTOM_API_CONFIG.separator)
        .map(url => url.trim())
        .filter(url => /^https?:\/\//.test(url))
        .slice(0, CUSTOM_API_CONFIG.maxSources);
    if (!apiUrls.length) throw new Error('没有提供有效的自定义API地址');

    const requests = apiUrls.map((apiUrl, i) =>
        fetchWithTimeout(
            PROXY_URL + encodeURIComponent(`${apiUrl}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`),
            { headers: API_CONFIG.search.headers },
            CUSTOM_API_CONFIG.testTimeout
        ).catch(err => {
            console.warn(`自定义API ${i + 1} 搜索失败:`, err);
            return null;
        })
    );

    try {
        const results = await Promise.all(requests);
        let all = [];
        results.forEach((r, i) => {
            if (r && Array.isArray(r.list))
                all.push(...r.list.map(item => ({
                    ...item,
                    source_name: `${CUSTOM_API_CONFIG.namePrefix}${i + 1}`,
                    source_code: 'custom',
                    api_url: apiUrls[i]
                })));
        });
        if (!all.length) {
            return JSON.stringify({
                code: 200, list: [], msg: '所有自定义API源均无搜索结果'
            });
        }
        // 去重: vod_id + api_url
        const seen = new Set(), unique = [];
        for (const item of all) {
            const k = `${item.api_url || ''}_${item.vod_id}`;
            if (!seen.has(k)) {
                seen.add(k);
                unique.push(item);
            }
        }
        return JSON.stringify({ code: 200, list: unique });
    } catch (err) {
        console.error('自定义API聚合搜索处理错误:', err);
        return JSON.stringify({
            code: 400,
            msg: '自定义API聚合搜索处理失败: ' + err.message,
            list: []
        });
    }
}

// ================================
// 改进的API请求主处理函数
// ================================
async function handleApiRequest(url) {
    const customApi = url.searchParams.get('customApi') || '';
    const source = url.searchParams.get('source') || 'heimuer';

    try {
        if (url.pathname === '/api/search') {
            const searchQuery = url.searchParams.get('wd');
            if (!searchQuery) throw new Error('缺少搜索参数');

            // 多自定义源聚合
            if (source === 'custom' && customApi.includes(CUSTOM_API_CONFIG.separator)) {
                return await handleMultipleCustomSearch(searchQuery, customApi);
            }

            // 验证API与source
            if (source === 'custom' && !customApi) throw new Error('使用自定义API时必须提供API地址');
            if (!API_SITES[source] && source !== 'custom') throw new Error('无效的API来源');

            // 构建API URL
            const apiUrl = source === 'custom'
                ? `${customApi}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`
                : `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;

            const result = await fetchWithTimeout(
                PROXY_URL + encodeURIComponent(apiUrl),
                { headers: API_CONFIG.search.headers }
            );
            if (!result || !Array.isArray(result.list)) throw new Error('API返回的数据格式无效');

            // 合并源信息
            result.list.forEach(item => {
                item.source_name = source === 'custom' ? '自定义源' : API_SITES[source].name;
                item.source_code = source;
                if (source === 'custom') item.api_url = customApi;
            });
            return JSON.stringify({ code: 200, list: result.list });
        }

        if (url.pathname === '/api/detail') {
            const id = url.searchParams.get('id');
            const sourceCode = url.searchParams.get('source') || 'heimuer';
            if (!id) throw new Error('缺少视频ID参数');
            if (!/^[\w-]+$/.test(id)) throw new Error('无效的视频ID格式');

            // 特殊片源
            if ((['ffzy', 'jisu', 'huangcang'].includes(sourceCode)) &&
                API_SITES[sourceCode]?.detail) {
                return await handleSpecialSourceDetail(id, sourceCode);
            }
            // 自定义API特殊
            if (sourceCode === 'custom' && url.searchParams.get('useDetail') === 'true') {
                return await handleCustomApiSpecialDetail(id, customApi);
            }
            // 标准API详情
            const detailUrl = sourceCode.startsWith('custom_')
                ? `${customApi}${API_CONFIG.detail.path}${id}`
                : `${API_SITES[sourceCode].api}${API_CONFIG.detail.path}${id}`;
            const result = await fetchWithTimeout(
                PROXY_URL + encodeURIComponent(detailUrl),
                { headers: API_CONFIG.detail.headers }
            );
            if (!result || !Array.isArray(result.list) || !result.list.length)
                throw new Error('获取到的详情内容无效');

            const videoDetail = result.list[0];
            let episodes = [];

            // 分集地址解析
            if (videoDetail.vod_play_url) {
                const mainSource = videoDetail.vod_play_url.split('$$$')[0] || '';
                episodes = mainSource.split('#')
                    .map(ep => {
                        const [ , link ] = ep.split('$');
                        return link && (link.startsWith('http://') || link.startsWith('https://')) ? link : '';
                    })
                    .filter(Boolean);
            }
            // m3u8兜底
            if (!episodes.length && videoDetail.vod_content) {
                const matches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
                episodes = matches.map(link => link.replace(/^\$/, ''));
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
        }
        throw new Error('未知的API路径');
    } catch (error) {
        console.error('API处理错误:', error);
        return JSON.stringify({
            code: 400,
            msg: error && error.message ? error.message : '请求处理失败',
            list: [],
            episodes: []
        });
    }
}

// 初始化 API 请求拦截（fetch patch）
(function() {
    const originalFetch = window.fetch;
    window.fetch = async function(input, init) {
        let requestUrl;
        if (typeof input === 'string') {
            requestUrl = new URL(input, window.location.origin);
        } else if (input && input.url) {
            requestUrl = new URL(input.url, window.location.origin);
        }
        if (requestUrl && requestUrl.pathname.startsWith('/api/')) {
            if (window.isPasswordProtected && window.isPasswordVerified) {
                if (window.isPasswordProtected() && !window.isPasswordVerified()) return;
            }
            try {
                const data = await handleApiRequest(requestUrl);
                return new Response(data, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    }
                });
            } catch (err) {
                return new Response(JSON.stringify({
                    code: 500,
                    msg: '服务器内部错误',
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
        return originalFetch.apply(this, arguments);
    };
})();

// 站点可用性测试
async function testSiteAvailability(apiUrl) {
    try {
        const response = await fetch('/api/search?wd=test&customApi=' + encodeURIComponent(apiUrl), {
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
