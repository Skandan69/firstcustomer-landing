const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/persistence');
const repo=require('../api/persistence/repository');

const WORKSPACE='123e4567-e89b-42d3-a456-426614174000';
const TOKEN='223e4567-e89b-42d3-a456-426614174000';
function res(){return{statusCode:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
function response(data,status=200){return{ok:status>=200&&status<300,status,json:async()=>data};}
function configure(){process.env.SUPABASE_URL='https://database.example';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_server-only';}

test('website preview generator uses known facts and keeps sample content explicit',async()=>{
  const{buildWebsitePreview}=await import('../assets/js/local-business/website-preview-generator.mjs');
  const preview=buildWebsitePreview({provider:'google',providerId:'g1',name:'Smile Dental',category:'Dentist',city:'Hyderabad',address:'MG Road',phone:'+914012345678',rating:4.7,reviewCount:120});
  assert.equal(preview.business.name,'Smile Dental');
  assert.equal(preview.business.rating,4.7);
  assert.equal(preview.business.reviewCount,120);
  assert.match(preview.disclaimer,/confirm/i);
  assert.ok(preview.services.every(item=>/confirm|customer|contact|information|offerings|enquir/i.test(item.description)));
});

test('website preview generator never invents a missing rating or review count',async()=>{
  const{buildWebsitePreview}=await import('../assets/js/local-business/website-preview-generator.mjs');
  const preview=buildWebsitePreview({provider:'openstreetmap',providerId:'node:1',name:'Local Shop',category:'Retail'});
  assert.equal(preview.business.rating,null);
  assert.equal(preview.business.reviewCount,null);
  assert.equal(preview.proof.some(item=>/review|rating/i.test(item.label||'')),false);
});

test('server preview sanitization rejects unsafe URLs and unknown themes',()=>{
  const preview=repo.sanitizePreview({theme:'javascript',business:{name:'<script>x</script>',website:'javascript:alert(1)',rating:null,reviewCount:null},hero:{title:'Demo'},services:[{title:'One',description:'Text'}]});
  assert.equal(preview.theme,'modern');
  assert.equal(preview.business.website,'');
  assert.equal(preview.business.rating,null);
  assert.equal(preview.business.reviewCount,null);
  assert.equal(preview.business.name,'<script>x</script>');
});

test('saving a website preview stores only structured data in the existing activity log',async()=>{
  configure();const old=global.fetch;let body;
  global.fetch=async(_url,options)=>{body=JSON.parse(options.body);return response([{id:'activity-1',created_at:'2026-10-03T00:00:00Z'}]);};
  try{
    const out=res();
    await handler({method:'POST',query:{resource:'website_previews'},headers:{'x-workspace-id':WORKSPACE},body:{shareToken:TOKEN,business:{provider:'google',providerId:'g1',name:'Alpha'},preview:{version:1,theme:'modern',business:{name:'Alpha'},hero:{title:'Alpha'},services:[]}}},out);
    assert.equal(out.statusCode,201);
    assert.equal(out.body.item.shareToken,TOKEN);
    assert.equal(body.event_type,'website_demo_generated');
    assert.equal(body.workspace_id,WORKSPACE);
    assert.equal(body.metadata.shareToken,TOKEN);
    assert.equal(typeof body.metadata.preview,'object');
    assert.equal(JSON.stringify(body.metadata).includes('<html'),false);
  }finally{global.fetch=old;}
});

test('public preview lookup requires only an unguessable token and never returns workspace data',async()=>{
  configure();const old=global.fetch;let requested='';
  global.fetch=async(url)=>{requested=String(url);return response([{created_at:'2026-10-03T00:00:00Z',metadata:{shareToken:TOKEN,preview:{version:1,theme:'modern',business:{name:'Alpha',rating:null,reviewCount:null},hero:{title:'Alpha'},services:[]}}}]);};
  try{
    const out=res();
    await handler({method:'GET',query:{resource:'public_preview',token:TOKEN},headers:{}},out);
    assert.equal(out.statusCode,200);
    assert.equal(out.body.item.preview.business.name,'Alpha');
    assert.equal(JSON.stringify(out.body).includes(WORKSPACE),false);
    assert.match(requested,/website_demo_generated/);
    assert.match(requested,/shareToken/);
  }finally{global.fetch=old;}
});

test('public preview rejects invalid share tokens before querying Supabase',async()=>{
  configure();const old=global.fetch;let called=false;global.fetch=async()=>{called=true;return response([]);};
  try{const out=res();await handler({method:'GET',query:{resource:'public_preview',token:'bad-token'},headers:{}},out);assert.equal(out.statusCode,400);assert.equal(out.body.error.code,'INVALID_PREVIEW_TOKEN');assert.equal(called,false);}finally{global.fetch=old;}
});

test('public preview renderer avoids unsafe innerHTML rendering',()=>{
  const fs=require('node:fs');const source=fs.readFileSync(require.resolve('../preview/preview.js'),'utf8');
  assert.equal(source.includes('.innerHTML'),false);
  assert.match(source,/textContent/);
});
