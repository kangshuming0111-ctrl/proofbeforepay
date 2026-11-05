import "./evidence-viewer.css";
import recordedV1 from "../../tests/fixtures/recorded-seller-staging/v1-evidence.json";
import recordedV2 from "../../tests/fixtures/recorded-seller-staging/v2-evidence.json";
import {createEvidenceViewerController,runtimeEvidenceForViewer,currentEvidenceChecks,type EvidenceViewerState,type EvidenceViewerError} from "./evidence-controller.ts";
import type {EvidenceExport} from "../../lib/evidence-export.ts";
import {getModuleDependencyFindings} from "../../lib/module-dependencies.ts";
import type {DeploymentSourceSession} from "../../lib/deployment-source.ts";
import type {RuntimeCheckReport} from "../../lib/runtime-checks.ts";
import {runtimeStepName,runtimeReasonLabel} from "../../lib/runtime-feedback.ts";

type Language="zh"|"en";
let language:Language="zh",state:EvidenceViewerState={phase:"empty"},selectedFile="",selectedRevisionId="",detailTab:"gates"|"runtime"|"source"|"supplemental"|"revisions"="gates";
const root=document.querySelector<HTMLDivElement>("#evidence-app")!;
const tr=(zh:string,en:string)=>language==="zh"?zh:en;
const node=<T extends keyof HTMLElementTagNameMap>(tag:T,className="",text?:string)=>{const item=document.createElement(tag);item.className=className;if(text!==undefined)item.textContent=text;return item;};
const append=(parent:Node,...children:Node[])=>children.forEach(child=>parent.appendChild(child));
const controller=createEvidenceViewerController(next=>{state=next;selectedFile="";selectedRevisionId="";render();});
const gates:Record<string,[string,string,string,string]>={
  "bounded-json":["完整文件范围","Complete file budget","整份记录保持有界普通 JSON；没有略过超限版本。","The entire record remains bounded plain JSON; oversized revisions are not omitted."],
  "revision-inventory":["所选修订与原始约定","Selected revisions and original agreement","按保存序号核对所选版本、唯一身份与同一锁定原文；当前版在最后。","Check saved sequences, unique identities and the same locked original scope; the current delivery is last."],
  "revision-source-and-record-digests":["各版完整源码与记录摘要","Complete revision source and record digests","逐版重新计算完整文件和证据对象摘要。","Recompute complete file and evidence-record digests for each selected revision."],
  "revision-file-differences":["所选版本的文件变化","Selected revision file changes","从完整文件重算新增、删除、变化和未变化路径，不据此自动认定返工成功。","Recompute added, removed, changed and unchanged paths; a change does not establish a successful repair."],
  "issuer-envelope":["应用签发包格式","Application-issued envelope","签发包格式与完整预算必须有效，失败时不会退回未签名核对。","The complete issued envelope must be valid; failure does not fall back to unsigned verification."],
  "issuer-receipt":["应用签发记录","Application issuance receipt","使用本核验器固定的公钥核对这份包的签发与精确内容，不证明网站、后台或付款。","Use the verifier's pinned public key to check application issuance of these exact records, not website behavior, backend truth or payment."],
  "bundle-structure":["统一证据包范围","Unified bundle scope","原 v1 核心与新增报告均有明确上限；没有省略超限记录。","The unchanged v1 core and supplemental reports have explicit bounds; oversized records are not silently omitted."],
  "module-observation-rules":["补充证据规则版本","Supplemental rule revision","明确区分旧记录与新版模块观察／返工上下文；不按新规则改写旧报告。","Distinguish legacy records from bounded module observations and contextual repair bindings without reinterpreting historical records."],
  "module-observations":["已保存的有限模块关系","Retained bounded module relationships","重算保存的导入观察、清单及读取结果之间的关系；没有原始 JS，不重新解析或执行代码。","Recalculate relationships among retained import observations, manifests and readings. Original JS is absent; it is neither parsed again nor executed."],
  structure:["文件格式与范围","Format and scope","支持的当前交付格式，且结构在上限内。","Supported current-delivery format within structural limits."],
  "file-digest":["交付文件摘要","File-map digest","重新计算文件映射的 SHA-256。","Recompute SHA-256 for the exact file map."],
  requirements:["原始要求引用","Original requirement spans","核对原文范围与保留的字面引用。","Resolve retained literal spans in the original source."],
  "source-rule-replay":["源码规则重放","Source-rule replay","对保存的文件重算命名版本的规则。","Replay the named source rules on the saved files."],
  "ai-source-citations":["AI 原文、补证与复核记录","AI source, evidence gaps and reviews","核对来源位置；若有补证、暂缓原件与批注，则核对其精确绑定。不证明模型判断、补证原因或人工身份真实。","Check source positions and, when present, exact evidence-needed, withheld-original and annotation bindings. Model judgment, gap causes and human identity are not proven."],
  "reported-observation-consistency":["已报告的浏览器读数","Reported browser observations","按提供的读数重算结果；未运行浏览器。","Recalculate supplied readings; no browser is run."],
  "runtime-bindings":["接口报告关联","HTTP report bindings","核对本版、计划、摘要及冻结目标。","Check delivery, plan, digest and frozen target bindings."],
  "journey-plan-source-mapping":["业务计划原文关联","Journey plan source mapping","核对计划建议保留的原文来源与关联；不验证模型判断。","Check retained source spans and bindings for plan suggestions, not model judgment."],
  "model-archive-integrity":["不可变模型报告档案","Immutable model report archive","核对原始有效载荷的精确 SHA-256、项目／交付／报告身份及清单与档案一一对应；不证明真实性。","Check exact payload SHA-256, project/delivery/report identity and a complete one-to-one manifest/archive mapping; authenticity is not proven."],
  "model-evidence-explanation":["并发报告 AI 解释关联","Concurrent-report AI explanation","核对解释与指定报告、诊断项的关联；不验证解释结论。","Check explanation bindings to the exact report and diagnostic findings, not its conclusions."],
  "acceptance-references":["验收快照关联","Acceptance snapshot references","核对原快照、报告与明确例外。","Check retained snapshots, reports and explicit exceptions."],
  "supplemental-objects":["补充报告对象与摘要","Supplemental objects and digests","重跑可见性、部署字节、时间规则记录的原生校验，并核对脱敏对象的精确摘要。","Replay native visibility, deployment-byte and time-policy record validators and verify exact public-object digests."],
  "supplemental-bindings":["补充报告与本版文件","Supplemental delivery bindings","核对本版源码节点、部署清单及原始读数的派生结果；不发出网络请求。","Resolve source nodes, deployment manifests and derived results for this delivery without issuing requests."],
  "supplemental-catalog":["当前完整报告清单","Current complete report catalog","由精确记录重新生成完整清单与摘要。","Rebuild the complete current catalog and its digest from exact records."],
  "supplemental-acceptance":["补充证据冻结验收链","Frozen supplemental acceptance chain","逐一核对当时纳入或排除的精确版本、例外确认和验收快照。","Resolve exact included/excluded historical versions, acknowledged exceptions and acceptance snapshots."],
  "followup-records":["返工与重测事件回放","Repair and retest event replay","从买卖双方追加事件重建任务状态；不自动认定返工完成。","Rebuild task state from append-only buyer/seller events; repair completion is not inferred."],
  "followup-bindings":["同一规则重测与旧验收状态","Same-rule retests and frozen task heads","核对各次任务引用的精确报告、诊断项、规则摘要及当时任务版本。旧交付源码未包含。","Resolve exact report findings, plan digests and task versions, including frozen historical heads. Earlier source files are not included."],
};
const errors:Record<EvidenceViewerError,[string,string]>={
  too_large:["请选择不超过 8 MiB 的单个 JSON 文件。","Choose one JSON file no larger than 8 MiB."],
  invalid_utf8:["文件不是有效 UTF-8。请重新导出 JSON 后选择。","This file is not valid UTF-8. Export the JSON again and retry."],
  invalid_json:["文件不是完整 JSON。请选择下载的证据包。","This is not complete JSON. Choose the downloaded evidence export."],
  read_failed:["未能读取本地文件。请重新选择；没有上传文件。","The local file could not be read. Select it again; nothing was uploaded."],
  verification_failed:["此次核对未完成。请重新导出文件后重试；未显示通过结果。","This check did not complete. Export the file again and retry; no successful result is shown."],
};
function button(text:string,action:()=>void|Promise<void>,className="",focusKey=text){
  const value=node("button",className,text);value.type="button";value.dataset.evFocus=focusKey;value.addEventListener("click",()=>{void action();});return value;
}
function labelledValue(label:string,value:string){const row=node("div");append(row,node("dt","",label),node("dd","",value));return row;}
function statusLabel(value:"consistent"|"inconsistent"|"unsupported"){
  return value==="consistent"?tr("记录内部一致","Internally consistent"):value==="inconsistent"?tr("记录存在不一致","Inconsistency found"):tr("不支持此格式","Unsupported format");
}
function issuancePanel(){
  const issuance=state.phase==="ready"?state.issuance:undefined;
  if(issuance?.status==="verified")return node("p","ev-callout",tr("应用签发已验证 · 只证明本应用签发了这份精确记录，不证明网站合格、后台真实或付款。","Application issuance verified · This establishes application issuance of these exact records, not website correctness, backend truth or payment."));
  if(issuance?.status==="invalid")return node("p","ev-callout issue",tr("应用签发未通过验证 · 没有退回未签名核对，也没有展示未验证的修订源码。","Application issuance could not be verified · No unsigned fallback or unverified revision source is shown."));
  return node("p","ev-note",tr("未签名历史格式 · 可核对内部一致性，签发者尚未证明。","Unsigned historical format · Internal consistency can be checked; issuance is unproven."));
}

function revisionPanel(){
 const section=node("section","ev-runtime");section.setAttribute("aria-label",tr("所选修订对照","Selected revision comparison"));
 const audit=state.phase==="ready"&&state.issuance?.status==="verified"?state.revisionAudit:undefined;
 if(!audit){append(section,node("p","ev-empty-note",tr("没有通过签发验证的修订包可展示。旧格式的核对范围保持原样。","No verified issued revision audit is available. Older formats retain their existing scope.")));return section;}
 append(section,node("p","ev-callout",tr(`已核对所选 ${audit.versions.length} 版完整源码；不代表所有历史。文件变化不自动等于问题已修复。`,`Complete source for ${audit.versions.length} selected revisions was checked; this is not all history. File changes do not automatically establish successful repair.`)));
 for(const v of audit.versions){
  const row=node("article","ev-runtime-step"),head=node("div","ev-gate-heading");append(head,node("h3","",`v${v.sequence} · ${v.isCurrent?tr("当前版","Current"):tr("历史版","Archived")}`),node("span","ev-step-state",`${v.files.length} ${tr("份文件","files")}`));append(row,head,node("p","ev-note",v.scope==="archived-core"?tr("历史范围：完整保存源码与核心报告；旧版补充报告及项目级资金同意／返工事件不包含。","Archived scope: complete retained source and core reports; historical supplemental reports and quote-level financial consent/repair events are excluded."):tr("当前范围：完整统一证据包；没有重新执行网站、模型或接口。","Current scope: full unified evidence bundle; the website, model and endpoints were not rerun.")));
  const verification=state.phase==="ready"&&state.verification.schema==="proofbeforepay-issued-revision-audit-verification-v1"?state.verification.versions.find(item=>item.deliveryId===v.deliveryId)?.verification:undefined;
  const checks=node("details");append(checks,node("summary","",tr(`查看这版的 ${verification?.checks.length??0} 项核对`,`Inspect ${verification?.checks.length??0} checks for this revision`)));const list=node("ul");for(const check of verification?.checks??[]){const copy=gates[check.id];append(list,node("li","",`${copy?tr(copy[0],copy[1]):check.id} · ${check.status==="consistent"?tr("一致","Consistent"):tr("不一致","Inconsistent")}`));}append(checks,list);append(row,checks);append(section,row);
 }
 for(const diff of audit.differences){
  const detail=node("details","ev-inventory");append(detail,node("summary","",tr(`v${diff.fromSequence} → v${diff.toSequence}：新增 ${diff.added.length}，删除 ${diff.removed.length}，变化 ${diff.changed.length}，未变 ${diff.unchanged.length}`,`v${diff.fromSequence} → v${diff.toSequence}: ${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed, ${diff.unchanged.length} unchanged`)));
  for(const [label,names]of [[tr("新增","Added"),diff.added],[tr("删除","Removed"),diff.removed],[tr("变化","Changed"),diff.changed],[tr("未变化","Unchanged"),diff.unchanged]]as const){if(!names.length)continue;append(detail,node("h4","",label));const list=node("ul");for(const path of names)append(list,node("li","",path));append(detail,list);}append(section,detail);
 }
 append(section,node("p","ev-note",tr("在“查看原文”中选择具体修订，可查看那一版保存的源码；不会借用当前版替代旧版。","Select a revision in Retained source to inspect that exact saved source; current files are never substituted for older files.")));return section;
}
function displayTime(value:string){return value.replace("T"," ").replace(".000Z"," UTC");}

function inputPanel(){
  const side=node("aside","ev-input"),label=node("label","ev-file-label",tr("选择本地证据包","Choose a local evidence file"));
  label.htmlFor="evidence-file";
  const input=node("input","ev-file-input");input.id="evidence-file";input.type="file";input.accept=".json,application/json";input.dataset.evFocus="local-file";
  input.addEventListener("change",()=>{const file=input.files?.[0];if(file){detailTab="gates";void controller.openFile(file);}});
  append(side,label,input,node("p","ev-note",tr("单个 UTF-8 JSON，最多 8 MiB。支持原 v1、统一 v2 和应用签发的修订审计包。只在本页内存读取；刷新或清除后不保留。","One UTF-8 JSON, up to 8 MiB. Supports legacy v1, unified v2 and application-issued revision audits. Read in this page’s memory; cleared on reset or refresh.")));
  const sampleGroup=node("div","ev-samples");append(sampleGroup,node("h2","",tr("先核对一份已记录的样例","Try a recorded example")));
  const sample=(version:1|2)=>{
    const b=button(tr(`记录的 v${version}`,`Recorded v${version}`),()=>{detailTab="gates";return controller.openRecorded(version===1?recordedV1:recordedV2,`ProofBeforePay-recorded-v${version}.json`);},"ev-sample");
    append(b,node("span","",version===1?tr("保留超限不符 · 17/18","Above-limit mismatch retained · 17/18"):tr("该次有限记录 · 18/18","That bounded recorded run · 18/18")));return b;
  };
  append(sampleGroup,sample(1),sample(2),node("p","ev-note",tr("两份虚构开发者记录，使用受控卖家参考服务。点击只核对随页面打包的文件，不会重新调用服务。","Two fictional developer records from a controlled seller-reference service. These bundled files are checked without calling that service again.")));
  append(side,sampleGroup,button(tr("清除本页文件","Clear this file"),()=>{detailTab="gates";controller.reset();},"ev-clear"));
  return side;
}

function gatePanel(){
  const section=node("section","ev-gates");section.setAttribute("aria-label",tr("离线核对项目","Offline evidence checks"));
  const checks=state.phase==="ready"?state.verification.checks:[];
  const list=node("ol");
  for(const [id,copy] of Object.entries(gates)){
    const check=checks.find(row=>row.id===id);
    if(!check&&(state.phase==="ready"&&state.issuance?.status!==undefined&&state.issuance.status!=="unproven"||["bounded-json","revision-inventory","revision-source-and-record-digests","revision-file-differences","issuer-envelope","issuer-receipt","journey-plan-source-mapping","model-evidence-explanation","model-archive-integrity","bundle-structure","module-observation-rules","module-observations","supplemental-objects","supplemental-bindings","supplemental-catalog","supplemental-acceptance","followup-records","followup-bindings"].includes(id)))continue;
    const outcome=check?.status??"not_checked",row=node("li",`ev-gate ${outcome}`),heading=node("div","ev-gate-heading");
    append(heading,node("h3","",tr(copy[0],copy[1])),node("span","ev-gate-status",outcome==="consistent"?tr("一致","Consistent"):outcome==="inconsistent"?tr("不一致","Inconsistent"):tr("未核对","Not checked")));
    append(row,heading,node("p","",tr(copy[2],copy[3])));
    if(check?.status==="inconsistent")append(row,node("p","ev-gate-failure",tr("无法从这份记录建立此项一致性。请检查原始导出；这里不会补造证据。","This gate cannot be established from the supplied record. Inspect the original export; missing evidence is not reconstructed.")));
    append(list,row);
  }
  const early=checks.find(row=>row.id==="schema"||row.id==="structure"&&row.status!=="consistent");
  if(early)append(section,node("p","ev-callout issue",early.id==="schema"?tr("请选择版本化证据包；原始项目 JSON 不会被当作可核对格式。","Choose the versioned evidence export. Raw project JSON is not silently treated as this format."):tr("输入超出有界普通 JSON 的范围，未继续核对。","The input is outside bounded plain JSON limits; later checks were not run.")));
  const unknown=checks.filter(row=>row.id!=="schema"&&!Object.hasOwn(gates,row.id));
  if(unknown.length)append(section,node("p","ev-callout",tr("文件包含本页尚未命名的核对项目，请按其记录结果复核；这不表示文件超出 JSON 范围。","This file includes checks not yet named by this view. Inspect their recorded outcomes; this does not mean the file exceeds JSON limits.")));
  append(section,list);return section;
}

function runtimePanel(packet:EvidenceExport|undefined){
  const section=node("section","ev-runtime");
  const view=runtimeEvidenceForViewer(state);
  if(!packet||view.state==="unavailable"){append(section,node("p","ev-empty-note",tr("这份记录没有可可靠展示的接口关联。先查看核对结果；未借用样例或其他文件。","No reliable HTTP binding is available for this file. Inspect the checks first; another file or sample is not substituted.")));return section;}
  if(view.state==="missing"){append(section,node("p","ev-empty-note",tr("此交付没有包含接口报告。源码规则一致不代表测试过网站后端。","No HTTP report was included. Source-rule consistency does not mean a website backend was tested.")));return section;}
  if(view.state==="pending")append(section,node("p","ev-callout issue",tr("文件保留了一次未完成运行。下面如有旧报告，仅是较早记录，不能说明未完成运行的结果。","The file retains an unfinished run. Any earlier report below is historical and cannot establish that run’s result.")));
  const report=view.state==="recorded"?view.report:view.previousReport;
  if(!report)return section;
  append(section,node("p","ev-callout",tr("下面是文件里保存的有限 HTTP 观测。这次离线核对没有发出这些请求。","These are bounded HTTP observations saved in the file. This offline check did not issue those requests.")));
  const refs=node("dl","ev-refs");append(refs,labelledValue(tr("报告","Report"),report.id),labelledValue(tr("声明修订","Declared revision"),report.target.revision),labelledValue(tr("目标","Target"),report.target.label),labelledValue(tr("运行时间","Recorded run"),`${displayTime(report.startedAt)} / ${displayTime(report.finishedAt)}`));append(section,refs);
  const list=node("ol","ev-runtime-steps");
  for(const step of report.steps){
    const row=node("li",`ev-runtime-step ${step.outcome}`),head=node("div","ev-gate-heading");
    append(head,node("h3","",runtimeStepName(step.id,language,step.label)),node("span","ev-step-state",`${step.status===undefined?tr("无 HTTP 读数","No HTTP reading"):`HTTP ${step.status}`} · ${step.outcome==="observed"?tr("观测支持","Observed support"):step.outcome==="mismatch"?tr("不符","Mismatch"):tr("未确定","Unavailable")}`));append(row,head);
    const details=node("details");append(details,node("summary","",tr("查看该步骤记录","Inspect this step")),node("code","",`${step.method} ${step.path}`),node("p","",`${tr("预期","Expected")}: ${step.expected}`));
    if(step.actual)append(details,node("pre","",step.actual));if(step.reason)append(details,node("p","",`${runtimeReasonLabel(step.reason,language)} (${step.reason})`));append(row,details);append(list,row);
  }
  append(section,list);return section;
}

function sourcePanel(packet:EvidenceExport|undefined){
  const section=node("section","ev-source");
  if(!packet){append(section,node("p","ev-empty-note",tr("文件结构尚未核对，暂不显示来源。","Sources are hidden until the file structure has been checked.")));return section;}
  const audit=state.phase==="ready"?state.revisionAudit:undefined;
  if(audit){
    const selected=audit.versions.find(v=>v.deliveryId===selectedRevisionId)??audit.versions.at(-1)!;selectedRevisionId=selected.deliveryId;
    const label=node("label","ev-source-label",tr("源码所属修订","Source revision")),select=node("select");select.id="retained-revision";select.dataset.evFocus="revision-choice";label.htmlFor=select.id;
    for(const v of audit.versions){const option=node("option","",`v${v.sequence} · ${v.isCurrent?tr("当前完整证据","Current full evidence"):tr("历史核心报告","Archived core reports")}`);option.value=v.deliveryId;option.selected=v.deliveryId===selectedRevisionId;append(select,option);}
    select.addEventListener("change",()=>{selectedRevisionId=select.value;selectedFile="";render();});append(section,label,select);
    packet=selected.evidence.schema==="proofbeforepay-evidence-export-v1"?selected.evidence:selected.evidence.core;
  }
  const files=Object.keys(packet.delivery.files??{}).sort((a,b)=>a.localeCompare(b,"en"));
  const textFiles=files.filter(file=>/\.(?:html|css)$/iu.test(file)||file==="delivery-manifest.json");
  const choices=["@requirements",...textFiles];if(!choices.includes(selectedFile))selectedFile=choices[0];
  const label=node("label","ev-source-label",tr("选择要查看的原文","Choose retained source text")),select=node("select");select.id="retained-source";select.dataset.evFocus="source-choice";label.htmlFor=select.id;
  for(const file of choices){const option=node("option","",file==="@requirements"?tr("原始要求与约定","Original requirements and agreement"):file);option.value=file;option.selected=file===selectedFile;append(select,option);}
  select.addEventListener("change",()=>{selectedFile=select.value;render();});append(section,label,select);
  const source=selectedFile==="@requirements"?[packet.project.summary,...(packet.project.requirements?[packet.project.requirements.sourceText]:[])].join("\n\n"):packet.delivery.files![selectedFile];
  const limit=24_000,pre=node("pre","ev-source-text",source.length>limit?source.slice(0,limit)+tr("\n… 本页仅显示前 24,000 字符；核对使用完整受支持文件。","\n… Display limited to 24,000 characters; the verifier used the complete supported file."):source);
  pre.tabIndex=0;append(section,node("p","ev-note",tr("仅以纯文本展示；不会渲染 HTML、应用 CSS、读取图片像素或跟随文件中的链接。","Text only: HTML is not rendered, CSS is not applied, image pixels are not read, and links in the file are not followed.")),pre);
  const inventory=node("details","ev-inventory");append(inventory,node("summary","",tr(`全部 ${files.length} 份保存文件`,`All ${files.length} retained files`)));const names=node("ul");for(const file of files)append(names,node("li","",file));append(inventory,names);append(section,inventory);return section;
}

function limitsPanel(){
  const section=node("details","ev-limits");append(section,node("summary","",tr("一致究竟证明了什么？","What does consistency establish?")));
  const audit=state.phase==="ready"?state.revisionAudit:undefined,issued=state.phase==="ready"&&state.issuance?.status==="verified";
  const list=node("ul");for(const line of [
    audit?tr("只核对包内所选修订，不代表全部历史。历史版仅含留存源码与核心报告；历史补充报告、项目级资金同意和返工事件不包含。","Only the selected revisions are checked, not all history. Archived revisions retain source and core reports, excluding historical supplemental reports, quote-level financial consent and repair events."):tr("仅核对当前交付文件及其保留的报告、验收关联；更早交付版本不在同一个包内。","Only this delivery’s files, retained reports and acceptance references are checked; earlier deliveries are outside this package."),
    tr("模块依赖只重算包内保存的有限观察关系；没有原始 JS 供重新解析，不验证运行时加载或执行。","Module diagnostics recalculate only the packaged bounded observations. Original JS is absent; parsing, runtime loading and execution are not repeated."),
    issued?tr("固定公钥验证了本应用对这份精确记录的签发；这不是独立后台观测或来源构建证明。","The pinned key verifies this application's issuance of these exact records, not independent backend observations or build provenance."):tr("没有通过可信签发验证。完全伪造但内部自洽的未签名文件也可能通过一致性检查。","Trusted issuance has not been established. A fully fabricated but internally coherent unsigned file can pass consistency checks."),
    tr("不证明真实身份、实际 HTTP 或模型调用、网站全部合格、法律结论或付款。","This does not prove identity, actual HTTP or model execution, complete website correctness, a legal conclusion or payment."),
    tr("原始要求和源文件可能包含个人文字。本页不上传、不存储到浏览器持久空间，也不是自动匿名化工具。","Requirements and source files may contain personal text. This page does not upload them or persist them in browser storage, and is not an automatic anonymiser."),
  ])append(list,node("li","",line));append(section,list);return section;
}

function supplementalPanel(){
 const section=node("section","ev-runtime"),evidence=state.phase==="ready"?state.supplemental:undefined;
 if(!evidence){append(section,node("p","ev-empty-note",tr("此文件没有完成对象与清单核对的统一补充证据。原 v1 包仍可核对其已有证据范围。","This file has no unified supplemental evidence with checked objects and catalog. Legacy v1 files retain their original verification scope.")));return section;}
 append(section,node("p","ev-callout",tr("以下为包内精确记录与买家的冻结选择。没有重新运行浏览器、网站或时间接口；不代表自动验收。","These are exact packaged records and frozen buyer selections. Browser, deployment and time endpoints were not rerun; this is not automatic acceptance.")));
 const families:Record<string,string>={"source-visibility":tr("源码文本可见性","Source-text visibility"),"deployment-source":tr("部署文件字节","Deployment file bytes"),"time-policy":tr("时间与日历规则","Time and calendar policy")};
 const list=node("ol","ev-runtime-steps");
 for(const row of evidence.catalog.rows){
  const item=node("li","ev-runtime-step"),head=node("div","ev-gate-heading");append(head,node("h3","",families[row.ref.family]??row.ref.family),node("span","ev-step-state",row.status));append(item,head,node("p","",row.summary),node("p","ev-note",row.scope));
  const refs=node("dl","ev-refs");append(refs,labelledValue(tr("记录／版本","Record / version"),`${row.ref.id} / ${row.ref.version}`),labelledValue("SHA-256",row.ref.payloadSha256));append(item,refs);
  const findings=node("ul");for(const f of row.findings)append(findings,node("li","",`${f.outcome} · ${f.label}`));append(item,findings);
  const object=evidence.objects.find(o=>o.ref.payloadSha256===row.ref.payloadSha256&&o.ref.id===row.ref.id&&o.ref.family===row.ref.family&&o.ref.version===row.ref.version);
  if(object?.ref.family==="deployment-source"&&(object.record as DeploymentSourceSession).plan.version===3){
   const moduleDetails=node("details","ev-inventory");append(moduleDetails,node("summary","",tr("有限模块依赖观察","Bounded module observations")),node("p","ev-note",tr("这里只重算已保存的导入观察与声明清单的关系，没有原始 JS 可供重新解析，没有执行代码或跟随依赖发出请求。完整运行时加载仍未验证。","Only retained import observations and declared-file relationships are recalculated. Original JS is absent, no code is executed, and no dependency is fetched. Arbitrary runtime loading remains unverified.")));
   if(currentEvidenceChecks(state).some(c=>c.id==="module-observations"&&c.status==="consistent")){
    const modules=node("ul");for(const finding of getModuleDependencyFindings(object.record as DeploymentSourceSession)){
     const module=node("li");append(module,node("strong","",finding.file),node("p","",tr(`声明范围关系：${finding.outcome}；直接引用 ${finding.references}，可达模块 ${finding.reachableModules}，漏声明 ${finding.missing}，未知 ${finding.unknown}。`,`Declared-scope relationships: ${finding.outcome}; ${finding.references} direct references, ${finding.reachableModules} reachable modules, ${finding.missing} missing declarations, ${finding.unknown} unknowns.`)));
     const details=node("ul");for(const d of finding.details.slice(0,20))append(details,node("li","",`${d.outcome} · ${d.from}${d.target?` → ${d.target}`:""} · ${d.reason}${d.offset===undefined?"":` · offset ${d.offset}`}`));if(finding.details.length>20)append(module,node("p","ev-note",tr("这里只展示前20个诊断；核对使用完整有界记录。","Only the first 20 diagnostics are displayed; verification used the full bounded record.")));append(module,details);append(modules,module);
    }append(moduleDetails,modules);
   }else append(moduleDetails,node("p","ev-empty-note",tr("模块关系尚未核对一致。请先查看核对项目，不能把此记录当成验证通过。","Module relationships have not passed consistency checks. Inspect the check list before relying on this record.")));
   append(item,moduleDetails);
  }
  if(object){const detail=node("details"),text=JSON.stringify(object.record,null,2),limit=24000;append(detail,node("summary","",tr("查看保存的原生记录","Inspect retained native record")),node("pre","ev-source-text",text.length>limit?text.slice(0,limit)+tr("\n… 仅显示前 24,000 字符；核对使用完整对象。","\n… Display limited to 24,000 characters; the complete object was verified."):text));append(item,detail);}
  append(list,item);
 }
 if(!evidence.catalog.rows.length)append(section,node("p","ev-empty-note",tr("此交付尚未保存补充检测报告。","No supplemental check reports are retained for this delivery.")));append(section,list);
 const accepts=node("details","ev-inventory");append(accepts,node("summary","",tr(`冻结验收选择 · ${evidence.acceptance.length} 份快照`,`Frozen acceptance selections · ${evidence.acceptance.length} snapshots`)));
 for(const item of evidence.acceptance){append(accepts,node("h3","",item.snapshotId));if(!item.decision){append(accepts,node("p","ev-note",tr("旧快照没有补充证据选择；没有用新报告补写。","This legacy snapshot has no supplemental selection; newer reports were not substituted.")));continue;}const entries=node("ul");for(const e of item.decision.entries)append(entries,node("li","",`${families[e.ref.family]} · ${e.ref.id} / ${e.ref.version} · ${e.disposition}${e.reason?` · ${e.reason}`:""}`));append(accepts,entries);}
 append(section,accepts,node("p","ev-note",tr(`${evidence.objects.length} 份精确补充对象；${evidence.artifactManifests.length} 份 JavaScript 字节清单。清单仅保留哈希，不包含或执行 JavaScript。`,`${evidence.objects.length} exact supplemental objects; ${evidence.artifactManifests.length} JavaScript byte manifests. Manifests retain hashes without embedding or executing JavaScript.`)));
 const tasks=state.phase==="ready"?state.followups?.tasks:undefined;
 if(tasks?.length){const history=node("details","ev-inventory");append(history,node("summary","",tr(`返工与重测事件 · ${tasks.length} 项任务`,`Repair and retest history · ${tasks.length} tasks`)),node("p","ev-note",tr("旧交付仅保留被任务引用的原生报告；没有旧源文件，不能重新核对其源码节点或字节。","Earlier deliveries contribute only native reports referenced by tasks. Their source files are absent, so their source-node and byte bindings cannot be replayed.")));for(const task of tasks){append(history,node("h3","",`${task.id} · v${task.version} · ${task.status}`));const events=node("ol");for(const event of task.events)append(events,node("li","",`${event.version} · ${event.actorRole} · ${event.action} · ${event.note}${event.resolution?` · ${event.resolution}`:""}`));append(history,events);}append(section,history);}
 return section;
}

function recordedOutcome(report:RuntimeCheckReport,historical=false){
  const counts=report.summary,result=node("div",`ev-outcome${counts.issues||counts.unavailable?" issue":""}`);
  append(result,node("strong","",historical?tr(`较早记录：${counts.observed}/${counts.steps} 步有预期观测`,`Earlier recorded run: ${counts.observed}/${counts.steps} expected observations`):tr(`记录的接口结果：${counts.observed}/${counts.steps} 步有预期观测`,`Recorded HTTP result: ${counts.observed}/${counts.steps} expected observations`)),node("span","",tr(`${counts.issues} 项不符，${counts.unavailable} 项未确定。这里只核对保存记录，没有实测服务。`,`${counts.issues} mismatched, ${counts.unavailable} unavailable. The stored record is checked; the service is not tested now.`)));
  const above=report.steps.find(step=>step.id==="party_above");if(above)append(result,node("span","",`${tr("超限请求","Above-limit request")}: HTTP ${above.status??"—"} · ${above.outcome==="mismatch"?tr("保留不符","Mismatch retained"):above.outcome==="observed"?tr("该次观测支持","Supported by that recorded observation"):tr("未确定","Unavailable")}`));
  return result;
}

function render(){
  const focused=document.activeElement instanceof HTMLElement?document.activeElement.dataset.evFocus:undefined;
  document.documentElement.lang=language==="zh"?"zh-CN":"en";document.title=tr("ProofBeforePay · 本地证据核对","ProofBeforePay · Local evidence check");root.replaceChildren();
  const header=node("header","ev-header"),brand=node("a","ev-brand","proofbeforepay.");brand.href="./";
  const nav=node("nav","ev-header-nav");nav.setAttribute("aria-label",tr("页面导航","Page navigation"));const back=node("a","evidence-navigation",tr("返回实验室","Back to lab"));back.href="./";
  append(nav,back,button(language==="zh"?"EN":"中文",()=>{language=language==="zh"?"en":"zh";render();},"ev-language","language"));append(header,brand,nav);
  const main=node("main","ev-main"),intro=node("div","ev-intro");append(intro,node("h1","",tr("把证据放在一起核对。","Put the evidence back together.")),node("p","",tr("选择一份导出，查看文件、引用和验收记录是否彼此一致。","Choose an export and check whether its files, citations and acceptance records agree.")));
  const privacy=node("p","ev-privacy",tr("本页核对在浏览器内完成 · 文件不上传 · 不调用模型或付款服务","Checked in this browser · no file upload · no model or payment calls"));
  const workbench=node("div","ev-workbench"),results=node("section","ev-results");results.setAttribute("aria-label",tr("证据核对结果","Evidence check result"));
  const summary=node("header","ev-result-heading");summary.setAttribute("aria-live","polite");
  if(state.phase==="empty")append(summary,node("h2","",tr("先选择证据包，或打开一份记录样例。","Choose an export or open a recorded example.")),node("p","",tr("不会自动扫描网站，也不会重新执行文件中的动作。","No website is scanned and no recorded action is re-executed.")));
  else if(state.phase==="checking")append(summary,node("h2","",tr("正在核对这份记录…","Checking this record…")),node("p","ev-filename",state.label));
  else if(state.phase==="error")append(summary,node("h2","ev-error",tr("这份文件尚未完成核对","This file has not been checked")),node("p","",tr(...errors[state.error])),node("p","ev-filename",state.label));
  else{
    append(summary,node("h2",`ev-verdict ${state.verification.consistency}`,statusLabel(state.verification.consistency)),node("p","ev-filename",state.label));
    append(summary,issuancePanel());
    append(summary,node("p","ev-summary-limit",tr("一致性不等于网站已全部合格，也不等于已验收或已付款。","Consistency is not a fully correct website, acceptance or payment.")));
    if(state.recorded)append(summary,node("p","ev-recorded-label",tr("已记录的虚构样例 · 没有发起新的 HTTP 请求","Recorded fictional example · no new HTTP requests")));
    const runtime=runtimeEvidenceForViewer(state);
    if(runtime.state==="pending"){append(summary,node("p","ev-callout issue",tr("此文件包含未完成的接口运行；本次结果未知。以下旧报告不代表这次运行已完成。","This file contains an unfinished HTTP run; its result is unknown. The earlier report below is not that run’s completed result.")));if(runtime.previousReport)append(summary,recordedOutcome(runtime.previousReport,true));}
    if(runtime.state==="recorded")append(summary,recordedOutcome(runtime.report));
  }
  append(results,summary);
  const tabs=node("nav","ev-tabs");tabs.style.flexWrap="wrap";tabs.setAttribute("aria-label",tr("核对视图","Check views"));for(const [key,zh,en] of [["gates","核对项目","Evidence checks"],["runtime","接口记录","HTTP evidence"],["supplemental","补充证据","Supplemental"],["source","查看原文","Retained source"],["revisions","修订对照","Revisions"]] as const){if(key==="revisions"&&!(state.phase==="ready"&&state.revisionAudit))continue;const b=button(tr(zh,en),()=>{detailTab=key;render();},detailTab===key?"active":"");b.setAttribute("aria-pressed",String(detailTab===key));append(tabs,b);}append(results,tabs);
  const pane=node("div","ev-detail-pane"),packet=state.phase==="ready"?state.packet:undefined;append(pane,detailTab==="gates"?gatePanel():detailTab==="runtime"?runtimePanel(packet):detailTab==="supplemental"?supplementalPanel():detailTab==="revisions"?revisionPanel():sourcePanel(packet));append(results,pane,limitsPanel());
  append(workbench,inputPanel(),results);append(main,intro,privacy,workbench);append(root,header,main);
  if(focused)[...root.querySelectorAll<HTMLElement>("[data-ev-focus]")].find(item=>item.dataset.evFocus===focused)?.focus({preventScroll:true});
}
render();
