const MEDIA_FILE_EXTENSIONS = [
  '.mp4','.webm','.mkv','.avi','.mov','.wmv','.flv','.f4v','.m4v','.3gp','.3g2','.ts','.mts','.m2ts',
  '.mp3','.wav','.ogg','.aac','.m4a','.flac','.wma','.alac','.aiff','.opus',
  '.jpg','.jpeg','.png','.gif','.webp','.bmp','.tiff','.svg','.avif','.heic'
];

const MEDIA_CONTENT_TYPES = ['video/', 'audio/', 'image/'];

// ===================== Utility: Logging & Header =====================

function logDebug(msg, DEBUG_ENABLED) { if (DEBUG_ENABLED) console.log(`[Proxy Func] ${msg}`); }

function createCorsHeaders() {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "*");
  return headers;
}
function buildResponse(body, status = 200, headers = {}) {
  const corsHeaders = createCorsHeaders();
  Object.entries(headers).forEach(([k, v]) => corsHeaders.set(k, v));
  if (corsHeaders.get('Content-Type') == null && status === 200)
    corsHeaders.set('Content-Type', 'text/plain');
  return new Response(body, { status, headers: corsHeaders });
}
function buildM3u8Response(content, cacheTtl) {
  return buildResponse(content, 200, {
    "Content-Type": "application/vnd.apple.mpegurl",
    "Cache-Control": `public, max-age=${cacheTtl}`
  });
}

// =============== URL/Path/UA utilities =================

function extractTargetUrl(pathname, DEBUG_ENABLED) {
  const encodedUrl = pathname.replace(/^\/proxy\//, '');
  if (!encodedUrl) return null;
  try {
    const decoded = decodeURIComponent(encodedUrl);
    if (/^https?:\/\//i.test(decoded)) return decoded;
    if (/^https?:\/\//i.test(encodedUrl)) return encodedUrl; // warn: not encoded, but looks valid
    logDebug(`无效目标 URL 格式 (解码后): ${decoded}`, DEBUG_ENABLED);
    return null;
  } catch (e) {
    logDebug(`解码目标 URL 错误: ${encodedUrl} - ${e.message}`, DEBUG_ENABLED);
    return null;
  }
}

function getBaseUrl(urlStr, DEBUG_ENABLED) {
  try {
    const parsed = new URL(urlStr);
    if (!parsed.pathname || parsed.pathname === "/") return `${parsed.origin}/`;
    const parts = parsed.pathname.split('/');
    parts.pop();
    return `${parsed.origin}${parts.join('/')}/`;
  } catch (e) {
    logDebug(`获取 base URL 错误: ${urlStr} - ${e.message}`, DEBUG_ENABLED);
    const lastSlash = urlStr.lastIndexOf('/');
    return lastSlash > urlStr.indexOf('://') + 2 ? urlStr.slice(0, lastSlash +1) : urlStr + '/';
  }
}

function resolveUrl(baseUrl, relativeUrl, DEBUG_ENABLED) {
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  try { return new URL(relativeUrl, baseUrl).toString(); }
  catch (e) {
    logDebug(`解析 URL 失败: baseUrl=${baseUrl}, relativeUrl=${relativeUrl}, error=${e.message}`, DEBUG_ENABLED);
    if (relativeUrl.startsWith('/')) { try {
      return (new URL(baseUrl)).origin + relativeUrl;
    } catch {} }
    return baseUrl.replace(/\/[^/]*$/, '/') + relativeUrl;
  }
}
function rewriteUrlToProxy(targetUrl) {
  return `/proxy/${encodeURIComponent(targetUrl)}`;
}
function getRandomUserAgent(UAs) {
  return UAs[Math.floor(Math.random() * UAs.length)];
}
function isM3u8Content(content, contentType) {
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes('application/vnd.apple.mpegurl') || ct.includes('application/x-mpegurl') || ct.includes('audio/mpegurl')) return true;
  }
  return content && typeof content === 'string' && content.trim().startsWith('#EXTM3U');
}
function isMediaFile(url, contentType) {
  if (contentType) {
    for (const t of MEDIA_CONTENT_TYPES) if (contentType.toLowerCase().startsWith(t)) return true;
  }
  const lowerUrl = url.toLowerCase();
  for (const ext of MEDIA_FILE_EXTENSIONS) {
    if (lowerUrl.endsWith(ext) || lowerUrl.includes(ext + "?")) return true;
  }
  return false;
}

// ============= Fetch, KV, Content ================

// 获取env.USER_AGENTS
function getUserAgents(env, DEBUG_ENABLED) {
  let UAs = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  if (env.USER_AGENTS_JSON) {
    try {
      const arr = JSON.parse(env.USER_AGENTS_JSON);
      if (Array.isArray(arr) && arr.length) UAs = arr;
      else logDebug('环境变量 USER_AGENTS_JSON 格式无效或为空，使用默认', DEBUG_ENABLED);
    } catch (e) {
      logDebug('解析 USER_AGENTS_JSON 失败: ' + e.message + ', 使用默认', DEBUG_ENABLED);
    }
  }
  return UAs;
}

async function fetchContentWithType(targetUrl, reqHeaders, UAs, DEBUG_ENABLED) {
  const headers = new Headers({
    'User-Agent': getRandomUserAgent(UAs),
    'Accept': '*/*',
    'Accept-Language': reqHeaders.get('Accept-Language') || 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': reqHeaders.get('Referer') || new URL(targetUrl).origin
  });
  try {
    logDebug(`请求目标: ${targetUrl}`, DEBUG_ENABLED);
    const resp = await fetch(targetUrl, { headers, redirect: 'follow' });
    if (!resp.ok) {
      const errText = await resp.text().catch(()=> '');
      throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${errText.slice(0,150)}`);
    }
    const content = await resp.text();
    const contentType = resp.headers.get('Content-Type') || '';
    logDebug(`请求成功: ${targetUrl}, 类型: ${contentType}, 长度: ${content.length}`, DEBUG_ENABLED);
    return { content, contentType, responseHeaders: resp.headers };
  } catch (e) {
    logDebug(`请求异常: ${targetUrl}: ${e.message}`, DEBUG_ENABLED);
    throw new Error(`请求目标失败: ${targetUrl}: ${e.message}`);
  }
}

async function getOrSetKV(kv, key, fetchFn, processFn, env, cacheSeconds, DEBUG_ENABLED, waitUntil) {
  if (kv) {
    try {
      const cached = await kv.get(key);
      if (cached) return { fromCache: true, result: cached };
    } catch(e) {
      logDebug(`读取缓存失败(${key}): ${e.message}`, DEBUG_ENABLED);
    }
  }
  const { content, contentType, responseHeaders } = await fetchFn();
  let result;
  if (typeof processFn === 'function') result = await processFn(content, contentType, responseHeaders);
  else result = content;
  if (kv) {
    try {
      waitUntil && waitUntil(kv.put(key, typeof result === "string" ? result : JSON.stringify(result), { expirationTtl: cacheSeconds }));
      logDebug(`已缓存到KV: ${key}`, DEBUG_ENABLED);
    } catch(e) {
      logDebug(`缓存写入失败(${key}): ${e.message}`, DEBUG_ENABLED);
    }
  }
  return { fromCache: false, result, contentType, responseHeaders };
}

// ========== M3U8 Processors ==========

function processKeyLine(line, baseUrl, DEBUG_ENABLED) {
  return line.replace(/URI="([^"]+)"/, (_, uri) => {
    const absUri = resolveUrl(baseUrl, uri, DEBUG_ENABLED);
    logDebug(`处理 KEY URI: 原='${uri}', 绝对='${absUri}'`, DEBUG_ENABLED);
    return `URI="${rewriteUrlToProxy(absUri)}"`;
  });
}
function processMapLine(line, baseUrl, DEBUG_ENABLED) {
  return line.replace(/URI="([^"]+)"/, (_, uri) => {
    const absUri = resolveUrl(baseUrl, uri, DEBUG_ENABLED);
    logDebug(`处理 MAP URI: 原='${uri}', 绝对='${absUri}'`, DEBUG_ENABLED);
    return `URI="${rewriteUrlToProxy(absUri)}"`;
  });
}
function processMediaPlaylist(url, content, DEBUG_ENABLED) {
  const baseUrl = getBaseUrl(url, DEBUG_ENABLED);
  return content.split('\n').map(line => {
    line = line.trim();
    if (!line) return '';
    if (line.startsWith('#EXT-X-KEY')) return processKeyLine(line, baseUrl, DEBUG_ENABLED);
    if (line.startsWith('#EXT-X-MAP')) return processMapLine(line, baseUrl, DEBUG_ENABLED);
    if (line.startsWith('#EXTINF')) return line;
    if (!line.startsWith('#')) {
      const absUrl = resolveUrl(baseUrl, line, DEBUG_ENABLED);
      logDebug(`重写媒体段: 原='${line}', 绝对='${absUrl}'`, DEBUG_ENABLED);
      return rewriteUrlToProxy(absUrl);
    }
    return line;
  }).join('\n');
}

/**
 * 处理主M3U8(递归)，获取最佳变体流并回包（需走kv缓存）
 */
async function processMasterPlaylist(url, content, recursionDepth, env, cacheTtl, DEBUG_ENABLED, waitUntil) {
  if (recursionDepth > Number(env.MAX_RECURSION) || 5) throw new Error(`超出递归限制 (${env.MAX_RECURSION})`);
  const baseUrl = getBaseUrl(url, DEBUG_ENABLED);
  const lines = content.split('\n');
  let maxBw = -1, bestVariantUrl = '';
  for (let i=0; i<lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
      const bw = bwMatch ? parseInt(bwMatch[1],10) : 0;
      let uri = '';
      for (let j=i+1;j<lines.length;j++) {
        const l = lines[j].trim();
        if(l && !l.startsWith('#')) { uri = l; i = j; break; }
      }
      if (uri && bw >= maxBw) { maxBw = bw; bestVariantUrl = resolveUrl(baseUrl, uri, DEBUG_ENABLED); }
    }
  }
  if (!bestVariantUrl) {
    // fallback: pick first .m3u8
    for (const l of lines) {
      const t = l.trim();
      if (t && !t.startsWith('#') && (t.endsWith('.m3u8') || t.includes('.m3u8?'))) {
        bestVariantUrl = resolveUrl(baseUrl, t, DEBUG_ENABLED);
        logDebug(`使用备选子列表: ${bestVariantUrl}`, DEBUG_ENABLED); break;
      }
    }
  }
  if (!bestVariantUrl) {
    logDebug(`主列表无子播放列表, 视作媒体列表`, DEBUG_ENABLED);
    return processMediaPlaylist(url, content, DEBUG_ENABLED);
  }

  // 优先用processed:m3u8缓存（已处理内容）
  const cacheKey = `m3u8_processed:${bestVariantUrl}`;
  let kv = null;
  try { kv = env.LIBRETV_PROXY_KV || null; } catch {}
  if (kv) {
    try {
      const processed = await kv.get(cacheKey);
      if (processed) { logDebug(`[缓存命中] 处理后: ${bestVariantUrl}`, DEBUG_ENABLED); return processed; }
    } catch(e){logDebug(`读取缓存失败(${cacheKey}): ${e.message}`, DEBUG_ENABLED);}
  }
  logDebug(`递归子列表 (带宽:${maxBw}): ${bestVariantUrl}`, DEBUG_ENABLED);
  const { content: variantContent, contentType: variantCt } = await fetchContentWithType(bestVariantUrl, new Headers(), getUserAgents(env, DEBUG_ENABLED), DEBUG_ENABLED);

  if (!isM3u8Content(variantContent, variantCt)) return processMediaPlaylist(bestVariantUrl, variantContent, DEBUG_ENABLED);

  const processedVariant = await processM3u8Content(bestVariantUrl, variantContent, recursionDepth + 1, env, cacheTtl, DEBUG_ENABLED, waitUntil);
  if (kv) try {
    waitUntil && waitUntil(kv.put(cacheKey, processedVariant, { expirationTtl: cacheTtl }));
    logDebug(`已缓存处理后子列表: ${bestVariantUrl}`, DEBUG_ENABLED);
  } catch(e){ logDebug(`缓存写入失败(${cacheKey}): ${e.message}`, DEBUG_ENABLED);}
  return processedVariant;
}

/**
 * 自动判断 Master or Media, 并处理
 */
async function processM3u8Content(targetUrl, content, recursionDepth, env, cacheTtl, DEBUG_ENABLED, waitUntil) {
  if (content.includes('#EXT-X-STREAM-INF') || content.includes('#EXT-X-MEDIA:')) {
    logDebug(`主播放列表: ${targetUrl}`, DEBUG_ENABLED);
    return processMasterPlaylist(targetUrl, content, recursionDepth, env, cacheTtl, DEBUG_ENABLED, waitUntil);
  }
  logDebug(`媒体播放列表: ${targetUrl}`, DEBUG_ENABLED);
  return processMediaPlaylist(targetUrl, content, DEBUG_ENABLED);
}

// ======================== Cloudflare Function Main =========================

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  const DEBUG_ENABLED = env.DEBUG === 'true';
  const CACHE_TTL = Number(env.CACHE_TTL) || 86400;

  try {
    // 1. 获取目标URL
    const targetUrl = extractTargetUrl(url.pathname, DEBUG_ENABLED);
    if (!targetUrl) return buildResponse("无效代理请求。路径应为 /proxy/<经过编码的URL>", 400);

    const kv = (() => { try { return env.LIBRETV_PROXY_KV || null; } catch { return null; } })();
    const UAs = getUserAgents(env, DEBUG_ENABLED);

    // 2. 优先尝试KV缓存raw
    let cachedJson = null;
    if (kv) try { cachedJson = await kv.get(`proxy_raw:${targetUrl}`); } catch (e) { logDebug("KV 获取异常: " + e.message, DEBUG_ENABLED);}
    if (cachedJson) {
      try {
        const cachedData = JSON.parse(cachedJson);
        const content = cachedData.body;
        let headers = {};
        try { headers = JSON.parse(cachedData.headers); } catch{}
        const contentType = headers["content-type"] || headers["Content-Type"] || '';
        if (isM3u8Content(content, contentType)) {
          logDebug("缓存内容为 M3U8，需重写内容", DEBUG_ENABLED);
          const replay = await processM3u8Content(targetUrl, content, 0, env, CACHE_TTL, DEBUG_ENABLED, waitUntil);
          return buildM3u8Response(replay, CACHE_TTL);
        }
        logDebug("缓存内容为其它媒体类型", DEBUG_ENABLED);
        return buildResponse(content, 200, headers);
      } catch (e) {
        logDebug("缓存解析异常: " + e.message, DEBUG_ENABLED);
      }
    }

    // 3. fetch下载目标URL
    let fetchResult;
    try {
      fetchResult = await fetchContentWithType(targetUrl, request.headers, UAs, DEBUG_ENABLED);
    } catch (fetchErr) {
      logDebug('fetch目标URL失败: ' + fetchErr.message, DEBUG_ENABLED);
      return buildResponse("代理目标请求失败: " + fetchErr.message, 502);
    }
    const { content, contentType, responseHeaders } = fetchResult;

    // 4. KV缓存原始内容
    if (kv) try {
      const headersObj = {};
      responseHeaders.forEach((val, key) => headersObj[key.toLowerCase()] = val);
      const cacheObj = { body: content, headers: JSON.stringify(headersObj) };
      waitUntil && waitUntil(kv.put(`proxy_raw:${targetUrl}`, JSON.stringify(cacheObj), { expirationTtl: CACHE_TTL }));
      logDebug('已缓存原始内容到KV', DEBUG_ENABLED);
    } catch(e) { logDebug('KV写入失败: ' + e.message, DEBUG_ENABLED); }

    // 5. 判断/处理M3U8、直接媒体、其它
    if (isM3u8Content(content, contentType)) {
      const replay = await processM3u8Content(targetUrl, content, 0, env, CACHE_TTL, DEBUG_ENABLED, waitUntil);
      return buildM3u8Response(replay, CACHE_TTL);
    } else {
      const outHeaders = new Headers(responseHeaders);
      outHeaders.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
      outHeaders.set("Access-Control-Allow-Origin", "*");
      outHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      outHeaders.set("Access-Control-Allow-Headers", "*");
      return new Response(content, { status: 200, headers: outHeaders });
    }
  } catch (err) {
    logDebug('代理请求异常: ' + (err?.message || err), true);
    return buildResponse(`代理处理错误: ${err.message || err}`, 500);
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
