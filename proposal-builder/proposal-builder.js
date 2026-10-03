import { listSavedLeads, listActivity } from '/assets/js/local-business/persistence-service.mjs';
import { evaluateOpportunity } from '/assets/js/local-business/opportunity-engine.mjs';
import { buildProposal, PROPOSAL_PACKAGES, recommendedPackage, formatInr } from '/assets/js/sales/proposal-generator.mjs';
import { saveProposal } from '/assets/js/sales/proposal-service.mjs';

const $=(id)=>document.getElementById(id);
let leads=[],activities=[],selected=null,lastUrl='';

init();

async function init(){
  fillPackages();
  bind();
  try{
    const [leadResult,activityResult]=await Promise.all([listSavedLeads(),listActivity()]);
    leads=leadResult.items||[];activities=activityResult.items||[];
    const select=$('leadSelect');select.replaceChildren(new Option(leads.length?'Choose a saved lead':'No saved leads yet',''));
    leads.forEach((lead)=>select.add(new Option(lead.businesses?.name||'Saved business',lead.id)));
    const requested=new URLSearchParams(location.search).get('lead');
    if(requested&&leads.some((lead)=>lead.id===requested)){select.value=requested;selectLead(requested);}
    if(!leads.length)setStatus('Save a business in Local Business Finder first, then return here.',true);
  }catch(error){setStatus(error.message||'Saved leads could not be loaded.',true);}
}

function bind(){
  $('leadSelect').addEventListener('change',(event)=>selectLead(event.target.value));
  $('packageSelect').addEventListener('change',()=>applyPackage($('packageSelect').value,true));
  ['projectFee','depositPercent','timeline','validityDays','note'].forEach((id)=>$(id).addEventListener('input',renderPreview));
  $('proposalForm').addEventListener('submit',generate);
  $('copyProposal').addEventListener('click',()=>copy(lastUrl,'Proposal link copied.'));
  $('copyFollowup').addEventListener('click',()=>copyFollowup());
}

function fillPackages(){
  const select=$('packageSelect');select.replaceChildren();
  Object.entries(PROPOSAL_PACKAGES).forEach(([id,pkg])=>select.add(new Option(`${pkg.name} — ${formatInr(pkg.price)}`,id)));
}

function selectLead(id){
  selected=leads.find((lead)=>lead.id===id)||null;
  $('success').classList.add('hidden');lastUrl='';
  if(!selected){$('businessCard').classList.add('hidden');renderPreview();return;}
  const business=toBusiness(selected.businesses||{});
  const opportunity=evaluateOpportunity(business,null);
  const packageId=recommendedPackage(business,opportunity);
  $('businessCard').classList.remove('hidden');
  text('businessName',business.name);
  text('businessMeta',[business.category,business.city,business.phone].filter(Boolean).join(' · '));
  text('businessOpportunity',`Opportunity ${opportunity.score}/100 · ${opportunity.recommendedService}`);
  $('packageSelect').value=packageId;
  applyPackage(packageId,true);
}

function applyPackage(id,overwrite){
  const pkg=PROPOSAL_PACKAGES[id]||PROPOSAL_PACKAGES.website;
  if(overwrite||!$('projectFee').value)$('projectFee').value=String(pkg.price);
  if(overwrite||!$('timeline').value)$('timeline').value=pkg.timeline;
  renderPreview();
}

function renderPreview(){
  if(!selected){text('previewTitle','Select a saved lead');text('previewObserved','The strongest factual opportunity signals will appear here.');text('previewScope','Choose a lead to see the recommended project scope.');text('previewPrice','₹0');text('previewDeposit','₹0');text('previewDemo','No demo linked yet.');return;}
  const business=toBusiness(selected.businesses||{});
  const opportunity=evaluateOpportunity(business,null);
  const packageId=$('packageSelect').value||recommendedPackage(business,opportunity);
  const previewUrl=findDemoUrl(business);
  const proposal=currentProposal(business,opportunity,packageId,previewUrl);
  text('previewTitle',proposal.title);
  text('previewObserved',proposal.observed.slice(0,3).join(' · '));
  text('previewScope',`${proposal.package.name}: ${proposal.package.deliverables.slice(0,3).join(', ')}`);
  text('previewPrice',formatInr(proposal.pricing.projectFee));
  text('previewDeposit',formatInr(proposal.pricing.depositAmount));
  text('previewDemo',previewUrl?'Latest shareable demo website will be included.':'No saved demo found. The proposal can still be sent without one.');
}

async function generate(event){
  event.preventDefault();
  if(!selected){setStatus('Choose a saved lead first.',true);return;}
  const button=$('generateButton');button.disabled=true;button.textContent='Generating…';$('success').classList.add('hidden');
  try{
    const business=toBusiness(selected.businesses||{});
    const opportunity=evaluateOpportunity(business,null);
    const packageId=$('packageSelect').value||recommendedPackage(business,opportunity);
    const previewUrl=findDemoUrl(business);
    const proposal=currentProposal(business,opportunity,packageId,previewUrl);
    const saved=await saveProposal({businessId:business.id,business,proposal});
    lastUrl=new URL(saved.url,location.origin).href;
    $('openProposal').href=lastUrl;
    $('success').classList.remove('hidden');
    setStatus('Proposal generated and added to the sales pipeline.');
    try{window.analytics?.track('proposal_generated',{package_id:packageId,has_demo:Boolean(previewUrl),opportunity_band:opportunity.level||'unknown'});}catch{}
    const activityResult=await listActivity();activities=activityResult.items||activities;
  }catch(error){setStatus(error.message||'The proposal could not be generated.',true);}
  finally{button.disabled=false;button.textContent='Generate Shareable Proposal';}
}

function currentProposal(business,opportunity,packageId,previewUrl){
  return buildProposal({
    business,opportunity,previewUrl,packageId,
    projectFee:$('projectFee').value,
    depositPercent:$('depositPercent').value,
    timeline:$('timeline').value,
    validityDays:$('validityDays').value,
    note:$('note').value
  });
}

function findDemoUrl(business){
  const event=[...activities].filter((activity)=>activity.event_type==='website_demo_generated'&&activity.metadata?.businessRef?.provider===business.provider&&activity.metadata?.businessRef?.providerId===business.providerId&&activity.metadata?.shareToken).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
  return event?.metadata?.shareToken?new URL(`/preview/?token=${encodeURIComponent(event.metadata.shareToken)}`,location.origin).href:'';
}

function toBusiness(row){
  return{provider:row.provider||'manual',providerId:row.provider_id||row.providerId||row.id||crypto.randomUUID(),id:row.id||'',name:row.name||'',category:row.category||'',address:row.address||'',city:row.city||'',state:row.state||'',country:row.country||'',phone:row.phone||'',email:row.email||'',website:row.website||'',rating:row.rating===null||row.rating===undefined?null:Number(row.rating),reviewCount:row.review_count===null||row.review_count===undefined?null:Number(row.review_count),businessStatus:row.business_status||'',sourceUrl:row.source_url||''};
}

async function copyFollowup(){
  if(!selected||!lastUrl)return;
  const business=toBusiness(selected.businesses||{});
  const message=`Hi ${business.name || 'there'} — I’ve prepared a short proposal based on the digital opportunity I reviewed. You can see the scope, timeline and pricing here: ${lastUrl} If it looks relevant, I can tailor the final scope around your actual priorities and business requirements.`;
  await copy(message,'Proposal follow-up copied.');
}
async function copy(value,message){if(!value)return;try{await navigator.clipboard.writeText(value);setStatus(message);}catch{setStatus('Copy failed. Open the proposal and copy the URL manually.',true);}}
function setStatus(message,error=false){$('status').textContent=message||'';$('status').classList.toggle('error',Boolean(error));}
function text(id,value){const node=$(id);if(node)node.textContent=String(value||'');}
