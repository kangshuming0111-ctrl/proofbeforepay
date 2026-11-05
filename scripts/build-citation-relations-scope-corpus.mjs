import {writeFile} from 'node:fs/promises';
import {parseStaticProject} from '../lib/static-project.ts';
import {summaryCoverageUnits} from '../lib/requirement-coverage.ts';
const html=body=>`<!doctype html><html><head><title>Menu board</title></head><body><h1>Menu board</h1>${body}</body></html>`;
const scenarios=[
 ['scoped-two-pages-correct','<p>Tea AUD 18</p>','supported'],
 ['scoped-target-price-wrong','<p>Tea AUD 16</p>','changes_suggested'],
 ['scoped-neighbour-price-borrow','<p>Tea AUD 16</p><p>Coffee AUD 18</p>','changes_suggested'],
 ['scoped-table-row-correct','<table><tbody><tr><td>Tea</td><td>AUD 18</td></tr></tbody></table>','supported'],
 ['scoped-table-cross-row','<table><tbody><tr><td>Tea</td><td>AUD 16</td></tr><tr><td>Coffee</td><td>AUD 18</td></tr></tbody></table>','changes_suggested'],
 ['scoped-merged-row-uncertain','<table><tbody><tr><td rowspan="2">Tea</td><td>AUD 18</td></tr><tr><td>AUD 28</td></tr></tbody></table>','insufficient_evidence'],
];
const summary='Display Tea prices on both agreed menu pages.',unit=summaryCoverageUnits(summary)[0];
const projects=scenarios.map(([id,body,expectedStatus])=>{
 const businessChecks={confirmed:true,items:['index.html','menu.html'].map((file,i)=>({id:`business-${i+1}`,criterionId:'coverage-1',file,source:{start:unit.start,end:unit.end,excerpt:unit.text},expected:{kind:'item_price',label:'Tea',currency:'AUD',amountMinor:1800}}))};
 const requiredPages=['index.html','menu.html'],p=parseStaticProject({title:'Scoped menu evidence',summary,amount:'1.00',requiredPages,manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:unit.id,disposition:'include'}]},businessChecks},'en');
 return{id,stratum:expectedStatus==='supported'?'clean':expectedStatus==='changes_suggested'?'mismatch':'boundary',language:'en',title:p.title,summary,requiredPages,businessChecks,files:{'index.html':html('<p>Tea AUD 18</p>'),'menu.html':html(body),'about.html':html('<p>Tea AUD 18</p>')},criteria:p.criteria.filter(c=>c.id==='coverage-1').map(c=>({...c,reference:{expectedStatus,rationale:'Synthetic controlled source relationship case; exact buyer-confirmed file and price, not rendered/runtime correctness. A merged cell remains outside the bounded recognizer.',relevantFiles:['index.html','menu.html','about.html'],requiresSemanticReview:true}}))};
});
const corpus={schema:'proofbeforepay-frozen-project-corpus-v1',cohort:'citation-relations-controlled-scope-2026-11-05',scope:'Six authored controlled multi-page source relation cases. Not real customer tasks or new repositories.',referenceMethod:'Production-confirmed file/label/currency/cents, direct original source inspection, no rendered execution; separate raw and negative-only application outcomes.',projects};
await writeFile(new URL('./citation-relations-scope-corpus-2026-11-05.json',import.meta.url),JSON.stringify(corpus,null,2)+'\n');
