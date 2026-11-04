import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
const source=await readFile(new URL("../app/components/RiskReviewPanel.tsx",import.meta.url),"utf8");
const a=source.indexOf("onSubmit={async e=>"),b=source.indexOf("}><label>",a);
assert.ok(a>=0&&b>a&&b-a<1500);
const submit=source.slice(a+"onSubmit={".length,b);
test("actual bilingual review submit retains reason on false or uncertainty and tells the user to verify before retry",async()=>{
 for(const language of["zh","en"])for(const result of["false","throw","true"]){let reason="Fictional source reproduction.",error="",saving=false,calls=0;const handler=new Function("deps",`const {busy,onSave,deliveryId,assessmentId,riskIndex,decision,reason,tr,setError,setSaving,setReason}=deps;const saving=false;return ${submit};`)({busy:false,deliveryId:"v1",assessmentId:"a1",riskIndex:0,decision:"needs_evidence",reason,tr:(zh:string,en:string)=>language==="zh"?zh:en,setError:(v:string)=>error=v,setSaving:(v:boolean)=>saving=v,setReason:(fn:(value:string)=>string)=>reason=fn(reason),onSave:async()=>{calls++;if(result==="throw")throw Error("connection lost after possible commit");return result==="true";}});
  await handler({preventDefault(){}});assert.equal(calls,1);assert.equal(saving,false);if(result==="true"){assert.equal(reason,"");assert.equal(error,"");}else{assert.equal(reason,"Fictional source reproduction.");assert.match(error,language==="zh"?/尚未确认保存.*刷新核对后再决定是否重试/u:/Saving has not been confirmed.*Refresh to check.*before deciding whether to retry/u);assert.ok(!error.includes("Not saved"));}
 }
});
test("rendered bilingual human review keeps ordinary/read-only boundaries and never implies acceptance or payment",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"pbp-risk-review-")),require=createRequire(import.meta.url);try{let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;output=output.replace("import '../risk-reviews.css';","");for(const name of["react","react/jsx-runtime"])output=output.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href)).replaceAll("'"+name+"'",JSON.stringify(pathToFileURL(require.resolve(name)).href));const file=path.join(dir,"risk.mjs");await writeFile(file,output);const {RiskReviewPanel}=await import(pathToFileURL(file).href);for(const language of["zh","en"]){const props={deliveryId:"v1",assessmentId:"a1",riskIndex:0,language,onSave:async()=>true};const normal=renderToStaticMarkup(createElement(RiskReviewPanel,props));assert.match(normal,/risk-review-form/u);assert.match(normal,language==="zh"?/此记录不代表验收或付款/u:/This record is not acceptance or payment/u);assert.ok(!renderToStaticMarkup(createElement(RiskReviewPanel,{...props,readOnly:true})).includes("risk-review-form"));}}
 finally{await rm(dir,{recursive:true,force:true});}
});
