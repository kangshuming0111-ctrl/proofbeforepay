"use client";
import {useEffect,useReducer,useRef,useState} from "react";
import type {Language} from "@/lib/contracts";
import {buildSellerOnboardingFiles,checkSellerOnboarding,ONBOARDING_SELECTOR_FIELDS} from "@/lib/seller-onboarding";
import {discoverSellerControls,SELLER_ONBOARDING_DOCUMENT_LIMITS,type SellerControlReason} from "@/lib/seller-control-discovery";
import {confirmedOnboardingCount,createSellerOnboardingState,decodeSellerOnboardingHtml,onboardingFieldValue,sellerOnboardingReducer,withOnboardingField,type SellerOnboardingAction} from "./seller-onboarding-state";
import {buildSellerOnboardingKit} from "@/lib/seller-onboarding-kit";
import "./seller-onboarding.css";
import {DeliveryStageEvidence} from "./DeliveryStageEvidence";

const fieldNames:Record<string,[string,string]>={"create.partySize":["预约人数","Party size"],"create.slot":["预约时段","Booking slot"],"create.requestOperation":["预约测试指令","Create instruction"],"create.submit":["预约按钮","Create button"],"cancel.bookingId":["待取消预约","Booking to cancel"],"cancel.requestOperation":["取消测试指令","Cancel instruction"],"cancel.submit":["取消按钮","Cancel button"],"move.bookingId":["待改期预约","Booking to move"],"move.slot":["改期时段","New slot"],"move.requestOperation":["改期测试指令","Move instruction"],"move.submit":["改期按钮","Move button"],"retry.submit":["原键重试按钮","Original-key retry button"],"result":["结果区域","Result region"]};
const explanations:Record<string,[string,string]>={configuration_valid:["配置格式正确；尚未连接后台。","Configuration shape is valid; no backend connection was made."],configuration_shape:["配置缺少字段或含额外字段，请恢复完整配置。","A field is missing or extra; restore the complete configuration."],protocol_unsupported:["只支持当前预约协议。","Only the current booking protocol is supported."],parent_origin_invalid:["填写实际主站 HTTPS 来源，不含路径、末尾斜杠、账号或查询参数。","Use the actual HTTPS main-site origin without a path, trailing slash, credentials or query."],backend_path_invalid:["填写同源目录，如 /pbp/，不填完整网址。","Use a same-origin directory such as /pbp/, not a full URL."],revision_invalid:["版本名使用 1–80 个字母、数字、点、短横线或下划线。","Use a 1–80 character revision with letters, numbers, dots, hyphens or underscores."],selector_invalid:["选择器为空、过长或含禁止内容。","The selector is empty, too long or contains prohibited content."],selector_unsupported:["选择器超出支持范围，请给控件加稳定 ID 或 data 属性。","Use stable IDs or data attributes; this selector exceeds the supported subset."],html_not_supplied:["选择本地 HTML 后可检查控件匹配；文件不会上传。","Choose local HTML to check selectors. The file is not uploaded."],html_size_or_encoding:["HTML 需为 UTF-8，大小不超过 256 KiB。","Use UTF-8 HTML no larger than 256 KiB."],selector_matches:["唯一匹配，静态控件类型兼容。","One match with a compatible static control type."],selector_missing:["没有匹配。修正选择器；动态生成的控件需在浏览器另验。","No match. Correct the selector; runtime-created controls need browser verification."],selector_ambiguous:["匹配多个控件。缩小范围到一个。","More than one match. Scope the selector to exactly one control."],control_type_invalid:["此字段需要 input/select/textarea，按钮需要 button 或按钮型 input。","Use input/select/textarea for fields and a button or button input for actions."],control_statically_unavailable:["HTML 中已禁用、隐藏或只读；需在对应动作前显示并启用，静态检查无法确认。","Initially disabled, hidden or readonly. Make it operable before its action; static checking cannot confirm this."],input_type_not_compatible:["该输入类型不能保留协议值；请使用文本、数字或含完整值的 select。","This input type cannot retain protocol values. Use text, number or a select with complete values."],operation_options_missing:["测试指令 select 缺少固定动作值；参照协议清单补全。","The instruction select lacks fixed operation values. Follow the protocol checklist."],html_node_limit:["HTML 超过 4096 个节点。请导出只包含预约流程的精简测试页。","HTML exceeds 4096 nodes. Export a smaller staging page containing only the booking flow."],html_depth_limit:["HTML 嵌套超过 64 层。请简化包装结构后重新选择文件。","HTML nesting exceeds 64 levels. Simplify wrappers, then choose the file again."],html_parse_unavailable:["无法解析 HTML。请重新导出 UTF-8 测试页面。","Could not parse HTML. Export the staging page again as UTF-8."],runtime_and_backend_not_executed:["未执行页面脚本、原生请求或后台；还需要实际运行与授权审核。","Page scripts, native requests and backend were not executed. Runtime testing and authorised review are still required."]};
const reasons:Record<SellerControlReason,[string,string]>={label_match:["关联标签","Associated label"],aria_match:["ARIA 标签","ARIA label"],name_match:["name 属性","name attribute"],id_match:["稳定 ID","Stable ID"],form_context:["所属表单","Form context"],control_type:["控件类型","Control type"],protocol_options:["固定协议选项","Fixed protocol options"],result_role:["结果语义","Result semantics"]};
function download(name:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadKitBytes(name:string,bytes:Uint8Array){const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:"application/zip"}));const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function SellerDomAdapterGuide({language}:{language:Language}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 const [state,rawDispatch]=useReducer(sellerOnboardingReducer,undefined,createSellerOnboardingState);
 const [kitBusy,setKitBusy]=useState(false),[kitNotice,setKitNotice]=useState("");
 const kitGeneration=useRef(0),kitAbort=useRef<AbortController|null>(null);
 useEffect(()=>()=>{++kitGeneration.current;kitAbort.current?.abort();},[]);
 function dispatch(action:SellerOnboardingAction){
  if(["step","report","config","select","confirm","example","file-start","file-ready","file-error"].includes(action.type)){++kitGeneration.current;kitAbort.current?.abort();kitAbort.current=null;setKitBusy(false);setKitNotice("");}
  rawDispatch(action);
 }
 const fileGeneration=useRef(0),fileInput=useRef<HTMLInputElement>(null);
 const {step,config,html,filename,report,notice,discovery,reading}=state;
 const confirmedCount=confirmedOnboardingCount(state);
 async function downloadCompleteKit(){
  if(kitBusy||reading||!report?.configurationValid)return;
  const generation=++kitGeneration.current,controller=new AbortController();kitAbort.current?.abort();kitAbort.current=controller;setKitBusy(true);setKitNotice("");
  try{
   const kit=await buildSellerOnboardingKit(structuredClone(config),{origin:location.origin,signal:controller.signal});
   if(generation!==kitGeneration.current||controller.signal.aborted)return;
   downloadKitBytes(kit.name,kit.bytes);setKitNotice(tr("完整准备包已生成并交给浏览器下载。ZIP SHA-256：","The complete preparation kit was generated and sent to your browser for download. ZIP SHA-256: ")+kit.sha256);
  }catch{if(generation===kitGeneration.current&&!controller.signal.aborted)setKitNotice(tr("准备包未生成。依赖下载或校验未通过，请重试；当前控件映射已保留。","The kit was not generated. Dependency download or verification failed. Retry; your current control mappings are retained."));}
  finally{if(generation===kitGeneration.current){setKitBusy(false);kitAbort.current=null;}}
 }
 function setField(key:string,value:string){dispatch({type:"config",config:withOnboardingField(config,key,value),field:key});}
 async function readHtml(file?:File){
  const generation=++fileGeneration.current;dispatch({type:"file-start",generation});
  if(!file){dispatch({type:"file-error",generation,message:""});return;}
  if(file.size>SELLER_ONBOARDING_DOCUMENT_LIMITS.maxBytes){dispatch({type:"file-error",generation,message:tr("HTML 文件超过 256 KiB。请导出精简测试页后重新选择。","HTML exceeds 256 KiB. Export a smaller staging page and choose it again.")});return;}
  try{
   const bytes=await file.arrayBuffer();
   if(generation!==fileGeneration.current)return;
   const text=decodeSellerOnboardingHtml(bytes);
   const found=await discoverSellerControls(text);
   if(generation!==fileGeneration.current)return;
   dispatch({type:"file-ready",generation,filename:file.name,html:text,discovery:found});
  }catch{
   if(generation===fileGeneration.current)dispatch({type:"file-error",generation,message:tr("无法读取 UTF-8 HTML。请重新导出 UTF-8 文件后选择。","Could not read UTF-8 HTML. Export the file as UTF-8 and choose it again.")});
  }
 }
 function runCheck(){
  try{dispatch({type:"report",generation:state.generation,revision:state.revision,report:checkSellerOnboarding(config,html)});dispatch({type:"step",step:1});}
  catch{dispatch({type:"notice",message:tr("预检未能完成。请简化 HTML 或修改配置后重试。","Preflight could not finish. Simplify the HTML or edit the configuration, then retry.")});}
 }
 const groups=[["create",tr("预约","Create")],["cancel",tr("取消","Cancel")],["move",tr("改期","Move")],["retry",tr("重试与结果","Retry and result")]];
 return <details className="seller-integration-guide"><summary>{tr("把现有预约网页接入检验","Connect an existing booking page")}</summary>
  <p>{tr("先选择你的测试网页，确认页面里哪些控件用于预约、取消和改期，再检查并下载接入准备文件。","Choose your staging page, confirm which controls create, cancel and move bookings, then check and download preparation files.")}</p>
  <div className="seller-onboarding">
   <nav className="seller-onboarding-steps" aria-label={tr("接入准备步骤","Integration preparation steps")}>{[tr("1 选页面与确认控件","1 Choose page and confirm"),tr("2 本地预检","2 Local preflight"),tr("3 下载准备文件","3 Preparation files")].map((name,i)=><button key={i} type="button" aria-current={step===i?"step":undefined} onClick={()=>dispatch({type:"step",step:i})}>{name}</button>)}</nav>
   {step===0&&<div>
    <div className="seller-onboarding-file"><label>{tr("选择本地测试 HTML","Choose local staging HTML")}<input ref={fileInput} type="file" accept=".html,.htm,text/html" onChange={e=>{const file=e.target.files?.[0];e.target.value="";void readHtml(file);}}/></label><small>{tr("仅在本机解析；不上传、不执行脚本、不访问网址。","Parsed locally; no upload, scripts or URL requests.")}</small></div>
    <div role="status" aria-live="polite" className="seller-onboarding-state">{reading?tr("正在读取页面并查找候选…","Reading the page and finding candidates…"):filename?<>{filename}{" · "}{tr(`已明确确认 ${confirmedCount}/13 项`,`Explicitly confirmed ${confirmedCount}/13 controls`)}</>:tr("从你自己的隔离测试页面开始；不要选择含客户资料或密钥的文件。","Start with your own isolated staging page. Exclude customer data and secrets.")}</div>
    {discovery&&!discovery.validDocument&&<p role="alert" className="seller-onboarding-note">{explanations[discovery.documentIssue??""]?tr(...explanations[discovery.documentIssue!]):tr("无法分析此页面。请重新导出精简 UTF-8 HTML。","Could not analyse this page. Export smaller UTF-8 HTML.")}</p>}
    {discovery?.validDocument&&<>
     <p className="seller-onboarding-note">{tr("候选仅为 HTML 标签和属性的预览，点击确认后才应用映射。唯一候选会先展示供核对；多个候选需自行选择。它们不证明实际可见、按钮可用或后台成功。","These suggestions are previews; mappings apply only after Confirm. A unique candidate is shown for review; choose among multiple candidates yourself. Suggestions do not prove visibility, working buttons or backend success.")}</p>
     <div className="seller-onboarding-candidates">{discovery.fields.map(field=>{
      const chosen=field.candidates.find(candidate=>candidate.id===state.selected[field.key]),confirmed=state.confirmed[field.key]?.candidateId===chosen?.id&&Boolean(chosen);
      return <section key={field.key} className="seller-onboarding-candidate" data-confirmed={confirmed||undefined}>
       <div className="seller-onboarding-candidate-heading"><strong>{tr(...fieldNames[field.key])}</strong><span>{confirmed?tr("已确认","Confirmed"):field.state==="ambiguous"?tr("多个候选，需判断","Multiple candidates"):field.candidates.length?tr("待确认","Review required"):tr("待补充","Unresolved")}</span></div>
       {field.candidates.length>0?<>
        <label className="seller-onboarding-candidate-select">{tr("页面控件候选","Suggested page control")}<select value={state.selected[field.key]??""} onChange={e=>dispatch({type:"select",key:field.key,candidateId:e.target.value})}><option value="">{tr("选择并核对一个候选","Choose and review a candidate")}</option>{field.candidates.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.label||candidate.tagName}{candidate.formLabel?` (${candidate.formLabel})`:""}{` — ${candidate.selector}`}</option>)}</select></label>
        {chosen&&<div className="seller-onboarding-candidate-source"><code>{chosen.selector}</code><small>{tr("源码行","Source line")} {chosen.source.line}{tr("；依据：","; based on: ")}{chosen.reasons.map(reason=>tr(...reasons[reason])).join(tr("、",", "))}{chosen.formLabel?tr(`；表单：${chosen.formLabel}`,`; form: ${chosen.formLabel}`):""}</small></div>}
        <button className="seller-onboarding-confirm" type="button" disabled={!chosen||confirmed} onClick={()=>chosen&&dispatch({type:"confirm",key:field.key,candidateId:chosen.id})}>{confirmed?tr("已确认此控件","Control confirmed"):tr("确认此控件","Confirm this control")}</button>
       </>:<p><small>{field.reason==="candidate_limit"?tr("候选过多。给目标控件添加清楚的标签或唯一 ID，再重新选择 HTML。","Too many candidates. Add a clear label or unique ID, then choose the HTML again."):field.key.endsWith("requestOperation")?tr("未找到含全部固定动作值的测试指令 select。请按协议清单补充后重新选择 HTML；普通预约选项不能代替测试指令。","No instruction select contains all required fixed operations. Add it using the protocol checklist, then choose the HTML again. Ordinary booking options cannot replace test instructions."):tr("没有找到可唯一定位的合适控件。请添加明确标签和稳定 ID，或展开高级配置手工映射；动态控件需另行运行验证。","No suitable uniquely selectable control found. Add a clear label and stable ID, or map it in advanced configuration. Dynamic controls need runtime verification.")}</small></p>}
      </section>;
     })}</div>
     <div className="seller-onboarding-actions"><button type="button" onClick={runCheck}>{confirmedCount===13?tr("检查已确认的控件","Check confirmed controls"):tr("检查当前映射与缺项","Check current mappings and gaps")}</button><a href="https://github.com/kangshuming0111-ctrl/proofbeforepay/blob/codex/public-release/examples/seller-lifecycle-staging/README.md" target="_blank" rel="noreferrer">{tr("固定协议说明","Fixed protocol reference")}</a></div>
    </>}
   </div>}
   {step===1&&<div>
    <div className="seller-onboarding-actions"><button type="button" disabled={reading} onClick={runCheck}>{tr("重新检查当前配置","Check current configuration")}</button><button className="seller-onboarding-secondary" type="button" onClick={()=>dispatch({type:"step",step:0})}>{tr("返回确认控件","Back to controls")}</button></div>
    {report?<div aria-live="polite"><p className="seller-onboarding-state">{report.staticMarkupReady?tr("静态控件匹配完成，尚未运行网站。","Static controls matched; the website has not run."):report.configurationValid?tr("配置格式正确，请处理下列问题或待验证项。","Configuration shape is valid. Address the issues or unknowns below."):tr("配置需要修正。确认遗漏的控件，或展开高级配置。","Configuration needs correction. Confirm missing controls or open advanced configuration.")}</p><ul className="seller-onboarding-results">{report.checks.map((check,i)=><li key={i} data-status={check.status}><span>{fieldNames[check.key]?tr(...fieldNames[check.key]):check.key==="configuration"?tr("配置","Configuration"):tr("验证范围","Verification scope")}{check.matches!==undefined?` (${check.matches})`:""}</span><span>{explanations[check.code]?tr(...explanations[check.code]):check.code}</span></li>)}</ul><div className="seller-onboarding-actions"><button type="button" onClick={()=>download("pbp-onboarding-check.json",JSON.stringify(report,null,2)+"\n","application/json")}>{tr("下载本次预检结果","Download this preflight result")}</button>{report.configurationValid&&<button type="button" onClick={()=>dispatch({type:"step",step:2})}>{tr("继续下载准备文件","Continue to preparation files")}</button>}</div></div>:<p role="status">{tr("文件或配置变化后，旧报告已失效。请检查当前配置。","After a file or configuration change, the old report is invalid. Check the current configuration.")}</p>}
    <p className="seller-onboarding-note">{tr("预检只解析本地 HTML。CSS 可见性、框架状态、按钮结果、原生 POST 请求与后台保存仍需实际运行验证。","Preflight only parses local HTML. CSS visibility, framework state, button results, native POST requests and backend storage still need runtime verification.")}</p>
   </div>}
   {step===2&&<div>
    <p>{tr("下载一个完整 ZIP：包含当前配置、连接代码、SDK、桥接模块与 SHA-256 校验清单。按 PBP-SETUP.md 对接原生处理；生成文件不会自动完成 POST、后台保存、测试站注册或审核。","Download one complete ZIP with your current configuration, connector, SDK, bridge and SHA-256 manifest. Connect native handlers using PBP-SETUP.md. Generating these files does not perform POST requests, save backend records, register or approve staging.")}</p>
    <div className="seller-onboarding-actions"><button type="button" disabled={!report?.configurationValid||reading||kitBusy} onClick={()=>void downloadCompleteKit()}>{kitBusy?tr("正在下载并校验依赖…","Downloading and verifying dependencies…"):tr("下载完整接入准备包（ZIP）","Download complete preparation kit (ZIP)")}</button></div>
    {kitNotice&&<p className="seller-onboarding-state" role="status">{kitNotice}</p>}
    <details><summary>{tr("只下载配置模板（不含依赖）","Individual templates (dependencies excluded)")}</summary><div className="seller-onboarding-actions">{["pbp-onboarding.json","pbp-connect.mjs","PBP-SETUP.md","pbp-protocol-checklist.md"].map(name=><button key={name} type="button" disabled={!report?.configurationValid||reading||kitBusy} onClick={()=>{try{const file=buildSellerOnboardingFiles(config).find(file=>file.name===name)!;download(file.name,file.content,file.type);}catch{dispatch({type:"notice",message:tr("配置已失效，请返回重新预检。","Configuration is no longer valid. Run preflight again.")});}}}>{name}</button>)}</div></details>
    {!report?.configurationValid&&<p role="status">{tr("先到第二步检查当前配置，再下载。","Check the current configuration in step 2 before downloading.")}</p>}
    <p><small>{tr("接入后仍须验证原生完成通知、实际后台协议和授权审核。预检不代表接入完成；买家另行验收和付款。","After integration, native completion, the real backend protocol and authorised review still need verification. Preflight does not mean integration is complete. The buyer separately accepts and pays.")}</small></p>
   </div>}
   <details className="seller-onboarding-advanced"><summary>{tr("高级：手工配置与接入设置","Advanced: manual mapping and setup")}</summary>
    <p><small>{tr("供开发者调整。手工配置可以不选 HTML，下载的仍仅为准备模板。修改任意配置会使旧预检结果失效；修改控件映射会撤销该项候选确认。","For developer adjustments. Manual preparation works without HTML; downloads remain preparation templates. Every configuration edit invalidates the preflight; editing a mapping revokes its candidate confirmation.")}</small></p>
    <div className="seller-onboarding-fields"><label className="seller-onboarding-wide">{tr("允许连接的主站来源","Allowed main-site origin")}<input value={config.parentOrigin} maxLength={200} onChange={e=>dispatch({type:"config",config:{...config,parentOrigin:e.target.value}})}/></label><label>{tr("同源测试后端目录","Same-origin backend directory")}<input value={config.backendBasePath} maxLength={160} onChange={e=>dispatch({type:"config",config:{...config,backendBasePath:e.target.value}})}/></label><label>{tr("前端版本名","Frontend revision")}<input value={config.frontendRevision} maxLength={80} onChange={e=>dispatch({type:"config",config:{...config,frontendRevision:e.target.value}})}/></label></div>
    {groups.map(([group,label])=><details key={group}><summary>{label}</summary><div className="seller-onboarding-fields">{ONBOARDING_SELECTOR_FIELDS.filter(key=>key.startsWith(group+".")||group==="retry"&&key==="result").map(key=><label key={key}>{tr(...fieldNames[key])}<input value={onboardingFieldValue(config,key)} maxLength={200} spellCheck={false} onChange={e=>setField(key,e.target.value)}/></label>)}</div></details>)}
    <p><small>{tr("支持标签、#id、.class、[属性]、[属性=值]、后代与 > 子代组合，最多四段。示例配置仅对应虚构示例，不适用于你的页面。","Supports tags, #id, .class, [attribute], [attribute=value], descendant and > child combinators, up to four parts. Example mappings refer only to the fictional sample, not your page.")}</small></p>
    <div className="seller-onboarding-actions"><button type="button" disabled={reading} onClick={runCheck}>{tr("检查手工配置","Check manual configuration")}</button><button className="seller-onboarding-secondary" type="button" disabled={reading} onClick={()=>dispatch({type:"example"})}>{tr("载入虚构示例映射","Load fictional example mappings")}</button></div>
   </details>
   {notice&&<p role="alert">{notice}</p>}
  </div>
  <details><summary>{tr("SDK、完整源码与技术边界","SDK, full source and technical limits")}</summary><p><a href="/sdk/seller-dom-adapter.mjs" download>{tr("下载 DOM 适配器","Download the DOM adapter")}</a>{" · "}<a href="https://github.com/kangshuming0111-ctrl/proofbeforepay/tree/codex/public-release/examples/seller-lifecycle-staging/frontend/bridge.mjs" target="_blank" rel="noreferrer">{tr("取得 bridge.mjs","Get bridge.mjs")}</a>{" · "}<a href="https://github.com/kangshuming0111-ctrl/proofbeforepay/tree/codex/public-release/examples/seller-dom-staging" target="_blank" rel="noreferrer">{tr("查看完整接入示例","Read the full integration example")}</a>{" · "}<a href="https://proofbeforepay-verification-lab.blueheron8.chatgpt.site/seller-adapter/fixed/index.html" target="_blank" rel="noreferrer">{tr("打开虚构动态表单","Open the fictional dynamic form")}</a></p><p><small>{tr("需要卖家配合固定预约协议；不是任意 React／WordPress 网站自动扫描。DOM 与请求日志仍是卖家端观测，不证明部署源码或后台真实性。静态交付预览继续禁用脚本；验收与付款由买家另行决定。","Seller cooperation with the bounded booking protocol is required; this is not an arbitrary React/WordPress scanner. DOM and journals remain seller-controlled observations, not deployment or backend authenticity proof. Static previews still disable scripts. The buyer separately decides acceptance and payment.")}</small></p></details>
  <DeliveryStageEvidence language={language}/>
 </details>;
}
