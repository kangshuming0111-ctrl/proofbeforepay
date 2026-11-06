import assert from "node:assert/strict";
import test from "node:test";
import {createNativeFormCitationCheck,isNativeFormSourceDirectiveCandidate,parseNativeFormSourceDirective} from "../lib/native-form-source.ts";
import type {ProofAssessmentCitation,ProofCriterion} from "../lib/contracts.ts";

const file="form.html";
const criterion=(source:string):ProofCriterion=>({id:"coverage-1",title:"Native source fact",source});
const document=(body:string)=>`<!doctype html><html><head><title>Authored unit fixture</title></head><body>${body}</body></html>`;
const cite=(files:Record<string,string>,name:string,part=files[name]):ProofAssessmentCitation=>{const start=files[name].indexOf(part);assert.ok(start>=0);return{file:name,start,end:start+part.length,excerpt:part};};
const labels=`The form source in ${file} must include Name: and E-mail: as label text.`;
const types=`The static source in ${file} must declare telephone as a tel input and contact as an email input.`;
const radio=`The source content in ${file} must pair Basic and Premium radio labels with the values basic and premium under the same tier name.`;
const checkbox=`The source content in ${file} must associate Tea and Cake checkbox labels with the values tea and cake under the extra name.`;
const time=`The static appointment control in ${file} must declare type time and min 09:00 and max 17:00 and step 600.`;
function check(source:string,body:string,parts?:string[]){const files={[file]:document(body)},citations=parts?.map(p=>cite(files,file,p))??[cite(files,file)];return createNativeFormCitationCheck(files)(criterion(source),citations);}
const isUnknown=(result:ReturnType<ReturnType<typeof createNativeFormCitationCheck>>)=>assert.equal(result.kind,"unknown",JSON.stringify(result));

test("closed parser emits shared descriptors for the four generic source families",()=>{
  assert.deepEqual(parseNativeFormSourceDirective(labels),{kind:"labels",file,labels:["Name:","E-mail:"],owner:"form"});
  assert.deepEqual(parseNativeFormSourceDirective(types),{kind:"input_types",file,controls:[{name:"telephone",type:"tel"},{name:"contact",type:"email"}]});
  assert.deepEqual(parseNativeFormSourceDirective(radio),{kind:"choice_pairs",file,inputType:"radio",name:"tier",pairs:[{label:"Basic",value:"basic"},{label:"Premium",value:"premium"}]});
  assert.deepEqual(parseNativeFormSourceDirective(time),{kind:"time_attributes",file,name:"appointment",type:"time",min:"09:00",max:"17:00",step:"600"});
  assert.equal(parseNativeFormSourceDirective(checkbox)?.kind,"choice_pairs");
});
test("full-sentence grammar rejects runtime conjunctions, conditions, extra sentences and malformed families",()=>{
  for(const source of[labels+" Also store the order.",labels.replace("."," and submit the form."),"If approved, "+types,radio.replace("premium under","premium and automatically pay under"),time.replace("600.","600 and email the customer."),types.replace("as a tel input","as a working tel input"),labels.replace(" as label text."," as label text. Then validate them.")]){
    assert.equal(parseNativeFormSourceDirective(source),undefined,source);
  }
  for(const source of[labels+" And store the order.",types+" Actually validate.",radio+" Then pay.",time+" And submit."])assert.equal(isNativeFormSourceDirectiveCandidate(source),true);
  for(const source of[labels.replace(" must ","\n must "),types.replace(" must ","\nmust "),radio.replace(" must ","\nmust "),time.replace(" must ","\nmust ")]){assert.equal(parseNativeFormSourceDirective(source),undefined);assert.equal(isNativeFormSourceDirectiveCandidate(source),true);}
  for(const source of["The source content in form.html must include the menu.","The page must store orders.","Ordinary wording about form source."])assert.equal(isNativeFormSourceDirectiveCandidate(source),false);
});
test("unquoted greedy operands cannot absorb a completed source clause and a runtime continuation",()=>{
  const suffixes=[
    "Name: and E-mail: as label text. Submit the order and verify it persists",
    "Name: and E-mail: as label text; Submit the order and verify it persists",
    "Name: and E-mail: as label text； Submit the order and verify it persists",
    "Name: and E-mail: as label text and store the order",
    "Name: and E-mail: as label text and then validate the form",
    "Name: and E-mail: as label text! Send the email",
    "Name: and E-mail: as label text? Store the order",
  ];
  for(const operand of suffixes){const source=`The form source in ${file} must include ${operand} as label text.`;
    assert.equal(parseNativeFormSourceDirective(source),undefined,source);
    assert.deepEqual(check(source,'<form><label>Name:</label><label>E-mail: as label text. Submit the order</label><label>verify it persists</label></form>'),{kind:"not_applicable"});
  }
  for(const source of[radio.replace("Basic and Premium", "Basic and Premium radio labels with the values basic and premium under the same tier name. Submit order and Persist it"),checkbox.replace("Tea and Cake", "Tea and Cake; submit the order")])assert.equal(parseNativeFormSourceDirective(source),undefined,source);
});
test("balanced quoted action-like and punctuated labels remain source data without running their words",()=>{
  const source=`The form source in ${file} must include "Submit order" and "Actually charge the card." as label text.`;
  assert.deepEqual(check(source,'<form><label>Submit order</label><label>Actually charge the card.</label></form>'),{kind:"covered",file});
  const embedded=`The form source in ${file} must include "E-mail: as label text. Submit order" and "A; B" as label text.`;
  assert.deepEqual(check(embedded,'<form><label>E-mail: as label text. Submit order</label><label>A; B</label></form>'),{kind:"covered",file});
});
test("source path, count, literal and time grammar stays finite and rejects operand ambiguity",()=>{
  for(const source of[labels.replace(file,"../form.html"),labels.replace(file,"https://other.test/form.html"),labels.replace("Name: and E-mail:","Name:"),labels.replace("Name: and E-mail:","Name: and Name:"),types.replace("contact as","telephone as"),radio.replace("basic and premium under","basic under"),time.replace("09:00","29:00"),time.replace("600.","0."),time.replace("600.","999999."),labels+"\nX",labels.replace("Name:",'"Name:')])assert.equal(parseNativeFormSourceDirective(source),undefined,source);
  const quoted=labels.replace("Name: and E-mail:",`"Name and role:" and "E-mail:"`);assert.deepEqual(parseNativeFormSourceDirective(quoted),{kind:"labels",file,labels:["Name and role:","E-mail:"],owner:"form"});
  const six=labels.replace("Name: and E-mail:","A and B and C and D and E and F");assert.equal(parseNativeFormSourceDirective(six)?.kind,"labels");assert.equal(parseNativeFormSourceDirective(six.replace("F as","F and G as")),undefined);
});
test("native nested labels are witnessed as source text together in one actual form",()=>{
  assert.deepEqual(check(labels,'<form><label>Name: <input name="person"></label><label>E-mail: <input name="mail" type="email"></label></form>'),{kind:"covered",file});
  isUnknown(check(labels,'<form><label>Name: <input></label></form><form><label>E-mail: <input></label></form>'));
  isUnknown(check(labels,'<label>Name:</label><label>E-mail:</label>'));
  isUnknown(check(labels,'<form><label>Name:</label><label>E-mail:</label></form><form><label>Name:</label><label>E-mail:</label></form>'));
  assert.deepEqual(check(labels,'<form><label>Name: <textarea>Unrelated stored text</textarea></label><label>E-mail: <select><option>Unrelated option</option></select></label></form>'),{kind:"covered",file});
  isUnknown(check(labels,'<form><label>Name: <textarea>E-mail:</textarea></label></form>'));
});
test("label citations must cover every raw text/entity byte and may not borrow comments or another file",()=>{
  const source=labels.replace("Name:",`"Name & role:"`),body='<form><label>Name &amp; role: <input></label><label>E-mail: <input></label></form>';
  assert.deepEqual(check(source,body),{kind:"covered",file});
  isUnknown(check(source,body,["Name &","E-mail:"]));
  const files={[file]:document('<form><label>E-mail:</label><!-- Name: --></form>'),"other.html":document('<form><label>Name:</label></form>')};
  isUnknown(createNativeFormCitationCheck(files)(criterion(labels),[cite(files,file),cite(files,"other.html")]));
});
test("hidden, template, script, foreign and nested-label decoys cannot witness required label text",()=>{
  for(const decoy of['<div hidden><label>Name:</label></div>','<template><label>Name:</label></template>','<script>"<label>Name:</label>"</script>','<!-- <label>Name:</label> -->','<svg><label>Name:</label></svg>','<label hidden>Name:</label>','<label aria-hidden="true">Name:</label>','<label style="display:none">Name:</label>','<label class="sr-only">Name:</label>','<label><span hidden>Name:</span></label>','<label><label>Name:</label></label>'])isUnknown(check(labels,`<form>${decoy}<label>E-mail:</label></form>`));
});
test("name/type facts bind each own input start tag and do not invent a same-form condition",()=>{
  const first='<input name="telephone" type="tel">',second='<input type="email" name="contact">';
  assert.deepEqual(check(types,`${first}<form>${second}</form>`),{kind:"covered",file});
  assert.deepEqual(check(types,`<form>${first}</form><form>${second}</form>`),{kind:"covered",file});
  assert.deepEqual(check(types,first.replace('type="tel"','type="TEL"')+second),{kind:"covered",file});
  assert.deepEqual(check(types,first.replace('<input','<input form="somewhere"')+second),{kind:"covered",file});
  isUnknown(check(types,'<input name="telephone" type="email"><input name="contact" type="tel">'));
  isUnknown(check(types,first+second+first));
  isUnknown(check(types,first+second,['name="telephone"','type="tel"',second]));
});
test("comments, hidden controls and other field names cannot repair a name/type mismatch",()=>{
  const wrong='<input name="telephone" type="text"><input name="contact" type="email">';
  for(const decoy of['<!-- <input name="telephone" type="tel"> -->','<input hidden name="telephone" type="tel">','<input name="archived" type="tel">','<template><input name="telephone" type="tel"></template>','<input id="telephone" name="other" type="tel">'])isUnknown(check(types,wrong+decoy));
});
function option(type:string,label:string,value:string,name="tier"){return`<label><input type="${type}" name="${name}" value="${value}"> ${label}</label>`;}
test("radio and checkbox label/value pairs are checked against actual same-form owners",()=>{
  assert.deepEqual(check(radio,`<form>${option("radio","Basic","basic")}${option("radio","Premium","premium")}</form>`),{kind:"covered",file});
  assert.deepEqual(check(checkbox,`<form>${option("checkbox","Tea","tea","extra")}${option("checkbox","Cake","cake","extra")}</form>`),{kind:"covered",file});
  isUnknown(check(radio,`<form>${option("radio","Basic","basic")}${option("radio","Premium","basic")}<input type="hidden" name="archive" value="premium"></form>`));
  isUnknown(check(radio,`<form>${option("radio","Basic","premium")}${option("radio","Premium","basic")}</form>`));
  isUnknown(check(radio,`<form>${option("radio","Basic","basic")}</form><form>${option("radio","Premium","premium")}</form>`));
  isUnknown(check(radio,option("radio","Basic","basic")+option("radio","Premium","premium")));
});
test("explicit for associations need one actual control ID in the same form",()=>{
  const body='<form id="a"><label for="basic">Basic</label><input id="basic" type="radio" name="tier" value="basic"><label for="premium">Premium</label><input id="premium" type="radio" name="tier" value="premium"></form>';
  assert.deepEqual(check(radio,body),{kind:"covered",file});
  for(const mutated of[body.replace('id="premium" type','id="wrong" type'),body+'<input id="premium" type="hidden">',body.replace('id="premium" type','id="premium" form="elsewhere" type'),body.replace('<label for="premium">Premium</label>','')+'<form><label for="premium">Premium</label></form>'])isUnknown(check(radio,mutated));
});
test("implicit labels with multiple labelable controls or ambiguous duplicate pairs are not a unique witness",()=>{
  isUnknown(check(radio,`<form><label><input type="radio" name="tier" value="basic"><input type="text">Basic</label>${option("radio","Premium","premium")}</form>`));
  isUnknown(check(radio,`<form>${option("radio","Basic","basic")}${option("radio","Basic","basic")}${option("radio","Premium","premium")}</form>`));
  isUnknown(check(radio,`<form>${option("radio","Basic","basic")}${option("radio","Premium","premium")}</form><form>${option("radio","Basic","basic")}${option("radio","Premium","premium")}</form>`));
});
test("owner uniqueness is established before expected value or citation filtering",()=>{
  const first=option("radio","Basic","basic"),good=option("radio","Premium","premium"),wrong=option("radio","Premium","basic");
  isUnknown(check(radio,`<form>${first}${good}${wrong}</form>`));
  isUnknown(check(radio,`<form>${first}${good}${wrong}</form>`,[first,good]));
  isUnknown(check(radio,`<form>${first}${good}${good}</form>`,[first,good]));
  const repeated=radio.replace("basic and premium under","compact and compact under");
  isUnknown(check(repeated,'<form><label for="one">Basic</label><label for="one">Premium</label><input id="one" type="radio" name="tier" value="compact"></form>'));
  assert.deepEqual(check(radio,`<form>${first}${good}${option("radio","Other","basic")}</form>`),{kind:"covered",file});
});
test("inclusion wording permits extra options and repeated expected values on distinct exact labels",()=>{
  assert.deepEqual(check(radio,`<form>${option("radio","Basic","basic")}${option("radio","Premium","premium")}${option("radio","Other","other")}</form>`),{kind:"covered",file});
  const source=radio.replace("basic and premium under","compact and compact under");
  assert.deepEqual(check(source,`<form>${option("radio","Basic","compact")}${option("radio","Premium","compact")}</form>`),{kind:"covered",file});
});
test("choice citations must show both owner attributes and actual label text, not just one half",()=>{
  const first=option("radio","Basic","basic"),second=option("radio","Premium","premium");
  assert.deepEqual(check(radio,`<form>${first}${second}</form>`,[first,second]),{kind:"covered",file});
  isUnknown(check(radio,`<form>${first}${second}</form>`,['<input type="radio" name="tier" value="basic">','<input type="radio" name="tier" value="premium">']));
  isUnknown(check(radio,`<form>${first}${second}</form>`,["Basic","Premium"]));
});
test("time facts require the unique exact named control with all own attributes and full start tag",()=>{
  const control='<input type="time" name="appointment" min="09:00" max="17:00" step="600">';
  assert.deepEqual(check(time,control),{kind:"covered",file});
  assert.deepEqual(check(time,control.replace('type="time"','type="TIME"')),{kind:"covered",file});
  for(const mutated of[control.replace('name="appointment"','name="another" id="appointment"'),control.replace('min="09:00"','min="08:00"'),control.replace('step="600"','step="60"'),control+control,control.replace(' step="600"','')+'<input name="archive" step="600">',control.replace('<input','<input hidden')])isUnknown(check(time,mutated));
  isUnknown(check(time,control,['type="time"','min="09:00" max="17:00" step="600"']));
});
test("missing file, malformed HTML, invalid citations and source budgets fail as unknown without throwing",()=>{
  const absent=createNativeFormCitationCheck({"other.html":document('<form><label>Name:</label><label>E-mail:</label></form>')});isUnknown(absent(criterion(labels),[]));
  isUnknown(check(types,'<input name="telephone" name="decoy" type="tel"><input name="contact" type="email">'));
  const files={[file]:document('<form><label>Name:</label><label>E-mail:</label></form>')},checkFile=createNativeFormCitationCheck(files),c=cite(files,file);
  for(const invalid of[{...c,start:-1},{...c,end:c.end+1},{...c,excerpt:"not exact"},...Array.from({length:1},()=>({...c,file:"missing.html"}))])isUnknown(checkFile(criterion(labels),[invalid]));
  isUnknown(checkFile(criterion(labels),Array(7).fill(c)));
  isUnknown(createNativeFormCitationCheck({...files,"large.css":"x".repeat(262144)})(criterion(labels),[c]));
  isUnknown(createNativeFormCitationCheck(Object.fromEntries([[file,files[file]],...Array.from({length:40},(_,i)=>[`${i}.css`,""])]))(criterion(labels),[c]));
});
test("constructor snapshots files and never changes source, citations or unrecognised runtime requirements",()=>{
  const files={[file]:document('<form><label>Name:</label><label>E-mail:</label></form>')},c=cite(files,file),before=structuredClone(c),checkFile=createNativeFormCitationCheck(files);
  files[file]="changed later";assert.deepEqual(checkFile(criterion(labels),[c]),{kind:"covered",file});assert.deepEqual(c,before);
  assert.deepEqual(checkFile(criterion("Submitting must persist the order and send a real email."),[c]),{kind:"not_applicable"});
});
