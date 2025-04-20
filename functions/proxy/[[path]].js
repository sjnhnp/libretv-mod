// functions/proxy/[[path]].js

// --- 配置 (现在从 Cloudflare 环境变量读取) ---
// 在 Cloudflare Pages 设置 -> 函数 -> 环境变量绑定 中设置以下变量:
// CACHE_TTL (例如 86400)
// MAX_RECURSION (例如 5)
// FILTER_DISCONTINUITY (不再需要，设为 false 或移除)
// USER_AGENTS_JSON (例如 ["UA1", "UA2"]) - JSON 字符串数组
// DEBUG (例如 false 或 true)
// --- 配置结束 ---
// functions/proxy/[[path]].js

const MEDIA_FILE_EXTENSIONS = [
  '.mp4','.webm','.mkv','.avi','.mov','.wmv','.flv','.f4v','.m4v','.3gp','.3g2','.ts','.mts','.m2ts',
  '.mp3','.wav','.ogg','.aac','.m4a','.flac','.wma','.alac','.aiff','.opus',
  '.jpg','.jpeg','.png','.gif','.webp','.bmp','.tiff','.svg','.avif','.heic'
];
const MEDIA_CONTENT_TYPES = ['video/', 'audio/', 'image/'];

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);

  // 读取并配置环境变量
  const DEBUG_ENABLED = env.DEBUG === 'true';
  const CACHE_TTL = Number(env.CACHE_TTL) || 86400;
  const MAX_RECURSION = Number(env.MAX_RECURSION) || 5;

  let USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];
  try {
    const agentsJson = env.USER_AGENTS_JSON;
    if (agentsJson) {
      const parsedAgents = JSON.parse(agentsJson);
      if (Array.isArray(parsedAgents) && parsedAgents.length > 0) USER_AGENTS = parsedAgents;
      else logDebug('环境变量 USER_AGENTS_JSON 格式无效或为空，使用默认');
    }
  } catch (e) {
    logDebug(`解析 USER_AGENTS_JSON 失败: ${e.message}，使用默认`);
  }

  function logDebug(msg) {
    if (DEBUG_ENABLED) console.log(`[Proxy Func] ${msg}`);
  }

  function getTargetUrlFromPath(pathname) {
    const encodedUrl = pathname.replace(/^\/proxy\//, '');
    if (!encodedUrl) return null;
    try {
      let decodedUrl = decodeURIComponent(encodedUrl);
      if (!/^https?:\/\//i.test(decodedUrl)) {
        if (/^https?:\/\//i.test(encodedUrl)) {
          decodedUrl = encodedUrl;
          logDebug(`Warning: Path not encoded but looks like URL: ${decodedUrl}`);
        } else {
          logDebug(`无效目标 URL 格式 (解码后): ${decodedUrl}`);
          return null;
        }
      }
      return decodedUrl;
    } catch (e) {
      logDebug(`解码目标 URL 错误: ${encodedUrl} - ${e.message}`);
      return null;
    }
  }

  function createCorsHeaders() {
    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "*");
    return headers;
  }

  function createResponse(body, status = 200, headers = {}) {
    const responseHeaders = new Headers({ ...headers, ...createCorsHeaders() });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders });
    }
    return new Response(body, { status, headers: responseHeaders });
  }

  function createM3u8Response(content) {
    return createResponse(content, 200, {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": `public, max-age=${CACHE_TTL}`
    });
  }

  function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  function getBaseUrl(urlStr) {
    try {
      const parsedUrl = new URL(urlStr);
      if (!parsedUrl.pathname || parsedUrl.pathname === '/') return `${parsedUrl.origin}/`;
      const parts = parsedUrl.pathname.split('/');
      parts.pop();
      return `${parsedUrl.origin}${parts.join('/')}/`;
    } catch (e) {
      logDebug(`获取 base URL 错误: ${urlStr} - ${e.message}`);
      const lastSlash = urlStr.lastIndexOf('/');
      return lastSlash > urlStr.indexOf('://') + 2 ? urlStr.slice(0, lastSlash +1) : urlStr + '/';
    }
  }

  function resolveUrl(baseUrl, relativeUrl) {
    if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
    try {
      return new URL(relativeUrl, baseUrl).toString();
    } catch (e) {
      logDebug(`解析 URL 失败: baseUrl=${baseUrl}, relativeUrl=${relativeUrl}, error=${e.message}`);
      if (relativeUrl.startsWith('/')) {
        const u = new URL(baseUrl);
        return `${u.origin}${relativeUrl}`;
      }
      return `${baseUrl.replace(/\/[^/]*$/, '/')}${relativeUrl}`;
    }
  }

  function rewriteUrlToProxy(targetUrl) {
    return `/proxy/${encodeURIComponent(targetUrl)}`;
  }

  async function fetchContentWithType(targetUrl) {
    const headers = new Headers({
      'User-Agent': getRandomUserAgent(),
      'Accept': '*/*',
      'Accept-Language': request.headers.get('Accept-Language') || 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': request.headers.get('Referer') || new URL(targetUrl).origin
    });
    try {
      logDebug(`请求目标: ${targetUrl}`);
      const response = await fetch(targetUrl, { headers, redirect: 'follow' });
      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        logDebug(`请求失败 ${response.status} ${response.statusText} - ${targetUrl}`);
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${targetUrl} Body: ${errBody.slice(0,150)}`);
      }
      const content = await response.text();
      const contentType = response.headers.get('Content-Type') || '';
      logDebug(`请求成功: ${targetUrl}, 类型: ${contentType}, 长度: ${content.length}`);
      return { content, contentType, responseHeaders: response.headers };
    } catch (error) {
      logDebug(`请求异常 ${targetUrl}: ${error.message}`);
      throw new Error(`请求目标失败 ${targetUrl}: ${error.message}`);
    }
  }

  function isM3u8Content(content, contentType) {
    if (contentType) {
      const ct = contentType.toLowerCase();
      if (ct.includes('application/vnd.apple.mpegurl') || ct.includes('application/x-mpegurl') || ct.includes('audio/mpegurl')) return true;
    }
    return content && typeof content === 'string' && content.trim().startsWith('#EXTM3U');
  }

  // Below function is unused but kept
  function isMediaFile(url, contentType) {
    if (contentType) {
      for (const t of MEDIA_CONTENT_TYPES) {
        if (contentType.toLowerCase().startsWith(t)) return true;
      }
    }
    const lowerUrl = url.toLowerCase();
    for (const ext of MEDIA_FILE_EXTENSIONS) {
      if (lowerUrl.endsWith(ext) || lowerUrl.includes(`${ext}?`)) return true;
    }
    return false;
  }

  function processKeyLine(line, baseUrl) {
    return line.replace(/URI="([^"]+)"/, (_, uri) => {
      const absUri = resolveUrl(baseUrl, uri);
      logDebug(`处理 KEY URI: 原='${uri}', 绝对='${absUri}'`);
      return `URI="${rewriteUrlToProxy(absUri)}"`;
    });
  }

  function processMapLine(line, baseUrl) {
    return line.replace(/URI="([^"]+)"/, (_, uri) => {
      const absUri = resolveUrl(baseUrl, uri);
      logDebug(`处理 MAP URI: 原='${uri}', 绝对='${absUri}'`);
      return `URI="${rewriteUrlToProxy(absUri)}"`;
    });
  }

  function processMediaPlaylist(url, content) {
    const baseUrl = getBaseUrl(url);
    const lines = content.split('\n');
    const output = [];

    for (let i=0; i<lines.length; i++) {
      const line = lines[i].trim();
      if (line === '' && i === lines.length -1) {
        output.push(line);
        continue;
      }
      if (!line) continue;

      if (line.startsWith('#EXT-X-KEY')) {
        output.push(processKeyLine(line, baseUrl));
        continue;
      }
      if (line.startsWith('#EXT-X-MAP')) {
        output.push(processMapLine(line, baseUrl));
        continue;
      }
      if (line.startsWith('#EXTINF')) {
        output.push(line);
        continue;
      }
      if (!line.startsWith('#')) {
        const absUrl = resolveUrl(baseUrl, line);
        logDebug(`重写媒体段: 原='${line}', 绝对='${absUrl}'`);
        output.push(rewriteUrlToProxy(absUrl));
        continue;
      }
      output.push(line);
    }
    return output.join('\n');
  }

  async function processM3u8Content(targetUrl, content, recursionDepth = 0, envVar) {
    if (content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:')) {
      logDebug(`主播放列表检测: ${targetUrl}`);
      return processMasterPlaylist(targetUrl, content, recursionDepth, envVar);
    }
    logDebug(`媒体播放列表检测: ${targetUrl}`);
    return processMediaPlaylist(targetUrl, content);
  }

  async function processMasterPlaylist(url, content, recursionDepth, envVar) {
    if (recursionDepth > MAX_RECURSION) {
      throw new Error(`超出递归限制 (${MAX_RECURSION}) - ${url}`);
    }

    const baseUrl = getBaseUrl(url);
    const lines = content.split('\n');
    let highestBandwidth = -1;
    let bestVariantUrl = '';

    for (let i=0; i<lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
        const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
        const bw = bwMatch ? parseInt(bwMatch[1],10) : 0;
        let variantUriLine = '';
        for (let j=i+1; j<lines.length; j++) {
          const l = lines[j].trim();
          if(l && !l.startsWith('#')) {
            variantUriLine = l;
            i = j;
            break;
          }
        }
        if (variantUriLine && bw >= highestBandwidth) {
          highestBandwidth = bw;
          bestVariantUrl = resolveUrl(baseUrl, variantUriLine);
        }
      }
    }

    if (!bestVariantUrl) {
      logDebug(`未找到有效子列表，尝试选第一个子列表引用: ${url}`);
      for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if(line && !line.startsWith('#') && (line.endsWith('.m3u8') || line.includes('.m3u8?'))) {
          bestVariantUrl = resolveUrl(baseUrl, line);
          logDebug(`使用备选子列表: ${bestVariantUrl}`);
          break;
        }
      }
    }

    if (!bestVariantUrl) {
      logDebug(`主列表 ${url} 内未找到子播放列表，按媒体列表处理`);
      return processMediaPlaylist(url, content);
    }

    const cacheKey = `m3u8_processed:${bestVariantUrl}`;
    let kv = null;
    try {
      kv = envVar.LIBRETV_PROXY_KV || null;
    } catch (e) {
      logDebug(`访问 KV 命名空间出错: ${e.message}`);
    }

    if (kv) {
      try {
        const cached = await kv.get(cacheKey);
        if (cached) {
          logDebug(`[缓存命中] 子列表: ${bestVariantUrl}`);
          return cached;
        }
        logDebug(`[缓存未命中] 子列表: ${bestVariantUrl}`);
      } catch (e) {
        logDebug(`读取缓存失败 (${cacheKey}): ${e.message}`);
      }
    }

    logDebug(`选用子列表 (带宽: ${highestBandwidth}): ${bestVariantUrl}`);
    const { content: variantContent, contentType: variantContentType } = await fetchContentWithType(bestVariantUrl);

    if (!isM3u8Content(variantContent, variantContentType)) {
      logDebug(`子列表不是 M3U8 内容，按媒体列表处理: ${bestVariantUrl}`);
      return processMediaPlaylist(bestVariantUrl, variantContent);
    }

    const processedVariant = await processM3u8Content(bestVariantUrl, variantContent, recursionDepth +1, envVar);

    if (kv) {
      try {
        waitUntil(kv.put(cacheKey, processedVariant, { expirationTtl: CACHE_TTL }));
        logDebug(`已缓存处理后的子列表: ${bestVariantUrl}`);
      } catch(e) {
        logDebug(`缓存写入失败 (${cacheKey}): ${e.message}`);
      }
    }

    return processedVariant;
  }

  try {
    const targetUrl = getTargetUrlFromPath(url.pathname);

    if (!targetUrl) {
      logDebug(`无效代理请求路径: ${url.pathname}`);
      return createResponse("无效代理请求。路径应为 /proxy/<经过编码的URL>", 400);
    }

    logDebug(`代理请求目标: ${targetUrl}`);

    const cacheKey = `proxy_raw:${targetUrl}`;
    let kv = null;

    try {
      kv = env.LIBRETV_PROXY_KV || null;
    } catch (e) {
      logDebug(`KV 命名空间未绑定: ${e.message}`);
    }

    if (kv) {
      try {
        const cachedJson = await kv.get(cacheKey);
        if (cachedJson) {
          logDebug(`[缓存命中] 原始内容: ${targetUrl}`);
          const cachedData = JSON.parse(cachedJson);
          const content = cachedData.body;
          let headers = {};
          try { headers = JSON.parse(cachedData.headers); } catch{}
          const contentType = headers['content-type'] || headers['Content-Type'] || '';

          if (isM3u8Content(content, contentType)) {
            logDebug(`缓存内容是 M3U8，重新处理: ${targetUrl}`);
            const processed = await processM3u8Content(targetUrl, content, 0, env);
            return createM3u8Response(processed);
          } else {
            logDebug(`缓存返回非 M3U8 内容: ${targetUrl}`);
            return createResponse(content, 200, new Headers(headers));
          }
        }
        logDebug(`[缓存未命中] 原始内容: ${targetUrl}`);
      } catch (e) {
        logDebug(`读取缓存失败: ${e.message}`);
      }
    }

    const { content, contentType, responseHeaders } = await fetchContentWithType(targetUrl);

    if (kv) {
      try {
        const headersToCache = {};
        responseHeaders.forEach((val, key) => {
          headersToCache[key.toLowerCase()] = val;
        });
        const cacheVal = { body: content, headers: JSON.stringify(headersToCache) };
        waitUntil(kv.put(cacheKey, JSON.stringify(cacheVal), { expirationTtl: CACHE_TTL }));
        logDebug(`已缓存原始内容: ${targetUrl}`);
      } catch (e) {
        logDebug(`缓存写入失败: ${e.message}`);
      }
    }

    if (isM3u8Content(content, contentType)) {
      logDebug(`内容为 M3U8，开始处理: ${targetUrl}`);
      const processed = await processM3u8Content(targetUrl, content, 0, env);
      return createM3u8Response(processed);
    } else {
      logDebug(`内容非 M3U8，直接返回: ${targetUrl}`);
      const finalHeaders = new Headers(responseHeaders);
      finalHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
      finalHeaders.set("Access-Control-Allow-Origin", "*");
      finalHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      finalHeaders.set("Access-Control-Allow-Headers", "*");
      return createResponse(content, 200, finalHeaders);
    }
  } catch (err) {
    logDebug(`代理请求异常: ${err.message}\n${err.stack}`);
    return createResponse(`代理处理错误: ${err.message}`, 500);
  }
}

export async function onOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400"
    }
  });
}
