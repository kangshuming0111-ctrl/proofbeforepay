/** Reveal an existing scoped target without activating its action. Native
 * details may emit toggle; no input, change, click or submit is dispatched.
 * A fallback can receive focus, but true always means the primary succeeded. */
export function revealGuidedTarget(root:HTMLElement|null,selector:string,fallbackSelector?:string):boolean{
 if(!root)return false;
 function reveal(selected:string):boolean{
  try{
   const matches=[...(root!.matches(selected)?[root!]:[]),...root!.querySelectorAll<HTMLElement>(selected)];
   if(matches.length!==1)return false;
   const target=matches[0],ancestors:HTMLElement[]=[];
   for(let node:HTMLElement|null=target;node;node=node.parentElement){
    ancestors.push(node);if(node===root)break;
   }
   if(ancestors.at(-1)!==root)return false;
   // Open only within this root, from the outer disclosure to the target.
   for(const node of [...ancestors].reverse())if(node.tagName==="DETAILS")node.setAttribute("open","");
   const focusTarget=target.tagName==="DETAILS"?[...target.children].find(node=>node.tagName==="SUMMARY") as HTMLElement|undefined:target;
   const candidate=focusTarget??target;
   if(candidate.matches(":disabled,[aria-disabled=true]"))return false;
   for(let node:HTMLElement|null=candidate;node;node=node.parentElement){
    if(node.hasAttribute("hidden")||node.hasAttribute("inert")||node.getAttribute("aria-hidden")==="true")return false;
    const visibility=node.ownerDocument.defaultView?.getComputedStyle(node).visibility;
    if(visibility==="hidden"||visibility==="collapse")return false;
   }
   if(![...candidate.getClientRects()].some(rect=>rect.width>0&&rect.height>0))return false;
   if(candidate.tabIndex<0&&!candidate.hasAttribute("tabindex"))candidate.setAttribute("tabindex","-1");
   candidate.focus({preventScroll:true});
   if(candidate.ownerDocument.activeElement!==candidate)return false;
   candidate.scrollIntoView({block:"nearest",inline:"nearest"});
   return true;
  }catch{return false;}
 }
 if(reveal(selector))return true;
 if(fallbackSelector&&fallbackSelector!==selector)reveal(fallbackSelector);
 return false;
}
