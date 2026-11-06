/** Actual assessment and risk components compiled for controlled SSR QA.
 * Only the unrelated benchmark-summary child is omitted; no handler executes.
 */
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import ts from "typescript";
const root=path.resolve(import.meta.dirname,".."),require=createRequire(import.meta.url);
export async function assessmentComponentModule(inspectKeys=false){
 const dir=await mkdtemp(path.join(tmpdir(),"pbp-assessment-ui-")),file=(p:string)=>pathToFileURL(path.join(root,p)).href;
 const source=await readFile(path.join(root,"app/components/DeliveryAssessment.tsx"),"utf8");
 let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 output=output.replace('import "../assessment.css";','').replace(/import \{ AssessmentValidationPanel \} from "\.\/AssessmentValidationPanel";/u,'const AssessmentValidationPanel=()=>null;');
 if(inspectKeys)output=output.replace('import { useEffect, useId, useRef, useState } from "react";', 'const useEffect=()=>{};const useId=()=>"test-id";const useRef=()=>({current:null});const useState=value=>[value,()=>{}];');
 let reviewOutput=ts.transpileModule(await readFile(path.join(root,"app/components/RiskReviewPanel.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText.replace("import '../risk-reviews.css';","");
 for(const name of["react","react/jsx-runtime"])reviewOutput=reviewOutput.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href)).replaceAll("'"+name+"'",JSON.stringify(pathToFileURL(require.resolve(name)).href));
 await writeFile(path.join(dir,"risk-review.mjs"),reviewOutput);output=output.replaceAll('"./RiskReviewPanel"','"./risk-review.mjs"');
 let obligationOutput=ts.transpileModule(await readFile(path.join(root,"app/components/AssessmentObligations.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const name of["react","react/jsx-runtime"])obligationOutput=obligationOutput.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href));
 obligationOutput=obligationOutput.replaceAll('"@/lib/assessment-obligations"',JSON.stringify(file("lib/assessment-obligations.ts")));
 await writeFile(path.join(dir,"assessment-obligations.mjs"),obligationOutput);output=output.replaceAll('"./AssessmentObligations"','"./assessment-obligations.mjs"');
 for(const name of["react","react/jsx-runtime","lucide-react"])output=output.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href));
 for(const name of["delivery-overview","assessment-display","assessment-evidence-needs"])output=output.replaceAll(JSON.stringify("@/lib/"+name),JSON.stringify(file("lib/"+name+".ts")));
 output=output.replaceAll('"./assessment-feedback"',JSON.stringify(file("app/components/assessment-feedback.ts")));
 let riskOutput=ts.transpileModule(await readFile(path.join(root,"app/components/RiskRepairPanel.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText.replace('import "../risk-repairs.css";','');
 for(const name of["react","react/jsx-runtime"])riskOutput=riskOutput.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href));
 riskOutput=riskOutput.replaceAll('"@/lib/risk-repairs"',JSON.stringify(file("lib/risk-repairs.ts")));
 await writeFile(path.join(dir,"risk-repair.mjs"),riskOutput);output=output.replaceAll('"./RiskRepairPanel"','"./risk-repair.mjs"');
 const modulePath=path.join(dir,"assessment.mjs");await writeFile(modulePath,output);
 const loadedModule=await import(pathToFileURL(modulePath).href);return{Component:loadedModule.DeliveryAssessment,cleanup:()=>rm(dir,{recursive:true,force:true})};
}
