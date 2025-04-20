// /js/components/CustomApiListItem.js
import { getState } from '../store.js';
/**
 * apiData: { name, url, isAdult }
 * onEditCallback: function(idx)
 * onRemoveCallback: function(idx)
 */
export function createCustomApiListItemElement(apiData, idx, onEditCallback, onRemoveCallback) {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-1 mb-1 bg-[#222] rounded';

    const textColor = apiData.isAdult ? 'text-pink-400' : 'text-white';
    const adultTag = apiData.isAdult ? document.createElement('span') : null;
    if (adultTag) {
        adultTag.className = 'text-xs text-pink-400 mr-1';
        adultTag.textContent = '(18+)';
    }

    // left
    const leftWrap = document.createElement('div');
    leftWrap.className = 'flex items-center flex-1 min-w-0';
    const input = document.createElement('input');
    input.type = "checkbox";
    input.checked = apiData.selected || false;
    input.id = `custom_api_${idx}`;
    input.className = `form-checkbox h-3 w-3 text-blue-600 mr-1${apiData.isAdult ? ' api-adult' : ''}`;
    input.dataset.customIndex = idx;

    const nameWrap = document.createElement('div');
    nameWrap.className = 'flex-1 min-w-0';
    const nameDiv = document.createElement('div');
    nameDiv.className = `text-xs font-medium ${textColor} truncate`;
    nameDiv.textContent = apiData.name;
    if (adultTag) nameDiv.appendChild(adultTag);
    const urlDiv = document.createElement('div');
    urlDiv.className = 'text-xs text-gray-500 truncate';
    urlDiv.textContent = apiData.url;

    nameWrap.appendChild(nameDiv);
    nameWrap.appendChild(urlDiv);

    leftWrap.appendChild(input);
    leftWrap.appendChild(nameWrap);

    item.appendChild(leftWrap);

    // right
    const rightWrap = document.createElement('div');
    rightWrap.className = 'flex items-center';
    const editBtn = document.createElement('button');
    editBtn.className = 'text-blue-500 hover:text-blue-700 text-xs px-1';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (typeof onEditCallback === 'function') onEditCallback(idx);
    });
    const removeBtn = document.createElement('button');
    removeBtn.className = 'text-red-500 hover:text-red-700 text-xs px-1';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (typeof onRemoveCallback === 'function') onRemoveCallback(idx);
    });

    rightWrap.appendChild(editBtn);
    rightWrap.appendChild(removeBtn);

    item.appendChild(rightWrap);
    // 勾选事件在外部由事件代理处理

    return item;
}
