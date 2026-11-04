import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {discoverSellerControls,SELLER_ONBOARDING_DOCUMENT_LIMITS} from "../lib/seller-control-discovery.ts";
import {checkSellerOnboarding,defaultSellerOnboardingConfig,ONBOARDING_SELECTOR_FIELDS,type SellerOnboardingConfig} from "../lib/seller-onboarding.ts";

const operationOptions=(values:string[])=>values.map(v=>`<option value="${v}">${v}</option>`).join("");
const createOps=["cancel-create","cancel-five","cancel-three","cancel-extra","source-create","loss-create"],cancelOps=["cancel-first","cancel-repeat"],moveOps=["move-full","move-free"];
function independentHtml(){return readFileSync(new URL("./fixtures/seller-onboarding-independent.html",import.meta.url),"utf8");}
const field=(report:Awaited<ReturnType<typeof discoverSellerControls>>,key:string)=>report.fields.find(f=>f.key===key)!;
function mappedConfig(report:Awaited<ReturnType<typeof discoverSellerControls>>){const config=defaultSellerOnboardingConfig();for(const row of report.fields){assert.equal(row.state,"candidate",row.key);assert.equal(row.candidates.length,1);const selector=row.candidates[0].selector;if(row.key==="result")config.result=selector;else{const[group,key]=row.key.split(".");(config.forms[group as keyof typeof config.forms]as Record<string,string>)[key]=selector;}}return config;}

test("an independent HTML supplies thirteen grounded candidates that reuse the unchanged preflight schema",async()=>{
 const html=independentHtml(),report=await discoverSellerControls(html);assert.equal(report.validDocument,true);assert.deepEqual(report.fields.map(f=>f.key),ONBOARDING_SELECTOR_FIELDS);assert.equal(report.source.bytes,new TextEncoder().encode(html).byteLength);assert.match(report.source.sha256!,/^[a-f0-9]{64}$/u);
 const config=mappedConfig(report);assert.equal(config.forms.create.partySize,"#headcount");assert.equal(config.forms.cancel.bookingId,"#cancel-ticket");assert.equal(config.forms.move.bookingId,"#change-ticket");assert.equal(config.forms.create.submit,"#send-entry");assert.equal(checkSellerOnboarding(config,html).staticMarkupReady,true);
 for(const row of report.fields)for(const c of row.candidates){assert.ok(c.reasons.length>0);assert.ok(c.source.line>=1&&c.source.startOffset<c.source.endOffset);assert.ok(html.slice(c.source.startOffset,c.source.endOffset).includes(c.tagName));}
 assert.equal(report.limits.networkRequests,0);assert.equal(report.limits.runtimeVerified,false);assert.equal(report.limits.backendVerified,false);assert.doesNotMatch(JSON.stringify(report),/PRIVATE-CUSTOMER-CANARY|private-customer-id|PRIVATE-RESULT-CANARY/u);
});
test("missing fixed protocol values remain missing even when input labels convincingly claim an instruction",async()=>{
 const html=independentHtml().replace('<option value="loss-create">loss-create</option>',"").replace('<select id="amend-mode">'+operationOptions(moveOps)+'</select>','<input id="amend-mode" aria-label="Move test instruction" value="move-full">');const report=await discoverSellerControls(html);
 assert.equal(field(report,"create.requestOperation").state,"missing");assert.equal(field(report,"move.requestOperation").state,"missing");assert.equal(field(report,"cancel.requestOperation").state,"candidate");assert.ok(field(report,"cancel.requestOperation").candidates[0].reasons.includes("protocol_options"));
});
test("same-named controls in distinct forms use grounded form scope, not a global arbitrary first match",async()=>{
 const html=independentHtml().replace('id="cancel-ticket"','name="reference"').replace('for="cancel-ticket"','for="not-present"').replace('id="change-ticket"','name="reference"').replace('for="change-ticket"','for="not-present"').replace('<select name="reference">','<select name="reference" aria-label="Reservation reference">').replace('<select name="reference"></select>','<select name="reference" aria-label="Reservation reference"></select>');const report=await discoverSellerControls(html);
 assert.equal(field(report,"cancel.bookingId").state,"candidate");assert.equal(field(report,"move.bookingId").state,"candidate");assert.match(field(report,"cancel.bookingId").candidates[0].selector,/^#withdrawal /u);assert.match(field(report,"move.bookingId").candidates[0].selector,/^#amend /u);assert.notEqual(field(report,"cancel.bookingId").candidates[0].selector,field(report,"move.bookingId").candidates[0].selector);
});
test("two genuine controls remain ambiguous; duplicate IDs cannot generate a falsely unique selector",async()=>{
 const report=await discoverSellerControls('<label for="one">Guests</label><input id="one"><label for="two">Guests</label><input id="two">');assert.equal(field(report,"create.partySize").state,"ambiguous");assert.equal(field(report,"create.partySize").candidates.length,2);
 const duplicate=await discoverSellerControls('<label for="same">Guests</label><input id="same"><input id="same">');assert.equal(field(duplicate,"create.partySize").state,"unsupported");assert.equal(field(duplicate,"create.partySize").reason,"no_stable_selector");assert.deepEqual(field(duplicate,"create.partySize").candidates,[]);
});
test("Chinese labels and aria-labelledby are evidence without customer field values",async()=>{
 const report=await discoverSellerControls('<form id="预订表单" aria-label="预订"><span id="人数标签">预约人数</span><input name="到店人数" aria-labelledby="人数标签" value="PRIVATE-VALUE"><label for="时段">到店时间</label><select id="时段"></select><button id="预约按钮">确认预约</button></form><p id="结果区" role="status">PRIVATE-RESULT</p>');
 assert.equal(field(report,"create.partySize").state,"candidate");assert.ok(field(report,"create.partySize").candidates[0].reasons.includes("aria_match"));assert.equal(field(report,"create.slot").state,"candidate");assert.equal(field(report,"create.submit").state,"candidate");assert.equal(field(report,"result").state,"candidate");assert.doesNotMatch(JSON.stringify(report),/PRIVATE-VALUE|PRIVATE-RESULT/u);
});
test("hidden, disabled, readonly, password and inert controls are never recommended",async()=>{
 for(const attrs of ['type="password"','type="hidden"','disabled','readonly','hidden','style="display: none"','aria-hidden="true"']){const report=await discoverSellerControls(`<label for="guest-count">Guests</label><input id="guest-count" ${attrs}>`);assert.equal(field(report,"create.partySize").state,"missing",attrs);}
 for(const wrapper of ['<fieldset disabled>','<section hidden>','<section inert>']){const report=await discoverSellerControls(wrapper+'<label for="guest-count">Guests</label><input id="guest-count">');assert.equal(field(report,"create.partySize").state,"missing",wrapper);}
});
test("HTML scripts, template controls, external resources and input values do not execute or create candidates",async()=>{
 const beforeFetch=globalThis.fetch;let network=0;globalThis.fetch=(async()=>{network++;throw new Error("unexpected network");})as typeof fetch;
 try{const report=await discoverSellerControls('<script>globalThis.__pbpDiscoveryExecuted=true;fetch("https://external.invalid/private");</script><template><label for="inert-guests">Guests</label><input id="inert-guests"></template><input id="ordinary" value="Guests reservation reference"><link rel="stylesheet" href="https://external.invalid/a.css"><iframe src="https://external.invalid/x"></iframe>');assert.equal(network,0);assert.equal((globalThis as Record<string,unknown>).__pbpDiscoveryExecuted,undefined);assert.ok(report.fields.every(f=>f.state==="missing"));assert.equal(report.limits.scriptsExecuted,false);}finally{globalThis.fetch=beforeFetch;}
});
test("the reproduced ninety-KiB deep tree and wide trees return explicit complete-document failures",async()=>{
 const deep='<div>'.repeat(8192)+'<input name="guests">'+'</div>'.repeat(8192);assert.equal(new TextEncoder().encode(deep).byteLength,90133);
 for(const[html,code]of [[deep,"html_depth_limit"],['<input aria-label="Guests">'.repeat(4100),"html_node_limit"]]){const report=await discoverSellerControls(html);assert.equal(report.validDocument,false);assert.equal(report.documentIssue,code);assert.equal(report.fields.length,13);assert.ok(report.fields.every(f=>f.state==="unsupported"&&f.candidates.length===0));const existing=checkSellerOnboarding(defaultSellerOnboardingConfig(),html);assert.equal(existing.staticMarkupReady,false);assert.equal(existing.checks.at(-1)?.code,code);}
 assert.equal(SELLER_ONBOARDING_DOCUMENT_LIMITS.maxBytes,256*1024);assert.equal(Object.isFrozen(SELLER_ONBOARDING_DOCUMENT_LIMITS),true);
});
test("oversized and invalid encoding inputs fail closed; document hash changes with same-name content",async()=>{
 for(const html of ['x'.repeat(256*1024+1),'\0','\ud800']){const report=await discoverSellerControls(html);assert.equal(report.validDocument,false);assert.equal(report.documentIssue,"html_size_or_encoding");assert.ok(report.fields.every(f=>!f.candidates.length));}
 const first=await discoverSellerControls(independentHtml()),second=await discoverSellerControls(independentHtml().replace('Guests attending','Guests attending now'));assert.notEqual(first.source.sha256,second.source.sha256);assert.equal(first.source.bytes!==second.source.bytes,true);
});
test("candidate overflow and missing stable attributes never silently choose a subset",async()=>{
 const report=await discoverSellerControls(Array.from({length:9},(_,i)=>`<label for="count-${i}">Guests</label><input id="count-${i}">`).join(""));assert.equal(field(report,"create.partySize").state,"unsupported");assert.equal(field(report,"create.partySize").reason,"candidate_limit");assert.deepEqual(field(report,"create.partySize").candidates,[]);
 const unstable=await discoverSellerControls('<label>Guests<input></label>');assert.equal(field(unstable,"create.partySize").state,"unsupported");assert.equal(field(unstable,"create.partySize").reason,"no_stable_selector");
});

test("explicit opposite action labels cannot be overruled by the enclosing form; reset is not a submit action",async()=>{
 const report=await discoverSellerControls('<form id="entry" aria-label="预订"><label for="move-time">改期时间</label><input id="move-time"><button id="cancel">Cancel booking</button><button id="reset" type="reset">Reserve places</button></form>');
 assert.equal(field(report,"create.slot").state,"missing");assert.equal(field(report,"create.submit").state,"missing");assert.equal(field(report,"move.slot").state,"missing");
 const normal=await discoverSellerControls(independentHtml());assert.equal(checkSellerOnboarding(mappedConfig(normal),independentHtml()).staticMarkupReady,true);
});
