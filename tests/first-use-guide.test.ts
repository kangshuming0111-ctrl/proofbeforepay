import assert from 'node:assert/strict';
import test from 'node:test';
import {createFirstUseGuide,beginGuideTask,noteGuideHelp,finishGuideTask,repeatLastGuideTask,exportFirstUseGuide,GUIDE_TASK_COPY} from '../lib/first-use-guide.ts';
import {summarizeFirstUseSessions,validateFirstUseSession} from '../lib/first-use-session.mjs';
const make=(persona:'buyer'|'technical_seller'='buyer')=>createFirstUseGuide({sessionId:'session-local-guide',participantCode:'p-anonymous12',persona,buildTag:'full-gap-2026-11-06',wallStart:Date.parse('2026-11-06T00:00:00.000Z'),monoStart:100});
test('both complete guided personas export unchanged strict v1 operator records and never human statistics',()=>{
 for(const persona of ['buyer','technical_seller'] as const){let run=make(persona);for(let i=0;i<3;i++){run=beginGuideTask(run,100+i*10000);run=finishGuideTask(run,'completed','none',100+i*10000+5000);}const result=exportFirstUseGuide(run,31000);assert.equal(result.mode,'operator_walkthrough');assert.equal(result.unfamiliarWithProject,false);assert.equal(result.externalParticipant,false);assert.deepEqual(validateFirstUseSession(result),result);assert.throws(()=>summarizeFirstUseSessions([result]),/NO_HUMAN_FIRST_USE_SESSIONS/);assert.equal(JSON.stringify(result).includes('monotonic'),false);assert.ok(result.tasks.every((t:{id:string})=>GUIDE_TASK_COPY[t.id]));}
});
test('help and blockers remain distinct; missing task or reason refuses export instead of faking completion',()=>{
 const original=make(),active=beginGuideTask(original,100);assert.equal(original.active,undefined);const helped=noteGuideHelp(active,200);assert.equal(active.active!.helpCount,0);assert.equal(helped.active!.helpCount,1);assert.throws(()=>finishGuideTask(helped,'blocked','none',300),/NEEDS_REASON/);const blocked=finishGuideTask(helped,'blocked','setup',300);assert.equal(blocked.tasks[0].helpCount,1);assert.equal(blocked.tasks[0].blockerCode,'setup');assert.throws(()=>exportFirstUseGuide(blocked,400),/INCOMPLETE/);assert.throws(()=>beginGuideTask(active,300),/NOT_AVAILABLE/);
});
test('monotonic clock rollback, nonfinite values and over-eight-hour attempts are rejected',()=>{
 const run=beginGuideTask(make(),200);for(const time of [199,NaN,Infinity,100+8*3600000+1])assert.throws(()=>finishGuideTask(run,'completed','none',time),/INVALID_GUIDE_CLOCK/);
});
test('wall times are anchored once and derived from actual monotonic elapsed time',()=>{
 let r=make();r=beginGuideTask(r,1100);r=finishGuideTask(r,'completed','none',6100);assert.equal(r.tasks[0].startedAt,'2026-11-06T00:00:01.000Z');assert.equal(r.tasks[0].endedAt,'2026-11-06T00:00:06.000Z');
});
test('the pre-existing CLI reexports the exact shared validators',async()=>{
 const cli=await import('../scripts/record-first-use-session.mjs');assert.equal(cli.validateFirstUseSession,validateFirstUseSession);assert.equal(cli.summarizeFirstUseSessions,summarizeFirstUseSessions);
});
test('actual bilingual component includes privacy, local clearing and non-human claim boundaries',async()=>{
 const fs=await import('node:fs/promises'),ts=await import('typescript'),{renderToStaticMarkup}=await import('react-dom/server'),React=await import('react');let source=await fs.readFile(new URL('../app/components/FirstUseGuide.tsx',import.meta.url),'utf8');
 source=source.replace(/import '\.\/first-use-guide\.css';/u,'').replace("from 'react'",`from ${JSON.stringify(import.meta.resolve('react'))}`).replace("from '@/lib/first-use-guide'",`from ${JSON.stringify(new URL('../lib/first-use-guide.ts',import.meta.url).href)}`);
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText.replace('from "react/jsx-runtime"',`from ${JSON.stringify(import.meta.resolve('react/jsx-runtime'))}`),module=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
 for(const language of ['zh','en']){const html=renderToStaticMarkup(React.createElement(module.FirstUseGuide,{language}));assert.match(html,language==='zh'?/不计入真人研究统计/:/excluded from human-study totals/);assert.match(html,language==='zh'?/刷新会清除/:/Refresh clears/);assert.match(html,/first-use-guide/);}
});

test('completed sessions can be downloaded after idle time without inventing an overlong session',()=>{let r=make();for(let i=0;i<3;i++){r=beginGuideTask(r,100+i*1000);r=finishGuideTask(r,'completed','none',600+i*1000);}assert.equal(exportFirstUseGuide(r,9*3600000).endedAt,'2026-11-06T00:00:02.500Z');});
test('redo replaces only the local last result and starts a fresh timed attempt',()=>{let r=beginGuideTask(make(),100);r=finishGuideTask(r,'blocked','setup',500);const again=repeatLastGuideTask(r,1000);assert.equal(r.tasks.length,1);assert.equal(again.tasks.length,0);assert.equal(again.active!.id,r.tasks[0].id);assert.equal(again.active!.helpCount,0);assert.equal(again.active!.startedAt,'2026-11-06T00:00:00.900Z');});
