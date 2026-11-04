import type {ProofQuote} from "./contracts.ts";
import {snapshot, Unavailable, cancelled, bounded} from "./saved-page-observation.ts";
import type {SourceVisibilityCitation, SourceVisibilityPlan, SourceVisibilityReading, VisibilityReason, VisibilityTarget} from "./source-visibility.ts";

const excluded = new Set(["SCRIPT","STYLE","TEMPLATE","NOSCRIPT","TEXTAREA","TITLE","HEAD","SVG","MATH","IFRAME","XMP","NOEMBED","NOFRAMES","PLAINTEXT"]);
const normalize = (value:string)=>value.replace(/\s+/gu," ").trim();
function locate(doc:Document,target:VisibilityTarget):Text|undefined{
 let parent:Element=doc.body;
 for(const [index,position]of target.path.entries()){
  const next=parent.children[position];if(!next||next.tagName.toLowerCase()!==target.tags[index])return;parent=next;
 }
 const node=[...parent.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE)[target.textIndex];
 return node?.nodeValue===target.value?node as Text:undefined;
}
/** Inspects a complete source-mapped text node, not a selector supplied by a
 * participant and not a substring searched across arbitrary DOM content. */
export function observeCitationText(doc:Document,win:Window,citation:SourceVisibilityCitation):Pick<SourceVisibilityReading,"state"|"reason">{
 if(!citation.target)return{state:"unavailable",reason:"unsupported_target"};
 const node=locate(doc,citation.target);if(!node||!node.parentElement)return{state:"unavailable",reason:"snapshot_mismatch"};
 const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);let current:Node|null,count=0,visited=0;
 while((current=walker.nextNode())){
  if(++visited>20000)return{state:"unavailable",reason:"resource_limit"};
  let eligible=true;for(let e=current.parentElement;e;e=e.parentElement)if(excluded.has(e.tagName)){eligible=false;break;}
  if(eligible&&normalize(current.nodeValue??"")===normalize(citation.target.value))count++;
 }
 if(count!==1)return{state:"ambiguous",reason:"ambiguous_text"};
 // visibility is inherited and descendants may explicitly restore visible.
 // Ancestor display/opacity/content-visibility still suppress descendants.
 const ownStyle=win.getComputedStyle(node.parentElement);
 if(ownStyle.visibility==="hidden"||ownStyle.visibility==="collapse")return{state:"hidden",reason:"visibility_hidden"};
 for(let element:Element|null=node.parentElement;element;element=element.parentElement){
  const style=win.getComputedStyle(element);
  if(style.display==="none")return{state:"hidden",reason:"display_none"};
  if(Number(style.opacity)===0)return{state:"hidden",reason:"opacity_zero"};
  if(style.contentVisibility==="hidden")return{state:"hidden",reason:"content_hidden"};
 }
 const range=doc.createRange();range.selectNodeContents(node);
 const initial=range.getBoundingClientRect();win.scrollTo({top:Math.max(0,win.scrollY+initial.top-100),left:0,behavior:"instant"});
 const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);
 let left=0,top=0,right=win.innerWidth,bottom=win.innerHeight;
 for(let element:Element|null=node.parentElement;element;element=element.parentElement){
  const style=win.getComputedStyle(element),clipX=style.overflowX!=="visible",clipY=style.overflowY!=="visible";
  if(!clipX&&!clipY)continue;
  // Client dimensions do not transform with a rotated/scaled clipping box.
  // Avoid inventing a pixel-visibility answer for that geometry.
  if(style.transform!=="none")return{state:"unavailable",reason:"not_visually_determined"};
  const box=element.getBoundingClientRect(),x=box.left+element.clientLeft,y=box.top+element.clientTop;
  if(clipX){left=Math.max(left,x);right=Math.min(right,x+element.clientWidth);}
  if(clipY){top=Math.max(top,y);bottom=Math.min(bottom,y+element.clientHeight);}
 }
 // A partially clipped citation cannot prove that its complete text is shown.
 // Inner containers are not scrolled or opened by this static observation.
 if(rects.length&&right>left&&bottom>top&&rects.every(r=>r.left>=left-1&&r.right<=right+1&&r.top>=top-1&&r.bottom<=bottom+1))return{state:"visible"};
 return{state:"unavailable",reason:"not_visually_determined"};
}
/** Saved static snapshots only: scripts/forms remain disabled. Observations
 * establish bounded client layout evidence, never live-site attestation. */
export async function runSourceVisibility(quote:ProofQuote,plan:SourceVisibilityPlan,signal:AbortSignal,onProgress?:(done:number,total:number)=>void):Promise<SourceVisibilityReading[]>{
 const delivery=quote.proof.delivery;
 if(!delivery?.files||delivery.id!==plan.deliveryId||delivery.assessment?.id!==plan.assessmentId)throw new Error("The delivery or saved AI assessment changed. Refresh before observing.");
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason);signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
 const timeout=setTimeout(()=>controller.abort(new Error("Source-visibility observation exceeded 90 seconds; no partial report was saved.")),90000),readings:SourceVisibilityReading[]=[];
 const total=plan.citations.length*2;onProgress?.(0,total);
 try{
  for(const width of plan.widths){
   const groups=new Map<string,SourceVisibilityCitation[]>();
   for(const citation of plan.citations){
    if(!citation.target){readings.push({citationId:citation.id,viewportWidth:width,state:"unavailable",reason:"unsupported_target"});onProgress?.(readings.length,total);continue;}
    const group=groups.get(citation.citation.file)??[];group.push(citation);groups.set(citation.citation.file,group);
   }
   for(const [file,citations]of groups){
    cancelled(controller.signal);const local=new AbortController(),cancel=()=>local.abort(controller.signal.reason);controller.signal.addEventListener("abort",cancel,{once:true});
    let results:SourceVisibilityReading[];
    try{
     results=await bounded(snapshot(quote,file,width,local.signal,async({doc,frame,assertCurrent,verifyStyles})=>{
      const styles=await verifyStyles();assertCurrent();
      return citations.map(citation=>({citationId:citation.id,viewportWidth:width,...(styles.loaded!==styles.expected?{state:"unavailable"as const,reason:"styles_unverified"as const}:observeCitationText(doc,frame.contentWindow!,citation))}));
     }),controller.signal,7500);
    }catch(error){
     cancelled(controller.signal);const reason:VisibilityReason=error instanceof Unavailable?(error.reason==="ambiguous_link"?"unsupported_target":error.reason):"load_failed";
     results=citations.map(c=>({citationId:c.id,viewportWidth:width,state:"unavailable",reason}));
    }finally{local.abort();controller.signal.removeEventListener("abort",cancel);}
    readings.push(...results);onProgress?.(readings.length,total);
   }
  }
  cancelled(controller.signal);return readings;
 }finally{clearTimeout(timeout);controller.abort();signal.removeEventListener("abort",abort);}
}
