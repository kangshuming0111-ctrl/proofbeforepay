import {TASKS,validateFirstUseSession} from './first-use-session.mjs';
export type GuidePersona='buyer'|'technical_seller';
export type GuideOutcome='completed'|'blocked'|'abandoned';
export type GuideBlocker='none'|'unclear_next_step'|'unclear_evidence'|'setup'|'authorization'|'runtime_failure'|'other';
type Task={id:string;startedAt:string;endedAt:string;outcome:GuideOutcome;helpCount:number;blockerCode:GuideBlocker;note:string};
export type FirstUseGuide={sessionId:string;participantCode:string;persona:GuidePersona;buildTag:string;wallStart:number;monoStart:number;lastMono:number;tasks:Task[];active?:{id:string;startedAt:string;helpCount:number}};
const BLOCKERS=['none','unclear_next_step','unclear_evidence','setup','authorization','runtime_failure','other'];
function at(run:FirstUseGuide,mono:number){if(!Number.isFinite(mono)||mono<run.lastMono||mono-run.monoStart>8*3600000)throw Error('INVALID_GUIDE_CLOCK');return new Date(run.wallStart+Math.round(mono-run.monoStart)).toISOString();}
export function createFirstUseGuide(input:{sessionId:string;participantCode:string;persona:GuidePersona;buildTag:string;wallStart:number;monoStart:number}):FirstUseGuide{
 if(!/^session-[a-z0-9-]{1,60}$/u.test(input.sessionId)||!/^p-[a-z0-9]{6,20}$/u.test(input.participantCode)||!Object.hasOwn(TASKS,input.persona)||!/^[a-zA-Z0-9._-]{1,80}$/u.test(input.buildTag)||!Number.isFinite(input.wallStart)||input.wallStart<0||input.wallStart>253402214400000||!Number.isFinite(input.monoStart)||input.monoStart<0)throw Error('INVALID_GUIDE');
 return {...input,lastMono:input.monoStart,tasks:[]};
}
export function beginGuideTask(value:FirstUseGuide,mono:number):FirstUseGuide{
 const timestamp=at(value,mono);if(value.active||value.tasks.length>=TASKS[value.persona].length)throw Error('GUIDE_TASK_NOT_AVAILABLE');
 const run=structuredClone(value);run.active={id:TASKS[run.persona][run.tasks.length],startedAt:timestamp,helpCount:0};run.lastMono=mono;return run;
}
export function noteGuideHelp(value:FirstUseGuide,mono:number):FirstUseGuide{
 at(value,mono);if(!value.active||value.active.helpCount>=20)throw Error('GUIDE_HELP_NOT_AVAILABLE');const run=structuredClone(value);run.active!.helpCount++;run.lastMono=mono;return run;
}
export function finishGuideTask(value:FirstUseGuide,outcome:GuideOutcome,blocker:GuideBlocker,mono:number):FirstUseGuide{
 const timestamp=at(value,mono);if(!value.active||!['completed','blocked','abandoned'].includes(outcome)||!BLOCKERS.includes(blocker)||outcome!=='completed'&&blocker==='none')throw Error('GUIDE_OUTCOME_NEEDS_REASON');
 const run=structuredClone(value);run.tasks.push({...run.active!,endedAt:timestamp,outcome,blockerCode:outcome==='completed'?'none':blocker,note:''});delete run.active;run.lastMono=mono;return run;
}
export function repeatLastGuideTask(value:FirstUseGuide,mono:number):FirstUseGuide{
 const timestamp=at(value,mono);if(value.active||!value.tasks.length)throw Error('GUIDE_TASK_NOT_AVAILABLE');
 const run=structuredClone(value),previous=run.tasks.pop()!;run.active={id:previous.id,startedAt:timestamp,helpCount:0};run.lastMono=mono;return run;
}
/** Always an operator walkthrough. This UI does not attest that a stranger
 * participated, collect personal data, or manufacture human-study eligibility. */
export function exportFirstUseGuide(value:FirstUseGuide,mono:number){
 if(!Number.isFinite(mono)||mono<value.lastMono)throw Error('INVALID_GUIDE_CLOCK');
 const endedAt=at(value,value.lastMono);if(value.active||value.tasks.length!==TASKS[value.persona].length)throw Error('GUIDE_INCOMPLETE');
 return validateFirstUseSession({schema:'proofbeforepay-first-use-session-v1',sessionId:value.sessionId,mode:'operator_walkthrough',persona:value.persona,participantCode:value.participantCode,unfamiliarWithProject:false,externalParticipant:false,consent:{status:'not_requested',recordedAt:null},buildTag:value.buildTag,startedAt:new Date(value.wallStart).toISOString(),endedAt,tasks:structuredClone(value.tasks)});
}
export const GUIDE_TASK_COPY:Record<string,{zh:[string,string];en:[string,string]}>={
 'create-requirements':{zh:['核对并确认要求','打开自己的项目或虚构样例，核对范围和验收标准。合同可选；只确认你理解的要求。'],en:['Check and confirm requirements','Open your project or a fictional sample. Check scope and criteria; a contract is optional. Confirm only wording you understand.']},
 'interpret-evidence':{zh:['分清已发现问题与未验证项','打开一项差异的原始依据，再找出一项证据不足的内容，说明还缺什么。'],en:['Distinguish findings from unknowns','Inspect the original evidence for one difference, then identify one unverified item and what evidence it still needs.']},
 'request-revision':{zh:['准备具体修改意见','将对应要求和补证下一步加入可编辑草稿，核对文字。本任务无需发送、验收或付款。'],en:['Prepare specific revision feedback','Add the requirement and next evidence step to an editable draft and inspect it. Sending, acceptance and payment are not required for this task.']},
 'integrate-staging':{zh:['准备测试站接入','按接入指南准备受控测试站或分层探针，分清已适配、人工和不支持的步骤；没有测试环境可记录受阻。'],en:['Prepare staging integration','Follow the guide for controlled staging or a stage probe. Distinguish adapted, manual and unsupported steps; record a blocker if no test environment is available.']},
 'submit-delivery':{zh:['提交文件与交付说明','在卖家端保存实际交付文件，填写说明并提交供买家核对。请使用虚构测试项目体验。'],en:['Submit files and a delivery note','Save the delivered files in the seller workspace, add a note and submit for buyer review. Use a fictional test project for this walkthrough.']},
 'repair-and-retest':{zh:['回应反馈并同项复测','对照一条已保存反馈准备修订版，再核对同一个要求。没有反馈或环境时记录受阻。'],en:['Respond and retest the same requirement','Prepare a revision for one saved feedback item, then inspect the same requirement again. Record a blocker when feedback or an environment is unavailable.']},
};
