import "./style.css";
import "./evidence-viewer.css";
import { evaluateBusinessBlocks } from "../../lib/business-checks.ts";
import type { ProofBusinessExpected } from "../../lib/contracts.ts";
import {validateRuntimeReport,type RuntimeCheckPlan} from "../../lib/runtime-checks.ts";
import {suggestBookingPolicy} from "../../lib/booking-policy.ts";
import {suggestSlotCapacity} from "../../lib/booking-capacity.ts";
import {CAPACITY_EXECUTION_ORDER,CAPACITY_SLOTS,CAPACITY_V4_EXECUTION_ORDER,CAPACITY_V4_SLOTS,runtimeCapacityStepDefinitions} from "../../lib/runtime-capacity.ts";
import {runtimeStepName} from "../../lib/runtime-feedback.ts";
import {runtimeCoverage,runtimeCoverageFamilyName} from "../../lib/runtime-coverage.ts";
import { createFirstUseTrial, startFirstUseTask, noteFirstUseHelp, finishFirstUseTask, recordFirstUseAction, exportFirstUseTrial, FIRST_USE_TASKS, type FirstUseTask, type FirstUseTrial, type TrialAction, type TrialOperator, type TrialOutcome } from "../../lib/first-use-trial.ts";
type Lang = "zh" | "en";
type Variant = "flawed" | "fixed";
type HttpProtocol = RuntimeCheckPlan["protocol"];
type Stage = "agreement" | "awaiting_delivery" | "submitted" | "changes_requested" | "accepted" | "simulated_paid";
type LocalReport = {
    variant: Variant;
    rows: {
        id: string;
        file: string;
        source: string;
        expected: ProofBusinessExpected;
        actual: string;
        outcome: "expected_observation" | "mismatch" | "unavailable";
    }[];
};
type HttpReport = {
    method?: unknown;
    scenario?: unknown;
    steps?: unknown;
    summary?: unknown;
    target?: unknown;
};
const BUILD = "guest-lab-v4-combined";
const CHECKS: {
    id: string;
    file: string;
    source: string;
    expected: ProofBusinessExpected;
    flawed: string;
    fixed: string;
}[] = [
    { id: "menu", file: "menu-zh.html", source: "中文菜单标明牛肉面 AUD 18", expected: { kind: "item_price", label: "牛肉面", currency: "AUD", amountMinor: 1800 }, flawed: "牛肉面 AUD 28", fixed: "牛肉面 AUD 18" },
    { id: "phone", file: "visit.html", source: "到店说明展示电话 +61 3 9000 0000", expected: { kind: "visible_copy", text: "+61 3 9000 0000" }, flawed: "+61 3 9000 9999", fixed: "+61 3 9000 0000" },
];
const TASK_COPY: Record<FirstUseTask, [
    string,
    string
]> = {
    T01: ["确认菜单价格、电话和合同可选的约定。", "Confirm the menu/phone agreement and that a contract is optional."],
    T02: ["切换卖家，提交第一版虚构交付。", "Switch to Seller and submit the first fictional delivery."],
    T03: ["核对不符，起草意见，分清草稿与已发送。", "Inspect differences, draft feedback and distinguish a draft from sent feedback."],
    T04: ["提交修订版，对照旧值和新值；运行两种预约接口测试。", "Submit a revision, compare old/current values, then test both booking services."],
    T05: ["说明人工验收与模拟付款的区别；决定是否在本地继续。", "Explain human acceptance versus simulated payment; decide whether to continue locally."],
};
const app = document.querySelector<HTMLDivElement>("#app")!;
let language: Lang = "zh", role: "buyer" | "seller" = "buyer", stage: Stage = "agreement", delivery: Variant | undefined, report: LocalReport | undefined, previousReport: LocalReport | undefined;
let feedback = "", draftReady = false, feedbackSent = false, manualConfirmed = false, httpConsent = false, httpBusy = false, httpReport: HttpReport | undefined, httpError = "", httpScenario: Variant | undefined;
let labView:"local"|"http"="local";
let httpReports:Partial<Record<Variant,HttpReport>>={};
let httpProtocol:HttpProtocol="booking-http-v4", httpMaxPartySize=6;
let httpSequence=0,httpController:AbortController|undefined;
let trial: FirstUseTrial | undefined, operator: TrialOperator = "unknown", selectedTask: FirstUseTask = "T01", selectedOutcome: TrialOutcome = "not_completed", trialOpen = false, message = "", messageError = false;
const tr = (zh: string, en: string) => language === "zh" ? zh : en;
const node = (tag: string, className = "", text?: string) => { const value = document.createElement(tag); if (className)
    value.className = className; if (text !== undefined)
    value.textContent = text; return value; };
function append(parent: Node, ...children: Node[]) { for (const child of children)
    parent.appendChild(child); }
const asRecord = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const jsonText = (value: unknown, limit = 12000) => { const text = typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? ""; return text.length > limit ? text.slice(0, limit) + "\n…" : text; };
const description = (zh: string, en: string, className = "note") => node("p", className, tr(zh, en));
function setMessage(zh: string, en: string, error = false) { message = tr(zh, en); messageError = error; }
function track(action: TrialAction) { if (trial) {
    try {
        trial = recordFirstUseAction(trial, action, performance.now());
    }
    catch (error) {
        message = error instanceof Error ? error.message : "Trial record unavailable";
        messageError = true;
    }
} }
function button(label: string, action: () => void | Promise<void>, options: {
    primary?: boolean;
    attention?: boolean;
    disabled?: boolean;
    className?: string;
} = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.disabled = !!options.disabled;
    b.className = options.attention ? "attention" : options.primary ? "primary" : options.className ?? "";
    b.addEventListener("click", () => { message = ""; messageError = false; try {
        const pending = action();
        render();
        if (pending && typeof pending.then === "function")
            void pending.catch(error => { message = error instanceof Error ? error.message : "Action unavailable"; messageError = true; }).finally(render);
    }
    catch (error) {
        message = error instanceof Error ? error.message : "Action unavailable";
        messageError = true;
        render();
    } });
    return b;
}
function download(value: unknown, name: string) { const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; append(document.body, a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function switchRole(next: "buyer" | "seller") { role = next; track(next === "buyer" ? "switch_buyer" : "switch_seller"); }
function submit(variant: Variant) { delivery = variant; stage = "submitted"; report = undefined; manualConfirmed = false; draftReady = false; feedback = ""; track(variant === "flawed" ? "submit_v1" : "submit_v2"); }
function checkStatic() { if (!delivery)
    return; report = { variant: delivery, rows: CHECKS.map(check => ({ ...check, actual: check[delivery!], outcome: evaluateBusinessBlocks(check.expected, [check[delivery!]]).outcome })) }; track("check_static"); }
function clearHttpDisplay() {httpSequence++;httpController?.abort();httpController=undefined;httpBusy=false;httpReport=undefined;httpReports={};httpScenario=undefined;httpError="";httpConsent=false;}
function resetCase() { role = "buyer"; stage = "agreement"; delivery = undefined; report = undefined; previousReport = undefined; feedback = ""; draftReady = false; feedbackSent = false; manualConfirmed = false; clearHttpDisplay();track("reset_case");message=tr("交付与接口显示已重置；已开始的本地试用记录保留，便于你先下载。","Handoff and HTTP display reset. Started local trial records are retained for download."); }
function expectedLabel(expected: ProofBusinessExpected) { return expected.kind === "visible_copy" ? expected.text : `${expected.label} — ${expected.currency} ${(expected.amountMinor / 100).toFixed(2)}`; }
function panel(title: string, label: string) { const section = node("section", "panel"), heading = node("header", "panel-heading"), body = node("div", "panel-body"); append(heading, node("h2", "", title), node("span", "", label)); append(section, heading, body); return { section, body }; }
function renderComparison(body: HTMLElement) {
    if (!report)
        return;
    const list = node("ul", "comparison");
    for (const row of report.rows) {
        const item = node("li", row.outcome === "mismatch" ? "mismatch" : ""), sameOld = previousReport?.rows.find(old => old.id === row.id);
        append(item, node("h3", "", `${row.file} · ${row.outcome === "mismatch" ? tr("给定文字不符", "Supplied text differs") : row.outcome === "expected_observation" ? tr("给定文字符合", "Supplied text matches") : tr("无法确定", "Uncertain")}`));
        const dl = node("dl", sameOld ? "" : "without-earlier");
        for (const [label, value] of [[tr("约定", "Agreed"), expectedLabel(row.expected)], ...(sameOld ? [[tr("旧版文字", "Earlier text"), sameOld.actual]] : []), [tr("本版文字", "Current text"), row.actual]]) {
            const column = node("div");
            append(column, node("dt", "", label), node("dd", label === tr("本版文字", "Current text") && row.outcome === "mismatch" ? "mismatch-value" : "", value));
            append(dl, column);
        }
        append(item, dl);
        append(list, item);
    }
    append(body, list, description("这些结果由实际规则函数对上面的固定示例文字计算；没有运行交付页面、读取像素或调用 AI。", "These results are computed by the actual rule function on the fixed sample text above. No delivered page, pixel observation or AI call ran."));
}
function renderLocal() {
    const { section, body } = panel(tr("对照交付，再明确验收", "Compare delivery, then accept explicitly"), tr("仅本页模拟", "Local role play"));section.classList.add("local-panel");
    const agreement = node("div", "agreement");
    for (const [label, value] of [[tr("中文菜单要求", "Chinese menu requirement"), "牛肉面 AUD 18"], [tr("联系电话要求", "Contact requirement"), "+61 3 9000 0000"]]) {
        const cell = node("div");
        append(cell, node("span", "", label), node("strong", "", value));
        append(agreement, cell);
    }
    append(body, agreement, description("这是虚构面馆的固定约定；合同可选。本演示不接收真实客户资料或文件。", "A fixed agreement for a fictional noodle shop; a contract is optional. This demonstration does not accept real client material or files."));
    const roles = node("div", "role-switch");
    append(roles, node("span", "", tr("当前视角", "Perspective")));
    for (const side of ["buyer", "seller"] as const) {
        const b = button(side === "buyer" ? tr("买家", "Buyer") : tr("卖家", "Seller"), () => switchRole(side));
        b.setAttribute("aria-pressed", String(role === side));
        append(roles, b);
    }
    append(body, roles);
    if (stage === "agreement") {
        append(body, description("先以买家身份确认这份约定。确认不会调用模型，也不产生付款。", "Start as buyer and confirm this agreement. Confirmation does not call a model or make a payment.", "workflow-message"), button(role === "buyer" ? tr("确认示例约定", "Confirm sample agreement") : tr("切换买家确认约定", "Switch to Buyer to confirm"), () => { if (role !== "buyer")
            switchRole("buyer");
        else {
            stage = "awaiting_delivery";
            track("agree_scope");
        } }, { primary: true }));
    }
    else if (stage === "awaiting_delivery") {
        append(body, description("约定已确认。卖家准备第一版，故意包含错误价格和电话。", "Agreement confirmed. The seller prepares a first version containing an intentionally wrong price and phone.", "workflow-message"), button(role === "seller" ? tr("提交第一版虚构交付", "Submit fictional v1") : tr("切换卖家准备交付", "Switch to Seller to deliver"), () => role === "seller" ? submit("flawed") : switchRole("seller"), { primary: true }));
    }
    else if (stage === "changes_requested") {
        append(body, description("修改意见已保存在本页。卖家提交修订版后，买家仍需重新核对。", "The change request is saved in this page. After the seller revises, the buyer must check again.", "workflow-message"), button(role === "seller" ? tr("提交修订版 v2", "Submit revised v2") : tr("切换卖家修订", "Switch to Seller to revise"), () => role === "seller" ? submit("fixed") : switchRole("seller"), { primary: true }));
    }
    else if (stage === "submitted") {
        append(body, description(delivery === "flawed" ? "第一版已提交，等待买家核对。" : "修订版已提交。旧版记录保留，尚未自动验收。", delivery === "flawed" ? "First version submitted for buyer inspection." : "Revision submitted. The earlier record remains; nothing is accepted automatically.", "workflow-message"));
        if (role !== "buyer")
            append(body, button(tr("切换买家核对", "Switch to Buyer to inspect"), () => switchRole("buyer"), { primary: true }));
        else if (!report)
            append(body, button(tr("核对这版给定文字", "Check this version’s supplied text"), checkStatic, { primary: true }));
    }
    else
        append(body, node("p", "result-message", stage === "accepted" ? tr("已明确接受本地 v2；尚未模拟付款。", "Local v2 explicitly accepted; payment has not been simulated.") : tr("模拟付款已记录：v2 · AUD 1.00。没有 PayPal 请求，没有真实转账。", "Simulated payment recorded: v2 · AUD 1.00. No PayPal request or real transfer occurred.")));
    renderComparison(body);
    if (stage === "submitted" && role === "buyer" && report?.rows.some(row => row.outcome !== "expected_observation")) {
        if (!draftReady)
            append(body, button(tr("起草具体修改意见", "Draft precise change request"), () => { draftReady = true; feedback = report!.rows.filter(row => row.outcome !== "expected_observation").map(row => `${row.source}\n${row.file}: ${tr("约定", "Agreed")} ${expectedLabel(row.expected)}; ${tr("本版文字", "Current text")} ${row.actual}.`).join("\n\n"); track("draft_feedback"); }));
        else {
            const label = node("label", "feedback-label", tr("修改草稿 · 尚未发送", "Change draft · not sent")), textarea = document.createElement("textarea");
            textarea.id = "local-feedback";
            textarea.maxLength = 1000;
            textarea.value = feedback;
            label.setAttribute("for", textarea.id);
            const send = button(tr("发送本地修改意见", "Send local change request"), () => { if (!feedback.trim())
                return; feedbackSent = true; previousReport = structuredClone(report); stage = "changes_requested"; track("send_local_feedback"); }, { primary: true, disabled: !feedback.trim() });
            textarea.addEventListener("input", () => { feedback = textarea.value; send.disabled = !feedback.trim(); });
            append(body, label, textarea, description("点击起草不等于已经退回。发送只更新本页模拟状态，不联系任何人。", "Drafting is not sending. Sending updates only this page’s simulated state and contacts nobody."), send);
        }
    }
    if (stage === "submitted" && role === "buyer" && delivery === "fixed" && report?.rows.every(row => row.outcome === "expected_observation")) {
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = manualConfirmed;
        check.id = "local-accept-confirm";
        const label = node("label", "checkbox-line");
        append(label, check, node("span", "", tr("我已亲自核对示例差异，并理解文字规则符合不代表网站全部功能正常。", "I inspected the sample differences and understand a text match does not establish that every website function works.")));
        const accept = button(tr("明确接受本地 v2（不付款）", "Accept local v2 — no payment"), () => { if (!manualConfirmed)
            return; stage = "accepted"; track("accept_local"); }, { primary: true, disabled: !manualConfirmed });
        check.addEventListener("change", () => { manualConfirmed = check.checked; accept.disabled = !manualConfirmed; });
        append(body, label, accept);
    }
    if (stage === "accepted" && role === "buyer")
        append(body, button(tr("单独确认模拟付款 AUD 1.00", "Separately confirm simulated AUD 1.00"), () => { stage = "simulated_paid"; track("simulate_payment"); }, { primary: true }));
    if (feedbackSent)
        append(body, description("本页已记录一次明确发送的修改意见；刷新页面会重置。", "This page records an explicitly sent local change request; reloading resets it."));
    append(body, description("买卖家为同一访客的两个模拟视角；验收和付款只改变本页状态，不建立真实协作、法律裁决或资金托管。预约接口实测在右侧单独记录，未自动纳入这份静态示例约定。", "Buyer and seller are simulated perspectives of one visitor. Acceptance and payment change only this page, not real membership, a legal ruling or escrow. Booking HTTP tests are recorded separately and are not automatically part of this static sample agreement.", "boundary"));
    return section;
}
async function runHttp(scenario: Variant) {
    if (!httpConsent || httpBusy)
        return;
    const sequence=++httpSequence,protocol=httpProtocol,maxPartySize=httpMaxPartySize;
    const current=()=>sequence===httpSequence&&protocol===httpProtocol&&maxPartySize===httpMaxPartySize;
    httpBusy = true;
    httpError = "";
    httpReport = undefined;
    httpScenario = scenario;
    delete httpReports[scenario];
    httpConsent = false;
    track(scenario === "flawed" ? "http_flawed_started" : "http_fixed_started");
    render();
    const plan=httpPlan(protocol,maxPartySize);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 40000);
    httpController=controller;
    try {
        const response = await fetch("/api/lab-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario, consent: true,...(protocol!=="booking-http-v1"?{protocol,maxPartySize}:{}),...((protocol==="booking-http-v3"||protocol==="booking-http-v4")?{maxGuestsPerSlot:8}:{}) }), credentials: "omit", redirect: "error", signal: controller.signal });
        if(!current())return;
        if(response.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")throw new Error(tr("接口未返回 JSON 报告，本次未记录通过。","The endpoint did not return a JSON report; no pass was recorded."));
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error(tr("接口没有返回报告。", "The endpoint returned no report."));
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            if(!current()){await reader.cancel();return;}
            if(controller.signal.aborted){await reader.cancel();throw new DOMException("aborted","AbortError");}
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.length;
            if (size > 192000) {
                await reader.cancel();
                throw new Error(tr("报告超出本页显示上限。", "The report exceeds this page’s limit."));
            }
            chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        let result:unknown;try{result=JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));}catch{throw new Error(tr(`接口返回 HTTP ${response.status}，未提供可读取的 JSON 报告。`,`The endpoint returned HTTP ${response.status} without a readable JSON report.`));} const value=asRecord(result);
        if (!response.ok)
            throw new Error(typeof value?.error === "string" ? value.error : tr(`接口返回 HTTP ${response.status}。`, `The endpoint returned HTTP ${response.status}.`));
        if (!value || typeof value.runId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(value.runId)||value.deliveryId!==`lab-${scenario}-${value.runId}`)
            throw new Error(tr("返回内容不是受支持的预约 HTTP 报告。", "The response is not a supported booking HTTP report."));
        // Validate the returned protocol, exact chosen policy and every step;
        // compare only runs made with the same currently selected expectation.
        const expectedDigest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode((protocol==="booking-http-v3"||protocol==="booking-http-v4")?`controlled-fixture:${protocol}:${scenario}`:`controlled-fixture:${scenario}`)))).map(n=>n.toString(16).padStart(2,"0")).join("");
        if(!current())return;if(controller.signal.aborted)throw new DOMException("aborted","AbortError");
        const validated=validateRuntimeReport(value,{deliveryId:`lab-${scenario}-${value.runId}`,deliveryDigest:expectedDigest,runId:value.runId,plan,target:httpTarget(protocol,scenario)});
        httpReport = validated; httpReports[scenario]=validated;
        track("http_completed");
    }
    catch (error) {
        if(!current())return;
        httpError = error instanceof Error ? (error.name === "AbortError" ? tr("40 秒内未得到报告；本次不能判断通过。", "No report within 40 seconds; this run does not establish a pass.") : error.message) : tr("接口检查未完成。", "The HTTP check did not complete.");
        track("http_error");
    }
    finally {
        clearTimeout(timer);
        if(current()){httpBusy = false;httpController=undefined;}
    }
}
const HTTP_NAMES:Record<string,[string,string]>={
    revision:["核对声明的接口版本","Declared target revision"],missing_slot:["缺少预约时间应被拒绝","Reject missing slot"],invalid_email:["错误邮箱应被拒绝","Reject malformed email"],create:["创建虚构预约","Create a synthetic booking"],readback:["用独立请求查回预约","Read the booking independently"],replay:["重复提交应返回同一预约","Replay the same idempotency key"],conflict:["冲突提交应被拒绝","Reject changed data with the same key"],unchanged:["原预约内容应保持不变","Read the original record again"],
    party_zero:["零人预约应被拒绝","Reject zero people"],party_fraction:["非整数人数应被拒绝","Reject fractional party size"],party_below:["上限减一人数应可预约","Create one below the agreed maximum"],party_below_readback:["独立查回上限减一的预约","Read back the below-maximum booking"],party_exact:["恰好上限人数应可预约","Create exactly at the agreed maximum"],party_exact_readback:["独立查回上限人数的预约","Read back the maximum-size booking"],party_above:["超过约定上限应被拒绝","Reject one above the agreed maximum"],concurrent_first:["并发重复提交 · 第一份响应","Concurrent same-key request: first response"],concurrent_second:["并发重复提交 · 第二份响应","Concurrent same-key request: second response"],concurrent_readback:["独立查回并发请求的同一预约","Read back the concurrent requests’ booking"],
};
function httpStep(value:HttpReport,id:string){return (Array.isArray(value.steps)?value.steps:[]).map(asRecord).find(step=>step?.id===id);}
function httpCounts(value:HttpReport){const steps=(Array.isArray(value.steps)?value.steps:[]).map(asRecord);return{total:steps.length,observed:steps.filter(step=>step?.outcome==="observed").length,issues:steps.filter(step=>step?.outcome==="mismatch").length,unavailable:steps.filter(step=>step?.outcome==="unavailable").length};}
function httpRequirementText(protocol:HttpProtocol,maxPartySize:number){return protocol!=="booking-http-v1"?`Each booking accepts at most ${maxPartySize} people.`:"The booking backend must reject invalid input, preserve independently readable bookings and handle replay/conflict without duplicate or overwritten records.";}
const httpCapacityText=()=>"Each time slot accepts at most 8 guests in total.";
function httpPlan(protocol:HttpProtocol,maxPartySize:number):RuntimeCheckPlan{
    const source=httpRequirementText(protocol,maxPartySize),citation={start:0,end:source.length,excerpt:source};
    if(protocol==="booking-http-v1")return{protocol,criterionId:"booking",source:citation};
    const policy=suggestBookingPolicy(citation)!;
    if(protocol==="booking-http-v2")return{protocol,criterionId:"booking",source:citation,policy};
    const text=httpCapacityText(),slotCitation={start:source.length+1,end:source.length+1+text.length,excerpt:text};
    return{protocol,criterionId:"booking",source:citation,policy,slotCapacity:{criterionId:"slot-capacity",...suggestSlotCapacity(slotCitation)!}};
}
function httpTarget(protocol:HttpProtocol,scenario:Variant){return{
    id:protocol==="booking-http-v4"?`lab-coverage-${scenario==="flawed"?"validation-gap":"fixed"}`:protocol==="booking-http-v3"?`lab-capacity-${scenario}`:protocol==="booking-http-v2"?`lab-policy-${scenario}`:`lab-${scenario}`,
    label:protocol==="booking-http-v4"?`Controlled combined ${scenario==="flawed"?"validation-gap":"fixed"} booking fixture`:protocol==="booking-http-v3"?`Controlled native ${scenario} capacity fixture`:`Controlled disposable ${scenario} booking fixture`,
    baseUrl:`${location.origin}/test-api/${protocol==="booking-http-v4"?`coverage-${scenario==="flawed"?"validation-gap":"fixed"}`:`${protocol==="booking-http-v3"?"capacity-":protocol==="booking-http-v2"?"policy-":""}${scenario}`}/`,
    revision:protocol==="booking-http-v4"?`coverage-${scenario==="flawed"?"validation-gap":"fixed"}-v1`:protocol==="booking-http-v3"?`capacity-${scenario==="flawed"?"overbook":"fixed"}-v1`:protocol==="booking-http-v2"?`booking-policy-${scenario}-v1`:scenario==="fixed"?"booking-fixed-v2":"booking-flawed-v1",
    protocol,testOnly:true as const,
};}
function capacityContract(){
    const plan=httpPlan(httpProtocol==="booking-http-v4"?"booking-http-v4":"booking-http-v3",6);if(plan.protocol!=="booking-http-v3"&&plan.protocol!=="booking-http-v4")throw new Error("Capacity plan unavailable");
    return{schema:"proofbeforepay-guest-capacity-contract-v1",namespace:{runId:"Generate one fresh UUID per consented run; replace every {runId} template with it",marker:"PBP-{runId}",syntheticCanary:{testRunId:"{runId}",marker:"PBP-{runId}",customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:CAPACITY_SLOTS.a,partySize:5},actualWinningRaceKey:"Use the key of the actual 201 capacity contender; never assume race-a wins"},plan,slots:plan.protocol==="booking-http-v4"?CAPACITY_V4_SLOTS:CAPACITY_SLOTS,steps:runtimeCapacityStepDefinitions(plan),executionOrder:plan.protocol==="booking-http-v4"?CAPACITY_V4_EXECUTION_ORDER:CAPACITY_EXECUTION_ORDER,
      keys:{above:"pbp-{runId}-capacity-above",raceA:"pbp-{runId}-capacity-race-a",raceB:"pbp-{runId}-capacity-race-b",replay:"actual winning race key",fill:"pbp-{runId}-capacity-fill",extra:"pbp-{runId}-capacity-extra",slotB:"pbp-{runId}-capacity-slot-b"},
      ...(plan.protocol==="booking-http-v4"?{additionalRequests:{missing_slot:{key:"pbp-{runId}-capacity-missing-slot",omit:["slot"]},invalid_email:{key:"pbp-{runId}-capacity-invalid-email",email:"not-an-email"},party_zero:{key:"pbp-{runId}-capacity-zero",partySize:0},party_fraction:{key:"pbp-{runId}-capacity-fraction",partySize:1.5},party_negative:{key:"pbp-{runId}-capacity-negative",partySize:-1},party_string:{key:"pbp-{runId}-capacity-string",partySize:"1"},winner_conflict:{key:"actual winning race key",partySize:1},same_key_first:{key:"pbp-{runId}-capacity-same-key",partySize:1,slot:CAPACITY_V4_SLOTS.c,concurrentGroup:"same-key-coverage-pair"},same_key_second:{key:"pbp-{runId}-capacity-same-key",partySize:1,slot:CAPACITY_V4_SLOTS.c,concurrentGroup:"same-key-coverage-pair"},party_one:{key:"pbp-{runId}-capacity-one",partySize:1,slot:CAPACITY_V4_SLOTS.d},party_below:{key:"pbp-{runId}-capacity-below",partySize:5,slot:CAPACITY_V4_SLOTS.e}}}:{}),
      occupancy:{path:"occupancy/{runId}/{a|b}",required:["testRunId","slot","revision","guestCount","bookingIds"],expectedValuesSentInGet:false},
      targets:{flawed:httpTarget(plan.protocol,"flawed"),fixed:httpTarget(plan.protocol,"fixed")},
      bounds:{maxRequests:plan.protocol==="booking-http-v4"?31:17,maxResponseBytes:16384,totalTimeoutMs:30000,perRequestTimeoutMs:4000},
      scope:"Controlled native SQL policies sharing this lab's physical synthetic D1, not independent external sellers. Fresh consent is required for each run. No identity, AI, real payments or private projects.",
      declaration:"The report fingerprint identifies a declared synthetic fixture, not uploaded frontend bytes, a backend build attestation or a signature.",
      limitations:["Only bounded backend HTTP paths, not frontend form/browser clicks, email, arbitrary-site scanning or a full database/security audit.","Different-key race requires one201 and one409; same winning key must replay200 without consuming occupancy.","Final original receipts follow all later writes; v4 includes C/D/E writes before the final independent receipt GETs. Failed or missing checkpoints remain visible and never imply acceptance or payment."],
    };
}
function httpAggregate(value:HttpReport,id:string):{guestCount:number;bookingIds:string[]}|undefined{
    const step=httpStep(value,id);if(step?.status!==200||typeof step.actual!=="string")return;
    try{const start=step.actual.indexOf("{"),end=step.actual.lastIndexOf("}");if(start<0||end<start)return;const parsed=asRecord(JSON.parse(step.actual.slice(start,end+1)));
      if(!parsed||!Number.isSafeInteger(parsed.guestCount)||(parsed.guestCount as number)<0||(parsed.guestCount as number)>1000||!Array.isArray(parsed.bookingIds)||parsed.bookingIds.length>24||!parsed.bookingIds.every(id=>typeof id==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(id))||new Set(parsed.bookingIds).size!==parsed.bookingIds.length)return;
      return{guestCount:parsed.guestCount as number,bookingIds:parsed.bookingIds};
    }catch{return;}
}
function httpKeyResult(value:HttpReport):{text:string;different:boolean}{
    const counts=httpCounts(value),create=httpStep(value,"create"),readback=httpStep(value,"readback");
    if((httpProtocol==="booking-http-v3"||httpProtocol==="booking-http-v4")){
        const invalidEmail=httpStep(value,"invalid_email"),initial=httpAggregate(value,"slot_a_initial");
        if(httpProtocol==="booking-http-v4"&&invalidEmail?.outcome==="mismatch")return{text:tr(`非法邮箱请求返回 HTTP ${invalidEmail.status??"—"}；负例后独立查询 A 为 ${initial?.guestCount??"未取得读数"} 人。系统未把容量检查跳过的部分当作通过。`,`Invalid email returned HTTP ${invalidEmail.status??"—"}; independent slot A after negative probes reports ${initial?.guestCount??"no reading"} guests. Skipped dependent capacity steps are not passes.`),different:true};
        const aggregate=httpAggregate(value,"slot_a_after_race"),a=httpStep(value,"capacity_race_first"),b=httpStep(value,"capacity_race_second");
        if(aggregate&&aggregate.guestCount>8)return{text:tr(`约定同一时段合计最多 8 人；本次后台独立读回 ${aggregate.guestCount} 人、${aggregate.bookingIds.length} 笔订单，超出约定。`,`Agreed slot total: 8 guests. This run's independent backend readback reports ${aggregate.guestCount} guests across ${aggregate.bookingIds.length} bookings, above the limit.`),different:true};
        if(a?.status===201&&b?.status===201)return{text:tr("两个不同订单都返回创建成功；这不符合只能成功一笔的约定。总人数回读见逐步证据。","Both distinct orders returned creation success, contrary to the one-winner capacity expectation. Inspect the aggregate readback in the step evidence."),different:true};
        return counts.issues||counts.unavailable?{text:tr("容量链条仍有不符或未确定步骤；没有把缺失读数当成通过。","The capacity flow has mismatches or unavailable checkpoints; missing readings are not treated as passes."),different:true}
          :{text:tr("本次全部步骤均有预期观测支持：不同订单争用、原键重放、补满与拒绝多一人，以及其他时段写入后的旧订单保留。","All selected steps have supporting observations: distinct orders contend for capacity, the winner replays, the slot fills and rejects an extra guest, and old receipts survive other-slot writes."),different:false};
    }
    if(httpProtocol==="booking-http-v2"){
        const above=httpStep(value,"party_above"),exact=httpStep(value,"party_exact"),exactRead=httpStep(value,"party_exact_readback"),below=httpStep(value,"party_below"),belowRead=httpStep(value,"party_below_readback");
        if(above?.outcome==="mismatch")return{text:tr(`约定每笔最多 ${httpMaxPartySize} 人，但 ${httpMaxPartySize+1} 人请求返回 HTTP ${above.status??"—"}，未按约定拒绝超限请求。`,`The agreement allows at most ${httpMaxPartySize} people, but a request for ${httpMaxPartySize+1} returned HTTP ${above.status??"—"} without the required rejection.`),different:true};
        if(exact?.outcome!=="observed"||exactRead?.outcome!=="observed"||below?.outcome!=="observed"||belowRead?.outcome!=="observed")return{text:tr(`约定范围内的 ${httpMaxPartySize-1} 人或 ${httpMaxPartySize} 人预约，尚未同时得到创建与独立回读的预期支持。`,`Creation and independent readback are not both supported for the agreed ${httpMaxPartySize-1}-person or ${httpMaxPartySize}-person boundary.`),different:true};
        if(counts.issues||counts.unavailable)return{text:tr("人数边界已有观测支持，其他步骤仍有不符或未确定结果；请查看完整报告。","The party-size boundaries have supporting observations, but other steps differ or remain unavailable. Inspect the full report."),different:true};
        return{text:tr(`本次 ${counts.total} 步均有预期观测支持；人数边界、独立回读与并发重复提交分别记录。`,`All ${counts.total} steps have expected observations in this run; party-size boundaries, independent readback and concurrent retries are recorded separately.`),different:false};
    }
    if(create?.outcome==="observed"&&readback?.status===404)return{text:tr("接口返回创建成功，但独立查询找不到预约。","Creation claimed success, but an independent request could not find the booking."),different:true};
    return readback?.outcome==="observed"?{text:tr("创建与独立回读一致；重复提交与冲突处理的结果另列。","Creation and independent readback agree; replay and conflict results are listed separately."),different:false}:{text:tr("独立回读尚未得到预期支持，请查看具体步骤。","Independent readback is not yet supported; inspect the individual steps."),different:true};
}
function renderHttpChoices(body:HTMLElement){
    const choices=node("div","http-plan-controls"),protocolLabel=node("label","http-plan-field"),protocolSelect=document.createElement("select");
    append(protocolLabel,node("span","",tr("检查范围","Check scope")));protocolSelect.id="http-protocol";protocolSelect.disabled=httpBusy;
    for(const [value,copy]of [["booking-http-v4",tr("基础、边界与容量组合 · 31 步","Combined inputs, boundaries and capacity · 31 steps")],["booking-http-v3",tr("同一时段总容量 · 17 步","Shared slot capacity · 17 steps")],["booking-http-v2",tr("每笔人数规则 · 18 步","Per-booking limits · 18 steps")],["booking-http-v1",tr("基础保存与重复提交 · 8 步","Basic persistence and replay · 8 steps")]]){const option=document.createElement("option");option.value=value;option.textContent=copy;option.selected=value===httpProtocol;append(protocolSelect,option);}
    protocolSelect.addEventListener("change",()=>{if(httpBusy)return;httpProtocol=protocolSelect.value as HttpProtocol;if((httpProtocol==="booking-http-v3"||httpProtocol==="booking-http-v4"))httpMaxPartySize=6;clearHttpDisplay();render();});append(protocolLabel,protocolSelect);append(choices,protocolLabel);
    if(httpProtocol==="booking-http-v2"){
        const maxLabel=node("label","http-plan-field"),select=document.createElement("select");select.id="http-maximum-party";select.disabled=httpBusy;append(maxLabel,node("span","",tr("约定每笔最多人数","Agreed maximum people per booking")));
        for(let maximum=2;maximum<=12;maximum++){const option=document.createElement("option");option.value=String(maximum);option.textContent=tr(`${maximum} 人`,`${maximum} people`);option.selected=maximum===httpMaxPartySize;append(select,option);}
        select.addEventListener("change",()=>{if(httpBusy)return;httpMaxPartySize=Number(select.value);clearHttpDisplay();render();});append(maxLabel,select);append(choices,maxLabel);
    }
    append(body,choices);
    const requirement=node("div","http-test-agreement");append(requirement,node("span","",tr("本次虚构约定原文","Fictional agreement for this run")),node("blockquote","",httpRequirementText(httpProtocol,httpMaxPartySize)));
    if(httpProtocol==="booking-http-v2")append(requirement,description(`将分别请求 ${httpMaxPartySize-1}、${httpMaxPartySize}、${httpMaxPartySize+1} 人，并独立读回允许范围内的预约。选择只改变检验预期，不会修改服务端实际配置。`,`Requests will test ${httpMaxPartySize-1}, ${httpMaxPartySize} and ${httpMaxPartySize+1} people, with independent readback inside the allowed range. Selection changes the expectation, not the service’s actual configuration.`));
    if((httpProtocol==="booking-http-v3"||httpProtocol==="booking-http-v4")){
        append(requirement,node("blockquote","",httpCapacityText()),description("两项分别确认的固定虚构约定：每笔最多 6 人，每个时段合计最多 8 人。两个不同订单各请求 5 人，应只有一笔成功；补入 3 人后拒绝额外 1 人，再验证另一时段可独立预约 6 人。","Two separate fixed fictional clauses: at most 6 guests per booking and 8 in total per slot. Two distinct 5-guest orders should yield one winner; fill 3, reject 1 extra, then independently book 6 in another slot."));
        const handoff=document.createElement("details");append(handoff,node("summary","",tr("查看并下载这次接口交接约定","Inspect and download this backend contract")),description("列出完整原文、本方案的全部步骤、真实执行顺序与固定测试目标。指纹仅标识声明的示例，不证明任何上传网页与后端的构建关系。","Includes both complete clauses, the selected protocol steps, actual execution order and fixed test targets. Its fingerprint identifies the declared fixture, not a build relationship between an uploaded frontend and backend."),button(tr("下载容量测试约定 JSON","Download capacity contract JSON"),()=>download(capacityContract(),"ProofBeforePay-capacity-contract.json")));append(requirement,handoff);
    }
    append(requirement,description("更改检查范围或人数会清空本页两版 HTTP 结果，并需要重新授权。","Changing scope or maximum clears both displayed HTTP reports and requires fresh consent."));append(body,requirement);
}
function renderPolicyFacts(body:HTMLElement,value:HttpReport){
    const facts=node("dl","http-policy-facts");
    for(const [count,createId,readId]of [[httpMaxPartySize-1,"party_below","party_below_readback"],[httpMaxPartySize,"party_exact","party_exact_readback"]] as const){
        const create=httpStep(value,createId),read=httpStep(value,readId),item=node("div");
        append(item,node("dt","",tr(`${count} 人预约`,`${count}-person booking`)),node("dd","",`${tr("创建","Create")} ${create?.status??"—"} / ${tr("独立回读","readback")} ${read?.status??"—"}`));append(facts,item);
    }
    const above=httpStep(value,"party_above"),a=httpStep(value,"concurrent_first"),b=httpStep(value,"concurrent_second"),read=httpStep(value,"concurrent_readback");
    const over=node("div",above?.outcome==="mismatch"?"is-different":"");append(over,node("dt","",tr(`${httpMaxPartySize+1} 人超限请求`,`${httpMaxPartySize+1}-person request above limit`)),node("dd","",tr(`预期拒绝；实际 HTTP ${above?.status??"—"}（${above?.outcome==="observed"?"观测支持":above?.outcome==="mismatch"?"不符":"未确定"}）`,`Expected rejection; actual HTTP ${above?.status??"—"} (${above?.outcome==="observed"?"observed support":above?.outcome==="mismatch"?"mismatch":"unavailable"})`)));append(facts,over);
    const concurrent=node("div");append(concurrent,node("dt","",tr("同键并发重复提交","Concurrent requests with one key")),node("dd","",`HTTP ${a?.status??"—"} + ${b?.status??"—"} · ${tr("读回","readback")} ${read?.status??"—"}`),node("dd","note",a?.outcome==="observed"&&b?.outcome==="observed"?tr("两份响应返回同一 ID；一份创建、一份复用。","Both responses returned one ID: one creation and one replay."):tr("尚未得到一份创建、一份复用同一 ID 的预期支持。","One creation and one replay of the same ID are not yet supported.")));append(facts,concurrent);append(body,facts);
}
function renderCapacityFacts(body:HTMLElement,value:HttpReport){
    const facts=node("dl","http-policy-facts"),a=httpStep(value,"capacity_race_first"),b=httpStep(value,"capacity_race_second"),aggregate=httpAggregate(value,"slot_a_after_race");
    const race=node("div",a?.outcome==="mismatch"||b?.outcome==="mismatch"?"is-different":"");append(race,node("dt","",tr("不同订单各 5 人，同时争用 8 人时段","Two distinct 5-guest orders contend for an 8-guest slot")),node("dd","",`HTTP ${a?.status??"—"} + ${b?.status??"—"}`));append(facts,race);
    for(const[id,zh,en]of[["slot_a_initial","非法输入后 A 应仍为空","A must remain empty after invalid inputs"],["slot_a_after_race","争用后 A，约定总人数 ≤ 8","A after race; agreed total ≤ 8"],["slot_a_after_replay","原键重放后的 A","A after winning-key replay"],["slot_a_after_rejection","其他时段写入后的 A","Final A after other-slot writes"],["slot_b_occupancy","独立时段 B","Independent slot B"]] as const){
        const reading=httpAggregate(value,id),item=node("div",reading&&id!=="slot_b_occupancy"&&reading.guestCount>8?"is-different":"");append(item,node("dt","",tr(zh,en)),node("dd","",reading?tr(`后台回传 ${reading.guestCount} 人，${reading.bookingIds.length} 笔订单`,`Backend reports ${reading.guestCount} guests across ${reading.bookingIds.length} bookings`):tr("没有完整读数，未当作 0 或通过。","No complete reading; not treated as zero or a pass.")));append(facts,item);
    }
    if(aggregate&&aggregate.guestCount>8){const excess=node("div","is-different");append(excess,node("dt","",tr("超出约定","Above the agreed total")),node("dd","",tr(`实际回传 ${aggregate.guestCount} > 约定 8`,`Reported ${aggregate.guestCount} > agreed 8`)));append(facts,excess);}
    append(body,facts,description("人数和编号来自本次独立 GET 回传的有界状态，不是全数据库审计。两个订单争用不同键；赢家重放使用其原来的同一键。","Counts and IDs come from bounded state returned by this run's independent GET, not a complete database audit. The contenders use different keys; replay uses the actual winner's original key."));
}
function renderCombinedFacts(body:HTMLElement,value:HttpReport){
    const section=node("div","http-version-comparison");append(section,node("h3","",tr("这次31步覆盖了什么","What this31-step run covers")));
    const coverage=runtimeCoverage(httpPlan("booking-http-v4",6),value as import("../../lib/runtime-checks.ts").RuntimeCheckReport);
    for(const group of coverage.groups)append(section,node("p","",`${runtimeCoverageFamilyName(group.id,language)}: ${tr(`预期观测 ${group.observed??0}/${group.planned}，不符 ${group.mismatched??0}，未确定 ${group.unavailable??group.planned}`,`expected ${group.observed??0}/${group.planned}, mismatched ${group.mismatched??0}, unavailable ${group.unavailable??group.planned}`)}`));
    const email=httpStep(value,"invalid_email");append(section,node("p","",tr(`错误邮箱这一项：HTTP ${email?.status??"—"}；${email?.outcome??"unavailable"}`,`Malformed email: HTTP ${email?.status??"—"}; ${email?.outcome??"unavailable"}`)));append(body,section);
}
function renderHttp() {
    const { section, body } = panel(tr("预约接口，兑现约定了吗？", "Does the booking service meet the agreement?"), tr("真实 HTTP 实测", "Actual HTTP check"));section.classList.add("http-panel");
    append(body, httpProtocol==="booking-http-v4"?description("基础检查与容量检查在同一轮运行。这个缺陷版能正确控制容量，却错误接受了虚构非法邮箱；增加的检查会实际检出它。修正版同时满足输入、重放和容量约定。","Basic and capacity checks run together. This flawed service controls capacity but wrongly accepts a fictional invalid email; the expanded checks actually detect it. The corrected service satisfies the input, replay and capacity agreement.","workflow-message"):httpProtocol==="booking-http-v3"?description("让两个不同订单同时争用一个时段，检查系统是否真的控制总容量。缺陷版会超卖，修正版由原生 SQL 规则约束；报告来自本次真实 HTTP 与独立回读。","Make two distinct orders contend for one slot and test whether the total is enforced. The flawed native policy overbooks; the corrected policy uses SQL constraints. Reports come from this run's actual HTTP requests and independent readbacks.","workflow-message"):httpProtocol==="booking-http-v2"?description("两种接口都能保存预约，但缺陷版未执行声明的人数上限。按本次约定请求边界人数，再检查无效输入、重复请求与并发响应。结果由本次真实请求生成。","Both services persist bookings, but the flawed revision does not enforce its declared party-size limit. Test the agreed boundaries, invalid inputs, replay and concurrent responses with actual requests.","workflow-message"):description("测试本实验室的两种受控虚构交付：缺陷版会出现“返回成功但未保存”等问题，修正版用于对照。每次运行都实际发出 HTTP 请求，再独立读回。", "Test two controlled fictional deliveries in this lab. The flawed service includes problems such as claiming success without saving; the corrected service provides a comparison. Every run sends actual HTTP requests and separately reads back the result.", "workflow-message"));
    append(body, description("只访问本实验室固定接口，不扫描任意卖家网站，不点击卖家前端、不验证邮件。只发送生成的虚构测试资料；容量策略使用本实验库的专用 SQL 表，物理数据库共享。不访问主站项目、身份或密钥。", "Only fixed lab endpoints run; no arbitrary seller scan, frontend clicks or email test. Generated fictional data uses dedicated native capacity tables in this lab's shared physical database. Main-site projects, identities and secrets are not accessed.", "boundary"));
    renderHttpChoices(body);
    if(httpProtocol==="booking-http-v4")append(body,description("本方案把基础输入、合法人数、同键重复请求及容量争抢放在同一轮：错误邮箱、缺少时间、零人、小数、负数、字符串人数、1人／上限减1／上限、改动数据冲突、两类并发及最终回读。共31个有界观测；不是全站自动验收。缺陷版故意允许虚构的非法邮箱落库，修正版拒绝它。","One run combines basic inputs, valid party boundaries, same-key replay and capacity contention: malformed email, missing slot, zero, fractional, negative and string counts;1/below/max parties; changed-data conflict; both concurrency patterns and final readbacks. These31 bounded observations are not a whole-site acceptance test. The flawed policy deliberately stores one fictional invalid email; the corrected policy rejects it.","workflow-message"));
    const consent = document.createElement("input");
    consent.type = "checkbox";
    consent.id = "http-consent";
    consent.checked = httpConsent;
    consent.disabled = httpBusy;
    const label = node("label", "checkbox-line");
    append(label, consent, node("span", "", tr("我同意向这个虚构示例服务提交测试请求。不会发送我输入的修改草稿或任何私人资料。", "I agree to submit test requests to this fictional service. My feedback draft and private material will not be sent.")));
    append(body, label);
    const actions = node("div", "action-row"), flawed = button(tr("测试缺陷版接口", "Test flawed service"), () => runHttp("flawed"), { attention: true, disabled: !httpConsent || httpBusy }), fixed = button(tr("测试修正版接口", "Test corrected service"), () => runHttp("fixed"), { primary: true, disabled: !httpConsent || httpBusy });
    consent.addEventListener("change", () => { httpConsent = consent.checked; flawed.disabled = !httpConsent || httpBusy; fixed.disabled = !httpConsent || httpBusy; });
    append(actions, flawed, fixed);
    if(httpBusy)append(actions,button(tr("停止等待本次报告","Stop waiting for this report"),()=>{httpSequence++;httpController?.abort();httpController=undefined;httpBusy=false;httpConsent=false;httpError=tr("已停止等待；已发出的请求可能已写入虚构测试数据，本次未记录通过。","Stopped waiting. Sent requests may have written fictional test data; no pass was recorded.");track("http_error");}));
    append(body, actions);
    if (httpBusy)
        append(body, node("p", "note busy-state", tr("正在执行请求、校验与独立读回…", "Running requests, validation and independent readback…")));
    if (httpError)
        append(body, node("p", "result-message error", httpError));
    if (httpReport) {
        append(body,description("接口修订号由受控目标声明，不证明它由任何上传文件构建。","The controlled target declares its revision; this does not attest that it was built from uploaded files."));
        const target = asRecord(httpReport.target), steps = Array.isArray(httpReport.steps) ? httpReport.steps : [], counts=httpCounts(httpReport);
        append(body, node("p", `result-message${counts.issues || counts.unavailable ? " error" : ""}`, tr(`本次${httpScenario === "flawed" ? "缺陷版" : "修正版"} ${counts.total} 步：${counts.observed} 步有预期观测支持，${counts.issues} 项不符，${counts.unavailable} 项无法确定。`, `This ${httpScenario === "flawed" ? "flawed" : "corrected"} run: ${counts.total} steps, ${counts.observed} observed support, ${counts.issues} mismatched, ${counts.unavailable} unavailable.`)));
        const keyResult=httpKeyResult(httpReport);append(body,node("p",`http-key-result${keyResult.different?" is-different":""}`,keyResult.text));
        if(httpProtocol==="booking-http-v2")renderPolicyFacts(body,httpReport);
        if(httpProtocol==="booking-http-v4")renderCombinedFacts(body,httpReport);
        if((httpProtocol==="booking-http-v3"||httpProtocol==="booking-http-v4"))renderCapacityFacts(body,httpReport);
        if(httpReports.flawed&&httpReports.fixed){
            const comparison=node("div","http-version-comparison");append(comparison,node("h3","",tr("两次实际运行，使用同一约定和协议","Two actual runs, the same agreement and protocol")));
            for(const variant of ["flawed","fixed"] as const){
                const saved=httpReports[variant]!,c=httpStep(saved,"create"),r=httpStep(saved,"readback"),above=httpStep(saved,"party_above"),counts=httpCounts(saved);
                const raceA=httpStep(saved,"capacity_race_first"),raceB=httpStep(saved,"capacity_race_second"),aggregate=httpAggregate(saved,"slot_a_after_race"),finalA=httpAggregate(saved,"slot_a_after_rejection");
                const observed=httpProtocol==="booking-http-v4"?tr(`非法邮箱 HTTP ${httpStep(saved,"invalid_email")?.status??"—"}；负例后 A ${httpAggregate(saved,"slot_a_initial")?.guestCount??"—"} 人；最后 A ${finalA?.guestCount??"—"} 人`,`Malformed email HTTP ${httpStep(saved,"invalid_email")?.status??"—"}; A after negatives ${httpAggregate(saved,"slot_a_initial")?.guestCount??"—"} guests; final A ${finalA?.guestCount??"—"}`):httpProtocol==="booking-http-v3"?tr(`不同订单争用 HTTP ${raceA?.status??"—"} / ${raceB?.status??"—"}；争用后 A ${aggregate?.guestCount??"—"} 人，最后 A ${finalA?.guestCount??"—"} 人`,`Distinct-order contention HTTP ${raceA?.status??"—"} / ${raceB?.status??"—"}; A after race ${aggregate?.guestCount??"—"} guests, final A ${finalA?.guestCount??"—"} guests`):httpProtocol==="booking-http-v2"?tr(`${httpMaxPartySize+1} 人超限请求 HTTP ${above?.status??"—"}`,`${httpMaxPartySize+1}-person request above limit: HTTP ${above?.status??"—"}`):`${tr("创建","Create")} HTTP ${c?.status??"—"} → ${tr("独立回读","Readback")} HTTP ${r?.status??"—"}`;
                append(comparison,node("p","",`${tr(variant==="flawed"?"缺陷版":"修正版",variant==="flawed"?"Flawed":"Corrected")}: ${observed} · ${counts.issues} ${tr("项不符","mismatched")} / ${counts.unavailable} ${tr("项未确定","unavailable")}`));
            }
            append(comparison,button(tr("下载两版实测对照","Download both actual runs"),()=>download({method:httpProtocol==="booking-http-v4"?"controlled-http-comparison-v4":httpProtocol==="booking-http-v3"?"controlled-http-comparison-v3":"controlled-http-comparison-v2",scope:"Two separately declared synthetic targets, not real buyer acceptance or frontend/build attestation",protocol:httpProtocol,agreedSource:httpRequirementText(httpProtocol,httpMaxPartySize),...(httpProtocol==="booking-http-v2"?{maxPartySize:httpMaxPartySize}:{}),plan:httpPlan(httpProtocol,httpMaxPartySize),...((httpProtocol==="booking-http-v3"||httpProtocol==="booking-http-v4")?{contract:capacityContract()}:{}),reports:httpReports},"ProofBeforePay-HTTP-comparison.json")));append(body,comparison);
        }
        const results = node("div", "http-results");
        append(results, node("h3", "", tr("逐步请求与读回证据", "Step-by-step request and readback evidence")), node("p", "report-meta", `${String(httpReport.method)} · ${typeof target?.label === "string" ? target.label : ""} · ${typeof target?.revision === "string" ? target.revision : ""}`));
        const list = node("ol");
        for (const raw of steps) {
            const step = asRecord(raw);
            if (!step)
                continue;
            const outcome = step.outcome === "observed" ? "observed" : step.outcome === "mismatch" ? "mismatch" : "unavailable", item = node("li"), heading = node("div", "step-heading");
            append(heading, node("strong", "", typeof step.id==="string"?HTTP_NAMES[step.id]?tr(...HTTP_NAMES[step.id]):runtimeStepName(step.id,language):typeof step.label === "string" ? step.label : tr("检查步骤", "Check step")), node("span", `step-badge ${outcome}`, outcome === "observed" ? tr("本次观测支持", "Observed support") : outcome === "mismatch" ? tr("不符", "Mismatch") : tr("无法确定", "Unavailable")));
            append(item, heading);
            const details = document.createElement("details");
            append(details, node("summary", "", tr("查看方法、状态和预期／实际值", "Inspect method, status and expected/actual values")), node("pre", "", jsonText({ id: step.id, method: step.method, path: step.path, status: step.status, expected: step.expected, actual: step.actual, reason: step.reason })));
            append(item, details);
            append(list, item);
        }
        append(results, list);
        const full = document.createElement("details");
        append(full, node("summary", "", tr("完整原始报告", "Full raw report")), node("pre", "raw-report", jsonText(httpReport, 48000)));
        append(results, full);
        append(body, results, button(tr("下载本次 HTTP 报告 JSON", "Download this HTTP report JSON"), () => download(httpReport, `ProofBeforePay-HTTP-${httpScenario}.json`)));
        append(body, description("这里只说明本次受控 HTTP 路径的结果。绿色观察不等于整个网站无 bug，也不会自动接受交付或触发付款。", "This establishes only this run’s controlled HTTP path. Observed support does not establish a bug-free website, accept a delivery or initiate payment."));
    }
    return section;
}
function renderTrial() {
    const details = document.createElement("details");
    details.className = "panel trial-panel";
    details.open = trialOpen;
    details.addEventListener("toggle", () => { trialOpen = details.open; });
    append(details, node("summary", "", tr("可选：首次使用任务记录（仅本页、可下载）", "Optional: first-use task record (local and downloadable)")));
    const body = node("div", "trial-body");
    append(body, description("此工具准备观察记录，不会凭空产生测试者或成功率。操作者类型与结果由填写者声明，没有身份核实；开发者或自动化走查不能算陌生真人研究。没有遥测上传。", "This prepares observations; it does not create participants or success rates. Operator type and outcomes are self-declared without identity verification. Developer or automation checks are not unfamiliar-user research. No telemetry is uploaded."));
    if (!trial) {
        const controls = node("div", "trial-controls"), select = document.createElement("select");
        select.setAttribute("aria-label", tr("操作者类型（自行声明）", "Operator type (self-declared)"));
        for (const [value, label] of [["unknown", tr("未说明", "Unspecified")], ["developer", tr("开发者走查", "Developer check")], ["automation", tr("自动化／AI 操作", "Automation / AI operation")], ["self-declared-first-time", tr("自称首次使用者（未核实）", "Self-declared first-time user (unverified)")]]) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            option.selected = value === operator;
            append(select, option);
        }
        select.addEventListener("change", () => { operator = select.value as TrialOperator; });
        append(controls, select, button(tr("开始本地记录", "Start local record"), () => { trial = createFirstUseTrial({ sessionId: crypto.randomUUID(), build: BUILD, operator, startedAt: new Date().toISOString() }, performance.now()); trialOpen = true; }));
        append(body, controls);
    }
    else {
        const attempt = trial.attempts.findLast(item => item.endedMs === undefined), controls = node("div", "trial-controls");
        if (!attempt) {
            const select = document.createElement("select");
            select.setAttribute("aria-label", tr("选择任务", "Choose task"));
            for (const task of FIRST_USE_TASKS) {
                const option = document.createElement("option");
                option.value = task;
                option.textContent = `${task} · ${tr(...TASK_COPY[task])}`;
                option.selected = selectedTask === task;
                append(select, option);
            }
            select.addEventListener("change", () => { selectedTask = select.value as FirstUseTask; });
            append(controls, select, button(tr("开始选定任务", "Start selected task"), () => { trial = startFirstUseTask(trial!, selectedTask, performance.now()); }));
        }
        else {
            append(controls, button(tr("记录一次帮助", "Record one help event"), () => { trial = noteFirstUseHelp(trial!, performance.now()); }));
            const select = document.createElement("select");
            select.setAttribute("aria-label", tr("自报任务结果（未经独立核验）", "Declared task outcome (unverified)"));
            for (const [value, label] of [["independent", tr("声明独立完成", "Declared independent")], ["with_help", tr("帮助后完成", "Completed with help")], ["not_completed", tr("未完成", "Not completed")], ["unavailable", tr("功能不可用", "Function unavailable")], ["stopped", tr("主动停止", "Stopped")]]) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                option.selected = value === selectedOutcome;
                append(select, option);
            }
            select.addEventListener("change", () => { selectedOutcome = select.value as TrialOutcome; });
            append(controls, select, button(tr("结束当前任务并记录结果", "End task and record outcome"), () => { trial = finishFirstUseTask(trial!, selectedOutcome, performance.now()); }));
        }
        append(controls, button(tr("下载本地任务记录 JSON", "Download local task record JSON"), () => download(exportFirstUseTrial(trial!), "ProofBeforePay-first-use-local.json")));
        append(body, controls, node("p", "trial-status", `${tr("操作者声明", "Declared operator")}: ${trial.operator} · ${tr("已开始任务", "Tasks started")}: ${trial.attempts.length} · ${tr("当前任务", "Current task")}: ${attempt?.task ?? tr("无", "None")}${attempt ? ` · ${tr("已记录帮助", "Help events")}: ${attempt.helpCount}` : ""}`));
    }
    const tasks = node("ol", "task-list");
    for (const task of FIRST_USE_TASKS)
        append(tasks, node("li", "", `${task} — ${tr(...TASK_COPY[task])}`));
    append(body, tasks, description("仅实际开始的任务才进入导出，不给未执行的任务填 0 或成功。刷新会清空本页记录；如需保存，请先下载。不要在修改草稿或记录中输入真实客户资料。", "Only actually started tasks enter the export. Unperformed tasks do not become zeroes or successes. Reloading clears this page; download first to retain a record. Do not enter real client material in drafts or records."));
    append(details, body);
    return details;
}
function render() { document.documentElement.lang = language === "zh" ? "zh-CN" : "en"; app.replaceChildren(); const header = node("header", "site-header"), brand = node("div", "brand"); append(brand, document.createTextNode("proof"), node("span", "", "before"), document.createTextNode("pay.")); const actions = node("div", "header-actions"); append(actions, node("small", "", tr("访客实验室 · 无需登录", "Guest lab · no sign-in")), button(language === "zh" ? "EN" : "中文", () => { language = language === "zh" ? "en" : "zh"; }), button(tr("重置本页交付", "Reset local handoff"), resetCase, { className: "reset-button", disabled:httpBusy })); const evidenceLink=node("a","evidence-navigation",tr("离线核对证据包","Check an evidence export"));evidenceLink.setAttribute("href","./verify.html");append(header, brand, actions); append(app, header); const main = node("main"), intro = node("section", "intro"), copy = node("div"); append(copy, node("h1", "", tr("付款前，先验证交付的承诺。", "Test the delivered promise before you pay.")), description("先核对约定与交付文字，再用真实 HTTP 请求检查人数边界、重复提交和独立读回。两种证据分别展示，最终决定始终由人确认。", "Compare agreed and delivered copy, then use actual HTTP requests to test party-size boundaries, replay and independent readback. The evidence stays separate; a person makes the final decision.")); append(intro, copy, node("span", "scope-label", tr("独立虚构实验室\n不访问主站项目或密钥", "Isolated fictional lab\nNo main-workspace data or keys"))); append(copy,evidenceLink); const journeyLink=node("a","evidence-navigation",tr("表单、取消、改期与重试流程实验","Form, cancellation, reschedule and retry lab"));journeyLink.setAttribute("href","./journeys.html");append(copy,journeyLink); const timeLink=node("a","evidence-navigation",tr("营业时间、提前预约与夏令时实验","Opening hours, notice and DST lab"));timeLink.setAttribute("href","./time-policy.html");append(copy,timeLink); append(main, intro); if (message)
    append(main, node("p", `message-bar${messageError ? " error" : ""}`, message)); const switcher=node("nav","mobile-lab-switch");switcher.setAttribute("aria-label",tr("实验室工作区","Lab workspace"));for(const view of ["local","http"] as const){const b=button(tr(view==="local"?"交付对照":"HTTP 深度检查",view==="local"?"Delivery comparison":"HTTP verification"),()=>{labView=view;});b.setAttribute("aria-pressed",String(labView===view));append(switcher,b);}append(main,switcher);const grid = node("div", `lab-grid mobile-${labView}`); append(grid, renderLocal(), renderHttp()); append(main, grid, renderTrial(), description("本页没有 AI 模型调用、PayPal 请求或真实商家订单。静态对照在浏览器内计算；预约 HTTP 测试只写入这座实验室独立的虚构服务。没有测试任意第三方网站或邮件系统。", "This page makes no AI model or PayPal calls and creates no real merchant orders. Static comparisons run locally; booking HTTP checks write only to this lab’s isolated fictional service. No arbitrary third-party website or email system is tested.", "lab-footer")); append(app, main); }
render();
