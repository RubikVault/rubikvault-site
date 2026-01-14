/**
 * Tooltip utility for adding ⓘ tooltips to fields
 */

export function createTooltip(text, details = {}) {
  const { source, asOf, cadence, provider, marketContext } = details;
  
  let content = `<strong>${text}</strong>`;
  if (source) content += `<br>Source: ${source}`;
  if (provider) content += `<br>Provider: ${provider}`;
  if (asOf) content += `<br>As-of: ${asOf}`;
  if (cadence) content += `<br>Update: ${cadence}`;
  if (marketContext) content += `<br>Context: ${marketContext}`;
  
  return `
    <span class="rv-tooltip-wrapper">
      <span class="rv-tooltip-icon" aria-label="Information">ⓘ</span>
      <span class="rv-tooltip-content">${content}</span>
    </span>
  `;
}

export function addTooltipToElement(element, text, details = {}) {
  if (!element) return;
  const tooltip = createTooltip(text, details);
  const wrapper = document.createElement('span');
  wrapper.innerHTML = tooltip;
  element.appendChild(wrapper.firstElementChild);
}
