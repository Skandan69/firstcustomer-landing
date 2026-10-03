import { publicProposal } from '/assets/js/sales/proposal-service.mjs';
import { formatInr } from '/assets/js/sales/proposal-generator.mjs';

const $=(id)=>document.getElementById(id);
const token=new URLSearchParams(location.search).get('token')||'';

load();

async function load(){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token))return fail('This proposal link is invalid.');
  try{
    const item=await publicProposal(token);
    render(item?.proposal);
  }catch(error){fail(error.message||'This proposal could not be loaded.');}
}

function render(proposal){
  if(!proposal||typeof proposal!=='object')return fail('This proposal does not contain valid content.');
  const business=proposal.business||{},pkg=proposal.package||{},pricing=proposal.pricing||{};
  document.title=`${business.name||'Business'} — Proposal`;
  text('proposalRef',`Ref ${token.slice(0,8).toUpperCase()}`);
  text('title',proposal.title||`Digital Growth Proposal for ${business.name||'Business'}`);
  text('summary',proposal.summary||'A practical digital growth project based on the available business information.');
  text('preparedAt',dateLabel(proposal.preparedAt));
  text('validUntil',dateLabel(proposal.validUntil));
  text('timeline',pkg.timeline||'To be confirmed');
  text('packageName',pkg.name||'Digital Growth Project');
  text('packageTimeline',pkg.timeline||'Timeline to be confirmed');
  text('projectFee',formatInr(pricing.projectFee));
  text('deposit',`${formatInr(pricing.depositAmount)} (${Number(pricing.depositPercent)||0}%)`);
  text('balance',formatInr(pricing.balanceAmount));
  text('businessFooter',[business.name,business.city].filter(Boolean).join(' · '));
  text('disclaimer',proposal.disclaimer||'Verify all business details and commercial terms before acceptance.');
  renderObserved(proposal.observed||[]);
  renderDeliverables(pkg.deliverables||[]);
  renderTerms(proposal.terms||[]);
  if(proposal.previewUrl){$('demoLink').href=proposal.previewUrl;$('demoLink').classList.remove('hidden');$('demoText').textContent='Review the website concept prepared alongside this proposal.';}
  if(proposal.note){$('noteSection').classList.remove('hidden');text('note',proposal.note);}
  $('loading').classList.add('hidden');$('proposalPage').classList.remove('hidden');$('actions').classList.remove('hidden');
  $('copyLink').addEventListener('click',()=>copy(location.href));
}

function renderObserved(items){
  const root=$('observed');root.replaceChildren();
  (items.length?items:['Project opportunity identified from available business information.']).slice(0,8).forEach((item)=>{
    const div=document.createElement('div');div.className='finding';div.textContent=String(item||'');root.append(div);
  });
}
function renderDeliverables(items){
  const root=$('deliverables');root.replaceChildren();
  items.slice(0,12).forEach((item)=>{const div=document.createElement('div');div.className='deliverable';div.textContent=String(item||'');root.append(div);});
}
function renderTerms(items){
  const root=$('terms');root.replaceChildren();
  items.slice(0,10).forEach((item)=>{const div=document.createElement('div');div.className='term';div.textContent=String(item||'');root.append(div);});
}
async function copy(value){try{await navigator.clipboard.writeText(value);$('copyLink').textContent='Copied';setTimeout(()=>$('copyLink').textContent='Copy proposal link',1300);}catch{}}
function dateLabel(value){const date=new Date(value);return Number.isNaN(date.getTime())?'To be confirmed':date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}
function text(id,value){const node=$(id);if(node)node.textContent=String(value||'');}
function fail(message){$('loading').classList.add('hidden');$('error').classList.remove('hidden');text('errorMessage',message);}
