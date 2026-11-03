"use client";
import {useState} from "react";
import type {Language} from "@/lib/contracts";
import {JOURNEY_INTEGRATION_TEMPLATE,parseJourneyIntegrationManifest,type JourneyIntegrationPreflight} from "@/lib/journey-integration-preflight";

/** Local declaration checks do not register, fetch or trust a seller website. */
export function SellerIntegrationGuide({language}:{language:Language}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 const [text,setText]=useState(JSON.stringify(JOURNEY_INTEGRATION_TEMPLATE,null,2)),[result,setResult]=useState<JourneyIntegrationPreflight>();
 function download(){const url=URL.createObjectURL(new Blob([text],{type:"application/json"})),link=document.createElement("a");link.href=url;link.download="proofbeforepay-staging-manifest.json";link.click();URL.revokeObjectURL(url);}
 return <details className="seller-integration-guide"><summary>{tr("卖家接入自检（开发者）","Seller integration self-check (developers)")}</summary>
  <p>{tr("把你的网站原生字段映射成验收协议。可参考独立的 Python／SQLite 花艺工作坊站，也可接入自己的技术栈。","Map your website’s native fields to the acceptance protocol. Use the separate Python/SQLite workshop as a reference, or connect your own stack.")}</p>
  <ol><li>{tr("准备只含虚构数据的独立测试部署。","Prepare a separate staging deployment with fictional data only.")}</li><li>{tr("填写字段映射、前端与后端地址，然后在本页检查清单。","Fill in native mappings and frontend/backend URLs, then check this manifest.")}</li><li>{tr("把清单交给项目运营方核准；核准后，再在本交付版本运行检查。","Request operator approval, then run checks against this delivery after registration.")}</li></ol>
  <label>{tr("测试站接入清单 JSON","Staging integration manifest JSON")}<textarea value={text} maxLength={16384} rows={8} spellCheck={false} onChange={e=>{setText(e.target.value);setResult(undefined);}}/></label>
  <div className="journey-integration-actions"><button className="button primary" onClick={()=>setResult(parseJourneyIntegrationManifest(text))}>{tr("检查接入清单","Check integration manifest")}</button><button className="subtle-button" onClick={download}>{tr("下载清单","Download manifest")}</button><button className="subtle-button" onClick={()=>{setText(JSON.stringify(JOURNEY_INTEGRATION_TEMPLATE,null,2));setResult(undefined);}}>{tr("恢复模板","Reset template")}</button></div>
  {result&&<div role="status"><strong>{result.canRequestRegistration?tr("清单自洽，可以准备申请登记","Manifest is consistent; prepare a registration request"):tr("先修正以下接入问题","Fix these integration issues first")}</strong><ul>{result.checks.map(check=><li key={check.id}><strong>{check.status==="error"?tr("需修正","Fix"):check.status==="warning"?tr("注意","Note"):tr("配置有效","Valid")}</strong>: {language==="zh"?check.messageZh:check.message}</li>)}</ul></div>}
  <p><small>{tr("清单只在浏览器内解析，不会发送或访问网址。通过自检不等于已登记、已运行、部署源码已验证或业务测试通过。真实客户权限仍需单独检查。","The manifest is parsed locally without sending it or fetching URLs. Passing does not register a site, run tests, verify deployed source or prove business correctness. Real customer permissions need separate checks.")}</small></p>
 </details>;
}
