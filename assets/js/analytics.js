(function(root,factory){const createAnalytics=factory();if(typeof module==='object'&&module.exports)module.exports={createAnalytics};else root.analytics=createAnalytics(root);})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const MEASUREMENT_ID='G-WKVRV08E16';
  const EVENTS=new Set(['page_view','business_search','save_lead','remove_lead','save_search','generate_audit','generate_website','proposal_generated']);
  function createAnalytics(root){
    if(root.__firstCustomerAnalytics)return root.__firstCustomerAnalytics;
    const api={measurementId:MEASUREMENT_ID,track};root.__firstCustomerAnalytics=api;
    try{root.dataLayer=root.dataLayer||[];const gtag=(...args)=>root.dataLayer.push(args);root.gtag=root.gtag||gtag;root.gtag('js',new Date());root.gtag('config',MEASUREMENT_ID,{send_page_view:false});loadScript(root);track('page_view',{page_title:root.document?.title||'',page_location:root.location?.href||'',page_path:root.location?.pathname||''});}catch{}
    return api;
    function track(event,properties={}){try{if(!EVENTS.has(event))return false;const safe=cleanProperties(properties);if(typeof root.gtag==='function')root.gtag('event',event,safe);return true;}catch{return false;}}
  }
  function loadScript(root){const doc=root.document;if(!doc||doc.getElementById('fc-ga4-script'))return;const script=doc.createElement('script');script.id='fc-ga4-script';script.async=true;script.src=`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;script.onerror=()=>{};(doc.head||doc.documentElement).appendChild(script);}
  function cleanProperties(value){if(!value||typeof value!=='object'||Array.isArray(value))return{};return Object.fromEntries(Object.entries(value).filter(([key,item])=>/^[a-z][a-z0-9_]{0,39}$/i.test(key)&&['string','number','boolean'].includes(typeof item)).slice(0,25).map(([key,item])=>[key,typeof item==='string'?item.slice(0,100):item]));}
  return createAnalytics;
});
