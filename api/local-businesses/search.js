const {validateRequestBody}=require('./core');
const {discoverBusinesses}=require('./providers');
const {recordSearch}=require('../persistence/repository');
const WINDOW_MS=60_000;const MAX_REQUESTS_PER_WINDOW=20;const requestBuckets=new Map();

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendError(res,405,'METHOD_NOT_ALLOWED','Use POST for business searches.');}
  const contentType=String(req.headers?.['content-type']||'').toLowerCase();if(contentType&&!contentType.includes('application/json'))return sendError(res,400,'INVALID_BODY','Send a valid JSON request body.');
  const validation=validateRequestBody(req.body);if(!validation.ok)return res.status(validation.error.code==='REQUEST_TOO_LARGE'?413:400).json({error:validation.error});
  if(!allowRequest(clientIp(req)))return sendError(res,429,'SEARCH_RATE_LIMITED','Too many searches. Please wait a minute and try again.');
  try{const result=await discoverBusinesses(validation.value,{googleApiKey:process.env.GOOGLE_PLACES_API_KEY});const workspaceId=String(req.headers?.['x-workspace-id']||'');if(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)){try{await recordSearch(workspaceId,validation.value,result);}catch(error){console.error('[search-history]',{code:error.code||'PERSISTENCE_FAILED'});}}return res.status(200).json(result);}
  catch(error){console.error('[business-discovery]',{code:error.code||'SEARCH_FAILED',message:error.message});return sendError(res,error.status||502,error.code||'SEARCH_FAILED',error.message||'Business discovery is temporarily unavailable.');}
};
function sendError(res,status,code,message){return res.status(status).json({error:{code,message}});}function clientIp(req){return String(req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();}function allowRequest(ip,now=Date.now()){for(const[key,bucket]of requestBuckets)if(now-bucket.startedAt>WINDOW_MS)requestBuckets.delete(key);const bucket=requestBuckets.get(ip);if(!bucket||now-bucket.startedAt>WINDOW_MS){requestBuckets.set(ip,{startedAt:now,count:1});return true;}bucket.count+=1;return bucket.count<=MAX_REQUESTS_PER_WINDOW;}
