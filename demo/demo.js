import { evaluateOpportunity } from '/assets/js/local-business/opportunity-engine.mjs';
import { buildWebsitePreview } from '/assets/js/local-business/website-preview-generator.mjs';
import { saveWebsitePreview, trackWebsitePreview } from '/assets/js/local-business/website-preview-service.mjs';
import { buildOutreachMessage } from '/assets/js/local-business/outreach-generator.mjs';
import { auditBusinessWebsite } from '/assets/js/local-business/website-audit-service.mjs';

const $=(id)=>document.getElementById(id);
let last={business:null,opportunity:null,url:''};

$('demoForm').addEventListener('submit',generate);
$('copyLink').addEventListener('click',()=>copy(last.url,'Demo link copied.'));
$('copyOutreach').addEventListener('click',()=>{if(!last.business)return;copy(buildOutreachMessage(last.business,last.opportunity,last.url),'Personalized outreach copied.');});

async function generate(event){
  event.preventDefault();
  const button=$('generateButton');button.disabled=true;button.textContent='Generating…';
  $('result').classList.add('hidden');setStatus('Preparing the business concept…');
  const business=readBusiness();
  let audit=null;
  try{
    if($('runAudit').checked&&business.website){
      setStatus('Auditing the existing website first…');
      try{const result=await auditBusinessWebsite(business);audit=result.audit||null;}catch(error){setStatus(`Website audit skipped: ${error.message} Generating the concept from the business details instead.`);}
    }
    const opportunity=evaluateOpportunity(business,audit);
    const preview=buildWebsitePreview(business,audit,opportunity);
    setStatus('Saving a secure share link…');
    const saved=await saveWebsitePreview(business,preview);
    const url=new URL(saved.url,location.origin).href;
    last={business,opportunity,url};
    trackWebsitePreview(business,opportunity);
    $('previewLink').href=url;
    $('resultText').textContent=audit?`Website audit incorporated. Opportunity score: ${opportunity.score}/100. The share link is ready for prospect outreach.`:`Opportunity score: ${opportunity.score}/100. The concept was generated from the verified details you provided.`;
    $('result').classList.remove('hidden');
    setStatus('Demo website generated successfully.');
  }catch(error){setStatus(error.message||'The demo website could not be generated.',true);}
  finally{button.disabled=false;button.textContent='Generate Shareable Demo';}
}

function readBusiness(){
  const name=$('businessName').value.trim();const category=$('category').value.trim();
  const locationValue=$('location').value.trim();
  const rating=numberOrNull($('rating').value);const reviewCount=numberOrNull($('reviews').value);
  return{provider:'manual',providerId:`manual:${crypto.randomUUID()}`,name,category,address:$('address').value.trim(),city:locationValue,state:'',country:'',latitude:null,longitude:null,phone:$('phone').value.trim(),email:$('email').value.trim(),website:normalizeWebsite($('website').value),rating,reviewCount:reviewCount===null?null:Math.max(0,Math.trunc(reviewCount)),businessStatus:'',sourceUrl:'',openingHours:''};
}

function normalizeWebsite(value){const text=String(value||'').trim();if(!text)return'';try{return new URL(/^https?:\/\//i.test(text)?text:`https://${text}`).href;}catch{return'';}}
function numberOrNull(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
async function copy(value,message){if(!value)return;try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);else{const area=document.createElement('textarea');area.value=value;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();document.execCommand('copy');area.remove();}setStatus(message);}catch{setStatus('Copy failed. Select the link manually.',true);}}
function setStatus(message,error=false){$('status').textContent=message||'';$('status').classList.toggle('error',Boolean(error));}
