import {parse,type DefaultTreeAdapterTypes} from "parse5";
import type {ProofAssessmentCitation} from "./contracts.ts";
import {hasUncertainSourceBodyCopyAtFile} from "./exact-copy-evidence.ts";
type Node=DefaultTreeAdapterTypes.Node;
type Element=DefaultTreeAdapterTypes.Element;
export type MergedPriceAmount={currency:"AUD"|"USD";amountMinor:number};
export type MergedPriceContext={label:string;amounts:[MergedPriceAmount,MergedPriceAmount];citation:ProofAssessmentCitation};
const normalized=(value:string)=>value.replace(/[\t\n\f\r \u00a0]+/gu," ").trim();
const blank=(value:string)=>/^[\t\n\f\r ]*$/u.test(value);
const element=(node:Node):node is Element=>"tagName"in node;
const INERT=new Set(["head","script","style","template","noscript","textarea","xmp","iframe","frame","frameset","object","embed","noembed","noframes","plaintext"]);
function price(value:string):MergedPriceAmount|undefined{const match=/^(AUD|USD) *(0|[1-9]\d*)(?:\.(\d{1,2}))?$/u.exec(normalized(value));if(!match)return;const amountMinor=Number(match[2])*100+Number((match[3]??"").padEnd(2,"0"));return Number.isSafeInteger(amountMinor)?{currency:match[1]as"AUD"|"USD",amountMinor}:undefined;}
function text(node:Element,source:string):string|undefined{const l=node.sourceCodeLocation;if(!l?.startTag||!l.endTag||source.slice(l.startTag.endOffset,l.endTag.startOffset).includes("<")||node.childNodes.some(c=>c.nodeName!=="#text"))return;return normalized(node.childNodes.map(c=>(c as DefaultTreeAdapterTypes.TextNode).value).join(""));}
function rawTag(node:Element,source:string,opening:RegExp,closing:RegExp){const l=node.sourceCodeLocation;return !!l?.startTag&&!!l.endTag&&opening.test(source.slice(l.startTag.startOffset,l.startTag.endOffset))&&closing.test(source.slice(l.endTag.startOffset,l.endTag.endOffset));}
/** Account for every original byte between complete direct children. This
 * rejects comments, ignored tags and parser repairs instead of trusting only
 * the repaired AST. An inserted tbody is the sole admitted implicit owner. */
function children(node:Element,source:string,allowed:string[],implicit=false):Element[]|undefined{
 const result:Element[]=[];
 for(const child of node.childNodes){if(child.nodeName==="#text"){if(!blank((child as DefaultTreeAdapterTypes.TextNode).value))return;}else if(element(child)&&child.namespaceURI==="http://www.w3.org/1999/xhtml"&&allowed.includes(child.tagName))result.push(child);else return;}
 if(!result.length)return;
 const l=node.sourceCodeLocation,first=result[0].sourceCodeLocation,last=result.at(-1)!.sourceCodeLocation;if(!first?.startTag||!last?.endTag)return;
 let cursor=implicit?first.startTag.startOffset:l?.startTag?.endOffset;const end=implicit?last.endTag.endOffset:l?.endTag?.startOffset;if(cursor===undefined||end===undefined)return;
 for(const child of result){const at=child.sourceCodeLocation;if(!at?.startTag||!at.endTag||at.startTag.startOffset<cursor||at.endTag.endOffset>end||!blank(source.slice(cursor,at.startTag.startOffset)))return;cursor=at.endTag.endOffset;}
 if(!blank(source.slice(cursor,end)))return;return result;
}
function targetInTable(node:Element,source:string,label:string,withinBudget:()=>boolean){const stack:Node[]=[node];while(stack.length){const current=stack.pop()!;if(!withinBudget())return false;if(element(current)&&["td","th"].includes(current.tagName)&&text(current,source)===label)return true;if("childNodes"in current)stack.push(...current.childNodes);}return false;}
function tableContext(file:string,source:string,table:Element,label:string):MergedPriceContext|undefined{
 const l=table.sourceCodeLocation;if(!l?.startTag||!l.endTag||table.attrs.length||!rawTag(table,source,/^<table\s*>$/iu,/^<\/table\s*>$/iu))return;
 const start=l.startTag.startOffset,end=l.endTag.endOffset,excerpt=source.slice(start,end);if(excerpt.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(excerpt))return;
 let rows:Element[]|undefined;
 const groups=table.childNodes.filter(element);if(groups.length===1&&groups[0].tagName==="tbody"){
  const tbody=groups[0],implicit=!tbody.sourceCodeLocation;
  if(tbody.attrs.length||!implicit&&!rawTag(tbody,source,/^<tbody\s*>$/iu,/^<\/tbody\s*>$/iu))return;
  rows=children(tbody,source,["tr"],implicit);
  // Include the full original table interior around an inserted tbody too.
  const first=rows?.[0].sourceCodeLocation,last=rows?.at(-1)?.sourceCodeLocation;
  if(!first?.startTag||!last?.endTag||!blank(source.slice(l.startTag.endOffset,implicit?first.startTag.startOffset:tbody.sourceCodeLocation!.startTag!.startOffset))||!blank(source.slice(implicit?last.endTag.endOffset:tbody.sourceCodeLocation!.endTag!.endOffset,l.endTag.startOffset)))return;
 }else rows=children(table,source,["tr"]);
 if(!rows||rows.length!==2||rows.some(row=>row.attrs.length||!rawTag(row,source,/^<tr\s*>$/iu,/^<\/tr\s*>$/iu)))return;
 const first=children(rows[0],source,["td"]),second=children(rows[1],source,["td"]);if(!first||first.length!==2||!second||second.length!==1)return;
 const owner=first[0],a=first[1],b=second[0];
 if(owner.attrs.length!==1||owner.attrs[0].name!=="rowspan"||owner.attrs[0].value!=="2"||!rawTag(owner,source,/^<td\s+rowspan\s*=\s*(?:"2"|'2'|2)\s*>$/iu,/^<\/td\s*>$/iu)||text(owner,source)!==label)return;
 if([a,b].some(cell=>cell.attrs.length||!rawTag(cell,source,/^<td\s*>$/iu,/^<\/td\s*>$/iu)))return;
 const av=text(a,source),bv=text(b,source),amountA=av===undefined?undefined:price(av),amountB=bv===undefined?undefined:price(bv);if(!amountA||!amountB)return;
 return{label,amounts:[amountA,amountB],citation:{file,start,end,excerpt}};
}
/** Establish only one finite source association, never which option applies or
 * whether the content is rendered. An ordinary heading mentioning the label
 * does not invalidate the row ownership. Other matching table owners do. */
export function findMergedPriceContext(files:Readonly<Record<string,string>>,file:string,label:string):MergedPriceContext|undefined{
 if(typeof label!=="string"||!normalized(label)||label.length>300||!Object.hasOwn(files,file)||typeof files[file]!=="string"||!file.endsWith(".html")||hasUncertainSourceBodyCopyAtFile(files,file))return;
 const source=files[file],target=normalized(label),document=parse(source,{sourceCodeLocationInfo:true,scriptingEnabled:true}),stack:{node:Node;body:boolean;hidden:boolean;depth:number}[]=[{node:document,body:false,hidden:false,depth:0}],tables:{node:Element;hidden:boolean}[]=[];let visited=0;
 while(stack.length){const current=stack.pop()!;if(++visited>50_000||current.depth>512)return;let body=current.body,hidden=current.hidden;
  if(element(current.node)){const n=current.node;if(n.namespaceURI!=="http://www.w3.org/1999/xhtml"||INERT.has(n.tagName))continue;body||=n.tagName==="body";hidden||=n.attrs.some(a=>["hidden","inert","style"].includes(a.name)||a.name==="aria-hidden"&&a.value.trim().toLowerCase()==="true");if(body&&n.tagName==="table"&&targetInTable(n,source,target,()=>++visited<=50_000)){tables.push({node:n,hidden});if(tables.length>1)return;}}
  if("childNodes"in current.node)for(let i=current.node.childNodes.length-1;i>=0;i--)stack.push({node:current.node.childNodes[i],body,hidden,depth:current.depth+1});
 }
 if(tables.length!==1||tables[0].hidden)return;return tableContext(file,source,tables[0].node,target);
}
