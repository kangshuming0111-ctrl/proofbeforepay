"use client";
import type {Language} from "@/lib/contracts";

export function SellerDomAdapterGuide({language}:{language:Language}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 return <details className="seller-integration-guide"><summary>{tr("把现有预约网页接入检验","Connect an existing booking page")}</summary>
  <p>{tr("卖家可以保留自己的表单与原生提交处理，用可配置的控件选择器连接现有预约检验。先在隔离测试站接入，再提交清单申请审核。","Keep the existing forms and native submit handlers. Map their controls with deployment-owned selectors, connect the supported booking checks on isolated staging, then submit the manifest for operator review.")}</p>
  <ol>
   <li>{tr("映射预约、取消、改期和原键重试按钮，以及结果区域。控件必须唯一、可见且可操作；执行前按需打开对应面板。","Map booking, cancellation, move and original-key retry controls plus the result region. Controls must be unique, visible and operable; reveal the relevant panel before execution.")}</li>
   <li>{tr("在原生操作完成时返回本次请求日志，并把结果区域标上动作序号。适配器真实填写和点击控件，不代替你的后台实现。","When a native action finishes, publish its request journal and stamp the result region with that action’s sequence. The adapter fills and clicks the actual controls; it does not implement your backend.")}</li>
   <li>{tr("将同源测试后端的原生字段映射到预约协议。通过审核后，主站另行读取收据、预约清单和人数，核对页面结果。","Map same-origin native staging fields to the booking protocol. After approval, the main server separately reads receipts, booking records and occupancy to reconcile the page result.")}</li>
  </ol>
  <p><a href="/sdk/seller-dom-adapter.mjs" download>{tr("下载 DOM 适配器","Download the DOM adapter")}</a>{" · "}<a href="https://github.com/kangshuming0111-ctrl/proofbeforepay/tree/codex/public-release/examples/seller-dom-staging" target="_blank" rel="noreferrer">{tr("查看接入源码与说明","Read integration source and instructions")}</a>{" · "}<a href="https://proofbeforepay-verification-lab.blueheron8.chatgpt.site/seller-adapter/fixed/index.html" target="_blank" rel="noreferrer">{tr("打开虚构动态表单","Open the fictional dynamic form")}</a></p>
  <p><small>{tr("当前适配的是固定预约操作协议，需要卖家接入；不是任意 React／WordPress 网站自动扫描。DOM 与请求日志仍是卖家端观测，不证明部署源码或后台真实性。静态交付预览继续禁用脚本；验收与付款仍由买家另行决定。","This adapter requires seller integration with the bounded booking protocol; it is not an arbitrary React/WordPress scanner. DOM and request journals remain seller-side observations, not deployed-source or backend-authenticity proof. Static delivery previews still disable scripts. The buyer separately decides acceptance and payment.")}</small></p>
 </details>;
}
