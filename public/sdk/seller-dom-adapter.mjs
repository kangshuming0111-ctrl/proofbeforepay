/** DOM executor for a seller-owned synthetic staging page. No network calls,
 * eval, arbitrary commands or acceptance authority. Pair with the existing
 * installSellerBridge envelope; observations remain cooperative client claims. */
export const DOM_ADAPTER_VERSION = "pbp-seller-dom-adapter-v1";
const ACTIONS = {create:["create","cancel-create"],cancel:["cancel","cancel-first"],rebook:["create","cancel-five"],fill:["create","cancel-three"],cancel_repeat:["cancel","cancel-repeat"],reject_extra:["create","cancel-extra"],source_create:["create","source-create"],move_full:["move","move-full"],move_free:["move","move-free"],response_loss_create:["create","loss-create"],response_loss_retry:["retry-original"]};
const SLOTS = ["2099-01-01T10:00:00Z","2099-01-01T11:00:00Z","2099-01-01T12:00:00Z"];
const plain = value => !!value && typeof value === "object" && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
function fail(reason) { throw new Error(`seller_dom_${reason}`); }
function cloneJson(value, maxBytes = 16 * 1024) {
  let nodes = 0; const seen = new Set();
  function visit(item, depth) {
    if (++nodes > 4000 || depth > 12) fail("journal_not_bounded_json");
    if (item === null || typeof item === "boolean" || typeof item === "string" || typeof item === "number" && Number.isFinite(item)) return;
    if (!item || typeof item !== "object" || seen.has(item)) fail("journal_not_bounded_json"); seen.add(item);
    if (Array.isArray(item)) { if (item.length > 100) fail("journal_not_bounded_json"); for (const child of item) visit(child, depth + 1); seen.delete(item); return; }
    if (!plain(item)) fail("journal_not_bounded_json");
    for (const key of Reflect.ownKeys(item)) { const d = Object.getOwnPropertyDescriptor(item,key); if (typeof key !== "string" || ["__proto__","constructor","prototype"].includes(key) || !d || !("value" in d)) fail("journal_not_bounded_json"); visit(d.value,depth+1); }
    // Reject cycles on the current recursion path, while allowing a native
    // completion to reference the same receipt in its journal and UI result.
    // Node/byte budgets still count the full expanded JSON representation.
    seen.delete(item);
  }
  visit(value,0); const json = JSON.stringify(value); if (new TextEncoder().encode(json).byteLength > maxBytes) fail("journal_too_large"); return JSON.parse(json);
}
function command(value) {
  const c = cloneJson(value,4096), a = c.action, definition = ACTIONS[c.actionId];
  if (!exact(c,["sequence","actionId","action"]) || !Object.hasOwn(ACTIONS,c.actionId) || !definition || !Number.isInteger(c.sequence) || c.sequence < 1 || c.sequence > 11 || !plain(a) || a.type !== definition[0]) fail("unsupported_command");
  if (a.type === "retry-original") { if (!exact(a,["type"])) fail("unsupported_command"); }
  else {
    if (a.requestOperation !== definition[1]) fail("unsupported_command");
    if (a.type === "create") { if (!exact(a,["type","requestOperation","partySize","slot"]) || !Number.isInteger(a.partySize) || a.partySize < 1 || a.partySize > 6 || !SLOTS.includes(a.slot)) fail("unsupported_command"); }
    else if (typeof a.bookingId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(a.bookingId) || (a.type === "cancel" ? !exact(a,["type","requestOperation","bookingId"]) : !exact(a,["type","requestOperation","bookingId","slot"]) || !SLOTS.includes(a.slot))) fail("unsupported_command");
  }
  return c;
}

/** Configure local selectors at deployment, never from a parent message.
 * observe(command) subscribes BEFORE the click and returns {promise,cancel}.
 * The native form resolves it only after its actual action finishes, with
 * {sequence,actionId,requests,receipt?}. The result element must be stamped
 * data-pbp-sequence and data-status by that same native completion handler.
 * This strict handshake detects stale/missing results; it does not make the
 * seller's journal or DOM an independent audit. */
export function createSellerDomExecutor({document:doc = document, runId, forms, result, observe, beforeAction = () => {}, timeoutMs = 10_000}) {
  if (!doc || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(runId??"") || !plain(forms) || typeof observe !== "function" || typeof beforeAction !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) fail("invalid_configuration");
  const required = {create:["partySize","slot","requestOperation","submit"],cancel:["bookingId","requestOperation","submit"],move:["bookingId","slot","requestOperation","submit"],retry:["submit"]};
  for (const [kind,keys] of Object.entries(required)) if (!exact(forms[kind],keys)) fail("invalid_configuration");
  for (const selector of [result,...Object.values(forms).flatMap(row=>Object.values(row))]) if (typeof selector !== "string" || !selector || selector.length > 200) fail("invalid_selector");
  let closed = false, busy = false, sequence = 0, currentCancel;
  function one(selector) { let nodes; try { nodes = doc.querySelectorAll(selector); } catch { fail("invalid_selector"); } if (nodes.length !== 1) fail("selector_not_unique"); return nodes[0]; }
  function usable(element) { if (element.disabled || element.hidden || typeof element.getClientRects !== "function" || element.getClientRects().length === 0) fail("control_unavailable"); }
  function fill(selector,value) {
    const el = one(selector); usable(el); if (!["INPUT","SELECT","TEXTAREA"].includes(el.tagName) || el.readOnly) fail("control_unavailable");
    const view = doc.defaultView, prototype = el.tagName === "SELECT" ? view?.HTMLSelectElement?.prototype : el.tagName === "TEXTAREA" ? view?.HTMLTextAreaElement?.prototype : view?.HTMLInputElement?.prototype;
    const setter = prototype && Object.getOwnPropertyDescriptor(prototype,"value")?.set;
    if (!setter) fail("native_value_setter_unavailable"); setter.call(el,value);
    el.dispatchEvent(new view.Event("input",{bubbles:true})); el.dispatchEvent(new view.Event("change",{bubbles:true}));
    if (el.value !== value) fail("control_value_not_retained"); return el.value;
  }
  function stop(reason = "stopped_external_outcome_unknown") { if (closed) return; closed = true; currentCancel?.(new Error(`seller_dom_${reason}`)); }
  return {
    async execute(raw) {
      const c = command(raw); if (closed || busy || c.sequence !== sequence + 1) fail("session_unavailable"); busy = true;
      let subscription, timer, complete, sent = false;
      try {
        beforeAction(c); if (closed) fail("session_unavailable"); const a = c.action, spec = forms[a.type === "retry-original" ? "retry" : a.type], fields = {operation:a.type === "retry-original" ? "create" : a.type};
        if (a.type !== "retry-original") {
          fields.requestOperation = fill(spec.requestOperation,a.requestOperation);
          if (a.type === "create") fields.partySize = fill(spec.partySize,String(a.partySize));
          if (a.type === "cancel" || a.type === "move") fields.bookingId = fill(spec.bookingId,a.bookingId);
          if (a.type === "create" || a.type === "move") fields.slot = fill(spec.slot,a.slot);
          // A framework may re-render an earlier input when a later input
          // changes. Re-read every mapped value together before the click.
          for (const [name,value] of Object.entries(fields)) if (name !== "operation" && one(spec[name]).value !== value) fail("control_value_not_retained");
        }
        // Read and validate actual controls before subscribing or submitting.
        const submit = one(spec.submit); usable(submit);
        if (submit.tagName !== "BUTTON" && !(submit.tagName === "INPUT" && ["submit","button"].includes(submit.type))) fail("submit_control_invalid");
        if (submit.form && !submit.form.checkValidity()) fail("native_validation_failed");
        const output = one(result); if (output.dataset.pbpSequence === String(c.sequence)) fail("stale_result");
        subscription = observe(c);
        if (!subscription || typeof subscription.promise?.then !== "function" || typeof subscription.cancel !== "function") fail("completion_subscription_invalid");
        const abort = new Promise((_,reject) => { currentCancel = reject; });
        const timeout = new Promise((_,reject) => { timer = setTimeout(()=>reject(new Error("seller_dom_completion_timeout_external_outcome_unknown")),timeoutMs); });
        // Attach all rejection handlers before the click (a form may complete
        // synchronously), and never resend on any completion error.
        complete = Promise.race([subscription.promise,abort,timeout]);
        sent = true; submit.click();
        const observed = cloneJson(await complete,80*1024);
        if (!plain(observed) || Object.keys(observed).some(k=>!["sequence","actionId","requests","receipt"].includes(k)) || observed.sequence !== c.sequence || observed.actionId !== c.actionId || !Array.isArray(observed.requests) || observed.requests.length > 4) fail("completion_identity_invalid");
        const live = one(result); usable(live);
        if (live.dataset.pbpSequence !== String(c.sequence) || !["success","error","unknown"].includes(live.dataset.status) || typeof live.textContent !== "string" || !live.textContent.trim() || live.textContent.length > 2000) fail("result_not_bound_to_completion");
        for (const trace of observed.requests) {
          if (!plain(trace) || Object.keys(trace).some(k=>!["method","path","key","status","request","response","error"].includes(k)) || trace.method !== "POST" || typeof trace.path !== "string" || !/^\/(?:[A-Za-z0-9_~-]+\/)*bookings(?:\/[A-Za-z0-9][A-Za-z0-9_-]{0,99}\/(?:cancel|move))?$/u.test(trace.path) || trace.path.length > 500) fail("request_journal_invalid");
          cloneJson(trace.request ?? null); cloneJson(trace.response ?? null);
          const body=trace.request,operation=a.type==="retry-original"?"create":a.type,bodyKeys=operation==="create"?["testRunId","marker","customer","email","partySize","slot"]:operation==="move"?["testRunId","marker","slot"]:["testRunId","marker"];
          if (!exact(body,bodyKeys) || body.testRunId!==runId || body.marker!==`PBP-${runId}` || operation==="create"&&(body.customer!=="PBP synthetic" || body.email!=="pbp-test@example.invalid" || !Number.isInteger(body.partySize) || body.partySize<1 || body.partySize>6) || operation!=="cancel"&&!SLOTS.includes(body.slot)) fail("non_synthetic_journal");
          if (trace.status!==undefined&&(!Number.isInteger(trace.status)||trace.status<100||trace.status>599) || trace.error!==undefined&&(typeof trace.error!=="string"||!trace.error||trace.error.length>160) || typeof trace.key!=="string" || !trace.key.startsWith(`pbp-${runId}-lifecycle-`) || trace.key.length>180) fail("request_journal_invalid");
        }
        // Retry has no new form values: the native application must expose the
        // same original payload/key in its journal; the server checks equality.
        if (a.type === "retry-original") { const payload=observed.requests[0]?.request; if (payload && plain(payload)) { fields.requestOperation="loss-create"; fields.partySize=String(payload.partySize); fields.slot=String(payload.slot); } }
        sequence = c.sequence;
        return {ui:{actionId:c.actionId,status:live.dataset.status,message:live.textContent.trim(),fields,...(observed.receipt===undefined?{}:{receipt:observed.receipt})},requests:observed.requests};
      } catch (error) {
        // Even failure before a click closes this executor so a partially
        // changed form cannot silently be reused by a different command.
        closed = true; if (complete) void complete.catch(()=>{}); throw error;
      } finally { if (timer) clearTimeout(timer); currentCancel=undefined; subscription?.cancel?.(sent?"finished_or_unknown":"not_submitted"); busy=false; }
    },
    dispose() { stop(); },
  };
}
