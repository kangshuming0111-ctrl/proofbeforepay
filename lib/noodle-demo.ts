import type { Language, ProofBusinessExpected } from "./contracts.ts";
import type { ProofVariant } from "./proof-evidence.ts";
import { BUYER_NOODLE_EXAMPLE } from "./requirement-display.ts";
import { summaryCoverageUnits } from "./requirement-coverage.ts";
import { parseStaticProject } from "./static-project.ts";

const PHONE = "+61 3 9000 0000";
const PRICE = 1800;
const REQUIRED_PAGES = ["index.html", "menu-en.html", "menu-zh.html", "visit.html"];

export function createNoodleDemoProject(language: Language) {
  const { title, summary } = BUYER_NOODLE_EXAMPLE[language];
  const units = summaryCoverageUnits(summary, 2);
  const checks: {file: string; expected: ProofBusinessExpected}[] = [
    {file: "menu-en.html", expected: {kind: "item_price", label: "Beef noodles", currency: "AUD", amountMinor: PRICE}},
    {file: "menu-zh.html", expected: {kind: "item_price", label: "牛肉面", currency: "AUD", amountMinor: PRICE}},
    {file: "visit.html", expected: {kind: "visible_copy", text: PHONE}},
  ];
  return parseStaticProject({
    title,
    summary,
    amount: "1.00",
    requiredPages: REQUIRED_PAGES,
    links: [
      {from: "index.html", text: "View menu", to: "menu-en.html"},
      {from: "menu-en.html", text: "中文菜单", to: "menu-zh.html"},
      {from: "menu-zh.html", text: "查看到店说明", to: "visit.html#consultation"},
    ],
    manualRequirements: [],
    coverage: {
      version: 2, sourceText: summary, confirmed: true,
      decisions: units.map(({id}) => ({id, disposition: "include"})),
    },
    businessChecks: {
      confirmed: true,
      items: checks.map((check, index) => {
        const unit = units[index];
        return {...check, id: `business-${index + 1}`, criterionId: unit.id,
          source: {start: unit.start, end: unit.end, excerpt: unit.text}};
      }),
    },
  }, language, {requireCoverage: true});
}

const STYLES = `:root { font-family: system-ui; color: #213d30; background: #fffdf5; }
* { box-sizing: border-box; }
body { margin: 0; }
main { max-width: 800px; margin: auto; padding: 24px; }
nav { display: flex; flex-wrap: wrap; gap: 12px; }
a { display: inline-block; padding: 12px; background: #e5ecdf; color: inherit; }
h1 { font-family: Georgia, serif; }
section { padding: 18px 0; }
p { line-height: 1.7; }
label { display: block; margin-block: 10px; }
input { max-width: 100%; padding: 6px; font: inherit; }
.notice { font-size: 12px; border-bottom: 1px solid #ccc; padding: 12px; }
a:focus-visible, input:focus-visible { outline: 3px solid #9d6035; }
@media (max-width: 600px) { main { padding: 16px; } }
`;

function page(language: Language, title: string, content: string) {
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="site.css">
</head>
<body>
  <main>
    ${content}
  </main>
</body>
</html>
`;
}

/** Worker-safe copy of the sample website. No file picker or external site is needed. */
export function noodleDemoFiles(variant: ProofVariant): Record<string, string> {
  const fixed = variant === "fixed";
  return {
    "index.html": page("en", "Laneway Noodles | Home", `<p class="notice">Fictional test restaurant. This site cannot take orders, send messages or process payments.</p>
    <h1>Laneway Noodles</h1>
    <p>Melbourne noodle shop. Monday–Friday 11am–8pm.</p>
    <nav><a href="menu-en.html">View menu</a><a href="visit.html#consultation">Visit information</a></nav>`),
    "menu-en.html": page("en", "Laneway Noodles | Menu", `<h1>Menu</h1>
    <p class="menu-row"><span>Beef noodles</span> <span>AUD</span> <strong>18.00</strong></p>
    <p class="menu-row">Vegetarian noodles AUD 16</p>
    <nav><a href="menu-zh.html">中文菜单</a><a href="index.html">Home</a></nav>`),
    "menu-zh.html": page("zh", "巷口面馆 | 中文菜单", `<h1>中文菜单</h1>
    <p class="menu-row"><span>牛肉面</span> <span>AUD</span> <strong>${fixed ? "18" : "28"}</strong></p>
    ${fixed ? "" : '<p style="display:none">牛肉面 AUD 18</p>'}
    <p class="menu-row">素食面 AUD 16</p>
    <nav><a href="visit.html#consultation">查看到店说明</a><a href="menu-en.html">English menu</a></nav>`),
    "visit.html": page("en", "Laneway Noodles | Visit", `<h1>Visit us</h1>
    <section id="consultation">
      <h2>Bookings and directions</h2>
      <p>${fixed ? PHONE : "+61 3 9000 9999"}</p>
      <p>Monday–Friday 11:00–20:00</p>
    </section>
    <section lang="zh">
      <h2>给店里留言</h2>
      <form>
        <label>姓名 <input type="text" name="name"></label>
        <label>邮箱 <input type="email" name="email"></label>
      </form>
      <p>示例仅展示填写项。</p>
    </section>
    <nav><a href="index.html">Home</a></nav>`),
    "site.css": STYLES,
  };
}
