const REGISTRY_URL='/shared/business-categories.json';
let categories=[];

export async function loadCategorySuggestions(listElement,statusElement,inputElement){
  try{const response=await fetch(REGISTRY_URL,{headers:{Accept:'application/json'}});if(!response.ok)return;categories=await response.json();listElement.replaceChildren(...categories.map(category=>{const option=document.createElement('option');option.value=category.label;option.label=(category.aliases||[]).slice(0,3).join(', ');return option;}));updateCategoryMode(inputElement.value,statusElement);}
  catch{categories=[];}
}
export function updateCategoryMode(value,statusElement){if(!statusElement)return;const clean=normalize(value);if(!clean){statusElement.textContent='Choose a suggested category for the strongest Open Data matching, or enter a custom category.';statusElement.removeAttribute('data-mode');return;}const known=categories.find(category=>[category.id,category.label,...(category.aliases||[])].some(alias=>normalize(alias)===clean));statusElement.textContent=known?`Matched category: ${known.label}`:'Custom category — any Open Data search or fallback will use conservative best-effort matching.';statusElement.dataset.mode=known?'known':'custom';}
function normalize(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
