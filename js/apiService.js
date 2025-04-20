import {
    PROXY_URL, API_SITES, API_CONFIG, CUSTOM_API_CONFIG, M3U8_PATTERN
} from './config.js';

// -- 参数校验 --
function validateApiInput(input, type = 'query') {
    if (typeof input !== 'string' || !input.trim()) return false;
    if (type === 'query' && input.length > 64) return false;
    if (type === 'id' && !/^[\w-]+$/.test(input)) return false;
    if (type === 'apiUrl' && !/^https?:\/\/[\w\-\.]+/.test(input)) return false;
    return true;
}
// -- helpers --
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

// -- 1. searchVideos --
export async function searchVideos(query, selectedSources = []) {
    // 泛用search，可聚合多源/自定义
    if (!validateApiInput(query, 'query')) {
        return { code: 400, msg: '无效的搜索参数', list: [] };
    }

    // 组装API调用列表
    let apis = [];
    let isCustomBatch = false;
    for (const src of selectedSources) {
        if (src.startsWith('custom_')) {
            const idx = parseInt(src.replace('custom_', ''), 10);
            // customApis管理交由业务侧传参/全局处理，这里只做格式
            // 由app.js/调用方传入 customAPIs 顺序与id映射保证
            apis.push({ code: 'custom', apiUrl: null, customIndex: idx });
            isCustomBatch = true;
        } else if (API_SITES[src]) {
            apis.push({ code: src, apiUrl: API_SITES[src].api });
        }
    }

    // 多自定义API特殊聚合
    if (isCustomBatch) {
        // 注意此情况需app.js传递 customAPIs，并做索引对齐匹配
        return { code: 501, msg: '请直接用多自定义API聚合接口', list: [] };
    }

    // 并发聚合多标准API
    const promises = apis.map(async ({ code, apiUrl }) => {
        try {
            const url = `${apiUrl}${API_CONFIG.search.path}${encodeURIComponent(query)}`;
            const json = await safeFetchJson(PROXY_URL + encodeURIComponent(url), {
                headers: API_CONFIG.search.headers,
                timeout: 8000
            });
            if (!json || !Array.isArray(json.list)) throw new Error('返回格式无效');
            return json.list.map(item => ({
                ...item,
                source_name: (API_SITES[code]?.name || code),
                source_code: code
            }));
        } catch (e) {
            // 返回空
            return [];
        }
    });

    let allResults = [];
    try {
        allResults = (await Promise.all(promises)).flat();
    } catch {
        allResults = [];
    }
    // 去重
    const seen = new Set();
    allResults = allResults.filter(item => {
        const key = (item.source_code || '') + '_' + (item.vod_id || item.id || '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return { code: 200, list: allResults };
}

// -- 2. getVideoDetails --
export async function getVideoDetails(videoId, sourceIdentifier, apiConfigOrCustom) {
    // videoId: 视频id, sourceIdentifier: 源key或custom_*，apiConfigOrCustom: 自定义源对象（如自定义源时传）

    if (!validateApiInput(videoId, 'id')) {
        return { code: 400, msg: '无效的视频ID', videoInfo: {}, detailUrl: "", episodes: [] };
    }

    let apiUrl, apiName, code, isCustom = false;

    if (sourceIdentifier && sourceIdentifier.startsWith('custom_')) {
        // customAPIs: { name, url, isAdult }
        isCustom = true;
        apiUrl = apiConfigOrCustom?.url || '';
        apiName = apiConfigOrCustom?.name || '自定义源';
        code = 'custom';
        if (!validateApiInput(apiUrl, 'apiUrl')) {
            return { code: 400, msg: '自定义API链接无效', videoInfo: {}, detailUrl: "", episodes: [] };
        }
    } else if (API_SITES[sourceIdentifier]) {
        apiUrl = API_SITES[sourceIdentifier].api;
        apiName = API_SITES[sourceIdentifier].name;
        code = sourceIdentifier;
    } else {
        return { code: 400, msg: '无效的来源KEY', videoInfo: {}, detailUrl: "", episodes: [] };
    }

    // 特殊源（html抓取）逻辑
    if ((code === 'ffzy' || code === 'jisu' || code === 'huangcang') && API_SITES[code]?.detail) {
        // crawl by HTML
        try {
            const site = API_SITES[code];
            const detailUrl = `${site.detail}/index.php/vod/detail/id/${videoId}.html`;
            const html = await safeFetchText(PROXY_URL + encodeURIComponent(detailUrl), {
                headers: {'User-Agent': API_CONFIG.detail.headers['User-Agent']},
                timeout: 10000
            });
            let matches = [];
            if (code === 'ffzy') {
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
            const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
            const descMatch = html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);
            const title = titleMatch ? titleMatch[1].trim() : '';
            const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : '';
            return {
                code: 200,
                episodes: matches,
                detailUrl,
                videoInfo: { title, desc, source_name: site.name, source_code: code }
            };
        } catch (e) {
            return { code: 500, msg: `${apiName}详情获取失败: ${e.message}`, videoInfo: {}, detailUrl: "", episodes: [] };
        }
    }

    // 自定义API特殊HTML模式
    if (isCustom && apiConfigOrCustom?.useDetail === true) {
        try {
            const detailUrl = `${apiUrl}/index.php/vod/detail/id/${videoId}.html`;
            const html = await safeFetchText(PROXY_URL + encodeURIComponent(detailUrl), {
                headers: {'User-Agent': API_CONFIG.detail.headers['User-Agent']},
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
            return {
                code: 200,
                episodes: matches,
                detailUrl,
                videoInfo: { title, desc, source_name: '自定义源', source_code: 'custom' }
            };
        } catch (e) {
            return { code: 500, msg: `自定义API详情获取失败: ${e.message}`, videoInfo: {}, detailUrl: "", episodes: [] };
        }
    }

    // 标准API模式
    try {
        const baseUrl = apiUrl;
        const detailUrl = `${baseUrl}${API_CONFIG.detail.path}${videoId}`;
        const data = await safeFetchJson(PROXY_URL + encodeURIComponent(detailUrl), {
            headers: API_CONFIG.detail.headers,
            timeout: 10000
        });
        if (!data || !data.list || !Array.isArray(data.list) || !data.list.length)
            throw new Error('获取到的详情内容无效');
        const videoDetail = data.list[0];
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
        if (!episodes.length && videoDetail.vod_content) {
            const matches = videoDetail.vod_content.match(M3U8_PATTERN);
            episodes = matches ? matches.map(m => m.replace(/^\$/, '')) : [];
        }
        return {
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
                source_name: apiName,
                source_code: code
            }
        };
    } catch (e) {
        return { code: 500, msg: '详情请求失败: ' + e.message, videoInfo: {}, detailUrl: "", episodes: [] };
    }
}

// -- 3. testApiAvailability --
export async function testApiAvailability(apiUrl) {
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
