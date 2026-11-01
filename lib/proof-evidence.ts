import type { Language, ProofCriterion, ProofDelivery, ProofEvidence } from "./contracts.ts";

export type ProofVariant = "flawed" | "fixed";
export type ProofFixture = {
  variant: ProofVariant;
  label: string;
  files: Record<string, string>;
};

/** These three requirements form the fixed sample contract, not a user's generated scope. */
export function proofCriteria(language: Language): ProofCriterion[] {
  return language === "zh" ? [
    { id: "pages", title: "三个独立页面", source: "交付三个独立页面：首页、服务和联系。" },
    { id: "mobile", title: "移动端可用", source: "所有交付页面都必须能在手机屏幕上正常使用。" },
    { id: "booking", title: "预约入口", source: "包含一个“Book a call”链接，打开交付网站内的预约区域。" },
  ] : [
    { id: "pages", title: "Three separate pages", source: "Deliver three separate pages: Home, Services and Contact." },
    { id: "mobile", title: "Mobile usability", source: "All delivered pages must be usable on a mobile screen." },
    { id: "booking", title: "Booking entry point", source: "Include a ‘Book a call’ link that opens a booking section within the delivered website." },
  ];
}

const STYLES = `:root{color-scheme:light;font-family:Arial,sans-serif;color:#263d32;background:#f8f4e9;font-synthesis:none}*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:4px}a:focus-visible{outline:3px solid #a04930;outline-offset:5px}button,input{font:inherit}.sample-note{margin:0;padding:8px 5%;background:#e8eddf;font-size:11px;line-height:1.5;text-align:center}.site-header{max-width:1120px;margin:auto;padding:22px 5%;display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid #d9dece}.wordmark{font:italic 27px Georgia,serif;text-decoration:none;white-space:nowrap}.wordmark span{color:#a04930}nav{display:flex;gap:20px;font-size:12px}nav a{text-decoration:none}nav a:hover{text-decoration:underline}main{max-width:1120px;margin:auto;padding:0 5%}.eyebrow{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase}.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:36px;align-items:center;padding:45px 0 35px}.hero h1,.page-intro h1{font:normal clamp(40px,6vw,68px)/1.05 Georgia,serif;letter-spacing:-2px;margin:17px 0}.hero h1 em{font-weight:normal;color:#a04930}.lead{font-size:14px;line-height:1.8;max-width:440px;color:#596657}.primary{display:inline-block;margin-top:13px;padding:13px 20px;background:#294b3b;color:#fffdf5;text-decoration:none;font-size:12px;border:1px solid #294b3b}.primary:hover{background:#1e382c}.quiet-link{display:inline-block;margin:15px;font-size:12px}.arrangement{height:330px;position:relative;overflow:hidden;background:#e8dfcc;border-radius:48% 48% 0 0}.arrangement:before{content:"";position:absolute;inset:28px;border:1px solid #c0b79e;border-radius:48% 48% 0 0}.vase{position:absolute;width:110px;height:137px;bottom:0;left:calc(50% - 55px);background:repeating-linear-gradient(90deg,#a4543c 0 7px,#af6046 7px 11px);border-radius:5% 5% 30% 30%}.stem{position:absolute;width:3px;height:180px;background:#52694e;left:50%;bottom:90px;transform-origin:bottom}.stem:nth-child(2){transform:rotate(-29deg)}.stem:nth-child(3){transform:rotate(25deg)}.stem:nth-child(4){transform:rotate(-8deg);height:210px}.bloom{position:absolute;width:66px;height:66px;left:calc(50% - 32px);top:2px;border-radius:44%;background:#d89a7e;box-shadow:11px 7px 0 -5px #e6b79b,-9px 9px 0 -5px #e6b79b;transform:rotate(25deg)}.stem:nth-child(3) .bloom{background:#f0d9a5;box-shadow:9px 5px 0 -4px #e4c688,-7px 9px 0 -4px #e4c688}.leaf{position:absolute;width:40px;height:18px;background:#6b7c54;border-radius:0 90% 0 90%;left:0;top:83px;transform:rotate(-22deg)}.art-caption{position:absolute;bottom:15px;left:15px;font-size:9px;letter-spacing:1px;writing-mode:vertical-rl}.strip{border-block:1px solid #d9dece;display:flex;justify-content:space-between;gap:15px;padding:16px 0;font-size:11px;line-height:1.5}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:32px 0 18px}.section-heading h2,.page-intro h2{font:normal 29px Georgia,serif;margin:0}.section-heading p{font-size:11px;color:#64715f}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.card{padding:20px;background:#efeddf;border-top:2px solid #a45b40}.card .number{font-size:10px;color:#8d563c}.card h2,.card h3{font:normal 23px Georgia,serif;margin:15px 0 10px}.card p{font-size:12px;line-height:1.7;color:#5c6856}.price{font-size:12px;font-weight:700}.page-intro{padding:38px 0 24px;max-width:650px}.page-intro h1{font-size:48px}.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:35px}.contact-grid section{padding:24px;background:#edeee1}.contact-grid h2{font:normal 28px Georgia,serif;margin:0 0 15px}.contact-grid p{font-size:13px;line-height:1.8}.site-footer{max-width:1120px;margin:34px auto 0;padding:22px 5%;border-top:1px solid #d9dece;display:flex;justify-content:space-between;gap:15px;font-size:10px;line-height:1.7;color:#596657}
@media(max-width:640px){.site-header{padding-block:17px;gap:12px}.wordmark{font-size:24px}nav{gap:12px;font-size:11px}.hero{grid-template-columns:1fr;padding-top:26px;gap:22px}.hero h1{font-size:48px;max-width:330px}.arrangement{height:270px;max-width:360px;width:100%;margin:auto}.strip{flex-direction:column;gap:7px}.cards,.contact-grid{grid-template-columns:1fr}.section-heading{align-items:start;flex-direction:column;gap:5px}.section-heading p{margin:0}.page-intro h1{font-size:40px}.site-footer{flex-direction:column;gap:5px}.quiet-link{margin-left:12px}}
`;

const NAVIGATION = `<header class="site-header"><a class="wordmark" href="index.html">willow<span> studio.</span></a><nav aria-label="Main navigation">
  <a href="index.html">Home</a>
  <a href="services.html">Services</a>
  <a href="contact.html">Contact</a>
</nav></header>`;

function page(title: string, content: string, hours: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | Willow Studio sample</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <aside class="sample-note">Controlled sample delivery for ProofBeforePay. Fictional business; no real orders or booking service.</aside>
  ${NAVIGATION}
  <main>${content}</main>
  <footer class="site-footer"><span>Willow Studio · Melbourne floral design<br>Illustrative location and services, for delivery review only.</span><span>Opening hours: ${hours}<br>hello@willow.example.test · sample email, not monitored</span></footer>
</body>
</html>
`;
}

/** Return a fresh copy so callers cannot change a later delivery's evidence. */
export function getProofFixture(variant: ProofVariant): ProofFixture {
  if (variant !== "flawed" && variant !== "fixed") throw new Error("Unknown sample delivery variant.");
  const hours = variant === "fixed" ? "Monday to Friday, 11am–8pm" : "Monday to Friday, 10am–6pm";
  const files: Record<string, string> = {
    "index.html": page("Home", `<section class="hero"><div><p class="eyebrow">Melbourne · independent floral studio</p><h1>Flowers for<br>the <em>everyday.</em></h1><p class="lead">Seasonal arrangements, thoughtful gifts and small celebrations. Made with care, one stem at a time.</p><a class="primary" href="contact.html#booking">Book a call</a><a class="quiet-link" href="services.html">Explore our flowers</a></div><div class="arrangement" role="img" aria-label="Decorative illustration of a seasonal bouquet"><span class="stem"><i class="bloom"></i><i class="leaf"></i></span><span class="stem"><i class="bloom"></i><i class="leaf"></i></span><span class="stem"><i class="bloom"></i><i class="leaf"></i></span><span class="stem"><i class="bloom"></i></span><span class="vase"></span><span class="art-caption">A SEASONAL KIND OF BEAUTIFUL</span></div></section>
    <div class="strip"><span>Seasonal flowers · small-batch arrangements</span><span>Opening hours: ${hours}</span></div>
    <div class="section-heading"><h2>A little something, beautifully made.</h2><p>Sample prices in AUD</p></div><section class="cards" aria-label="Our services"><article class="card"><span class="number">01 / EVERYDAY</span><h3>The daily bunch</h3><p>A simple gathering of seasonal stems for your table, desk or favourite person.</p><span class="price">From $45 AUD</span></article><article class="card"><span class="number">02 / A GESTURE</span><h3>Signature bouquet</h3><p>Textural, generous and a little unexpected. Designed for a thoughtful gift.</p><span class="price">From $85 AUD</span></article><article class="card"><span class="number">03 / TOGETHER</span><h3>Small celebrations</h3><p>Table flowers and gentle finishing touches for the moments you want to keep.</p><span class="price">From $160 AUD</span></article></section>`, hours),
    "services.html": page("Services", `<div class="page-intro"><p class="eyebrow">Our flowers & services</p><h1>Good things<br>grow <em>together.</em></h1><p class="lead">Choose a seasonal arrangement or talk with us about flowers for your gathering. All prices below are illustrative.</p></div><section class="cards" aria-label="Services and prices"><article class="card"><span class="number">01 / EVERYDAY</span><h2>The daily bunch</h2><p>Florist-selected seasonal stems, wrapped simply. A small everyday pleasure.</p><span class="price">From $45 AUD</span></article><article class="card"><span class="number">02 / GIFTING</span><h2>Signature bouquet</h2><p>A hand-tied bouquet with seasonal colour and texture, ready to give.</p><span class="price">From $85 AUD</span></article><article class="card"><span class="number">03 / CELEBRATE</span><h2>Small celebrations</h2><p>Flowers for intimate tables and gatherings. Discuss your colours and space with us.</p><span class="price">From $160 AUD</span></article></section><p class="lead">Opening hours: ${hours}. Use our contact page to find the sample consultation section.</p><a class="primary" href="contact.html#booking">Book a call</a>`, hours),
    "styles.css": STYLES,
  };
  if (variant === "fixed") {
    files["contact.html"] = page("Contact", `<div class="page-intro"><p class="eyebrow">Say hello</p><h1>Let's make<br>something lovely.</h1><p class="lead">Tell us what you have in mind: a thoughtful gift, a gathering or flowers just because.</p></div><div class="contact-grid">
    <section id="booking" aria-labelledby="booking-heading">
      <h2 id="booking-heading">Book a call</h2>
      <p>This is the sample consultation destination agreed for this delivery. No calendar, form submission or email service is connected.</p>
      <a href="mailto:hello@willow.example.test">Sample email: hello@willow.example.test</a>
    </section><section><h2>Studio details</h2><p>Melbourne, Australia<br>Illustrative location only; no shop visits.</p><p>Opening hours: ${hours}</p><p>Prices and services are fictional examples used to review website delivery.</p></section></div>`, hours);
  }
  // The manifest is an inspectable artifact, while checks below read the actual files too.
  files["delivery-manifest.json"] = JSON.stringify({
    sample: true,
    label: "Controlled sample delivery; not a real website test",
    htmlPages: Object.keys(files).filter((file) => file.endsWith(".html")).sort(),
  }, null, 2);
  return { variant, label: variant === "fixed" ? "Revised sample delivery" : "First sample delivery", files };
}

function withoutComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/gu, "");
}

function inspectPage(html: string | undefined, expected: string) {
  const document = withoutComments(html || "");
  const title = /<title\b[^>]*>([^<]*)<\/title>/iu.exec(document);
  return {
    titleExcerpt: title?.[0],
    valid: /<!doctype\s+html\s*>/iu.test(document)
      && new RegExp(`^${expected}(?:\\s*\\||$)`, "u").test(title?.[1]?.trim() || ""),
  };
}

function bookingLink(html: string): { excerpt: string; href: string } | undefined {
  for (const anchor of withoutComments(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const text = anchor[2].replace(/<[^>]+>/gu, "").trim();
    const href = /(?:^|\s)href\s*=\s*(["'])(.*?)\1/iu.exec(anchor[1])?.[2];
    if (text === "Book a call" && href) return { excerpt: anchor[0], href };
  }
}

/**
 * Inspect only the supplied, controlled HTML/CSS artifacts. This is deliberately
 * not a general HTML validator, browser rendering test, URL crawler or fraud score.
 * Exported separately so tests can change content and verify findings change too.
 */
export function inspectProofFiles(files: Readonly<Record<string, string>>, language: Language): ProofEvidence[] {
  const zh = language === "zh";
  const expectedPages = [
    { file: "index.html", title: "Home" },
    { file: "services.html", title: "Services" },
    { file: "contact.html", title: "Contact" },
  ];
  const pageChecks = expectedPages.map(({ file, title }) => ({ file, ...inspectPage(files[file], title) }));
  const missing = pageChecks.filter(({ valid }) => !valid).map(({ file }) => file);
  const primaryPage = pageChecks.find(({ file }) => !!files[file]);
  const pageSources = pageChecks.map(({ file, titleExcerpt, valid }) => {
    const source = !files[file] ? (zh ? "文件未交付" : "file not delivered")
      : titleExcerpt || (zh ? "未找到 title 标签" : "no title tag found");
    return `${file}: ${source} [${valid ? (zh ? "符合页面标题检查" : "matches page check") : (zh ? "未通过页面检查" : "fails page check")}]`;
  }).join("\n");
  const index = files["index.html"] || "";
  const link = bookingLink(index);
  // Supported sample links are local file + fragment references. Nothing is fetched.
  const localTarget = link && /^(?:\.\/)?([a-z0-9-]+\.html)#([A-Za-z][A-Za-z0-9_-]*)$/u.exec(link.href);
  const targetFile = localTarget?.[1];
  const fragment = localTarget?.[2];
  const targetHtml = targetFile ? withoutComments(files[targetFile] || "") : "";
  const targetTag = fragment ? [...targetHtml.matchAll(/<[^!][^>]*>/gu)].find(([tag]) =>
    new RegExp(`\\sid\\s*=\\s*(["'])${fragment}\\1`, "u").test(tag))?.[0] : undefined;
  const targetExists = Boolean(targetTag);
  const mobileExcerpt = files["styles.css"]?.split("\n").find((line) => line.startsWith("@media"));

  const evidence: ProofEvidence[] = [{
    id: "evidence-pages",
    criterionId: "pages",
    file: primaryPage?.file || "index.html",
    excerpt: primaryPage?.titleExcerpt || (primaryPage ? files[primaryPage.file].slice(0, 1000) : ""),
    finding: missing.length ? "fail" : "pass",
    explanation: `${pageSources}\n${missing.length
      ? (zh ? `缺少要求的独立 HTML 文档或页面标题不匹配：${missing.join("、")}。以上来源直接读取交付 HTML，清单不能代替这些文件。`
        : `Required HTML documents are absent or their titles do not match: ${missing.join(", ")}. These sources are read directly from delivered HTML; a manifest cannot replace the files.`)
      : (zh ? "三个要求的独立 HTML 文档及标题均存在。此检查不证明页面内容完整或视觉质量合格。"
        : "All three required HTML documents and titles exist. This does not establish content completeness or visual quality.")}`,
  }, {
    id: "evidence-mobile",
    criterionId: "mobile",
    file: mobileExcerpt ? "styles.css" : "index.html",
    excerpt: mobileExcerpt || (index.match(/<meta name="viewport"[^>]*>/u)?.[0] || index),
    finding: "needs_human",
    explanation: zh
      ? "这是受控样例的源码检查。viewport 标签和媒体查询只能说明响应式意图，不能证明手机上没有横向溢出、文字可读或按钮易点。请实际打开每个页面，在手机宽度下检查后再人工确认。"
      : "This is a source check of a controlled sample. A viewport tag or media query shows responsive intent, not rendered usability. A person must inspect every page at a mobile width for overflow, readable text and usable controls before confirming this criterion.",
  }, {
    id: "evidence-booking",
    criterionId: "booking",
    file: "index.html",
    excerpt: link?.excerpt || index,
    finding: targetExists ? "pass" : "fail",
    explanation: targetExists
      ? (zh ? `已从首页实际链接解析到 ${targetFile}#${fragment}，并在交付文件中找到 ${targetTag}。仅确认本地链接目标存在；未测试渲染后的点击交互，也不代表真实预约或邮件服务已接通。`
        : `Resolved the Home link to ${targetFile}#${fragment} and found ${targetTag} in the delivered file. This confirms a local link target exists, not rendered click behavior or a connected scheduling/email service.`)
      : (zh ? `首页${link ? `链接指向 ${link.href}` : "没有 Book a call 链接"}，但交付文件中没有对应的本地预约目标。检查只读取这些样例文件，没有访问外部网站。`
        : `The Home page ${link ? `links to ${link.href}` : "has no Book a call link"}, but no corresponding local booking target exists in the delivery. Only these sample files were inspected; no external website was requested.`),
  }];
  return evidence;
}

export function createProofDelivery(variant: ProofVariant, language: Language): ProofDelivery {
  const fixture = getProofFixture(variant);
  return {
    id: crypto.randomUUID(),
    variant,
    label: language === "zh" ? (variant === "fixed" ? "修订后的样例交付" : "首次样例交付") : fixture.label,
    submittedAt: new Date().toISOString(),
    files: { ...fixture.files },
    evidence: inspectProofFiles(fixture.files, language),
  };
}
