const $=(id)=>document.getElementById(id);
const token=new URLSearchParams(location.search).get('token')||'';

load();

async function load(){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)){return fail('This preview link is invalid.');}
  try{
    const response=await fetch(`/api/persistence?resource=public_preview&token=${encodeURIComponent(token)}`);
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error?.message||'This preview could not be loaded.');
    render(payload.item?.preview);
  }catch(error){fail(error.message||'This preview could not be loaded.');}
}

function render(preview){
  if(!preview||typeof preview!=='object')return fail('This preview does not contain valid website content.');
  document.body.dataset.theme=theme(preview.theme);
  const business=preview.business||{},hero=preview.hero||{},story=preview.story||{},contact=preview.contact||{};
  document.title=`${business.name||'Business'} — Website Concept`;
  text('brandName',business.name||'Business');
  text('navCategory',business.category||'Local business');
  text('heroEyebrow',hero.eyebrow||business.category||'Local business');
  text('heroTitle',hero.title||business.name||'Business');
  text('heroSubtitle',hero.subtitle||'A clearer digital experience for customers.');
  text('visualTitle',business.name||'A modern business website');
  text('storyTitle',story.title||`A stronger digital first impression for ${business.name||'this business'}`);
  text('storyBody',story.body||'A focused concept that makes it easier for customers to understand the business and get in touch.');
  text('contactTitle',contact.title||'Ready to talk?');
  text('footerName',business.name||'Business');
  renderProof(Array.isArray(preview.proof)?preview.proof:[]);
  renderServices(Array.isArray(preview.services)?preview.services:[]);
  renderContact(contact,business);
  configureCtas(contact,business,hero);
  if(preview.auditContext&&Number.isFinite(Number(preview.auditContext.healthScore))){text('auditNote',`The current website health audit scored ${Math.round(Number(preview.auditContext.healthScore))}/100. This concept addresses the presentation and conversion layer; all final content should be verified before launch.`);}
  $('loading').classList.add('hidden');$('site').classList.remove('hidden');
}

function renderProof(items){
  const root=$('proof');root.replaceChildren();
  const safeItems=items.slice(0,3);
  if(!safeItems.length)safeItems.push({value:'Clear',label:'Mobile-first information'},{value:'Simple',label:'Customer contact path'},{value:'Local',label:'Business-first experience'});
  safeItems.forEach((item)=>{const node=document.createElement('div');node.className='proof-item';const value=document.createElement('div');value.className='proof-value';value.textContent=String(item.value||'');const label=document.createElement('div');label.className='proof-label';label.textContent=String(item.label||'');node.append(value,label);root.append(node);});
}

function renderServices(items){
  const root=$('servicesGrid');root.replaceChildren();
  items.slice(0,6).forEach((item,index)=>{const card=document.createElement('article');card.className='service';const num=document.createElement('div');num.className='service-num';num.textContent=String(index+1).padStart(2,'0');const title=document.createElement('h3');title.textContent=String(item.title||'Service section');const p=document.createElement('p');p.textContent=String(item.description||'Confirm the exact content with the business before publication.');card.append(num,title,p);root.append(card);});
}

function renderContact(contact,business){
  const root=$('contactCard');root.replaceChildren();
  const rows=[['Phone',contact.phone||business.phone],['Email',contact.email||business.email],['Address',contact.address||business.address],['Area',contact.location||business.location]].filter(([,value])=>value);
  if(!rows.length)rows.push(['Contact','Confirm the preferred customer contact method before publishing.']);
  rows.forEach(([label,value])=>{const row=document.createElement('div');row.className='contact-row';const strong=document.createElement('strong');strong.textContent=`${label}: `;row.append(strong,document.createTextNode(String(value)));root.append(row);});
}

function configureCtas(contact,business,hero){
  const phone=digits(contact.phone||business.phone);const email=validEmail(contact.email||business.email)?String(contact.email||business.email):'';
  const primary=$('primaryCta'),nav=$('navCta');
  primary.textContent=hero.primaryCta||'Get in touch';nav.textContent=phone?'Call now':email?'Email us':'Get in touch';
  if(phone){primary.href=`tel:${phone}`;nav.href=`tel:${phone}`;}
  else if(email){primary.href=`mailto:${email}`;nav.href=`mailto:${email}`;}
  else{primary.href='#contact';nav.href='#contact';}
}

function fail(message){$('loading').classList.add('hidden');$('error').classList.remove('hidden');text('errorMessage',message);}
function text(id,value){const node=$(id);if(node)node.textContent=String(value||'');}
function theme(value){return['care','hospitality','service','professional','wellness','education','retail','modern'].includes(value)?value:'modern';}
function digits(value){return String(value||'').replace(/\D/g,'').slice(0,20);}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||''));}
