import type { Language, ProofCriterion, QuoteDraft, RequirementCoverage } from "./contracts.ts";

import { validateSavedCoverage } from "./requirement-coverage.ts";

type Copy = Record<Language, string>;

const noodleClauses: Array<{ source: string; title: Copy; description: Copy }> = [
  {
    source: "网站包含首页、菜单页 menu.html 和联系页 contact.html，首页可打开菜单页和联系页。",
    title: { zh: "首页能点进菜单和联系页", en: "Home links to Menu and Contact" },
    description: { zh: "我想要首页、菜单和联系店家三个页面。从首页就能点进菜单和联系页。", en: "I’d like a home page, a menu page and a contact page. Customers should be able to reach both pages from the home page." },
  },
  {
    source: "菜单页同时展示中文「牛肉面」和英文「Beef noodles」，两种语言所示价格均为 AUD18。",
    title: { zh: "中英文菜单：牛肉面都是 18 澳元", en: "Beef noodles: AUD 18 in both languages" },
    description: { zh: "菜单上请写「牛肉面」和「Beef noodles」，两种写法旁边都标 18 澳元。", en: "On the menu, please show both ‘牛肉面’ and ‘Beef noodles’, with AUD 18 next to each name." },
  },
  {
    source: "联系页展示营业时间为上午 11 点至晚上 8 点（11am–8pm）。",
    title: { zh: "联系页写上营业时间：上午 11 点到晚上 8 点", en: "Contact page shows opening hours: 11 am–8 pm" },
    description: { zh: "客人在联系页能看到我们上午 11 点开门、晚上 8 点关门。", en: "Customers should be able to see on the contact page that we open at 11 am and close at 8 pm." },
  },
  {
    source: "首页、菜单页和联系页在手机上均可用，正文与导航可阅读及操作，无需横向滚动。",
    title: { zh: "手机上三页都能看清、能点链接", en: "All three pages are readable and tappable on a phone" },
    description: { zh: "客人用手机看首页、菜单和联系页时，文字要看得清楚，链接要点得动，页面不用左右拖。", en: "On a phone, customers should be able to read the text and tap the links on all three pages without scrolling sideways." },
  },
];

/** Natural starter copy; developer details stay in the separate setup fields. */
export const BUYER_NOODLE_EXAMPLE = {
  zh: {
    title: "我的面馆网站",
    summary: "我在墨尔本开了家面馆，想让外国客人也能看懂菜单。英文菜单上的 Beef noodles 请标 18 澳元。\n中文菜单上的牛肉面也请标 18 澳元，两边别写成不同的价。\n请在来店信息页放店里的电话 +61 3 9000 0000，客人找不到店时可以打电话问路。\n客人想留言时，联系表单里要能填「姓名」和「邮箱」。",
  },
  en: {
    title: "A website for my noodle shop",
    summary: "I run a noodle shop in Melbourne. I’d like English-speaking customers to read the menu too. Please list Beef noodles at AUD 18 on the English menu.\nPlease put 牛肉面 at AUD 18 on the Chinese menu as well, so both show the same price.\nPut our number +61 3 9000 0000 on the visit page so customers can call if they can’t find the shop.\nWhen customers leave us a message, the contact form should have fields labelled ‘姓名’ and ‘邮箱’.",
  },
} as const;

const starterDetails: Copy[] = [
  {zh: "英文菜单：Beef noodles 18 澳元", en: "English menu: Beef noodles at AUD 18"},
  {zh: "中文菜单：牛肉面 18 澳元", en: "Chinese menu: 牛肉面 at AUD 18"},
  {zh: "来店信息页：店里电话", en: "Visit page: shop phone number"},
  {zh: "联系表单：能填姓名和邮箱", en: "Contact form: name and email"},
];

const threePageDemo = [
  "买家约定三页网站和预约入口，卖家提交缺陷版或修订版，买家检查证据后验收。此演示无真实卖家或付款。",
  "The buyer requests three pages and a booking entry. The seller submits an initial or revised version for buyer acceptance. No real seller or payment is involved.",
];

export function buyerRequirementLines(quote: Pick<QuoteDraft, "summary">, language: Language): string[] {
  const summary = quote.summary.trim();
  if (threePageDemo.includes(summary)) return language === "zh" ? [
    "我想做个小店网站。客人能看看首页、了解我们提供的服务，也能找到怎么联系我们。",
    "首页请放一个「Book a call」按钮，点进去就能看到怎么预约电话。",
    "请写清我们的营业时间：周一到周五，上午 11 点到晚上 8 点。",
    "客人用手机也能正常看网站。",
  ] : [
    "I’d like a simple website for my shop. Customers should find a home page, a page about our services and a way to contact us.",
    "Put a ‘Book a call’ button on the home page so customers can find the booking section.",
    "Please show our hours: Monday to Friday, 11 am to 8 pm.",
    "Customers should be able to use the site on their phone too.",
  ];
  // Older exports sometimes put this exact four-line example on one line.
  const compact = (value: string) => value.replace(/\s+/gu, "");
  if (compact(summary) === compact(noodleClauses.map(clause => clause.source).join(""))) {
    return noodleClauses.map(clause => clause.description[language]);
  }
  return summary.split(/\r?\n/u).map(line => line.trim()).filter(Boolean)
    .map(line => noodleClauses.find(clause => clause.source === line)?.description[language] ?? line);
}

/** Do not call an original request agreed work unless the saved choices bind to it. */
export function buyerRequirementSections(quote: Pick<QuoteDraft, "summary">, language: Language, coverage?: RequirementCoverage) {
  const original = quote.summary;
  const lines = buyerRequirementLines(quote, language);
  if (coverage?.sourceText === original.trim()) {
    try {
      const { decisions } = validateSavedCoverage(coverage);
      return {
        confirmed: true,
        lines: decisions.filter(row => row.disposition === "include").map(row => noodleClauses.find(clause => clause.source === row.text)?.description[language] ?? row.text),
        excluded: decisions.filter(row => row.disposition === "exclude"),
        original,
      };
    } catch { /* Invalid or detached records cannot be presented as agreed scope. */ }
  }
  return {confirmed: false, lines, excluded: [], original};
}

export function buyerProjectTitle(quote: Pick<QuoteDraft, "title" | "summary">, language: Language): string {
  if (threePageDemo.includes(quote.summary.trim())) return language === "zh" ? "小店网站示例" : "Small shop website example";
  return quote.title.trim() === "面馆网站交付演练" && noodleClauses.every(clause => quote.summary.includes(clause.source))
    ? language === "zh" ? "面馆网站" : "Noodle shop website"
    : quote.title;
}

const pageNames: Record<string, Copy> = {
  "index.html": { zh: "首页", en: "Home page" },
  "home.html": { zh: "首页", en: "Home page" },
  "menu.html": { zh: "菜单页", en: "Menu page" },
  "menu-en.html": { zh: "英文菜单页", en: "English menu page" },
  "menu-zh.html": { zh: "中文菜单页", en: "Chinese menu page" },
  "contact.html": { zh: "联系页", en: "Contact page" },
  "visit.html": { zh: "来店信息页", en: "Visit page" },
  "services.html": { zh: "服务页", en: "Services page" },
};

export function buyerPageName(file: string, language: Language): string {
  return pageNames[file.toLowerCase()]?.[language] ?? file;
}

function plainRequirement(criterion: ProofCriterion, language: Language): {title: string; description: string} | undefined {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const { id, source, title } = criterion;
  const starterIndex = [BUYER_NOODLE_EXAMPLE.zh.summary, BUYER_NOODLE_EXAMPLE.en.summary]
    .map(summary => summary.split("\n").indexOf(source)).find(index => index >= 0);
  if (starterIndex !== undefined && /^coverage-[1-9]\d*$/u.test(id)) {
    return {title: starterDetails[starterIndex][language], description: source};
  }
  const known = noodleClauses.find(clause => clause.source === source);
  if (known) return { title: known.title[language], description: known.description[language] };

  const file = /^(?:独立页面：|Separate page: )(.+\.html)$/iu.exec(title)?.[1];
  if (file && /^page-[1-9]\d*$/u.test(id) && (
    source === `交付独立非空 HTML 文档 ${file}，包含 HTML doctype、非空 title 与 body。`
    || source === `Deliver ${file} as a separate nonempty HTML document with an HTML doctype, a nonempty title and a body.`
  )) {
    const name = buyerPageName(file, language);
    return { title: name === file ? tr(`网页：${file}`, `Page: ${file}`) : name,
      description: tr(`「${name}」应该能单独打开，有页面标题和正文。`, `“${name}” should open as its own page with a page title and content area.`) };
  }

  if (/^link(?:-[1-9]\d*)?$/u.test(id) && /^(?:本地链接目标|Local link destination)(?: [1-9]\d*)?$/u.test(title)) {
    const link = /^(.+?\.html) 包含文字为“([\s\S]+)”的链接，指向 (.+\.html(?:#[A-Za-z0-9_.:-]+)?)。$/u.exec(source)
      ?? /^(.+?\.html) contains a link labelled “([\s\S]+)” pointing to (.+\.html(?:#[A-Za-z0-9_.:-]+)?)\.$/u.exec(source);
    if (link) {
      const [, from, text, to] = link;
      const [destination, section] = to.split("#");
      const fromName = buyerPageName(from, language), destinationName = buyerPageName(destination, language);
      const where = section === "booking" ? tr(`「${destinationName}」里的预约区`, `the booking section on “${destinationName}”`)
        : section ? tr(`「${destinationName}」里的 ${section} 区域`, `the ${section} section on “${destinationName}”`)
          : tr(`「${destinationName}」`, `“${destinationName}”`);
      return { title: tr(`从${fromName}点「${text}」`, `“${text}” link on ${fromName}`), description: tr(`在「${fromName}」点「${text}」，应该打开${where}。`, `Selecting “${text}” on “${fromName}” should open ${where}.`) };
    }
  }

  if (id === "mobile") {
    const basic = source === "所有交付页面都必须能在手机屏幕上正常使用。" || source === "All delivered pages must be usable on a mobile screen.";
    const check = source === "所有交付页面都必须能在手机屏幕上正常使用；必须由人实际检查。" || source === "All delivered pages must be usable on a mobile screen; a person must check them directly.";
    if (basic || check) return { title: tr("用手机也能正常打开和使用", "Works on a phone"), description: check
      ? tr("所有页面在手机上都要能正常使用，需要你亲自看一次。", "Every page needs to work on a phone and must be checked by a person.")
      : tr("所有页面在手机上都要能正常使用。", "Every page needs to work on a phone.") };
  }

  if (id === "pages" && ["交付三个独立页面：首页、服务和联系。", "Deliver three separate pages: Home, Services and Contact."].includes(source)) {
    return { title: tr("首页、服务页、联系页", "Home, Services and Contact pages"), description: tr("网站要有首页、服务和联系三个页面，每个都能单独打开。", "The website needs three separate pages: Home, Services and Contact.") };
  }
  if (id === "booking" && ["包含一个“Book a call”链接，打开交付网站内的预约区域。", "Include a ‘Book a call’ link that opens a booking section within the delivered website."].includes(source)) {
    return { title: tr("点「Book a call」能看到预约区", "‘Book a call’ opens the booking section"), description: tr("点「Book a call」，应该打开这个网站里的预约区。", "Selecting ‘Book a call’ should open a booking section on this website.") };
  }
  if (["网页必须显示营业时间 Monday to Friday, 11am–8pm。", "Display opening hours: Monday to Friday, 11am–8pm."].includes(source)) {
    return {title: tr("营业时间：周一到周五，上午 11 点到晚上 8 点", "Opening hours: weekdays, 11 am–8 pm"), description: tr("请让客人看得见我们的营业时间：周一到周五，上午 11 点开门，晚上 8 点关门。", "Let customers see that we’re open Monday to Friday from 11 am to 8 pm.")};
  }
}

/** Presentation only. Unknown buyer copy stays verbatim; criterion IDs and source are untouched. */
export function criterionDisplayTitle(criterion: ProofCriterion, language: Language): string {
  const plain = plainRequirement(criterion, language);
  if (plain) return plain.title;
  const title = criterion.title.trim();
  const original = /^coverage-[1-9]\d*$/u.test(criterion.id) && /^(?:原始需求\s*\d+|Original requirement\s*\d+)$/iu.test(title);
  if (!original && !/^(?:人工要求\s*\d+|Manual requirement\s*\d+)$/iu.test(title)) return criterion.title;
  const source = criterion.source.replace(/\s+/gu, " ").trim();
  if (!source) return language === "zh" ? "已确认的要求" : "Agreed requirement";
  const characters = Array.from(source);
  return characters.length > 56 ? `${characters.slice(0, 55).join("")}…` : source;
}

export function criterionDisplayDescription(criterion: ProofCriterion, language: Language): string {
  return plainRequirement(criterion, language)?.description ?? criterion.source;
}
