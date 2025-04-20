// ================= 基本配置与常量导入区域 =================
/* 请确保在主HTML中先加载 config.js，保证如下全局常量可用：
   PROXY_URL, API_SITES, API_CONFIG, M3U8_PATTERN, CUSTOM_API_CONFIG
*/

const API_TIMEOUT = 10000;
const ERROR_CODES = {
    BAD_REQUEST: 400,
    SERVER_ERROR: 500
};

// ================ fetch 拦截器入口 ================
(function() {
    const originalFetch = window.fetch;
    window.fetch = async function(input, init) {
        let requestUrlObj;
        if (typeof input === 'string' && input.startsWith('/api/')) {
            requestUrlObj = new URL(input, window.location.origin);
        } else if (input && input.url && input.url.startsWith && input.url.startsWith('/api/')) {
            requestUrlObj = new URL(input.url, window.location.origin);
        }
        if (requestUrlObj && requestUrlObj.pathname.startsWith('/api/')) {
            // 口令保护
            if (window.isPasswordProtected && window.isPasswordVerified) {
                if (window.isPasswordProtected() && !window.isPasswordVerified()) {
                    return new Response(JSON.stringify({
                        code: 401, msg: '未验证密码'
                    }), { status: 401, headers:{'Content-Type':'application/json'} });
                }
            }
            // 分发API路由
            return handleApiRequest(requestUrlObj);
        }
        // 非API，走默认
        return originalFetch.apply(this, arguments);
    };
})();

// ========== API主路由函数 ==========
async function handleApiRequest(urlObj) {
    try {
        switch (urlObj.pathname) {
            case '/api/search':
                return await apiHandleSearch(urlObj);
            case '/api/detail':
                return await apiHandleDetail(urlObj);
            default:
                return apiErrorResp(404, '未知的API路径');
        }
    } catch(err) {
        console.error('API请求异常:', err);
        return apiErrorResp(500, err.message || '服务器内部错误');
    }
}

// ========== /api/search 主处理 ==========
async function apiHandleSearch(urlObj) {
    const wd = urlObj.searchParams.get('wd')?.trim();
    const customApi = urlObj.searchParams.get('customApi');
    if (!wd) return apiErrorResp(400, '缺少搜索参数');

    // 是否为多自定义API聚合搜索
    if(customApi && customApi.includes(CUSTOM_API_CONFIG.separator)){
        return await handleMultipleCustomSearch(wd, customApi);
    }

    // 单自定义API搜索
    if (customApi) {
        return await handleSingleCustomSearch(wd, customApi);
    }
    // 默认、内置API和支持聚合
    const source = urlObj.searchParams.get('source');
    if(source==='aggregated'){ // 聚合搜索
        return await handleAggregatedSearch(wd);
    }

    const apiSource = source || 'heimuer';
    if (!API_SITES[apiSource]) return apiErrorResp(400, '无效的API来源');

    try {
        const apiUrl = API_SITES[apiSource].api + API_CONFIG.search.path + encodeURIComponent(wd);
        const resp = await fetchWithTimeout(PROXY_URL+encodeURIComponent(apiUrl), {
            headers: API_CONFIG.search.headers
        });
        if (!resp.ok) throw new Error(`API请求失败: ${resp.status}`);
        const data = await resp.json();
        if (!data || !Array.isArray(data.list)) {
            throw new Error('API返回的数据格式无效');
        }
        // 补充来源标记
        data.list.forEach(item=>{
            item.source_name = API_SITES[apiSource].name;
            item.source_code = apiSource;
        });
        return apiSuccResp({ list: data.list });
    } catch (err) {
        return apiErrorResp(500, err.message);
    }
}

// ============ 单自定义API搜索 ============
async function handleSingleCustomSearch(wd, customApi) {
    if (!/^https?:\/\/[\w\.\-]+/.test(customApi)) {
        return apiErrorResp(400, '自定义API地址格式无效');
    }
    const apiUrl = customApi.replace(/\/$/,'') + API_CONFIG.search.path + encodeURIComponent(wd);
    try{
        const resp = await fetchWithTimeout(PROXY_URL+encodeURIComponent(apiUrl),{
            headers: API_CONFIG.search.headers
        });
        if (!resp.ok) throw new Error(`自定义API请求失败:${resp.status}`);
        const data = await resp.json();
        if (!data || !Array.isArray(data.list)) throw new Error('自定义API数据格式无效');
        data.list.forEach(item=>{
            item.source_name = '自定义源';
            item.source_code = 'custom';
            item.api_url = customApi;
        });
        return apiSuccResp({ list: data.list });
    }catch(e){
        return apiErrorResp(500, e.message);
    }
}

// ============ 多自定义API聚合 ==========
async function handleMultipleCustomSearch(wd, customApiUrls) {
    const apis = customApiUrls.split(CUSTOM_API_CONFIG.separator)
        .map(url=>url.trim())
        .filter(url=>/^https?:\/\/.+/.test(url))
        .slice(0, CUSTOM_API_CONFIG.maxSources);
    if(apis.length===0) return apiErrorResp(400, '无效的自定义API地址');
    const promArr = apis.map(async (url, idx)=>{
        try{
            const fullUrl = url.replace(/\/$/,'')+API_CONFIG.search.path + encodeURIComponent(wd);
            const resp = await fetchWithTimeout(PROXY_URL+encodeURIComponent(fullUrl),{
                headers: API_CONFIG.search.headers
            });
            if (!resp.ok) return [];
            const data = await resp.json();
            if (!data || !Array.isArray(data.list)) return [];
            return data.list.map(item=>({
                ...item,
                source_name: `${CUSTOM_API_CONFIG.namePrefix}${idx+1}`,
                source_code: 'custom',
                api_url : url
            }));
        }catch(e){ return []; }
    });
    const allResArr = await Promise.all(promArr);
    let allResults = [];
    allResArr.forEach(arr=>{ if(arr.length) allResults = allResults.concat(arr); });
    // 去重 根据vod_id+api_url
    const seen = new Set(), res=[];
    for(const item of allResults){
        const k = (item.api_url||'')+'_'+item.vod_id;
        if(!seen.has(k)){ seen.add(k); res.push(item);}
    }
    return apiSuccResp({ list: res });
}

// ============ 聚合搜索内置源 ==========
async function handleAggregatedSearch(wd) {
    const available = Object.keys(API_SITES).filter(k=>!API_SITES[k].adult && k!=='aggregated'&&k!=='custom');
    if(available.length===0) return apiErrorResp(400, '无可用API源');
    const promArr = available.map(async(k)=>{
        try{
            const apiUrl = API_SITES[k].api+API_CONFIG.search.path+encodeURIComponent(wd);
            const resp = await fetchWithTimeout(PROXY_URL+encodeURIComponent(apiUrl),{
                headers: API_CONFIG.search.headers
            });
            if (!resp.ok) return [];
            const data = await resp.json();
            if (!data || !Array.isArray(data.list)) return [];
            return data.list.map(item=>({
                ...item,
                source_name: API_SITES[k].name,
                source_code: k
            }));
        }catch(e){ return []; }
    });
    const arrs = await Promise.all(promArr);
    let all=[];
    arrs.forEach(arr=>{ if(arr.length) all=all.concat(arr); });
    // 去重(vod_id+source_code)
    const seen = new Set(), res=[];
    for(const item of all){
        const k = item.source_code+'_'+item.vod_id;
        if(!seen.has(k)){ seen.add(k); res.push(item);}
    }
    // 按名称和来源排序
    res.sort((a,b)=>{
        const n = (a.vod_name||'').localeCompare(b.vod_name||'');
        return n!==0? n : (a.source_name||'').localeCompare(b.source_name||'');
    });
    return apiSuccResp({ list: res });
}

// ============== /api/detail 逻辑 ===========
async function apiHandleDetail(urlObj) {
    const id = urlObj.searchParams.get('id');
    const source = urlObj.searchParams.get('source')||'heimuer';
    const customApi = urlObj.searchParams.get('customApi');
    const useDetail = urlObj.searchParams.get('useDetail') === 'true';
    if (!id) return apiErrorResp(400, '缺少视频ID参数');
    if (!/^[\w-]+$/.test(id)) return apiErrorResp(400, '无效的视频ID');

    // 自定义API（特殊详情 or 标准）
    if(source==='custom' && customApi){
        if(useDetail){
            // 自定义HTML详情
            return await handleCustomApiSpecialDetail(id, customApi);
        }
        return await handleCustomApiDetail(id, customApi);
    }

    if(!API_SITES[source]) return apiErrorResp(400, '无效API来源');

    // 特殊HTML详情解析
    if ((source==='ffzy'||source==='jisu'||source==='huangcang') && API_SITES[source].detail){
        return await handleCommonHtmlDetail(id, source, API_SITES[source].detail, API_SITES[source].name);
    }

    // 标准API(json)
    const detailUrl = API_SITES[source].api + API_CONFIG.detail.path + id;
    try{
        const resp = await fetchWithTimeout(PROXY_URL+encodeURIComponent(detailUrl), {
            headers: API_CONFIG.detail.headers
        });
        if (!resp.ok) throw new Error('详情请求失败:'+resp.status);
        const data = await resp.json();
        // 检查
        if(!data || !data.list || !Array.isArray(data.list) || data.list.length===0){
            throw new Error('获取到的详情内容无效');
        }
        const videoDetail = data.list[0];
        // 播放地址处理
        let episodes=[];
        if(videoDetail.vod_play_url){
            // 多个播放源
            const playSources = videoDetail.vod_play_url.split('$$$');
            if(playSources.length > 0){
                const mainSrc = playSources[0];
                const parts = mainSrc.split('#');
                episodes = parts.map(ep=>{
                    const arr=ep.split('$');
                    return arr.length>1?arr[1]:''; // 取URL
                }).filter(u=>/^https?:\/\//.test(u));
            }
        }
        // 尝试内容m3u8补漏
        if(episodes.length===0 && videoDetail.vod_content){
            const m = videoDetail.vod_content.match(M3U8_PATTERN) || [];
            episodes = m.map(link=>link.replace(/^\$/, ''));
        }
        // 拼装返回结构
        return new Response(JSON.stringify({
            code: 200,
            episodes: episodes,
            detailUrl: detailUrl,
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
                source_name: API_SITES[source].name,
                source_code: source
            }
        }), { headers: {'Content-Type':'application/json'}});
    }catch(e){
        return apiErrorResp(500, e.message);
    }
}

// ======== 通用特殊源HTML解析（ffzy/jisu/huangcang） =========
async function handleCommonHtmlDetail(id, source, baseUrl, srcName){
    try{
        // 构建详情页URL
        const detailUrl = baseUrl.replace(/\/$/,'')+'/index.php/vod/detail/id/'+id+'.html';
        const resp = await fetchWithTimeout(PROXY_URL+encodeURIComponent(detailUrl),{
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...'
            }
        });
        if (!resp.ok) throw new Error('HTML详情请求失败:'+resp.status);
        const html = await resp.text();
        // ffzy专属m3u8正则
        let matches = [];
        if (source==='ffzy') {
            matches = html.match(/\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g)||[];
        }
        if (matches.length===0) {
            matches = html.match(/\$(https?:\/\/[^"'\s]+?\.m3u8)/g) || [];
        }
        matches = [...new Set(matches)]
            .map(link=>{
                let u=link.substring(1);
                let idx=u.indexOf('(');
                return idx>0 ? u.substring(0,idx) : u;
            });
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const descMatch = html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);
        return new Response(JSON.stringify({
            code: 200,
            episodes: matches,
            detailUrl: detailUrl,
            videoInfo: {
                title: titleMatch?titleMatch[1].trim():'',
                desc: descMatch?descMatch[1].replace(/<[^>]+>/g, ' ').trim():'',
                source_name: srcName,
                source_code: source
            }
        }), { headers: { 'Content-Type': 'application/json'} });
    }catch(e){
        return apiErrorResp(500,e.message);
    }
}

// ====== 自定义API json 详情 (非HTML) ======
async function handleCustomApiDetail(id, customApi){
    const detailUrl = customApi.replace(/\/$/,'')+API_CONFIG.detail.path+id;
    try{
        const resp = await fetchWithTimeout(PROXY_URL+encodeURIComponent(detailUrl),{
            headers: API_CONFIG.detail.headers
        });
        if (!resp.ok) throw new Error('自定义API详情请求失败:'+resp.status);
        const data = await resp.json();
        if(!data || !data.list || !Array.isArray(data.list) || data.list.length===0){
            throw new Error('获取到的详情内容无效');
        }
        const d = data.list[0];
        // 取m3u8
        let episodes=[];
        if(d.vod_play_url){
            const parts = d.vod_play_url.split('$$$')[0].split('#').map(e=>e.split('$')[1]);
            episodes = parts.filter(u=>/^https?:\/\//.test(u));
        }
        if(episodes.length===0 && d.vod_content){
            const m = d.vod_content.match(M3U8_PATTERN) || [];
            episodes = m.map(link=>link.replace(/^\$/, ''));
        }
        return new Response(JSON.stringify({
            code: 200,
            episodes: episodes,
            detailUrl: detailUrl,
            videoInfo: {
                title: d.vod_name,
                cover: d.vod_pic,
                desc: d.vod_content,
                type: d.type_name,
                year: d.vod_year,
                area: d.vod_area,
                director: d.vod_director,
                actor: d.vod_actor,
                remarks: d.vod_remarks,
                source_name: '自定义源',
                source_code: 'custom'
            }
        }), {headers:{'Content-Type':'application/json'}});
    }catch(e){
        return apiErrorResp(500, e.message);
    }
}

// ====== 自定义API html详情 ======
async function handleCustomApiSpecialDetail(id, customApi){
    try{
        const detailUrl = customApi.replace(/\/$/,'')+'/index.php/vod/detail/id/'+id+'.html';
        const resp = await fetchWithTimeout(PROXY_URL+encodeURIComponent(detailUrl),{
            headers: {
                'User-Agent':'Mozilla/5.0 ...'
            }
        });
        if(!resp.ok) throw new Error('自定义API详情页请求失败:'+resp.status);
        const html = await resp.text();
        const matches = (html.match(/\$(https?:\/\/[^"'\s]+?\.m3u8)/g)||[])
            .map(link=>{
                let u=link.substring(1);
                let idx=u.indexOf('(');
                return idx>0?u.substring(0,idx):u;
            });
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const descMatch = html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);
        return new Response(JSON.stringify({
            code: 200,
            episodes: matches,
            detailUrl: detailUrl,
            videoInfo: {
                title: titleMatch?titleMatch[1].trim():'',
                desc: descMatch?descMatch[1].replace(/<[^>]+>/g, ' ').trim():'',
                source_name: '自定义源',
                source_code: 'custom'
            }
        }), {headers:{'Content-Type':'application/json'}});
    }catch(e){
        return apiErrorResp(500, e.message);
    }
}

// =========== fetch带超时 ===========
async function fetchWithTimeout(url, options={}){
    const controller = new AbortController();
    const timeoutId = setTimeout(()=>controller.abort(), API_TIMEOUT);
    try{
        const resp = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return resp;
    }catch(e){
        clearTimeout(timeoutId);
        if(e.name==='AbortError') throw new Error('请求超时');
        throw e;
    }
}

// ========== 统一返回格式 ==========
function apiErrorResp(code, msg){
    return new Response(JSON.stringify({ code, msg, list: [], episodes: [] }), {
        status: code>=500?500:400,
        headers: { 'Content-Type':'application/json'}
    });
}
function apiSuccResp(obj){
    // 支持 {list}, {episodes, detailUrl, videoInfo }
    return new Response(JSON.stringify({ code: 200, ...obj }), {
        headers: {'Content-Type':'application/json'}
    });
}

// =========== 站点可用性测试 ===========
async function testSiteAvailability(apiUrl) {
    try {
        const resp = await fetch('/api/search?wd=test&customApi='+encodeURIComponent(apiUrl), {
            signal: AbortSignal.timeout(5000)
        });
        if(!resp.ok) return false;
        const data = await resp.json();
        return data && data.code!==400 && Array.isArray(data.list);
    }catch(e){
        console.error('站点可用性测试失败:', e);
        return false;
    }
}
window.testSiteAvailability = testSiteAvailability;
