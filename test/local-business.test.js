const test=require('node:test');const assert=require('node:assert/strict');const{dedupeBusinesses,validateRequestBody}=require('../api/local-businesses/core');const{normaliseGooglePlace}=require('../api/local-businesses/providers/google');const{haversine,normaliseOsmElement,withinRadius,_cache}=require('../api/local-businesses/providers/open-data');const{discoverBusinesses}=require('../api/local-businesses/providers');const searchHandler=require('../api/local-businesses/search');
test('normalises Google into the canonical model',()=>{const item=normaliseGooglePlace({id:'g1',displayName:{text:'Alpha'},primaryType:'dental_clinic',types:['health'],rating:4.7,userRatingCount:82,formattedAddress:'Road',internationalPhoneNumber:'+9140',websiteUri:'https://example.com',businessStatus:'OPERATIONAL',googleMapsUri:'https://maps.google.com/x',location:{latitude:17.4,longitude:78.5}});assert.equal(item.provider,'google');assert.equal(item.providerId,'g1');assert.equal(item.phone,'+9140');assert.equal(item.reviewCount,82);assert.ok(item.createdAt);});
test('normalises OpenStreetMap without inventing ratings or status',()=>{const item=normaliseOsmElement({type:'node',id:9,lat:17.4,lon:78.5,tags:{name:'Beta Cafe',amenity:'cafe','addr:street':'Main Road',phone:'+91123',website:'https://beta.test',opening_hours:'Mo-Sa 09:00-18:00'}});assert.equal(item.provider,'openstreetmap');assert.equal(item.providerId,'node:9');assert.equal(item.rating,null);assert.equal(item.reviewCount,null);assert.equal(item.businessStatus,'');assert.equal(item.openingHours,'Mo-Sa 09:00-18:00');});
test('missing fields remain empty or null',()=>{const google=normaliseGooglePlace({id:'g2',displayName:{text:'Unknown'}});const osm=normaliseOsmElement({type:'node',id:10,tags:{name:'Unknown'}});assert.equal(google.reviewCount,null);assert.equal(osm.phone,'');assert.equal(osm.latitude,null);});
test('validates provider selection and radius',()=>{assert.equal(validateRequestBody({location:'Hyderabad',radiusKm:5,provider:'auto'}).ok,true);assert.equal(validateRequestBody({location:'Hyderabad',radiusKm:3}).error.code,'INVALID_RADIUS');assert.equal(validateRequestBody({location:'Hyderabad',radiusKm:5,provider:'other'}).error.code,'INVALID_PROVIDER');});
test('selects Google when requested',async()=>{const old=global.fetch;global.fetch=async()=>response({places:[{id:'g3',displayName:{text:'Google Result'}}]});try{const result=await discoverBusinesses({provider:'google',location:'Hyderabad',category:'',radiusKm:5,pageToken:''},{googleApiKey:'key'});assert.equal(result.provider,'google');}finally{global.fetch=old;}});
test('Auto falls back to Open Data when Google is unavailable',async()=>{_cache.clear();const old=global.fetch;global.fetch=async url=>String(url).includes('nominatim')?response([{lat:'17.4',lon:'78.5',display_name:'Hyderabad'}]):response({elements:[{type:'node',id:11,lat:17.401,lon:78.501,tags:{name:'Fallback Shop',shop:'general'}}]});try{const result=await discoverBusinesses({provider:'auto',location:'Auto Fallback Unique',category:'',radiusKm:2,pageToken:''},{googleApiKey:''});assert.equal(result.provider,'open_data');assert.equal(result.businesses[0].name,'Fallback Shop');}finally{global.fetch=old;}});
test('deduplicates canonical businesses',()=>{assert.deepEqual(dedupeBusinesses([{provider:'google',providerId:'a'},{provider:'google',providerId:'a'},{provider:'google',providerId:'b'}]).map(v=>v.providerId),['a','b']);});
test('radius filtering uses coordinates',()=>{const center={latitude:17.4,longitude:78.5};assert.ok(haversine(17.4,78.5,17.401,78.501)<200);assert.equal(withinRadius({latitude:17.401,longitude:78.501},center,200),true);});
test('nullable ratings are safe',async()=>{const{filterBusinesses}=await import('../assets/js/local-business/business-filters.mjs');const businesses=[{provider:'openstreetmap',providerId:'1',name:'OSM',website:'',rating:null,reviewCount:null,phone:'',category:'Cafe',businessStatus:''}];assert.equal(filterBusinesses(businesses,{website:'all',rating:0,reviews:0,phone:false,source:'',category:'',businessStatus:'',sort:'rating'}).length,1);});
test('rendering escapes provider values and unsafe URLs',async()=>{const{renderBusinessCard}=await import('../assets/js/local-business/business-renderer.mjs');const html=renderBusinessCard({provider:'openstreetmap',providerId:'node:1',name:'<img src=x onerror=alert(1)>',category:'Cafe',rating:null,reviewCount:null,address:'<script>x</script>',phone:'',website:'javascript:alert(1)',businessStatus:'',sourceUrl:'https://openstreetmap.org/node/1'});assert.equal(html.includes('<img src=x'),false);assert.equal(html.includes('<script>'),false);assert.equal(html.includes('javascript:alert'),false);assert.match(html,/Rating unavailable from Open Data/);assert.equal(html.includes('Not available · Not available'),false);});
test('oversized bodies are rejected',()=>assert.equal(validateRequestBody({location:'x',category:'a'.repeat(5000),radiusKm:5,provider:'auto'}).error.code,'REQUEST_TOO_LARGE'));
test('endpoint works without Google key and without configured persistence',async()=>{_cache.clear();const oldFetch=global.fetch,oldKey=process.env.GOOGLE_PLACES_API_KEY;delete process.env.GOOGLE_PLACES_API_KEY;global.fetch=async url=>String(url).includes('nominatim')?response([{lat:'17.4',lon:'78.5'}]):response({elements:[{type:'node',id:12,lat:17.4,lon:78.5,tags:{name:'Free Result',amenity:'clinic'}}]});try{const out=mockResponse();await searchHandler({method:'POST',body:{location:'No Key Unique',category:'',radiusKm:2,provider:'auto'},headers:{'content-type':'application/json','x-forwarded-for':'no-key-auto'},socket:{}},out);assert.equal(out.statusCode,200);assert.equal(out.body.provider,'open_data');}finally{global.fetch=oldFetch;if(oldKey)process.env.GOOGLE_PLACES_API_KEY=oldKey;}});

test('explicit Google calls only Places API (New) and preserves permission diagnostics',async()=>{
  const oldFetch=global.fetch,calls=[];
  global.fetch=async(url)=>{calls.push(String(url));return response({error:{status:'PERMISSION_DENIED',message:'The caller does not have permission'}},403);};
  try{
    await assert.rejects(
      discoverBusinesses({provider:'google',location:'Hyderabad',category:'doctor',radiusKm:5,pageToken:''},{googleApiKey:'test-key'}),
      error=>error.code==='GOOGLE_PERMISSION_DENIED'&&error.requestedProvider==='google'&&error.diagnostic.httpStatus===403
    );
    assert.equal(calls.length,1);
    assert.ok(calls.every(url=>url==='https://places.googleapis.com/v1/places:searchText'));
  }finally{global.fetch=oldFetch;}
});

test('explicit Open Data never calls Google',async()=>{
  _cache.clear();const oldFetch=global.fetch,calls=[];
  global.fetch=async(url)=>{calls.push(String(url));return String(url).includes('nominatim')?response([{lat:'17.4',lon:'78.5',display_name:'Hyderabad'}]):response({elements:[{type:'node',id:91,lat:17.4,lon:78.5,tags:{name:'Open Doctor',amenity:'doctors'}}]});};
  try{
    const result=await discoverBusinesses({provider:'open_data',location:'Explicit Open Data Unique',category:'doctor',radiusKm:5,pageToken:''},{googleApiKey:'test-key'});
    assert.equal(result.provider,'open_data');
    assert.equal(calls.some(url=>url.includes('places.googleapis.com')),false);
  }finally{global.fetch=oldFetch;}
});

test('Auto fallback retains the original Google permission failure',async()=>{
  _cache.clear();const oldFetch=global.fetch;
  global.fetch=async(url)=>String(url).includes('places.googleapis.com')
    ?response({error:{status:'PERMISSION_DENIED',message:'The caller does not have permission'}},403)
    :String(url).includes('nominatim')
      ?response([{lat:'17.4',lon:'78.5',display_name:'Hyderabad'}])
      :response({elements:[{type:'node',id:92,lat:17.4,lon:78.5,tags:{name:'Fallback Doctor',amenity:'doctors'}}]});
  try{
    const result=await discoverBusinesses({provider:'auto',location:'Auto Permission Unique',category:'doctor',radiusKm:5,pageToken:''},{googleApiKey:'test-key'});
    assert.equal(result.provider,'open_data');
    assert.equal(result.fallback.diagnostic.originalGoogleFailure.code,'GOOGLE_PERMISSION_DENIED');
    assert.equal(result.fallback.diagnostic.originalGoogleFailure.upstreamMessage,'The caller does not have permission');
    assert.deepEqual(result.fallback.diagnostic.attemptedProviders,['google','open_data']);
  }finally{global.fetch=oldFetch;}
});

test('Open Data timeout never replaces the Google failure in Auto mode',async()=>{
  _cache.clear();const oldFetch=global.fetch;
  global.fetch=async(url)=>{
    if(String(url).includes('places.googleapis.com'))return response({error:{status:'PERMISSION_DENIED',message:'The caller does not have permission'}},403);
    if(String(url).includes('nominatim'))return response([{lat:'17.4',lon:'78.5',display_name:'Hyderabad'}]);
    throw Object.assign(new Error('timeout'),{name:'AbortError'});
  };
  try{
    await assert.rejects(
      discoverBusinesses({provider:'auto',location:'Auto Double Failure Unique',category:'doctor',radiusKm:5,pageToken:''},{googleApiKey:'test-key'}),
      error=>error.code==='AUTO_FALLBACK_FAILED'&&error.diagnostic.originalGoogleFailure.code==='GOOGLE_PERMISSION_DENIED'&&error.diagnostic.openDataFailure.code==='OPEN_DATA_TIMEOUT'&&/Google Places permission denied/.test(error.message)&&/Open Data search timed out/.test(error.message)
    );
  }finally{global.fetch=oldFetch;}
});

test('Google request diagnostics describe Places API (New) without the key',()=>{
  const{buildGoogleRequest,FIELD_MASK,GOOGLE_ENDPOINT,redactSecret}=require('../api/local-businesses/providers/google');
  const request=buildGoogleRequest({location:'Hyderabad',category:'doctor',radiusKm:5,pageToken:''});
  assert.equal(request.endpoint,GOOGLE_ENDPOINT);
  assert.equal(request.method,'POST');
  assert.equal(request.fieldMask,FIELD_MASK);
  assert.deepEqual(request.body,{textQuery:'doctor in Hyderabad',languageCode:'en',maxResultCount:20});
  assert.equal(JSON.stringify(request).includes('test-key'),false);
  assert.equal(redactSecret('Google rejected test-key','test-key'),'Google rejected [redacted]');
});

test('frontend sends the selected Google provider exactly',async()=>{
  const oldFetch=global.fetch,oldWindow=global.window,oldStorage=global.localStorage;let sent;
  global.window={analytics:{track(){}}};global.localStorage={getItem:()=>null,setItem(){}};
  global.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return response({provider:'google',businesses:[]});};
  try{
    const{searchLocalBusinesses}=await import('../assets/js/local-business/business-service.mjs');
    await searchLocalBusinesses({location:'Hyderabad',category:'doctor',radiusKm:5,provider:'google'});
    assert.deepEqual(sent,{location:'Hyderabad',category:'doctor',radiusKm:5,provider:'google'});
  }finally{global.fetch=oldFetch;global.window=oldWindow;global.localStorage=oldStorage;}
});

test('Google-only API errors identify Google and never report Open Data',async()=>{
  const oldFetch=global.fetch,oldKey=process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY='test-key';
  global.fetch=async()=>response({error:{status:'PERMISSION_DENIED',message:'The caller does not have permission'}},403);
  try{
    const out=mockResponse();
    await searchHandler({method:'POST',body:{location:'Hyderabad',category:'doctor',radiusKm:5,provider:'google'},headers:{'content-type':'application/json','x-forwarded-for':'google-only-regression'},socket:{}},out);
    assert.equal(out.statusCode,503);
    assert.equal(out.body.error.code,'GOOGLE_PERMISSION_DENIED');
    assert.equal(out.body.error.provider,'google');
    assert.deepEqual(out.body.error.attemptedProviders,['google']);
    assert.equal(out.body.error.diagnostic.httpStatus,403);
    assert.equal(out.body.error.diagnostic.providerStatus,'PERMISSION_DENIED');
    assert.equal(out.body.error.diagnostic.upstreamMessage,'The caller does not have permission');
    assert.deepEqual(out.body.error.diagnostic.requestPayload,{textQuery:'doctor in Hyderabad',languageCode:'en',maxResultCount:20});
    assert.equal(JSON.stringify(out.body).includes('test-key'),false);
    assert.equal(JSON.stringify(out.body).includes('OPEN_DATA_TIMEOUT'),false);
  }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.GOOGLE_PLACES_API_KEY;else process.env.GOOGLE_PLACES_API_KEY=oldKey;}
});

test('provider-specific UI messages never label Google errors as Open Data',async()=>{
  const{providerErrorPresentation}=await import('../assets/js/local-business/business-renderer.mjs');
  const google=providerErrorPresentation({code:'GOOGLE_PERMISSION_DENIED',requestedProvider:'google'});
  const openData=providerErrorPresentation({code:'OPEN_DATA_TIMEOUT',requestedProvider:'open_data'});
  assert.equal(google.title,'Google Places permission denied');
  assert.equal(/Open Data/.test(`${google.title} ${google.message}`),false);
  assert.equal(openData.title,'Open Data timed out');
});

test('changing the frontend provider invalidates stale provider results',()=>{
  const fs=require('node:fs');
  const source=fs.readFileSync(require.resolve('../assets/js/local-business/local-business-finder.js'),'utf8');
  assert.match(source,/lbfProvider'\)\.addEventListener\('change',handleProviderSelectionChange\)/);
  assert.match(source,/function handleProviderSelectionChange\(\)\{requestGeneration\+=1;cancelBusinessSearch\(\)/);
  assert.match(source,/Run a new search to use the selected data source/);
});

function response(data,status=200){return{ok:status>=200&&status<300,status,json:async()=>data};}function mockResponse(){return{statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
