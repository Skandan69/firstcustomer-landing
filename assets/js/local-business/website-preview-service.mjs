import { workspaceId } from './persistence-service.mjs';

const ENDPOINT='/api/persistence';

export async function saveWebsitePreview(business,preview){
  const shareToken=crypto.randomUUID();
  const response=await fetch(`${ENDPOINT}?resource=website_previews`,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Workspace-Id':workspaceId()},
    body:JSON.stringify({shareToken,business,preview})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(payload.error?.message||'The demo website could not be saved.'),{code:payload.error?.code||'PREVIEW_SAVE_FAILED',status:response.status});
  const token=payload.item?.shareToken||shareToken;
  return{shareToken:token,url:`/preview/?token=${encodeURIComponent(token)}`};
}

export function trackWebsitePreview(business,opportunity){
  try{
    window.analytics?.track('generate_website',{
      source:'local_business_finder',
      provider:business.provider||'unknown',
      has_existing_website:Boolean(business.website),
      opportunity_band:opportunity?.level||'unknown'
    });
  }catch{}
}
