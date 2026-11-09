import type {ProofBusinessCheckStep,ProofCriterion,ProofQuote,Language} from "./contracts.ts";
import {assessmentEvidenceScope} from "./assessment-evidence-scope.ts";
import {exactCopyLiteral} from "./exact-copy-directive.ts";
import {parseNativeFormSourceDirective} from "./native-form-source.ts";
import {sourceLiteralDirective} from "./source-literal-directive.ts";
import {staticMarkupDirective} from "./static-markup-directive.ts";
import {validateSavedCoverage} from "./requirement-coverage.ts";

/** Kept explicit so future language admission does not reinterpret a saved
 * report that used the earlier, deliberately smaller grammar. */
export const BILINGUAL_MENU_PRICE_COMPLETENESS = "bilingual-bounded-v4";
export type RequirementCompletenessVersion="bounded-original-zh-v1"|"bilingual-bounded-v2"|"bilingual-bounded-v3"|typeof BILINGUAL_MENU_PRICE_COMPLETENESS;
export type RequirementCompletenessResult={kind:"not_applicable"|"complete"|"incomplete";checkIds:string[];reason?:"uncovered_original_requirement"|"compound_original_unverified"|"missing_price_scope"};
export type RequirementCompletenessInputs={businessSteps:readonly ProofBusinessCheckStep[];version?:RequirementCompletenessVersion};

/** Whole-clause admission, not a bag of source_text keywords. This one
 * finite price-only wording binds EVERY named subject/currency/amount to the
 * buyer's complete typed expectation set. Extra duties stay unverified. */
export function priceOnlyOriginal(criterion:ProofCriterion,steps:readonly ProofBusinessCheckStep[]):boolean{
 const source=criterion.source.trim();if(/[\r\n]/u.test(source))return false;
 const match=/^菜单的([\s\S]+)标价必须为(AUD|USD)\s*(0|[1-9]\d*)(?:\.(\d{1,2}))?[。.]?$/u.exec(source);
 if(!match)return false;
 const checks=steps.filter((s,i)=>steps.findIndex(other=>other.checkId===s.checkId)===i);
 if(!checks.length||checks.length>6||checks.some(s=>s.expected.kind!=="item_price"))return false;
 const minor=Number(match[3])*100+Number((match[4]??"").padEnd(2,"0"));if(!Number.isSafeInteger(minor))return false;
 const labels:string[]=[];
 for(const check of checks){
  if(check.expected.kind!=="item_price"||check.expected.currency!==match[2]||check.expected.amountMinor!==minor)return false;
  const label=check.expected.label;
  if(label!==label.trim()||!/^[\p{L}\p{N}][\p{L}\p{N} '’-]{0,79}$/u.test(label)
   ||/必须|标价|价格|营业时间|持久|保存|提交|且|以及|同时|\b(?:must|shall|should|hours?|prices?|save|persist|submit)\b/iu.test(label))return false;
  labels.push(label);
 }
 if(new Set(labels).size!==labels.length)return false;
 const consume=(remaining:string,names:readonly string[]):boolean=>names.some((label,index)=>{
  if(!remaining.startsWith(label))return false;const rest=remaining.slice(label.length).trim();
  if(names.length===1)return rest==="";
  return rest.startsWith("和")&&consume(rest.slice(1).trim(),names.filter((_,i)=>i!==index));
 });
 return consume(match[1].trim(),labels);
}

/** V2 consumes complete buyer-named subjects, not words split on and/和.
 * At most eight names, bounded original length and stop after two full parses.
 * Ambiguous whole partitions remain incomplete. No alias/case/NFKC guessing. */
function oneSubjectPartition(text:string,labels:readonly string[]):boolean{
 let paths=0,visits=0;
 const visit=(remaining:string,names:readonly string[])=>{
  if(paths>1||++visits>100000)return;
  for(const label of names){
   const options=[label,`"${label}"`,`“${label}”`,`‘${label}’`,`'${label}'`];
   for(const literal of options){
    if(!remaining.startsWith(literal))continue;let rest=remaining.slice(literal.length).trim();
    if(names.length===1){if(rest==="")paths++;continue;}
    const separator=/^(?:和|及|、|,[ \t]*(?:and[ \t]+)?|and[ \t]+)/iu.exec(rest);if(!separator)continue;
    rest=rest.slice(separator[0].length).trim();if(!rest)continue;
    visit(rest,names.filter(name=>name!==label));
   }
  }
 };
 visit(text.trim(),labels);return visits<=100000&&paths===1;
}
const BOTH_PAGES_PRICE = /^Display[ \t]+(.+?)[ \t]+prices[ \t]+on[ \t]+both[ \t]+agreed[ \t]+menu[ \t]+pages[.]?$/iu;
const EN_PRICE = /^The[ \t]+menu[ \t]+must[ \t]+list[ \t]+(.+?)[ \t]+at[ \t]+(AUD|USD)[ \t]*(0|[1-9]\d*)(?:\.(\d{1,2}))?[.]?$/iu;
const ZH_ISO_PRICE = /^(?:菜单的(.+?)标价必须为|菜单中(.+?)的价格必须为)(AUD|USD)[ \t]*(0|[1-9]\d*)(?:\.(\d{1,2}))?[。.]?$/iu;
const ZH_NAMED_PRICE = /^菜单中(.+?)的价格必须为(0|[1-9]\d*)(?:\.(\d{1,2}))?(澳元|美元)[。.]?$/u;
const BILINGUAL_MENU_PRICE = /^菜单页同时展示中文「([\p{Script=Han}]{1,40})」和英文「([A-Za-z][A-Za-z0-9 '’-]{0,79})」[，,][ \t]*两种语言所示价格均为[ \t]*(AUD|USD)[ \t]*(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?[。.]?$/u;
const EXPLICIT_MENU_PAGE = /^网站包含首页、菜单页[ \t]+([^ \t，。、]+)[ \t]*和联系页[ \t]+([^ \t，。、]+)[，,][ \t]*首页可打开菜单页和联系页[。.]?$/u;

export function bilingualMenuPriceOriginal(source: string): {labels: [string,string]; currency: "AUD"|"USD"; amountMinor: number} | undefined {
 const match = BILINGUAL_MENU_PRICE.exec(source.trim());
 if (!match || match[2] !== match[2].trim()) return;
 return {labels: [match[1], match[2]], currency: match[3] as "AUD"|"USD", amountMinor: Number(match[4])*100 + Number((match[5] ?? "").padEnd(2,"0"))};
}

export function isOriginalBilingualMenuPriceStep(step: ProofBusinessCheckStep): boolean {
 return step.checkId === `original-price:${step.criterionId}:0` || step.checkId === `original-price:${step.criterionId}:1`;
}

/** Only two included original clauses jointly identify this source scope.
 * No filename guess, unconfirmed suggestion or delivery bytes define a check.
 * These temporary expectations are for source review, never a browser plan. */
export function originalBilingualMenuPriceSteps(quote: ProofQuote, saved: readonly ProofBusinessCheckStep[]): {criterionIds: string[]; steps: ProofBusinessCheckStep[]} {
 const project = quote.proof.project;
 if (!project?.coverage) return {criterionIds: [], steps: []};
 const coverage = validateSavedCoverage(project.coverage);
 if (coverage.sourceText !== quote.summary.trim()) return {criterionIds: [], steps: []};
 const included = coverage.decisions.filter(row => row.disposition === "include" &&
  quote.proof.criteria.some(criterion => criterion.id === row.criterionId && criterion.source === row.text));
 const prices = included.flatMap(row => {
  const price = bilingualMenuPriceOriginal(row.text);
  return price && row.criterionId && !saved.some(step => step.criterionId === row.criterionId) ? [{row, criterionId: row.criterionId, price}] : [];
 });
 const criterionIds = prices.map(entry => entry.criterionId);
 if (prices.length !== 1) return {criterionIds, steps: []};
 const pageMentions = included.filter(row => row.text.includes("菜单页") && /\.html\b/iu.test(row.text));
 const mapping = pageMentions.length === 1 ? EXPLICIT_MENU_PAGE.exec(pageMentions[0].text) : null;
 if (!mapping || mapping[1] === mapping[2] || [mapping[1],mapping[2]].includes("index.html") ||
  ![mapping[1],mapping[2]].every(file => file.endsWith(".html") && project.requiredPages.includes(file))) return {criterionIds, steps: []};
 const steps: ProofBusinessCheckStep[] = prices.flatMap(({row, criterionId, price}) => price.labels.map((label, index) => {
  const checkId = `original-price:${criterionId}:${index}`;
  return {checkId, stepId: checkId, criterionId, file: mapping[1], viewportWidth: 375,
   source: {start: row.start, end: row.end, excerpt: row.text}, expected: {kind: "item_price", label, amountMinor: price.amountMinor, currency: price.currency}};
 }));
 return {criterionIds, steps};
}

function isBoundedPriceOriginal(source: string): boolean {
  const text = source.trim();
  return text.length <= 3000 && !/[\r\n]/u.test(text)
    && [BOTH_PAGES_PRICE, EN_PRICE, ZH_ISO_PRICE, ZH_NAMED_PRICE].some(form => form.test(text));
}

function priceOnlyOriginalV2(criterion:ProofCriterion,steps:readonly ProofBusinessCheckStep[]):boolean{
 const source=criterion.source.trim();if(!source||source.length>3000||/[\r\n]/u.test(source))return false;
 const checks=steps.filter((step,i)=>steps.findIndex(other=>other.checkId===step.checkId)===i);
 if(!checks.length||checks.length>8||checks.some(step=>step.expected.kind!=="item_price"))return false;
 const labels:string[]=[];const fileSubjects=new Set<string>();
 for(const check of checks){
  if(check.expected.kind!=="item_price")return false;const label=check.expected.label;
  if(label!==label.trim()||!/^[\p{L}\p{N}][\p{L}\p{N} '’-]{0,79}$/u.test(label)
   ||/必须|标价|价格|营业时间|持久|保存|提交|且|以及|同时|\b(?:must|shall|should|hours?|prices?|save|persist|submit)\b/iu.test(label))return false;
  const identity=check.file+"\u0000"+label;if(fileSubjects.has(identity))return false;fileSubjects.add(identity);
  if(!labels.includes(label))labels.push(label);
 }
 const both=BOTH_PAGES_PRICE.exec(source);
 if(both)return checks.length===2&&new Set(checks.map(c=>c.file)).size===2&&labels.length===1&&oneSubjectPartition(both[1],labels);
 // Every other family explicitly states ONE common currency/amount. Different
 // per-item prices cannot borrow a same-price original clause.
 const en=EN_PRICE.exec(source);
 const zhIso=ZH_ISO_PRICE.exec(source);
 const zhNamed=ZH_NAMED_PRICE.exec(source);
 let subjects:string,currency:string,integer:string,fraction:string|undefined;
 if(en){[,subjects,currency,integer,fraction]=en;currency=currency.toUpperCase();}
 else if(zhIso){subjects=zhIso[1]??zhIso[2];currency=zhIso[3].toUpperCase();integer=zhIso[4];fraction=zhIso[5];}
 else if(zhNamed){subjects=zhNamed[1];integer=zhNamed[2];fraction=zhNamed[3];currency=zhNamed[4]==="澳元"?"AUD":"USD";}
 else return false;
 const minor=Number(integer)*100+Number((fraction??"").padEnd(2,"0"));
 return Number.isSafeInteger(minor)&&checks.every(check=>check.expected.kind==="item_price"&&check.expected.currency===currency&&check.expected.amountMinor===minor)&&oneSubjectPartition(subjects,labels);
}
export function priceOnlyOriginalForVersion(criterion:ProofCriterion,steps:readonly ProofBusinessCheckStep[],version:RequirementCompletenessVersion):boolean{
 if(version==="bounded-original-zh-v1")return priceOnlyOriginal(criterion,steps);
 if(version===BILINGUAL_MENU_PRICE_COMPLETENESS){
  const price=bilingualMenuPriceOriginal(criterion.source);
  if(price&&steps.some(isOriginalBilingualMenuPriceStep)){
   return steps.length===2&&steps.every((step,index)=>isOriginalBilingualMenuPriceStep(step)&&step.criterionId===criterion.id&&step.file===steps[0].file&&
    step.expected.kind==="item_price"&&step.expected.label===price.labels[index]&&step.expected.currency===price.currency&&step.expected.amountMinor===price.amountMinor);
  }
  return priceOnlyOriginalV2(criterion,steps);
 }
 if(version==="bilingual-bounded-v2"||version==="bilingual-bounded-v3")return priceOnlyOriginalV2(criterion,steps);
 throw new TypeError("Unsupported requirement completeness version.");
}

/** Quoted content is data. Never turn an and/和 in a requested label or
 * exact copy into a second promise. Unclosed quotes are not silently masked. */
function withoutQuotedData(source:string):string{
 const output=source.split(""),pairs:Record<string,string>={'"':'"',"'":"'","“":"”","‘":"’","「":"」"};
 for(let i=0;i<source.length;i++){
  const close=pairs[source[i]];if(!close||source[i]==="'"&&/[\p{L}\p{N}]/u.test(source[i-1]??""))continue;
  let end=i+1;for(;end<source.length;end++){
   if(source[end]!==close)continue;let slashes=0;for(let p=end-1;p>i&&source[p]==="\\";p--)slashes++;if(slashes%2===0)break;
  }
  if(end===source.length)continue;for(let p=i;p<=end;p++)output[p]=" ";i=end;
 }
 return output.join("");
}
function atomicSource(source:string):boolean{
 return exactCopyLiteral(source)!==undefined||parseNativeFormSourceDirective(source)!==undefined
  ||sourceLiteralDirective(source)!==undefined||staticMarkupDirective(source)!==undefined;
}
/** Finite explicit extra-duty detection only, not a complete NLP parser.
 * Conjunctions alone are not duties: multiple menu subjects may share a price.
 * Whole-source recognised literal/native grammars are checked before this. */
function hasExplicitCompound(source:string, symbolic = false):boolean{
 const s=withoutQuotedData(source);
 const chinese = symbolic ? s.replace(/[&＆][ \t]*/gu, "和") : s;
 const english = symbolic ? s.replace(/[&＆]/gu, " and ") : s;
 return /(?:且|以及|同时|并且|但是|但(?:还|需|须|应|要|不|营业|价格|地址|电话)|还(?:要|须|需)|另(?:外)?(?:要|须|需|应)|并(?:须|需|应|要|显示|注明|列出|包含|写明|提供))/u.test(s)
  ||/(?:和|及|、)(?:营业(?:时间|时段)|开放时间|营业日|地址|电话|联系方式|邮箱|店名|商店名称|餐厅名称|价格|价目|标价|菜单)/u.test(chinese)
  ||/\b(?:and|also|plus|as\s+well\s+as)\s+(?:(?:the|our|a|an|its)\s+)?(?:must|shall|should|needs?\s+to|show|display|list|state|include|contain|provide|opening\s+(?:hours?|times?)|business\s+(?:hours?|times?)|hours?\s+of\s+operation|address|phone|telephone|e-?mail|contact\s+(?:details|number)|prices?|pricing|menu|(?:shop|business|restaurant|company)\s+name)\b/iu.test(english)
  ||/\b(?:and|also|plus|as\s+well\s+as)\b[^.;。；\n]{0,100}\b(?:must|shall|should|needs?\s+to)\b/iu.test(english)
  ||/[;；。\n]\s*[^\s;；。\n]/u.test(s)||/\.\s+[A-Z][^.!?]{1,120}/u.test(s);
}

/** Complete means only that the entire original maps to the saved price
 * expectations. It never proves the source, rendering, operation or acceptance.
 * Run this once at the FINAL affirmative funnel, not only restoration branches.
 * Existing negative/unknown items are not promoted or rewritten by this gate. */
export function createRequirementCompletenessCheck(input:RequirementCompletenessInputs){
 const steps=structuredClone(input.businessSteps),version=input.version??"bounded-original-zh-v1";
 if(version!=="bounded-original-zh-v1"&&version!=="bilingual-bounded-v2"&&version!=="bilingual-bounded-v3"&&version!==BILINGUAL_MENU_PRICE_COMPLETENESS)throw new TypeError("Unsupported requirement completeness version.");
 return(criterion:ProofCriterion):RequirementCompletenessResult=>{
  const selected=steps.filter(step=>step.criterionId===criterion.id),checkIds=[...new Set(selected.map(step=>step.checkId))];
  if(selected.some(step=>step.expected.kind==="item_price"))return priceOnlyOriginalForVersion(criterion,selected,version)
   ?{kind:"complete",checkIds}:{kind:"incomplete",reason:"uncovered_original_requirement",checkIds};
  if(assessmentEvidenceScope(criterion).category!=="source_text"||atomicSource(criterion.source))return{kind:"not_applicable",checkIds};
  const bounded = version === "bilingual-bounded-v3" || version === BILINGUAL_MENU_PRICE_COMPLETENESS;
  if (bounded && (isBoundedPriceOriginal(criterion.source) || version===BILINGUAL_MENU_PRICE_COMPLETENESS && bilingualMenuPriceOriginal(criterion.source))) {
    return {kind: "incomplete", reason: "missing_price_scope", checkIds};
  }
  return hasExplicitCompound(criterion.source, bounded)
    ? {kind: "incomplete", reason: "compound_original_unverified", checkIds}
    : {kind: "not_applicable", checkIds};
 };
}
export function requirementCompletenessExplanation(result:RequirementCompletenessResult,language:Language):string{
 if (result.reason === "missing_price_scope") {
   return language === "zh"
     ? "本项原文提出了价格要求，但没有已锁定的菜品价格与目标页面检查。请买家按完整原文核对交付页面，双方确认复核范围后再给出整项结论。"
     : "The original sets a price requirement without a locked item-price check and target page. Review the delivered page against the full wording and agree on the review scope before concluding that the whole requirement is met.";
 }
 return language==="zh"
  ?result.reason==="uncovered_original_requirement"
   ?"本项原始要求尚未被已锁定的价格检查完整覆盖。已核对的价格子事实单独保留；它们不能代替同项其余条件的证据。请双方对照完整原文，明确其余条件的检查方法和材料后再核对；当前不把整项发布为符合，也不据此认定交付做错。"
   :"这条源码要求包含尚未建立完整核验依据的附加条件。某个内容块或子条件有据，不能代替整条原文。请双方逐项明确检查方法与材料后再核对；当前不把整项发布为符合，也不推断交付失败。"
  :result.reason==="uncovered_original_requirement"
   ?"The locked price checks do not cover this entire original requirement. Verified price subfacts remain separate and cannot substitute for other conditions. Both parties should review the full wording and agree how the remaining conditions will be checked; this item is not published as supported or inferred to have failed."
   :"This source requirement contains additional conditions without complete verification. Evidence for one block or subcondition does not establish the entire original. Agree how each condition will be checked; the whole item is not published as supported and delivery failure is not inferred.";
}
