const GOOGLE_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const {normalizeBusiness}=require('../business-model');
const FIELD_MASK = ['places.id','places.displayName','places.primaryType','places.types','places.rating','places.userRatingCount','places.formattedAddress','places.addressComponents','places.nationalPhoneNumber','places.internationalPhoneNumber','places.websiteUri','places.businessStatus','places.googleMapsUri','places.location','nextPageToken'].join(',');

async function searchGoogle(criteria, options = {}) {
  const key = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  if (!key) throw providerError('GOOGLE_NOT_CONFIGURED', 'Google Places is not configured for this deployment.', 503, true);
  const body = { textQuery: criteria.category ? `${criteria.category} in ${criteria.location}` : `businesses in ${criteria.location}`, languageCode: 'en', maxResultCount: 20 };
  if (criteria.pageToken) body.pageToken = criteria.pageToken;
  let response;
  try { response = await fetchWithTimeout(GOOGLE_ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':FIELD_MASK}, body:JSON.stringify(body) }, options.timeoutMs || 12000); }
  catch (error) { throw providerError('GOOGLE_UNAVAILABLE', error.name === 'AbortError' ? 'Google Places timed out.' : 'Google Places could not be reached.', 502, true); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw mapGoogleError(response.status, data.error, Boolean(criteria.pageToken));
  return { provider:'google', businesses:(data.places || []).map(normaliseGooglePlace).filter(Boolean), nextPageToken:data.nextPageToken || null };
}

function normaliseGooglePlace(place = {}) { const website=text(place.websiteUri);const component=(type)=>text((place.addressComponents||[]).find((item)=>item.types?.includes(type))?.longText); return normalizeBusiness({provider:'google',providerId:text(place.id),name:text(place.displayName?.text),category:humanise(place.primaryType || place.types?.[0] || ''),types:place.types,address:text(place.formattedAddress),city:component('locality')||component('administrative_area_level_2'),state:component('administrative_area_level_1'),country:component('country'),latitude:numberOrNull(place.location?.latitude),longitude:numberOrNull(place.location?.longitude),phone:text(place.internationalPhoneNumber||place.nationalPhoneNumber),email:'',website,rating:Number.isFinite(place.rating)?place.rating:null,reviewCount:Number.isFinite(place.userRatingCount)?place.userRatingCount:null,businessStatus:text(place.businessStatus),sourceUrl:text(place.googleMapsUri),openingHours:''}); }
function mapGoogleError(status, error = {}, paginating = false) { const message=text(error.message)||'Google Places rejected the request.'; if(status===400&&paginating)return providerError('INVALID_PAGE_TOKEN',message,400,false); if(status===429||error.status==='RESOURCE_EXHAUSTED')return providerError('GOOGLE_QUOTA_EXCEEDED',message,429,true); if(/billing|billing account|account verification/i.test(message))return providerError('GOOGLE_BILLING_REQUIRED',message,503,true); if(/not been (used|enabled)|api.*not enabled|access not configured/i.test(message))return providerError('GOOGLE_API_NOT_ENABLED',message,503,true); if(status===401||status===403||['PERMISSION_DENIED','FAILED_PRECONDITION','UNAUTHENTICATED'].includes(error.status))return providerError('GOOGLE_PERMISSION_DENIED',message,503,true); return providerError('GOOGLE_UNAVAILABLE',message,status>=500?502:400,status>=500); }
function providerError(code,message,status,fallbackEligible){const error=new Error(message);error.code=code;error.status=status;error.fallbackEligible=fallbackEligible;return error;}
async function fetchWithTimeout(url,options,timeoutMs){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(url,{...options,signal:controller.signal});}finally{clearTimeout(timer);}}
function text(value){return typeof value==='string'?value:'';} function numberOrNull(value){return Number.isFinite(value)?value:null;} function humanise(value){return text(value).replace(/_/g,' ').replace(/\b\w/g,(c)=>c.toUpperCase());}
module.exports={FIELD_MASK,normaliseGooglePlace,searchGoogle};
