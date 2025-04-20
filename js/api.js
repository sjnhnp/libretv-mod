// 导入配置
import { PROXY_URL, API_SITES, API_CONFIG, M3U8_PATTERN, CUSTOM_API_CONFIG } from './config.js';

// 定义常量
const TIMEOUT = 10000; // 10 seconds
const ERROR_CODES = {
    BAD_REQUEST: 400,
    SERVER_ERROR: 500
};

// 路由处理函数
const routeHandlers = {
    '/api/search': handleSearch,
    '/api/detail': handleDetail
};

// 改进的API请求处理函数
async function handleApiRequest(url) {
    const parsedUrl = new URL(url, window.location.origin);
    const handler = routeHandlers[parsedUrl.pathname];

    if (!handler) {
        return new Response(JSON.stringify({ code: ERROR_CODES.BAD_REQUEST, msg: '无效的API路径' }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const result = await handler(parsedUrl);
        // 确保结果是一个有效的 Response 对象
        if (result instanceof Response) {
            return result;
        }
        // 如果不是 Response 对象，将结果包装成 JSON 响应
        return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('API请求处理错误:', error);
        return new Response(JSON.stringify({ code: ERROR_CODES.SERVER_ERROR, msg: '服务器内部错误' }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}


// 处理搜索请求
async function handleSearch(url) {
    const query = url.searchParams.get('wd');
    const customApi = url.searchParams.get('customApi');

    if (!query) {
        return createErrorResponse(ERROR_CODES.BAD_REQUEST, '搜索关键词不能为空');
    }

    if (customApi) {
        return handleCustomApiSearch(query, customApi);
    }

    const sources = API_SITES.filter(site => !API_CONFIG[site].detail);
    const searchPromises = sources.map(source => searchSingleApi(query, source));
    const results = await Promise.all(searchPromises);

    return createSuccessResponse(results.flat());
}

// 处理详情请求
async function handleDetail(url) {
    const id = url.searchParams.get('id');
    const source = url.searchParams.get('source');
    const customApi = url.searchParams.get('customApi');
    const useDetail = url.searchParams.get('useDetail') === 'true';

    if (!id || !source) {
        return createErrorResponse(ERROR_CODES.BAD_REQUEST, 'ID和来源不能为空');
    }

    if (customApi) {
        return handleCustomApiDetail(id, customApi);
    }

    const apiConfig = API_CONFIG[source];
    if (!apiConfig) {
        return createErrorResponse(ERROR_CODES.BAD_REQUEST, '无效的API来源');
    }

    if (useDetail && apiConfig.detail) {
        return handleSpecialSourceDetail(id, source);
    }

    return handleStandardDetail(id, source);
}

// 处理单个API的搜索
async function searchSingleApi(query, source) {
    const apiConfig = API_CONFIG[source];
    const targetApiUrl = apiConfig.api.replace('{wd}', encodeURIComponent(query));
    const proxyUrl = `${PROXY_URL}${encodeURIComponent(targetApiUrl)}`;

    try {
        const response = await fetchWithTimeout(proxyUrl);
        const data = await response.json();
        return processApiResponse(data, source);
    } catch (error) {
        console.error(`搜索 ${source} 时出错:`, error);
        return [];
    }
}

// 处理自定义API搜索
async function handleCustomApiSearch(query, customApi) {
    const customApiConfig = CUSTOM_API_CONFIG[customApi];
    if (!customApiConfig) {
        return createErrorResponse(ERROR_CODES.BAD_REQUEST, '无效的自定义API');
    }

    const targetApiUrl = customApiConfig.api.replace('{wd}', encodeURIComponent(query));
    const proxyUrl = `${PROXY_URL}${encodeURIComponent(targetApiUrl)}`;

    try {
        const response = await fetchWithTimeout(proxyUrl);
        const data = await response.json();
        return createSuccessResponse(processApiResponse(data, customApi));
    } catch (error) {
        console.error('自定义API搜索错误:', error);
        return createErrorResponse(ERROR_CODES.SERVER_ERROR, '自定义API搜索失败');
    }
}

// 处理标准详情请求
async function handleStandardDetail(id, source) {
    const apiConfig = API_CONFIG[source];
    const targetApiUrl = apiConfig.api.replace('{wd}', id);
    const proxyUrl = `${PROXY_URL}${encodeURIComponent(targetApiUrl)}`;

    try {
        const response = await fetchWithTimeout(proxyUrl);
        const data = await response.json();
        return createSuccessResponse(processApiResponse(data, source));
    } catch (error) {
        console.error('获取详情失败:', error);
        return createErrorResponse(ERROR_CODES.SERVER_ERROR, '获取详情失败');
    }
}

// 处理特殊来源的详情
async function handleSpecialSourceDetail(id, source) {
    const specialHandlers = {
        'ffzy': handleFFZYDetail,
        'jisu': handleJisuDetail,
        'huangcang': handleHuangcangDetail
    };

    const handler = specialHandlers[source] || handleCustomApiSpecialDetail;
    return handler(id, source);
}

// 处理FFZY详情
async function handleFFZYDetail(id) {
    // FFZY详情处理逻辑
    // ...
}

// 处理Jisu详情
async function handleJisuDetail(id) {
    // Jisu详情处理逻辑
    // ...
}

// 处理Huangcang详情
async function handleHuangcangDetail(id) {
    // Huangcang详情处理逻辑
    // ...
}

// 处理自定义API特殊详情
async function handleCustomApiSpecialDetail(id, source) {
    // 自定义API特殊详情处理逻辑
    // ...
}

// 处理自定义API详情
async function handleCustomApiDetail(id, customApi) {
    const customApiConfig = CUSTOM_API_CONFIG[customApi];
    if (!customApiConfig) {
        return createErrorResponse(ERROR_CODES.BAD_REQUEST, '无效的自定义API');
    }

    const targetApiUrl = customApiConfig.api.replace('{wd}', id);
    const proxyUrl = `${PROXY_URL}${encodeURIComponent(targetApiUrl)}`;

    try {
        const response = await fetchWithTimeout(proxyUrl);
        const data = await response.json();
        return createSuccessResponse(processApiResponse(data, customApi));
    } catch (error) {
        console.error('获取自定义API详情失败:', error);
        return createErrorResponse(ERROR_CODES.SERVER_ERROR, '获取自定义API详情失败');
    }
}

// 处理API响应
function processApiResponse(data, source) {
    // 处理API响应的逻辑
    // ...
}

// 创建成功响应
function createSuccessResponse(data) {
    return new Response(JSON.stringify({ code: 200, list: data }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// 创建错误响应
function createErrorResponse(code, msg) {
    return new Response(JSON.stringify({ code, msg }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// 带超时的fetch
async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error('请求超时');
        }
        throw error;
    }
}

// 测试站点可用性
async function testSiteAvailability(site) {
    const apiConfig = API_CONFIG[site];
    if (!apiConfig) {
        return false;
    }

    const testUrl = apiConfig.api.replace('{wd}', 'test');
    const proxyUrl = `${PROXY_URL}${encodeURIComponent(testUrl)}`;

    try {
        const response = await fetchWithTimeout(proxyUrl);
        return response.ok;
    } catch (error) {
        console.error(`测试 ${site} 可用性时出错:`, error);
        return false;
    }
}

// 拦截fetch请求
const originalFetch = window.fetch;
window.fetch = async function (url, options) {
    if (url.startsWith('/api/')) {
        return handleApiRequest(url);
    }
    return originalFetch(url, options);
};

// 导出测试站点可用性函数
window.testSiteAvailability = testSiteAvailability;
