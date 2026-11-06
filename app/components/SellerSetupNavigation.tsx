"use client";
import {useState} from "react";
import type {Language} from "@/lib/contracts";

export type SellerSetupStep="scope"|"controls"|"application"|"run";
export const SELLER_SETUP_TARGETS:Record<SellerSetupStep,string>={scope:"#journey-supported-scope",controls:"#seller-dom-setup",application:"#seller-integration-applications",run:"#journey-run-setup"};
const steps:{id:SellerSetupStep;zh:string;en:string}[]=[{id:"scope",zh:"1 核对是否适用",en:"1 Check supported scope"},{id:"controls",zh:"2 确认控件与下载",en:"2 Map controls and download"},{id:"application",zh:"3 提交测试站资料",en:"3 Submit staging details"},{id:"run",zh:"4 查看运行条件",en:"4 Review run prerequisites"}];

/** Navigation only. These steps are instructions, never completion evidence. */
export function SellerSetupNavigation({language,onNavigate}:{language:Language;onNavigate:(step:SellerSetupStep)=>boolean}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en,[notice,setNotice]=useState("");
 return <div className="seller-setup-navigation">
  <p>{tr("普通网站文件交付可跳过此区。本向导只覆盖开发者接入自有预约后台；咨询保存等其他检查请使用相应工具，未覆盖行为仍需人工核对。","Skip this area for ordinary website-file delivery. This guide covers developer integration of a booking backend. Use the relevant tools for other supported checks, such as enquiry storage; behavior outside their coverage still needs human review.")}</p>
  <nav aria-label={tr("预约后台接入准备","Booking backend preparation")} className="seller-onboarding-steps">{steps.map(step=><button type="button" key={step.id} onClick={()=>setNotice(onNavigate(step.id)?tr(`已定位：${step.zh}。请查看该区实际状态。`,`Opened: ${step.en}. Read the actual state in that section.`):tr("当前无法定位这一步，请展开下方对应说明；没有运行测试或更改任何同意项。","This step could not be located. Open its instructions below; no test ran and no consent changed."))}>{language==="zh"?step.zh:step.en}</button>)}</nav>
  <p className="form-help">{tr("步骤仅指引位置，不代表完成。查看和展开不会提交申请、采纳约定、运行测试、验收或付款。","These are directions, not completion status. Opening a section does not submit an application, adopt an agreement, run tests, accept work or pay.")}</p>
  {notice&&<p role="status" aria-live="polite" className="seller-setup-notice">{notice}</p>}
 </div>;
}
