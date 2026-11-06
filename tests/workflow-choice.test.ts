import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
type Mode = "demo" | "sandbox" | "collaborative" | "collaborative-sandbox" | "single";
type Element = {type?: unknown; props?: Record<string, unknown>};
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props?.children)];
}
function content(value: unknown): string {
  if (Array.isArray(value)) return value.map(content).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value && typeof value === "object" && "props" in value ? content((value as Element).props?.children) : "";
}
const modes: Mode[] = ["demo", "sandbox", "collaborative", "collaborative-sandbox", "single"];
const component = (async () => {
  const source = await readFile(new URL("../app/components/WorkflowChoice.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText
    .replace('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`);
  return (await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`)).WorkflowChoice;
})();
const props = (value: Mode, language = "en", sampleOnly = false, sandboxAvailable = true, onChange = (_value: Mode) => {}) => ({value, language, sampleOnly, sandboxAvailable, onChange});

test("default use presents two explicit simulation choices and retains all five modes inside one closed optional section", async () => {
  const Choice = await component, tree = Choice(props("demo")), all = nodes(tree);
  const buttons = all.filter(node => node.type === "button");
  assert.deepEqual(buttons.map(content), ["Try both roles · simulated payment", "Invite a seller · simulated payment"]);
  assert.ok(buttons.every(node => node.props?.type === "button"));
  assert.deepEqual(buttons.map(node => node.props?.["aria-pressed"]), [true, false]);
  const details = all.find(node => node.type === "details")!;
  assert.equal(details.props?.open, undefined);
  const select = nodes(details).find(node => node.type === "select")!;
  assert.equal(select.props?.id, "projectWorkflow"); assert.equal(select.props?.value, "demo");
  assert.deepEqual(nodes(select).filter(node => node.type === "option").map(node => node.props?.value), modes);
  const html = renderToStaticMarkup(createElement(Choice, props("demo")));
  assert.ok(html.indexOf('role="status"') < html.indexOf('<details'));
  assert.match(html, /Current choice: <\/strong>Try both roles · simulated payment/u);
});

test("every controlled mode has an always-visible truthful bilingual summary and nondefault modes expose their selector", async () => {
  const Choice = await component;
  for (const language of ["zh", "en"]) for (const mode of modes) {
    const tree = Choice(props(mode, language)), all = nodes(tree), status = all.find(node => node.props?.role === "status")!;
    const expected = mode === "demo" || mode === "collaborative" ? (language === "zh" ? "模拟付款" : "simulated payment") : "PayPal Sandbox";
    assert.ok(content(status).includes(expected), `${language}/${mode}`);
    assert.equal(nodes(all.find(node => node.type === "details")).includes(status), false);
    assert.equal(Boolean(all.find(node => node.type === "details")?.props?.open), mode !== "demo" && mode !== "collaborative");
    const buttons = all.filter(node => node.type === "button");
    assert.deepEqual(buttons.map(node => node.props?.["aria-pressed"]), [mode === "demo", mode === "collaborative"]);
  }
});

test("primary clicks explicitly choose the stated base simulation mode instead of retaining a hidden Sandbox flag", async () => {
  const Choice = await component;
  for (const mode of modes) {
    const changes: Mode[] = [], tree = Choice(props(mode, "en", false, true, value => changes.push(value)));
    const buttons = nodes(tree).filter(node => node.type === "button");
    for (const button of buttons) (button.props!.onClick as () => void)();
    assert.deepEqual(changes, ["demo", "collaborative"], mode);
  }
});

test("the retained advanced selector forwards each exact original mode without automatic conversion or a mount callback", async () => {
  const Choice = await component, changes: Mode[] = [], settings = props("demo", "en", false, true, value => changes.push(value));
  const tree = Choice(settings), select = nodes(tree).find(node => node.type === "select")!;
  assert.deepEqual(changes, []);
  for (const value of modes) (select.props!.onChange as (event: {target: {value: Mode}}) => void)({target: {value}});
  assert.deepEqual(changes, modes); assert.equal(settings.value, "demo");
});

test("sample-only mode never offers invitations or the legacy single-user path", async () => {
  const Choice = await component;
  for (const mode of ["demo", "sandbox"] as Mode[]) for (const language of ["zh", "en"]) {
    const all = nodes(Choice(props(mode, language, true)));
    assert.equal(all.filter(node => node.type === "button").length, 1);
    assert.deepEqual(all.filter(node => node.type === "option").map(node => node.props?.value), ["demo", "sandbox"]);
    assert.equal(all.find(node => node.type === "select")?.props?.value, mode);
  }
});

test("unavailable Sandbox stays visibly unavailable and disabled; single-user fallback is accurately named without changing values", async () => {
  const Choice = await component;
  for (const language of ["zh", "en"]) for (const mode of modes) {
    const changes: Mode[] = [], tree = Choice(props(mode, language, false, false, value => changes.push(value))), all = nodes(tree);
    assert.deepEqual(changes, []); assert.equal(all.find(node => node.type === "select")?.props?.value, mode);
    const options = all.filter(node => node.type === "option");
    assert.ok(options.filter(node => ["sandbox", "collaborative-sandbox"].includes(String(node.props?.value))).every(node => node.props?.disabled === true));
    const status = content(all.find(node => node.props?.role === "status"));
    if (mode === "sandbox" || mode === "collaborative-sandbox") assert.match(status, language === "zh" ? /尚未配置，暂不可用/u : /not configured; unavailable/u);
    if (mode === "single") {assert.match(status, language === "zh" ? /模拟付款/u : /simulated payment/u); assert.doesNotMatch(status, /PayPal Sandbox/u);}
  }
});
