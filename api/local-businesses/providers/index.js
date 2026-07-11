const {searchGoogle}=require('./google');
const {searchOpenData}=require('./open-data');

async function discoverBusinesses(criteria,options={}){
  const provider=criteria.provider||'auto';
  if(provider==='google')return searchGoogle(criteria,{apiKey:options.googleApiKey});
  if(provider==='open_data')return searchOpenData(criteria,options.openData);
  try{return await searchGoogle(criteria,{apiKey:options.googleApiKey});}
  catch(error){if(!error.fallbackEligible)throw error;const result=await searchOpenData(criteria,options.openData);return{...result,fallback:{from:'google',to:'open_data',code:error.code,message:'Google Places is unavailable, so Open Data results are shown instead.'}};}
}
module.exports={discoverBusinesses};
