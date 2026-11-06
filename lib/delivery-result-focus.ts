import type {Language, ProofDelivery} from "./contracts.ts";
import type {deliveryOverview} from "./delivery-overview.ts";
import {criterionDisplayTitle} from "./delivery-overview.ts";
import type {BusinessSpotlightData} from "./business-spotlight.ts";
import type {DeliveryLayoutSummary} from "./delivery-layout-summary.ts";
import type {ModelSpotlight} from "./model-spotlight.ts";
import {evaluateProjectEnquiryReport,validateProjectEnquiryReport} from "./project-enquiry.ts";

export type DeliveryResultTarget = "criterion"|"model"|"business"|"journey"|"runtime"|"enquiry"|"transfer"|"layout"|"details";
export type DeliveryResultFocus = {reason:string; title:string; key:string; target:DeliveryResultTarget; criterionId?:string};
export function deliveryResultInspection(focus:DeliveryResultFocus,callbacks:{criterion:(id:string)=>void}&Partial<Record<Exclude<DeliveryResultTarget,"criterion">,()=>void>>):(()=>void)|undefined{
  if(focus.target==="criterion")return focus.criterionId?()=>callbacks.criterion(focus.criterionId!):undefined;
  return callbacks[focus.target];
}
export type DeliveryResultInput = {
  delivery:ProofDelivery;
  overview:ReturnType<typeof deliveryOverview>;
  model:ModelSpotlight;
  business?:BusinessSpotlightData;
  layout:DeliveryLayoutSummary;
  journey?:{summary:{issues:number;unavailable:number}};
  runtime?:{issues:number;unavailable:number};
  enquiry?:ReturnType<typeof evaluateProjectEnquiryReport>;
  language:Language;
};

/** Re-evaluate only a saved report bound to this delivery and its saved plan.
 * This is not a new HTTP run or independent deployed-source attestation. */
export function deliveryResultEnquiry(delivery:ProofDelivery,projectId?:string){
  try{
    if(!delivery.enquiryPlan||!delivery.enquiryReport)return;
    return evaluateProjectEnquiryReport(validateProjectEnquiryReport(delivery.enquiryReport,{deliveryId:delivery.id,deliveryDigest:delivery.enquiryPlan.deliveryDigest,plan:delivery.enquiryPlan,...(projectId?{projectId}:{})}));
  }catch{return;}
}

/** A saved lease is an unfinished record, not proof that a worker is active.
 * Expiry does not silently clear it; records for another delivery stay unknown. */
export function deliveryResultRecords(delivery:ProofDelivery){
  const records=([ ["transfer",delivery.transferCompetitionRun], ["model",delivery.modelRun],
    ["journey",delivery.journeyRun], ["runtime",delivery.runtimeRun], ["enquiry",delivery.enquiryRun] ] as const);
  return {
    unfinished:records.filter(([,run])=>run?.deliveryId===delivery.id).map(([kind])=>kind),
    foreign:records.filter(([,run])=>run&&run.deliveryId!==delivery.id).map(([kind])=>kind),
  };
}

/** One display-only priority for heading, key issue and suggested inspection.
 * Stable ties: unfinished transfer/model/journey/runtime/enquiry; unchecked rules;
 * rule failures; invalid records/model; journey/runtime/enquiry/business differences;
 * layout overflow; AI changes; pending human checks; unknown evidence; saved
 * revision; ordinary evidence. No action executes here; the parent keeps its
 * authoritative workflow, acceptance and payment precedence. */
export function deliveryResultFocus(input:DeliveryResultInput):DeliveryResultFocus{
  const {delivery,overview,model,business,layout,journey,runtime,enquiry,language}=input;
  const tr=(zh:string,en:string)=>language==="zh"?zh:en;
  const focus=(reason:string,target:DeliveryResultTarget,title:string,key:string,criterionId?:string):DeliveryResultFocus=>({reason,target,title,key:Array.from(key).length>180?`${Array.from(key).slice(0,180).join("")}…${tr("（节选；全文见证据）"," (excerpt; full text in evidence)")}`:key,...(criterionId?{criterionId}:{})});
  const criterion=(reason:string,title:string,row:typeof overview.rows[number])=>focus(reason,"criterion",title,criterionDisplayTitle(row.criterion,language),row.criterion.id);
  const records=deliveryResultRecords(delivery);
  const names={transfer:tr("同时改期检查","Concurrent-rescheduling check"),model:tr("同时操作检查","Concurrent-actions check"),journey:tr("预约流程检查","Booking-flow check"),runtime:tr("预约后台检查","Booking-backend check"),enquiry:tr("咨询后台检查","Enquiry-backend check")};
  const pending=records.unfinished[0];
  if(pending)return focus("unfinished",pending,tr("有检查记录尚未完成，请先查看","An unfinished check record needs inspection"),tr(`${names[pending]}尚未完成；已保存的报告不能代替本轮结果。`,`${names[pending]} is unfinished. A saved report is not this run’s result.`));
  const first=overview.rows[0];
  if(!overview.reviewCurrent&&first)return criterion("rules_missing",tr("本版尚未核查，请先查看要求","This version has not been checked"),first);
  const failed=overview.rows.find(row=>row.rule==="fail");
  if(failed)return criterion("rule_failure",tr("有交付要求尚未符合","Some delivery requirements are unmet"),failed);
  const foreign=records.foreign[0];
  if(foreign)return focus("foreign_record",foreign,tr("有检查记录无法关联本版","A check record cannot be linked to this version"),tr(`${names[foreign]}记录属于其他交付；未把它当成本版结果。`,`${names[foreign]} belongs to another delivery and was not treated as this version’s result.`));
  if(model.state==="checking")return focus("model_checking","model",tr("正在核对保存的并发报告","Validating the saved concurrent report"),tr("文件关联核对完成前，不显示通过结论。","No passing conclusion is shown before the file binding is checked."));
  if(model.state==="invalid")return focus("model_invalid","model",tr("同时操作检查记录需要重新核对","Concurrent evidence needs review"),tr("报告或文件关联无法校验，没有借用旧报告作结论。","The report or file binding could not be validated; an older report was not substituted."));
  if(model.state==="ready"&&model.diagnosis?.outcome!=="compatible"){
    const finding=model.diagnosis?.findings.find(row=>row.severity==="issue")??model.diagnosis?.findings.find(row=>row.severity==="unknown");
    return focus("model_attention","model",model.diagnosis?.summary[language]??tr("同时操作检查仍需核对","Concurrent evidence needs review"),finding?.title[language]??tr("查看已保存的预期、实际记录与复测依据。","Inspect the saved expectations, observations and retest evidence."));
  }
  if(delivery.businessChecks&&!business)return focus("business_invalid","business",tr("业务内容报告无法可靠读取","Business-content evidence cannot be reliably read"),tr("先核对报告；缺少可靠记录不能算作符合。","Inspect the report. Missing reliable evidence does not establish a match."));
  if(delivery.journeyPlan&&!journey)return focus("journey_unknown","journey",tr("约定的预约流程仍待核对","The agreed booking flow still needs inspection"),tr("本版没有可用的完整流程报告，未作通过判断。","No usable complete flow report is available for this version; no pass is claimed."));
  if(delivery.runtimeReport&&!runtime)return focus("runtime_unknown","runtime",tr("预约后台报告无法关联本版","The booking report cannot be linked to this version"),tr("旧报告不能证明本次交付的后台行为。","An older report cannot establish this delivery’s backend behavior."));
  if((delivery.enquiryPlan||delivery.enquiryReport)&&!enquiry)return focus("enquiry_unknown","enquiry",tr("约定的咨询后台仍待核对","The agreed enquiry backend still needs inspection"),delivery.enquiryReport?tr("保存报告或本版关联无法校验，未作通过判断。","The saved report or its version binding could not be validated; no pass is claimed."):tr("已约定咨询提交与保存检查，本版尚无可用报告。","Enquiry submission and persistence checks were agreed; this version has no usable report."));
  if(journey?.summary.issues)return focus("journey_difference","journey",tr("预约流程有观察到的差异","The booking flow has observed differences"),tr(`流程观察中有 ${journey.summary.issues} 项不符；请核对约定与实际记录。`,`${journey.summary.issues} flow observations differ. Inspect the agreement and actual records.`));
  if(runtime?.issues)return focus("runtime_difference","runtime",tr("预约后台有观察到的差异","The booking backend has observed differences"),tr(`${runtime.issues} 个约定步骤不符，请查看具体证据。`,`${runtime.issues} agreed steps differ. Inspect their evidence.`));
  if(enquiry?.summary.mismatch)return focus("enquiry_difference","enquiry",tr("咨询提交或保存存在观察差异","Enquiry submission or persistence has observed differences"),tr(`${enquiry.summary.mismatch} 个约定步骤不符，${enquiry.summary.unknown} 个步骤仍未确定。`,`${enquiry.summary.mismatch} agreed steps differ and ${enquiry.summary.unknown} remain uncertain.`));
  if(business?.issues){const group=business.groups.find(row=>row.row.current.outcome==="mismatch");return focus("business_difference","business",tr("约定的业务内容存在差异","Agreed business content differs"),group?.row.step.source.excerpt??tr("核对价格、电话等约定与页面观察。","Compare agreed prices, contact details and page observations."));}
  if(layout.state==="current"&&layout.overflow)return focus("layout_overflow","layout",tr("页面存在横向溢出","A page has horizontal overflow"),layout.firstIssue?`${layout.firstIssue.file} · ${layout.firstIssue.width}px`:tr("查看保存的页面宽度观察。","Inspect the saved page-width observations."));
  const supplemental=deliveryResultStatus(input).find(row=>["supplemental","source-visibility","deployment-source","time-policy"].includes(row.id)&&row.attention);
  if(supplemental)return focus("supplemental_attention","details",tr("补充证据仍有不符或未确定项","Supplemental evidence has mismatches or unknowns"),supplemental.text);
  const aiChange=overview.rows.find(row=>row.ai?.status==="changes_suggested");
  if(aiChange)return criterion("ai_change",["source-publication-v1", "source-publication-v2"].includes(aiChange.ai?.publicationBasis?.schema ?? "") ? tr("系统源码核验发布了差异，请核对", "System source checks published a difference to review") : tr("AI 提出了修改建议，请核对","AI suggests changes for you to review"),aiChange);
  const human=overview.rows.find(row=>row.humanPending);
  if(human)return criterion("human_pending",tr("还有要求需要你亲自确认","Some requirements need your direct check"),human);
  const unreviewed=overview.rows.find(row=>row.rule==="unreviewed");
  if(unreviewed)return criterion("rule_unknown",tr("有要求尚无完整规则证据","Some requirements lack complete rule evidence"),unreviewed);
  if(journey?.summary.unavailable)return focus("journey_unavailable","journey",tr("部分预约流程仍缺少证据","Some booking-flow evidence is unavailable"),tr(`${journey.summary.unavailable} 项流程观察未确定，不能当作没有问题。`,`${journey.summary.unavailable} flow observations remain uncertain; this does not establish absence of issues.`));
  if(runtime?.unavailable)return focus("runtime_unavailable","runtime",tr("部分预约后台步骤仍未确定","Some booking-backend steps remain uncertain"),tr(`${runtime.unavailable} 个约定步骤缺少确定结果。`,`${runtime.unavailable} agreed steps lack a determined result.`));
  if(enquiry?.summary.unknown)return focus("enquiry_unavailable","enquiry",tr("部分咨询后台步骤仍未确定","Some enquiry-backend steps remain uncertain"),tr(`${enquiry.summary.unknown} 个约定步骤未确定；没有观察不等于没有问题。`,`${enquiry.summary.unknown} agreed steps remain uncertain; missing observations do not mean there are no issues.`));
  if(business?.unavailable)return focus("business_unavailable","business",tr("部分业务内容仍需核对","Some business content still needs inspection"),business.groups.find(row=>row.row.current.outcome==="unavailable")?.row.step.source.excerpt??tr("没有获得可用的页面文字观察。","No usable page-text observation was obtained."));
  if(layout.state!=="current"||layout.unavailable)return focus("layout_unknown","layout",tr("页面显示仍有未覆盖的观察","Some page-display observations remain uncovered"),layout.state==="current"?tr(`${layout.unavailable} 次页面宽度观察不可测。`,`${layout.unavailable} page-width observations were unavailable.`):layout.state==="stale"?tr("旧版页面读数不适用于当前交付。","Earlier page readings do not apply to this delivery."):layout.state==="invalid"?tr("保存的页面读数无法可靠核对。","Saved page readings could not be reliably checked."):tr("尚无页面宽度读数；这不证明手机体验或后台功能。","Page-width readings have not been recorded; mobile usability and backend behavior remain unverified."));
  const insufficient=overview.rows.find(row=>row.ai?.status==="insufficient_evidence");
  if(insufficient)return criterion("ai_insufficient",tr("AI 有无法独立判断的要求","AI cannot independently determine some requirements"),insufficient);
  if(business?.groups.some(group=>group.row.state==="now_matches"))return focus("revision","business",tr("本次观察转为符合，仍需核对修改","The current observation matches; review the revision"),tr("观察变化不等于问题已修复或买家已验收。","A changed observation does not verify a fix or establish buyer acceptance."));
  return focus("saved",first?"criterion":"details",tr("本版检查已保存，验收由买家决定","Checks saved; the buyer decides acceptance"),first?criterionDisplayTitle(first.criterion,language):tr("查看完整记录；验收和付款仍需分别确认。","Inspect the full record; acceptance and payment still need separate confirmation."),first?.criterion.id);
}

export function deliveryResultStatus(input:DeliveryResultInput):{id:string;text:string;attention:boolean}[]{
  const {delivery,overview,model,business,layout,journey,runtime,enquiry,language}=input;
  const tr=(zh:string,en:string)=>language==="zh"?zh:en;
  const rows:{id:string;text:string;attention:boolean}[]=[];
  const add=(id:string,text:string,attention=false)=>rows.push({id,text,attention});
  add("rules",overview.reviewCurrent?tr(`规则：${overview.ruleFailures} 项不符，${overview.unreviewed} 项未核查`,`Rules: ${overview.ruleFailures} mismatches, ${overview.unreviewed} unchecked requirements`):tr(`规则：本版尚未核查（${overview.unreviewed} 项）`,`Rules: this version not checked (${overview.unreviewed} requirements)`),!overview.reviewCurrent||!!overview.ruleFailures||!!overview.unreviewed);
  const sourcePublished = delivery.assessment?.deliveryId === delivery.id && delivery.assessment.items.some(item => ["source-publication-v1", "source-publication-v2"].includes(item.publicationBasis?.schema ?? ""));
  add("ai",overview.assessmentCurrent?sourcePublished?tr(`发布结论（含源码核验）：${overview.aiChanges} 项需修改，${overview.aiInsufficient} 项证据不足`,`Published findings (including source checks): ${overview.aiChanges} needing changes, ${overview.aiInsufficient} insufficient-evidence requirements`):tr(`AI：${overview.aiChanges} 项建议修改，${overview.aiInsufficient} 项证据不足`,`AI: ${overview.aiChanges} change suggestions, ${overview.aiInsufficient} insufficient-evidence requirements`):tr("AI：本版尚无评估","AI: no assessment for this version"),!!overview.aiChanges||!!overview.aiInsufficient);
  add("human",overview.reviewCurrent?tr(`人工：${overview.humanRemaining} 项待确认，已确认 ${overview.humanConfirmed}/${overview.humanRequired}`,`Human: ${overview.humanRemaining} left, ${overview.humanConfirmed}/${overview.humanRequired} confirmed`):tr("人工：待本版核查后确认","Human: confirm after this version is checked"),!!overview.humanRemaining);
  if(overview.risks?.total)add("risks",tr(`AI 潜在线索：${overview.risks.total} 条，${overview.risks.unreviewed} 条尚未复核`,`Potential AI issues: ${overview.risks.total}, ${overview.risks.unreviewed} without human review`),overview.risks.unreviewed>0);
  if(business)add("business",tr(`业务内容：${business.issues} 次不符，${business.unavailable} 次未确定（${business.observations} 次宽度观察）`,`Business content: ${business.issues} mismatches, ${business.unavailable} uncertain (${business.observations} width observations)`),!!business.issues||!!business.unavailable);
  else if(delivery.businessChecks)add("business",tr("业务内容：报告无法可靠读取","Business content: report cannot be reliably read"),true);
  const records=deliveryResultRecords(delivery);
  for(const kind of records.foreign)add(`${kind}-foreign`,tr(`${kind==="transfer"?"改期竞争":kind==="model"?"并发":kind==="journey"?"预约流程":kind==="enquiry"?"咨询后台":"预约后台"}：记录不属于本版`,`${kind}: saved record belongs to another delivery`),true);
  if(delivery.journeyPlan||delivery.journeyRun||delivery.journeyReport){const pending=records.unfinished.includes("journey");add("journey",tr(`预约流程：${pending?"未完成记录；":""}${journey?`${pending?"先前报告 ":""}${journey.summary.issues} 项不符，${journey.summary.unavailable} 项未确定`:"尚无可用报告"}`,`Booking flow: ${pending?"unfinished record; ":""}${journey?`${pending?"previous report: ":""}${journey.summary.issues} mismatches, ${journey.summary.unavailable} uncertain`:"no usable report"}`),pending||!journey||!!journey.summary.issues||!!journey.summary.unavailable);}
  if(delivery.runtimeRun||delivery.runtimeReport){const pending=records.unfinished.includes("runtime");add("runtime",tr(`预约后台：${pending?"未完成记录；":""}${runtime?`${pending?"先前报告 ":""}${runtime.issues} 步不符，${runtime.unavailable} 步未确定`:"尚无本版可用报告"}`,`Booking backend: ${pending?"unfinished record; ":""}${runtime?`${pending?"previous report: ":""}${runtime.issues} mismatched steps, ${runtime.unavailable} uncertain`:"no usable report for this version"}`),pending||!runtime||!!runtime.issues||!!runtime.unavailable);}
  if(delivery.transferCompetitionRun)add("transfer",records.unfinished.includes("transfer")?tr("同时改期：未完成记录","Concurrent rescheduling: unfinished record"):tr("同时改期：本版结果未确定","Concurrent rescheduling: this version’s result is unknown"),true);
  if(delivery.enquiryPlan||delivery.enquiryRun||delivery.enquiryReport){const pending=records.unfinished.includes("enquiry");add("enquiry",tr(`咨询后台：${pending?"未完成记录；":""}${enquiry?`${pending?"先前报告 ":""}${enquiry.summary.mismatch} 步不符，${enquiry.summary.unknown} 步未知`:delivery.enquiryReport?"报告无法校验":"尚无本版可用报告"}`,`Enquiry backend: ${pending?"unfinished record; ":""}${enquiry?`${pending?"previous report: ":""}${enquiry.summary.mismatch} mismatched steps, ${enquiry.summary.unknown} unknown`:delivery.enquiryReport?"report could not be validated":"no usable report for this version"}`),pending||!enquiry||!!enquiry.summary.mismatch||!!enquiry.summary.unknown);}
  if(model.state!=="none"){
    const issueCount=model.diagnosis?.findings.filter(row=>row.severity==="issue").length??0,unknownCount=model.diagnosis?.findings.filter(row=>row.severity==="unknown").length??0;
    add("model",model.state==="ready"?tr(`同时操作检查：${issueCount} 条异常线索，${unknownCount} 条未确定`,`Concurrent actions: ${issueCount} issue findings, ${unknownCount} uncertain`):model.state==="pending"?tr("同时操作：未完成记录","Concurrent actions: unfinished record"):model.state==="checking"?tr("同时操作：正在核对报告关联","Concurrent actions: validating the report binding"):tr("同时操作：报告无法校验","Concurrent actions: report could not be validated"),model.state!=="ready"||model.diagnosis?.outcome!=="compatible");
  }
  add("layout",layout.state==="current"?tr(`页面宽度：${layout.overflow} 次横向溢出，${layout.unavailable} 次不可测（已测 ${layout.measured}/${layout.total}）`,`Page widths: ${layout.overflow} overflow, ${layout.unavailable} unavailable (${layout.measured}/${layout.total} measured)`):layout.state==="stale"?tr("页面宽度：旧版读数不适用","Page widths: earlier readings do not apply"):layout.state==="invalid"?tr("页面宽度：读数无法可靠核对","Page widths: readings cannot be reliably checked"):tr("页面宽度：尚未测量","Page widths: not measured"),layout.state!=="current"||!!layout.overflow||!!layout.unavailable);
  const catalog=delivery.supplementalCatalog;
  if(catalog){
    if(catalog.deliveryId!==delivery.id||catalog.rows.some(row=>row.ref.deliveryId!==delivery.id||row.ref.deliveryDigest!==catalog.deliveryDigest))add("supplemental",tr("补充证据：目录与本版关联待核对","Supplemental evidence: catalog binding needs review"),true);
    else for(const family of["source-visibility","deployment-source","time-policy"]as const){
      const selected=catalog.rows.filter(row=>row.ref.family===family);if(!selected.length)continue;
      const findings=selected.flatMap(row=>row.findings),mismatch=findings.filter(row=>row.outcome==="mismatch").length,unknown=findings.filter(row=>row.outcome==="unknown").length;
      const name=family==="source-visibility"?tr("文字可见性","Text visibility"):family==="deployment-source"?tr("部署文件","Deployment files"):tr("时间规则","Time rules");
      add(family,tr(`${name}：${mismatch} 条不符，${unknown} 条未知${findings.length?"":"，尚无观察"}`,`${name}: ${mismatch} mismatched findings, ${unknown} unknown${findings.length?"":", no observations"}`),mismatch>0||unknown>0||!findings.length);
    }
  }
  return rows;
}
