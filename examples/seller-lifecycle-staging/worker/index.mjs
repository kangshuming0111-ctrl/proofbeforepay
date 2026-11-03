import {handleLifecycleRequest} from './lifecycle-service.mjs';
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/pbp/')){
    if(request.method==='POST'&&request.headers.get('origin')!==url.origin)return Response.json({code:'same_origin_required'},{status:403});
    return handleLifecycleRequest(request,env);
  }
  if(!['GET','HEAD'].includes(request.method)||!env.ASSETS)return new Response('Not found',{status:404});
  const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
  headers.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors https://briefpay-kang-lab.blueheron8.chatgpt.site");
  headers.set('Referrer-Policy','no-referrer');headers.set('X-Content-Type-Options','nosniff');headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,headers});
}};
