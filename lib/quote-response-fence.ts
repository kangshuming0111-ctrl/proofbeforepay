/** Client response ordering only. The server still owns membership, versions,
 * evidence and payment. Quotes are never merged and writes are never retried. */
export type QuoteResponseView = {projectId:string|null; deliveryId:string|null; role:"buyer"|"seller"};
export type QuoteResponseTicket = {view:QuoteResponseView; revision:number};
export type QuoteResponseEnvelope<Q> = {quote:Q; role?:"buyer"|"seller"};
export type QuoteResponseOutcome =
  | {kind:"applied"; source:"response"|"refresh"}
  | {kind:"ignored-context"|"superseded"}
  | {kind:"refresh-failed"|"invalid-response"; message:string};
type ResponseSettings = {
  allowDeliveryChange?:boolean;
  /** Read the requested demo perspective while guarding the original view. */
  projectionRole?:"buyer"|"seller";
  /** Commit a perspective change in the same stack as applying its snapshot. */
  afterApply?:()=>void;
};
type QuoteShape = {id:string; proof:{delivery?:{id:string}}};
export function sameQuoteResponseView(a:QuoteResponseView,b:QuoteResponseView) {
  return a.projectId===b.projectId && a.deliveryId===b.deliveryId && a.role===b.role;
}
export function quoteResponseContext(view:QuoteResponseView) {
  return `${view.projectId??""}:${view.deliveryId??""}:${view.role}`;
}
export function createQuoteResponseFence<Q extends QuoteShape>(options:{
  read:()=>QuoteResponseTicket;
  isQuote:(value:unknown)=>value is Q;
  /** Transport membership may differ from a single-tool workspace perspective. */
  expectedRole?:(view:QuoteResponseView,quote:Q)=>"buyer"|"seller";
  apply:(value:QuoteResponseEnvelope<Q>)=>void;
  load:(view:QuoteResponseView)=>Promise<QuoteResponseEnvelope<Q>>;
}) {
  let refreshSequence=0;
  const capture=():QuoteResponseTicket=>structuredClone(options.read());
  const inView=(ticket:QuoteResponseTicket)=>!!ticket.view.projectId && sameQuoteResponseView(ticket.view,options.read().view);
  const valid=(ticket:QuoteResponseTicket,value:QuoteResponseEnvelope<Q>,settings:ResponseSettings={})=>
    !!value && options.isQuote(value.quote) && value.quote.id===ticket.view.projectId &&
    (value.role===undefined || value.role===(options.expectedRole?.({...ticket.view,role:settings.projectionRole??ticket.view.role},value.quote)??settings.projectionRole??ticket.view.role));
  async function refresh(ticket:QuoteResponseTicket,settings:ResponseSettings={}):Promise<QuoteResponseOutcome> {
    if(!inView(ticket)) return {kind:"ignored-context"};
    const started=capture(),sequence=++refreshSequence;
    const current=()=>inView(started) && options.read().revision===started.revision && sequence===refreshSequence;
    try {
      const value=await options.load({...structuredClone(started.view),role:settings.projectionRole??started.view.role});
      if(!current()) return {kind:"superseded"};
      if(!valid(started,value,settings)) return {kind:"invalid-response",message:"The refreshed record belongs to a different project or perspective."};
      options.apply(value); settings.afterApply?.();
      return {kind:"applied",source:"refresh"};
    } catch(error) {
      if(!current()) return {kind:"superseded"};
      return {kind:"refresh-failed",message:error instanceof Error?error.message:"Current project refresh failed."};
    }
  }
  async function receive(ticket:QuoteResponseTicket,value:QuoteResponseEnvelope<Q>,settings:ResponseSettings={}):Promise<QuoteResponseOutcome> {
    if(!inView(ticket)) return {kind:"ignored-context"};
    if(!valid(ticket,value,settings)) return {kind:"invalid-response",message:"The response belongs to a different project or perspective."};
    if(options.read().revision!==ticket.revision || !settings.allowDeliveryChange && (value.quote.proof.delivery?.id??null)!==ticket.view.deliveryId)
      return refresh(ticket,settings);
    options.apply(value); settings.afterApply?.();
    return {kind:"applied",source:"response"};
  }
  return {capture,receive,refresh};
}
