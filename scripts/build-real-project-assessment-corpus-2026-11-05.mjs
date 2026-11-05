/** Exact-commit public source acquisition only; never executes third-party code. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStaticProject } from '../lib/static-project.ts';
import { summaryCoverageUnits } from '../lib/requirement-coverage.ts';
import { validateProjectCorpus, prepareProjectEvaluation } from './run-project-assessment-evaluation.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const spec=JSON.parse(await readFile(path.join(root,'scripts/real-project-assessment-source-spec-2026-11-05.json'),'utf8'));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const archive=path.join(root,'public/benchmarks/real-projects-2026-11-05/source-provenance');
await mkdir(archive,{recursive:true});
const projects=[],origins=[];
for(const p of spec.projects){
 const files={},evidence=[]; let license='';
 for(const row of p.sourceFiles){
  const expected=`https://raw.githubusercontent.com/${p.repository}/${p.commit}/${row.upstreamPath}`;
  if(row.url!==expected||!/^https:\/\/raw\.githubusercontent\.com\/[A-Za-z0-9_./-]+$/u.test(expected))throw Error('Unexpected source URL');
  let bytes;
  if(process.argv.includes('--download'))bytes=execFileSync('curl',['--fail','--silent','--show-error','--max-time','30',expected],{maxBuffer:100_000});
  else bytes=await readFile(path.join(root,'outputs/real-projects-2026-11-05/raw-source',p.key,row.upstreamPath));
  if(bytes.length!==row.bytes||sha256(bytes)!==row.sha256)throw Error(`Pinned byte mismatch: ${p.id}/${row.upstreamPath}`);
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(!Buffer.from(text).equals(bytes))throw Error('UTF-8 round-trip mismatch');
  if(row.deliveryPath)files[row.deliveryPath]=text;else license=text;
  evidence.push({...row,byteIdentical:true});
 }
 if(!license.includes('MIT License')||!license.includes('Permission is hereby granted'))throw Error('Missing MIT notice');
 const manual=p.rows.slice(0,5),coverageRows=p.rows.slice(5),summary=coverageRows.map(r=>r[0]).join('\n');
 const units=summaryCoverageUnits(summary);
 if(units.length!==coverageRows.length||units.some((u,i)=>u.text!==coverageRows[i][0]))throw Error(`Coverage grouping must preserve authored requirements: ${p.id}`);
 const parsed=parseStaticProject({title:p.title,summary,amount:'1.00',requiredPages:['index.html'],manualRequirements:manual.map(r=>r[0]),coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(u=>({id:u.id,disposition:'include'}))}},p.language);
 const derived=parsed.criteria.filter(c=>/^(?:manual|coverage)-/u.test(c.id));
 const rows=[...manual,...coverageRows];
 projects.push({id:p.id,stratum:'boundary',language:p.language,title:p.title,summary,files,criteria:derived.map((c,i)=>({...c,reference:{expectedStatus:rows[i][1],rationale:rows[i][2],relevantFiles:rows[i][3],requiresSemanticReview:true}}))});
 await writeFile(path.join(archive,`${p.key}-LICENSE.txt`),license);
 await writeFile(path.join(archive,`${p.key}-original-html.json`),JSON.stringify({repository:p.repository,commit:p.commit,files},null,2)+'\n');
 origins.push({id:p.id,repository:`https://github.com/${p.repository}`,commit:p.commit,commitUrl:`https://github.com/${p.repository}/commit/${p.commit}`,license:'MIT',licensePreserved:`${p.key}-LICENSE.txt`,sourceKind:'Public template source, not a customer production delivery',selectionRoot:p.sourceFiles[0].upstreamPath.split('/')[0],pathPolicy:'Remove common dist/ or template/ prefix only; file contents are byte-identical and nested relative paths remain unchanged',selectedFiles:evidence,excludedDependencies:'All CSS, JavaScript, raster images, fonts, backend and remote services are outside the submitted HTML-only subset; source references remain intact',privacyReview:'Only public template demonstration business details, fictional sample names/amounts and public vendor contact links. No real customer data, credentials or authenticated URLs selected.',newRequirements:'Authored by Codex for this source evaluation; not original client requirements or project-author promises'});
}
const corpus={schema:'proofbeforepay-frozen-project-corpus-v1',cohort:'unseen-real-open-source-html-2026-11-05',scope:'Three previously untested public MIT template projects; byte-identical original HTML subsets, with 24 newly authored custom acceptance requirements. Source-only evaluation, not full-site execution, customer accuracy or real payment.',referenceMethod:'Pre-call source inspection by Codex. Five actual manual requirements plus three actual coverage groups per project derived by production intake. Each reference states source support, explicit mismatch or missing runtime/visual evidence. References never enter the provider packet.',projects};
validateProjectCorpus(corpus);
const corpusText=JSON.stringify(corpus,null,2)+'\n';
const prepared=await prepareProjectEvaluation(corpus,{corpusText});
const provenance={schema:'pbp-real-project-provenance-v1',verifiedOn:'2026-11-05',corpusSha256:sha256(corpusText),projectCount:projects.length,criterionCount:projects.reduce((n,p)=>n+p.criteria.length,0),newToPriorEvaluation:false,newProjectCount:2,previouslySeenProjectCount:1,exposureAudit:'real-project-assessment-exposure-audit-2026-11-05.json',metadataErratum:'Business Casual was already evaluated as adapted source. Frozen corpus and first provider attempts remain unchanged; metadata corrected after full baseline HEAD audit.',origins:origins.map(o=>({...o,priorExposure:o.id==='real-business-casual'?'previously-seen-repository-family':'no-record-in-tracked-baseline-history'})),selectionLimit:'Convenience selection of HTML templates: two projects share StartBootstrap authorship and Bootstrap conventions. Three repositories are not three independent customer deployments or a representative sample of production websites.',unmodifiedSource:true,providerCalls:0,requestPlans:prepared.prepared.map(p=>({id:p.project.id,files:Object.keys(p.project.files).length,requestUtf8Bytes:p.plan.requestUtf8Bytes,outputTokenLimit:p.plan.outputTokenLimit})),licenseSources:origins.map(o=>o.repository+'/blob/'+o.commit+'/LICENSE')};
await writeFile(path.join(root,'scripts/real-project-assessment-corpus-2026-11-05.json'),corpusText);
await writeFile(path.join(root,'scripts/real-project-assessment-provenance-2026-11-05.json'),JSON.stringify(provenance,null,2)+'\n');
console.log(JSON.stringify({projects:provenance.projectCount,criteria:provenance.criterionCount,corpusSha256:provenance.corpusSha256,providerCalls:0,requestPlans:provenance.requestPlans}));
