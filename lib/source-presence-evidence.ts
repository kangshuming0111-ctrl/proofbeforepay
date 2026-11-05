import {parse, type DefaultTreeAdapterTypes} from "parse5";
import type {Language, ProofAssessmentCitation, ProofCriterion} from "./contracts.ts";
import {hasUncertainSourceBodyCopyAtFile} from "./exact-copy-evidence.ts";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
export type SourcePresenceEvidence = {kind:"not_applicable"} | {
  kind:"present"|"absent"|"unknown"; field:"phone"|"email";
  files:string[]; citations:ProofAssessmentCitation[];
};
const INERT=new Set(["head","script","style","template","noscript","textarea","xmp","iframe","object","embed","svg","math"]);
const OWNERS=new Set(["p","address","li","dd","td","div","span","a"]);
const normalize=(s:string)=>s.replace(/\s+/gu," ").trim();
const element=(node:Node):node is Element=>"tagName" in node;

/** Finite presence-only clauses. Values, negation, qualifiers, role aliases and
 * compound/runtime requirements deliberately do not inherit this allowance. */
function directive(source:string):{field:"phone"|"email";file?:string}|undefined{
  const s=source.trim();
  const en=/^(?:(?:the|our)\s+)?(page(?:\s+(?:content|copy|text))?|website(?:\s+(?:content|copy|text))?|site(?:\s+(?:content|copy|text))?|[a-zA-Z0-9_./-]+\.html)\s+(?:must|should|needs?\s+to)\s+(?:list|include|contain|state|provide)\s+(?:(?:the|our|a)\s+)?(?:(?:shop|store|business|restaurant|company)(?:'s)?\s+)?(phone(?:\s+number)?|telephone(?:\s+number)?|contact\s+number|email(?:\s+address)?)[.!]?$/iu.exec(s);
  if(en)return {field:/email/iu.test(en[2])?"email":"phone",...(en[1].endsWith(".html")?{file:en[1]}:{})};
  const zh=/^(?:页面|网页|网站)(?:文案|文字内容|内容|文字)?(?:必须|应|须|需要)(?:列出|包含|注明|写明|提供)(?:(?:店铺|店家|商店|公司|餐厅|商家)的?)?(电话号码|电话|联系邮箱|电子邮箱|邮箱地址|邮箱)[。.]?$/u.exec(s);
  if(zh)return {field:/邮箱/u.test(zh[1])?"email":"phone"};
}
function matches(field:"phone"|"email",text:string):boolean{
  return field==="phone" ? /(?:\b(?:phone|telephone|tel|call)\b|电话|聯絡電話|联系电话)\s*[:：]?\s*\+?[\d(][\d ()–—.-]{5,28}\d/iu.test(text)
    : /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/iu.test(text);
}

/** Independent source witnesses, not model-prose matching, browser visibility,
 * phone validity, email deliverability or a general semantic verifier. */
export function createSourcePresenceEvidenceCheck(files:Record<string,string>):(criterion:ProofCriterion)=>SourcePresenceEvidence{
  const snapshot={...files},cache=new Map<string,{uncertain:boolean;owners:{text:string;citation:ProofAssessmentCitation}[]}>();
  function read(file:string){
    const cached=cache.get(file);if(cached)return cached;
    const source=snapshot[file],owners:{text:string;citation:ProofAssessmentCitation}[]=[];
    let uncertain=hasUncertainSourceBodyCopyAtFile(snapshot,file),visited=0,issue=false;
    const doc=parse(source,{sourceCodeLocationInfo:true,onParseError:e=>{if(e.code!=="missing-doctype")issue=true;}});
    function visit(node:Node,insideBody:boolean,depth:number):string{
      if(++visited>50000||depth>512){uncertain=true;return "";}
      if(node.nodeName==="#text")return insideBody?(node as DefaultTreeAdapterTypes.TextNode).value:"";
      let body=insideBody;
      if(element(node)){
        body ||= node.tagName==="body";
        if(node.namespaceURI!=="http://www.w3.org/1999/xhtml"||INERT.has(node.tagName))return "";
        if(["img","canvas","video","audio","slot"].includes(node.tagName))uncertain=true;
        if(node.attrs.some(a=>["hidden","inert"].includes(a.name)||a.name==="aria-hidden"&&a.value==="true"||a.name==="style"&&/display\s*:\s*none|visibility\s*:\s*hidden/iu.test(a.value))){uncertain=true;return "";}
      }
      const text="childNodes" in node?node.childNodes.map(c=>visit(c,body,depth+1)).join(" "):"";
      if(body&&element(node)&&OWNERS.has(node.tagName)&&!node.childNodes.some(c=>element(c)&&["p","div","section","article","table","ul","ol","li"].includes(c.tagName))){
        const l=node.sourceCodeLocation;
        if(l?.startTag&&l.endTag){const start=l.startTag.startOffset,end=l.endTag.endOffset,excerpt=source.slice(start,end);
          if(excerpt.length<=500&&normalize(text))owners.push({text:normalize(text),citation:{file,start,end,excerpt}});
        }
      }
      if(body&&normalize(text)&&!owners.length&&(/\b(?:phone|telephone|tel)\b|电话|@/iu.test(text)))uncertain=true;
      return text;
    }
    const bodyText=visit(doc,false,0);
    if((["phone","email"] as const).some(field=>matches(field,bodyText)&&!owners.some(o=>matches(field,o.text))))uncertain=true;
    const value={uncertain:uncertain||issue,owners};cache.set(file,value);return value;
  }
  return criterion=>{
    const d=directive(criterion.source);if(!d)return {kind:"not_applicable"};
    const targets=d.file?[d.file]:Object.keys(snapshot).filter(f=>f.endsWith(".html")).sort();
    if(!targets.length||targets.some(f=>!Object.hasOwn(snapshot,f)||!f.endsWith(".html"))||Object.keys(snapshot).length>40||Object.values(snapshot).reduce((n,s)=>n+s.length,0)>262144)return {kind:"unknown",field:d.field,files:targets.filter(f=>Object.hasOwn(snapshot,f)),citations:[]};
    const candidates=targets.flatMap(file=>read(file).owners.filter(o=>matches(d.field,o.text)).map(o=>o.citation)).sort((a,b)=>a.excerpt.length-b.excerpt.length||a.file.localeCompare(b.file)||a.start-b.start);
    // An existing literal owner is enough to challenge a simple absence claim,
    // even if unrelated dynamic content exists. It cannot establish visibility.
    if(candidates.length)return {kind:"present",field:d.field,files:targets,citations:[candidates[0]]};
    return {kind:targets.some(f=>read(f).uncertain)?"unknown":"absent",field:d.field,files:targets,citations:[]};
  };
}
export function sourcePresenceExplanation(result:Exclude<SourcePresenceEvidence,{kind:"not_applicable"}>,language:Language):string{
  const zh=language==="zh",field=result.field==="phone"?(zh?"电话":"phone"):(zh?"邮箱":"email");
  if(result.kind==="present")return zh
    ? `独立源码检查在 ${result.citations[0].file} 找到完整的${field}文字依据，不能把该简单要求认定为“缺失”。已保留精确引用供双方复核；这不证明内容可见、号码有效或邮件能送达，也不自动通过验收。`
    : `An independent source check found a complete ${field} text witness in ${result.citations[0].file}; a missing-content claim is not established for this simple requirement. Review the retained exact citation. Visibility, contact validity and delivery are not proven; acceptance is not automatic.`;
  return zh?`当前源码不足以确定${field}文字是否缺失；可能存在动态、图片或不受支持的内容。请核对锁定范围并补充直接观察，不能只按关键词未出现要求返工。`
    : `The available source cannot establish absent ${field} text; dynamic, image or unsupported content may remain. Check the locked scope and obtain direct observations instead of inferring a defect from keyword absence.`;
}
/** Canonical source-only wording replaces unsupported model visibility,
 * placement or page-count assertions for this finite presence-only family. */
export function sourcePresenceSupportedExplanation(result:Extract<SourcePresenceEvidence,{kind:"present"|"absent"|"unknown"}>,language:Language):string{
  if(result.kind!=="present"||!result.citations.length)return sourcePresenceExplanation(result,language);
  const field=result.field==="phone"?(language==="zh"?"电话":"phone"):(language==="zh"?"邮箱":"email");
  return language==="zh"
    ? `在 ${result.citations[0].file} 的完整源码内容块中找到${field}文字，当前引用覆盖该依据。这仅支持本项有限的源码文字要求，不要求其他未指定页面重复该文字，也不证明浏览器可见、联系方式有效或实际送达；最终仍由买家核对。`
    : `A complete source owner in ${result.citations[0].file} contains ${field} text, and the current citation covers that witness. This supports only the limited source-copy requirement. It does not require duplication on another unspecified page or establish browser visibility, contact validity or delivery; the buyer still reviews it.`;
}
export function sourcePresenceMissingAdvice(result:Exclude<SourcePresenceEvidence,{kind:"not_applicable"}>,language:Language):string{
  const field=result.field==="phone"?(language==="zh"?"电话":"phone"):(language==="zh"?"邮箱":"email");
  return language==="zh"
    ? `有限静态文字检查未找到可辨识的完整${field}依据，保留为待人工核对的修改建议。请按锁定范围逐页检查等价文字和其他内容来源，确认后再修改；这不是页面数量、浏览器显示或联系方式有效性的结论。`
    : `The bounded static-text check did not locate a complete recognizable ${field} witness, so this remains a change suggestion for human review. Check equivalent wording and other content sources within the locked scope before making changes. This is not a page-count, browser-display or contact-validity finding.`;
}
/** Preserve a model's unresolved status without retaining an unsupported
 * absence/visibility claim in its free prose. This does not promote an item. */
export function sourcePresenceUnresolvedExplanation(result:Exclude<SourcePresenceEvidence,{kind:"not_applicable"}>,language:Language):string{
  const zh=language==="zh",field=result.field==="phone"?(zh?"电话":"phone"):(zh?"邮箱":"email");
  if(result.kind==="present"&&result.citations.length)return zh
    ? `模型未对此项给出明确判断。独立源码检查在 ${result.citations[0].file} 找到完整的${field}文字依据，已保留引用供人工核对；状态仍为证据不足。这不证明浏览器可见、联系方式有效或实际送达，也不自动通过验收。`
    : `The model left this item unresolved. An independent source check found a complete ${field} text witness in ${result.citations[0].file}; the exact citation is retained for human review. The status remains insufficient evidence. Browser visibility, contact validity, delivery and acceptance are not established.`;
  return zh
    ? `模型未对此项给出明确判断。有限静态文字检查尚未找到可确立结论的完整${field}依据；请在锁定范围内核对等价文字和其他内容来源。状态仍为证据不足，不能据此认定内容缺失、浏览器不可见或要求返工。`
    : `The model left this item unresolved. The bounded static-text check has not established a complete ${field} witness for a conclusion. Review equivalent wording and other content sources in the locked scope. The status remains insufficient evidence; this does not establish missing content, invisibility or a required change.`;
}
