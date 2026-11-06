import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import type {GettingStartedProps} from "../app/components/GettingStarted.tsx";
import {RUNTIME_LAB_ORIGIN} from "../lib/runtime-project.ts";

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
const component = (async () => {
  const source = await readFile(new URL("../app/components/GettingStarted.tsx", import.meta.url), "utf8");
  let output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText.replace('import "../welcome.css";', "");
  for (const name of ["react/jsx-runtime", "lucide-react"]) output = output.replaceAll(JSON.stringify(name), JSON.stringify(import.meta.resolve(name)));
  output = output.replaceAll('"@/lib/runtime-project"', JSON.stringify(new URL("../lib/runtime-project.ts", import.meta.url).href));
  return (await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`)).GettingStarted;
})();
function props(language: "zh" | "en", resume = false, busy = false) {
  const calls: string[] = [];
  const value: GettingStartedProps = {language, busy, onDemo: () => calls.push("new-example"), onStart: () => calls.push("requirements"), onExample: () => calls.push("noodle-requirements"), ...(resume ? {resumeProject: {title: "Existing shop website", status: "Awaiting seller", onOpen: () => calls.push("existing-project")}} : {})};
  return {value, calls};
}
function within(tree: unknown, className: string) { return nodes(tree).find(node => node.props?.className === className)!; }

test("new and returning users retain two bilingual primary routes without invoking either on render", async () => {
  const Welcome = await component;
  for (const language of ["zh", "en"] as const) for (const resume of [false, true]) {
    const {value, calls} = props(language, resume), tree = Welcome(value), actions = nodes(within(tree, "welcome-actions")).filter(node => node.type === "button");
    assert.deepEqual(calls, []);
    assert.equal(actions.length, 2);
    assert.ok(actions.every(node => node.props?.type === "button"));
    assert.deepEqual(actions.map(content), [resume ? language === "zh" ? "打开这个项目" : "Open this project" : language === "zh" ? "先体验一个完整例子" : "Try a complete example", language === "zh" ? "填写我的项目要求" : "Enter my requirements"]);
    assert.equal(Boolean(within(tree, "welcome-resume")), resume);
    const more = within(tree, "welcome-more");
    assert.equal(more.props?.open, undefined);
    assert.equal(nodes(more).some(node => node.props?.className === "welcome-new-example"), resume);
  }
});

test("actual resume, new-example and intake handlers remain separate explicit actions", async () => {
  const Welcome = await component;
  for (const language of ["zh", "en"] as const) for (const resume of [false, true]) {
    const {value, calls} = props(language, resume), tree = Welcome(value), actions = nodes(within(tree, "welcome-actions")).filter(node => node.type === "button");
    (actions[0].props!.onClick as () => void)();
    assert.deepEqual(calls, [resume ? "existing-project" : "new-example"]);
    (actions[1].props!.onClick as () => void)();
    assert.equal(calls.at(-1), "requirements");
    if (resume) {
      const newExample = nodes(within(tree, "welcome-new-example")).find(node => node.type === "button")!;
      (newExample.props!.onClick as () => void)();
      assert.equal(calls.at(-1), "new-example");
      assert.equal(calls.filter(value => value === "existing-project").length, 1);
    }
    const noodle = nodes(within(tree, "welcome-more")).find(node => node.props?.onClick === value.onExample)!;
    (noodle.props!.onClick as () => void)();
    assert.equal(calls.at(-1), "noodle-requirements");
  }
});

test("an invalid runtime resume payload falls back to the working new-user routes", async () => {
  const Welcome = await component;
  for (const invalid of [null, {}, {title: "Shop", status: "Saved"}, {title: "Shop", status: "Saved", onOpen: "invalid"}, {title: {}, status: "Saved", onOpen: () => {}}, {title: "Shop", status: null, onOpen: () => {}}]) {
    const {value, calls} = props("en");
    const tree = Welcome({...value, resumeProject: invalid}), actions = nodes(within(tree, "welcome-actions")).filter(node => node.type === "button");
    assert.equal(content(actions[0]), "Try a complete example");
    assert.equal(within(tree, "welcome-resume"), undefined);
    (actions[0].props!.onClick as () => void)();
    assert.deepEqual(calls, ["new-example"]);
  }
});

test("busy disables every actionable welcome button in the bilingual new and returning states", async () => {
  const Welcome = await component;
  for (const language of ["zh", "en"] as const) for (const resume of [false, true]) for (const busy of [false, true]) {
    const {value, calls} = props(language, resume, busy), tree = Welcome(value), buttons = nodes(tree).filter(node => node.type === "button");
    assert.equal(buttons.length, resume ? 4 : 3);
    assert.ok(buttons.every(node => node.props?.disabled === busy));
    const html = renderToStaticMarkup(createElement(Welcome, value));
    assert.equal((html.match(/<button\b[^>]*\bdisabled=""/gu) ?? []).length, busy ? buttons.length : 0);
    assert.deepEqual(calls, []);
  }
});

test("fictional payment and explicit-AI disclosure stays beside its new-example action, not the resumed project", async () => {
  const Welcome = await component;
  for (const language of ["zh", "en"] as const) for (const resume of [false, true]) {
    const {value} = props(language, resume), tree = Welcome(value), all = nodes(tree), note = all.find(node => node.props?.className === "welcome-action-note")!;
    assert.ok(note);
    assert.equal(all.filter(node => node.props?.className === "welcome-action-note").length, 1);
    assert.match(content(note), language === "zh" ? /虚构项目和模拟付款/u : /fictional project and simulated payment/u);
    assert.match(content(note), language === "zh" ? /AI 评估需要你另行点击/u : /AI assessment runs only when you request it/u);
    assert.equal(nodes(within(tree, "welcome-more")).includes(note), resume);
    if (resume) {
      assert.ok(nodes(within(tree, "welcome-new-example")).includes(note));
      assert.doesNotMatch(content(within(tree, "welcome-resume")), /fictional|simulated|虚构|模拟/u);
    }
  }
});

test("resume title and status are visible escaped data without a claim about chronological order", async () => {
  const Welcome = await component, {value, calls} = props("en", true);
  value.resumeProject!.title = '<script>untrusted()</script> Shop & "tea"';
  value.resumeProject!.status = '<img src=x onerror=untrusted()> Saved & awaiting review';
  const tree = Welcome(value), resume = within(tree, "welcome-resume"), html = renderToStaticMarkup(createElement(Welcome, value));
  assert.ok(content(resume).includes(value.resumeProject!.title));
  assert.ok(content(resume).includes(value.resumeProject!.status));
  assert.match(html, /&lt;script&gt;untrusted\(\)&lt;\/script&gt; Shop &amp; &quot;tea&quot;/u);
  assert.match(html, /&lt;img src=x onerror=untrusted\(\)&gt; Saved &amp; awaiting review/u);
  assert.doesNotMatch(html, /<script>|<img src=x/u);
  assert.doesNotMatch(content(tree), /most recent|latest|last updated|last created|最近更新|最近创建|上次/u);
  assert.deepEqual(calls, []);
});

test("the existing labs, closed scope disclosure and evidence illustration remain available", async () => {
  const Welcome = await component;
  for (const resume of [false, true]) {
    const {value} = props("en", resume), tree = Welcome(value), all = nodes(tree), links = all.filter(node => node.type === "a");
    assert.deepEqual(links.map(node => node.props?.href), [RUNTIME_LAB_ORIGIN, `${RUNTIME_LAB_ORIGIN}/journeys.html`]);
    assert.ok(links.every(node => node.props?.target === "_blank" && node.props?.rel === "noreferrer"));
    assert.equal(within(tree, "welcome-scope").props?.open, undefined);
    assert.match(content(within(tree, "welcome-scope")), /Static checks do not run scripts, form backends or email delivery/u);
    assert.match(content(within(tree, "welcome-illustration-note")), /no checks have run/u);
    assert.match(content(within(tree, "welcome-decision")), /explicitly accepts a version/u);
  }
});
