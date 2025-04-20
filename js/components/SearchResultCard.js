// /js/components/SearchResultCard.js

/**
 * itemData: 搜索结果item对象
 * apiConfig: (可选) 相关api配置
 * sourceIdentifier: (可选) 用于data属性
 *
 * 返回一个完整的DOM元素
 */
export function createSearchResultCardElement(itemData/*, apiConfig, sourceIdentifier*/) {
    // 卡片根
    const card = document.createElement('div');
    card.classList.add(
        'card-hover', 'bg-[#111]', 'rounded-lg', 'overflow-hidden',
        'cursor-pointer', 'transition-all', 'hover:scale-[1.02]', 'h-full'
    );
    // 关键信息 data
    if (itemData.vod_id) card.dataset.videoId = itemData.vod_id;
    if (itemData.source_code) card.dataset.source = itemData.source_code;
    if (itemData.api_url) card.dataset.apiUrl = itemData.api_url;

    // 卡片内结构复刻原renderResultCard，但用纯DOM拼装
    const flexDiv = document.createElement('div');
    flexDiv.classList.add('md:flex');
    // 左侧封面图
    let hasCover = itemData.vod_pic && typeof itemData.vod_pic === 'string' && itemData.vod_pic.startsWith('http');
    if (hasCover) {
        const leftDiv = document.createElement('div');
        leftDiv.classList.add('md:w-1/4', 'relative', 'overflow-hidden');
        const wrapperDiv = document.createElement('div');
        wrapperDiv.classList.add('w-full', 'h-40', 'md:h-full');
        const img = document.createElement('img');
        img.classList.add('w-full', 'h-full', 'object-cover', 'transition-transform', 'hover:scale-110');
        img.setAttribute('alt', itemData.vod_name || '');
        img.setAttribute('loading', 'lazy');
        img.setAttribute('src', itemData.vod_pic);
        img.onerror = function() {
            this.onerror = null;
            this.src = 'https://via.placeholder.com/300x450?text=无封面';
            this.classList.add('object-contain');
        };
        const overlay = document.createElement('div');
        overlay.classList.add('absolute', 'inset-0', 'bg-gradient-to-t', 'from-[#111]', 'to-transparent', 'opacity-60');
        wrapperDiv.appendChild(img);
        wrapperDiv.appendChild(overlay);
        leftDiv.appendChild(wrapperDiv);
        flexDiv.appendChild(leftDiv);
    }
    // 右内容
    const contentDiv = document.createElement('div');
    contentDiv.className = `p-3 flex flex-col flex-grow ${hasCover ? 'md:w-3/4' : 'w-full'}`;
    // 片名
    const h3 = document.createElement('h3');
    h3.classList.add('text-lg', 'font-semibold', 'mb-2', 'break-words');
    h3.textContent = itemData.vod_name || '';
    // tag区
    const tagsDiv = document.createElement('div');
    tagsDiv.classList.add('flex', 'flex-wrap', 'gap-1', 'mb-2');
    if (itemData.type_name) {
        const typeTag = document.createElement('span');
        typeTag.classList.add('text-xs', 'py-0.5', 'px-1.5', 'rounded', 'bg-opacity-20', 'bg-blue-500', 'text-blue-300');
        typeTag.textContent = itemData.type_name;
        tagsDiv.appendChild(typeTag);
    }
    if (itemData.vod_year) {
        const yearTag = document.createElement('span');
        yearTag.classList.add('text-xs', 'py-0.5', 'px-1.5', 'rounded', 'bg-opacity-20', 'bg-purple-500', 'text-purple-300');
        yearTag.textContent = itemData.vod_year;
        tagsDiv.appendChild(yearTag);
    }
    const topContent = document.createElement('div');
    topContent.classList.add('flex-grow');
    topContent.appendChild(h3);
    topContent.appendChild(tagsDiv);
    // 剧情简介
    const p = document.createElement('p');
    p.classList.add('text-gray-400', 'text-xs', 'h-9', 'overflow-hidden');
    p.textContent = itemData.vod_remarks || '暂无介绍';
    topContent.appendChild(p);
    contentDiv.appendChild(topContent);

    // 下部来源
    const infoRow = document.createElement('div');
    infoRow.classList.add('flex', 'justify-between', 'items-center', 'mt-2', 'pt-2', 'border-t', 'border-gray-800');
    if (itemData.source_name) {
        const sourceDiv = document.createElement('div');
        const srcBadge = document.createElement('span');
        srcBadge.classList.add('bg-[#222]', 'text-xs', 'px-2', 'py-1', 'rounded-full');
        srcBadge.textContent = itemData.source_name;
        sourceDiv.appendChild(srcBadge);
        infoRow.appendChild(sourceDiv);
    } else {
        infoRow.appendChild(document.createElement('div'));
    }
    const playHint = document.createElement('span');
    playHint.classList.add('text-xs', 'text-gray-500', 'flex', 'items-center');
    playHint.innerHTML =
        `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>` +
        '点击播放';
    infoRow.appendChild(playHint);

    contentDiv.appendChild(infoRow);
    flexDiv.appendChild(contentDiv);
    card.appendChild(flexDiv);

    // 本阶段仅构造DOM，事件绑定在app.js由事件委托实现

    return card;
}
