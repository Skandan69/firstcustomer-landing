const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/persistence');
const repo=require('../api/persistence/repository');

const WORKSPACE='123e4567-e89b-42d3-a456-426614174000';
const TOKEN='323e4567-e89b-42d3-a456-426614174000';
const BUSINESS='423e4567-e89b-42d3-a456-426614174000';
function response(data,status=200){return{ok:status>=200&&status<300,status,json:async()=>data};}
function res(){return{statusCode:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
function configure(){process.env.SUPABASE_URL='https://database.example';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_server-only';}

test('CRM pipeline derives stage, proposal value, win value and follow-up state',async()=>{
  const{buildPipeline}=await import('../assets/js/sales/crm-engine.mjs');
  const saved=[{id:'lead-1',business_id:BUSINESS,businesses:{id:BUSINESS,name:'Alpha Clinic',category:'Clinic'}}];
  const activities=[
    {business_id:BUSINESS,event_type:'crm_stage_changed',created_at:'2026-10-01T00:00:00Z',metadata:{stage:'contacted'}},
    {business_id:BUSINESS,event_type:'crm_next_action_set',created_at:'2026-10-01T01:00:00Z',metadata:{text:'Call owner',dueAt:'2026-10-02'}},
    {business_id:BUSINESS,event_type:'proposal_generated',created_at:'2026-10-01T02:00:00Z',metadata:{shareToken:TOKEN,proposal:{pricing:{projectFee:18000}}}}
  ];
  const pipeline=buildPipeline(saved,activities,new Date('2026-10-03T00:00:00Z').getTime());
  assert.equal(pipeline.leads[0].stage,'proposal');
  assert.equal(pipeline.summary.proposalValue,18000);
  assert.equal(pipeline.summary.followupsDue,1);
  assert.match(pipeline.leads[0].proposalUrl,/proposal/);
});

test('won and lost events override earlier pipeline stages',async()=>{
  const{buildPipeline}=await import('../assets/js/sales/crm-engine.mjs');
  const saved=[{id:'lead-1',business_id:BUSINESS,businesses:{id:BUSINESS,name:'Alpha'}}];
  const won=buildPipeline(saved,[{business_id:BUSINESS,event_type:'proposal_generated',created_at:'2026-10-01',metadata:{proposal:{pricing:{projectFee:20000}}}},{business_id:BUSINESS,event_type:'lead_won',created_at:'2026-10-02',metadata:{}}]);
  assert.equal(won.leads[0].stage,'won');
  assert.equal(won.summary.wonValue,20000);
  const lost=buildPipeline(saved,[{business_id:BUSINESS,event_type:'crm_stage_changed',created_at:'2026-10-01',metadata:{stage:'interested'}},{business_id:BUSINESS,event_type:'lead_lost',created_at:'2026-10-03',metadata:{reason:'Budget'}}]);
  assert.equal(lost.leads[0].stage,'lost');
});

test('proposal generator produces editable commercial terms without inventing business facts',async()=>{
  const{buildProposal}=await import('../assets/js/sales/proposal-generator.mjs');
  const proposal=buildProposal({business:{name:'Alpha Clinic',category:'Clinic',website:'',rating:null,reviewCount:null},opportunity:{recommendedService:'New business website',reasons:['No website listed']},packageId:'website',projectFee:14000,depositPercent:40,validityDays:10});
  assert.equal(proposal.business.rating,null);
  assert.equal(proposal.business.reviewCount,null);
  assert.equal(proposal.pricing.projectFee,14000);
  assert.equal(proposal.pricing.depositAmount,5600);
  assert.equal(proposal.package.id,'website');
  assert.ok(proposal.observed.includes('No website listed'));
  assert.match(proposal.disclaimer,/Verify/);
});

test('proposal server sanitizer blocks unsafe URLs and bounds commercial data',()=>{
  const proposal=repo.sanitizeProposal({business:{name:'Alpha',website:'javascript:alert(1)',rating:null,reviewCount:null},title:'Proposal',package:{id:'x',name:'Test',timeline:'Soon',deliverables:['One']},pricing:{projectFee:99999999,depositPercent:500,depositAmount:99999999,balanceAmount:99999999},previewUrl:'javascript:alert(1)',observed:['Finding'],terms:['Term']});
  assert.equal(proposal.business.website,'');
  assert.equal(proposal.previewUrl,'');
  assert.equal(proposal.pricing.projectFee,10000000);
  assert.equal(proposal.pricing.depositPercent,100);
  assert.equal(proposal.business.rating,null);
});

test('proposal save uses existing activity log and public lookup exposes no workspace id',async()=>{
  configure();const old=global.fetch;const calls=[];
  global.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(options.method==='POST')return response([{id:'event-1',created_at:'2026-10-03T00:00:00Z'}]);
    return response([{created_at:'2026-10-03T00:00:00Z',metadata:{shareToken:TOKEN,proposal:{version:1,business:{name:'Alpha',rating:null,reviewCount:null},title:'Proposal',package:{name:'Website',deliverables:[]},pricing:{projectFee:12000,depositPercent:50,depositAmount:6000,balanceAmount:6000},observed:[],terms:[]}}}]);
  };
  try{
    let out=res();
    await handler({method:'POST',query:{resource:'proposals'},headers:{'x-workspace-id':WORKSPACE},body:{shareToken:TOKEN,businessId:BUSINESS,business:{provider:'manual',providerId:'manual:1',name:'Alpha'},proposal:{version:1,business:{name:'Alpha',rating:null,reviewCount:null},title:'Proposal',package:{name:'Website',deliverables:[]},pricing:{projectFee:12000,depositPercent:50,depositAmount:6000,balanceAmount:6000},observed:[],terms:[]}}},out);
    assert.equal(out.statusCode,201);
    const posted=JSON.parse(calls[0].options.body);
    assert.equal(posted.event_type,'proposal_generated');
    assert.equal(posted.business_id,BUSINESS);
    assert.equal(posted.metadata.shareToken,TOKEN);

    out=res();
    await handler({method:'GET',query:{resource:'public_proposal',token:TOKEN},headers:{}},out);
    assert.equal(out.statusCode,200);
    assert.equal(out.body.item.proposal.business.name,'Alpha');
    assert.equal(JSON.stringify(out.body).includes(WORKSPACE),false);
  }finally{global.fetch=old;}
});

test('CRM event allowlist accepts stage, follow-up, won and lost events',async()=>{
  configure();const old=global.fetch;global.fetch=async()=>response([{id:'activity'}]);
  try{
    for(const eventType of ['crm_stage_changed','crm_next_action_set','crm_followup_logged','outreach_sent','proposal_status_changed','lead_won','lead_lost']){
      const out=res();
      await handler({method:'POST',query:{resource:'activity_log'},headers:{'x-workspace-id':WORKSPACE},body:{eventType,businessId:BUSINESS,metadata:{stage:'contacted'}}},out);
      assert.equal(out.statusCode,201,eventType);
    }
  }finally{global.fetch=old;}
});

test('public proposal renderer uses safe text rendering and supports print-to-PDF',()=>{
  const fs=require('node:fs');
  const js=fs.readFileSync(require.resolve('../proposal/proposal.js'),'utf8');
  const html=fs.readFileSync(require.resolve('../proposal/index.html'),'utf8');
  assert.equal(js.includes('.innerHTML'),false);
  assert.match(js,/textContent/);
  assert.match(html,/window\.print/);
  assert.match(html,/noindex,nofollow/);
});
