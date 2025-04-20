
// /js/components/ApiCheckbox.js

/**
 * apiConfig: { name, key, isAdult }
 * isChecked: boolean
 * isDisabled: boolean
 * onChangeCallback: function(checked, apiKey)
 */
export function createApiCheckboxElement(apiConfig, isChecked, isDisabled, onChangeCallback) {
    const wrap = document.createElement('div');
    wrap.className = 'flex items-center';

    const input = document.createElement('input');
    input.type = "checkbox";
    input.className = `form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333]${apiConfig.isAdult ? ' api-adult' : ''}`;
    input.id = 'api_' + apiConfig.key;
    input.checked = !!isChecked;
    input.disabled = !!isDisabled;
    input.dataset.api = apiConfig.key;

    input.addEventListener('change', () => {
        if (typeof onChangeCallback === 'function') onChangeCallback(input.checked, apiConfig.key);
    });

    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.className = `ml-1 text-xs ${apiConfig.isAdult ? "text-pink-400" : "text-gray-400"} truncate`;
    label.textContent = apiConfig.name;

    wrap.appendChild(input);
    wrap.appendChild(label);
    return wrap;
}
