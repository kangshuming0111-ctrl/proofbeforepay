import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {parseFragment} from "parse5";
import ts from "typescript";
import type {GettingStartedProps} from "../app/components/GettingStarted.tsx";
import {RUNTIME_LAB_ORIGIN} from "../lib/runtime-project.ts";

type Element = {nodeName: string; tagName?: string; attrs?: {name: string; value: string}[]; childNodes?: Element[]; value?: string};
function nodes(value: Element): Element[] {
  return [value, ...(value.childNodes ?? []).flatMap(nodes)];
}
function attr(element: Element, name: string) { return element.attrs?.find(attribute => attribute.name === name)?.value; }
function content(element: Element): string {
  return element.nodeName === "#text" ? element.value ?? "" : (element.childNodes ?? []).map(content).join("");
}
function hasClass(element: Element, className: string) { return (attr(element, "class") ?? "").split(/\s+/u).includes(className); }
function within(tree: Element, className: string) { return nodes(tree).find(element => hasClass(element, className)); }

const component = (async () => {
  const source = await readFile(new URL("../app/components/GettingStarted.tsx", import.meta.url), "utf8");
  let output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText.replace('import "../welcome.css";', "");
  for (const name of ["react", "react/jsx-runtime", "lucide-react"]) output = output.replaceAll(JSON.stringify(name), JSON.stringify(import.meta.resolve(name)));
  output = output.replaceAll('"@/lib/runtime-project"', JSON.stringify(new URL("../lib/runtime-project.ts", import.meta.url).href));
  return (await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`)).GettingStarted;
})();
function props(language: "zh" | "en", resume = false, busy = false) {
  const calls: string[] = [];
  const value: GettingStartedProps = {language, busy, onDemo: () => calls.push("new-example"), onStart: () => calls.push("requirements"), onExample: () => calls.push("noodle-requirements"), ...(resume ? {resumeProject: {title: "Existing shop website", status: "Awaiting seller", onOpen: () => calls.push("existing-project")}} : {})};
  return {value, calls};
}
async function render(value: GettingStartedProps) {
  const html = renderToStaticMarkup(createElement(await component, value));
  return {html, tree: parseFragment(html) as Element};
}

test("new and returning users retain two bilingual primary routes without invoking either on render", async () => {
  for (const language of ["zh", "en"] as const) for (const resume of [false, true]) {
    const {value, calls} = props(language, resume), {tree} = await render(value);
    const actions = nodes(within(tree, "welcome-actions")!).filter(element => element.tagName === "button");
    assert.deepEqual(calls, []);
    assert.equal(actions.length, 2);
    assert.ok(actions.every(element => attr(element, "type") === "button"));
    assert.deepEqual(actions.map(content), [resume ? language === "zh" ? "打开这个项目" : "Open this project" : language === "zh" ? "先体验一个完整例子" : "Try a complete example", language === "zh" ? "填写我的项目要求" : "Enter my requirements"]);
    assert.equal(Boolean(within(tree, "welcome-resume")), resume);
    const more = within(tree, "welcome-more")!;
    assert.equal(attr(more, "open"), undefined);
    assert.equal(Boolean(within(more, "welcome-new-example")), resume);
  }
});

test("an invalid runtime resume payload falls back to the working new-user routes", async () => {
  for (const invalid of [null, {}, {title: "Shop", status: "Saved"}, {title: "Shop", status: "Saved", onOpen: "invalid"}, {title: {}, status: "Saved", onOpen: () => {}}, {title: "Shop", status: null, onOpen: () => {}}]) {
    const {value, calls} = props("en");
    const {tree} = await render({...value, resumeProject: invalid as unknown as GettingStartedProps["resumeProject"]});
    const actions = nodes(within(tree, "welcome-actions")!).filter(element => element.tagName === "button");
    assert.equal(content(actions[0]), "Try a complete example");
    assert.equal(within(tree, "welcome-resume"), undefined);
    assert.deepEqual(calls, []);
  }
});

test("busy disables business actions while the illustration disclosure stays available", async () => {
  for (const language of ["zh", "en"] as const) for (const resume of [false, true]) for (const busy of [false, true]) {
    const {value, calls} = props(language, resume, busy), {tree} = await render(value);
    const businessButtons = nodes(tree).filter(element => element.tagName === "button" && !hasClass(element, "welcome-illustration-toggle"));
    assert.equal(businessButtons.length, resume ? 4 : 3);
    assert.ok(businessButtons.every(element => (attr(element, "disabled") !== undefined) === busy));
    const disclosure = within(tree, "welcome-illustration-toggle")!;
    assert.equal(disclosure.tagName, "button");
    assert.equal(attr(disclosure, "type"), "button");
    assert.equal(attr(disclosure, "disabled"), undefined);
    assert.deepEqual(calls, []);
  }
});

test("the illustration disclosure controls its real content with a stable collapsed mobile state", async () => {
  for (const language of ["zh", "en"] as const) {
    const {value} = props(language), {tree} = await render(value);
    const disclosure = within(tree, "welcome-illustration-toggle")!;
    const targetId = attr(disclosure, "aria-controls");
    assert.ok(targetId);
    assert.equal(attr(disclosure, "aria-expanded"), "false");
    assert.equal(attr(within(tree, "welcome-evidence")!, "data-expanded"), "false");
    const targets = nodes(tree).filter(element => attr(element, "id") === targetId);
    assert.equal(targets.length, 1);
    assert.ok(hasClass(targets[0], "welcome-illustration-content"));
    assert.match(content(targets[0]), language === "zh" ? /尚未运行检查/u : /no checks have run/u);
  }
});

test("fictional payment and explicit-AI disclosure stays beside its new-example action, not the resumed project", async () => {
  for (const language of ["zh", "en"] as const) for (const resume of [false, true]) {
    const {value} = props(language, resume), {tree} = await render(value), all = nodes(tree), note = within(tree, "welcome-action-note")!;
    assert.ok(note);
    assert.equal(all.filter(element => hasClass(element, "welcome-action-note")).length, 1);
    assert.match(content(note), language === "zh" ? /虚构项目和模拟付款/u : /fictional project and simulated payment/u);
    assert.match(content(note), language === "zh" ? /AI 评估需要你另行点击/u : /AI assessment runs only when you request it/u);
    assert.equal(nodes(within(tree, "welcome-more")!).includes(note), resume);
    if (resume) {
      assert.ok(nodes(within(tree, "welcome-new-example")!).includes(note));
      assert.doesNotMatch(content(within(tree, "welcome-resume")!), /fictional|simulated|虚构|模拟/u);
    }
  }
});

test("resume title and status are visible escaped data without a claim about chronological order", async () => {
  const {value, calls} = props("en", true);
  value.resumeProject!.title = '<script>untrusted()</script> Shop & "tea"';
  value.resumeProject!.status = '<img src=x onerror=untrusted()> Saved & awaiting review';
  const {tree, html} = await render(value), resume = within(tree, "welcome-resume")!;
  assert.ok(content(resume).includes(value.resumeProject!.title));
  assert.ok(content(resume).includes(value.resumeProject!.status));
  assert.match(html, /&lt;script&gt;untrusted\(\)&lt;\/script&gt; Shop &amp; &quot;tea&quot;/u);
  assert.match(html, /&lt;img src=x onerror=untrusted\(\)&gt; Saved &amp; awaiting review/u);
  assert.doesNotMatch(html, /<script>|<img src=x/u);
  assert.doesNotMatch(content(tree), /most recent|latest|last updated|last created|最近更新|最近创建|上次/u);
  assert.deepEqual(calls, []);
});

test("the existing labs, closed scope disclosure and evidence illustration remain available", async () => {
  for (const resume of [false, true]) {
    const {value} = props("en", resume), {tree} = await render(value), links = nodes(tree).filter(element => element.tagName === "a");
    assert.deepEqual(links.map(element => attr(element, "href")), ["/judge.html", RUNTIME_LAB_ORIGIN, `${RUNTIME_LAB_ORIGIN}/journeys.html`]);
    assert.ok(links.filter(element => attr(element, "href") !== "/judge.html").every(element => attr(element, "target") === "_blank" && attr(element, "rel") === "noreferrer"));
    assert.equal(attr(links.find(element => attr(element, "href") === "/judge.html")!, "target"), undefined);
    assert.equal(attr(within(tree, "welcome-scope")!, "open"), undefined);
    assert.match(content(within(tree, "welcome-scope")!), /Static checks do not run scripts, form backends or email delivery/u);
    assert.match(content(within(tree, "welcome-illustration-note")!), /no checks have run/u);
    assert.match(content(within(tree, "welcome-decision")!), /explicitly accepts a version/u);
  }
});
