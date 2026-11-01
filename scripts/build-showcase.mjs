import { createHash } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CSS = `:root{font-family:Arial,sans-serif;color:#203d32;background:#faf7ee;font-synthesis:none}*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:4px}a:focus-visible,input:focus-visible,button:focus-visible{outline:3px solid #9f593f;outline-offset:4px}.sample{margin:0;padding:9px 5%;font-size:11px;background:#e7eedf;text-align:center;line-height:1.5}header,main,footer{max-width:1120px;margin:auto;padding-inline:5%}header{padding-block:22px;display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:1px solid #d5deca}.brand{font:italic 28px Georgia,serif;text-decoration:none;white-space:nowrap}nav{display:flex;gap:22px;font-size:13px}nav a{text-decoration:none}nav a:hover{text-decoration:underline}.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:42px;align-items:center;padding-block:42px}.kicker{font-size:11px;letter-spacing:1.5px;text-transform:uppercase}h1{font:normal clamp(44px,6vw,72px)/1.05 Georgia,serif;letter-spacing:-2px;margin:17px 0}h2{font:normal 30px Georgia,serif;margin:0 0 13px}h3{font:normal 25px Georgia,serif;margin:10px 0}.lead{font-size:15px;line-height:1.8;max-width:440px;color:#516151}.primary{display:inline-block;padding:13px 20px;background:#294b3b;color:white;font-size:13px;text-decoration:none;border:0;font-family:inherit;cursor:pointer}.art{height:320px;background:#e7ddc9;border-radius:48% 48% 0 0;position:relative;overflow:hidden}.vase{position:absolute;bottom:-10px;left:calc(50% - 55px);width:110px;height:145px;background:repeating-linear-gradient(90deg,#a65a42 0 8px,#b36c4e 8px 13px);border-radius:7% 7% 35% 35%}.stem{position:absolute;bottom:105px;left:50%;width:3px;height:170px;background:#62774d;transform-origin:bottom}.stem:nth-child(2){transform:rotate(-28deg);height:155px}.stem:nth-child(3){transform:rotate(25deg);height:165px}.stem:before{content:"";position:absolute;left:-29px;top:-10px;width:62px;height:62px;border-radius:40%;background:#d9997a;box-shadow:9px 6px 0 -4px #e4b18e,-9px 7px 0 -3px #e3b792}.stem:nth-child(3):before{background:#ecd4a2}.stem:after{content:"";position:absolute;top:95px;left:0;width:40px;height:18px;background:#718250;border-radius:0 90% 0 90%;transform:rotate(-25deg)}.facts{display:flex;gap:15px;justify-content:space-between;border-block:1px solid #d5deca;padding:17px 0;font-size:12px;line-height:1.7}.intro{padding-block:35px 24px}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding-block:15px 25px}.card{background:#eeecde;padding:23px;border-top:2px solid #a76b48}.card p,.policy p,.contact p{font-size:14px;line-height:1.8;color:#53604d}.price{font-weight:bold;font-size:14px}.policy{background:#e9eddf;padding:25px;margin-block:10px 28px}.contact{display:grid;grid-template-columns:1fr 1fr;gap:22px;padding-bottom:30px}.contact section{background:#eeecde;padding:24px}.request label{display:block;font-size:13px;margin:14px 0 5px}.request input{display:block;width:100%;min-width:0;padding:11px;border:1px solid #afbaa3;background:#fffdf5;font:inherit}.request button{margin-top:17px}.quiet{font-size:11px!important;line-height:1.6!important}footer{border-top:1px solid #d5deca;padding-block:22px;font-size:11px;line-height:1.7;color:#53604d;display:flex;justify-content:space-between;gap:20px}@media(max-width:620px){header{align-items:start;flex-direction:column;padding-block:18px}.hero{grid-template-columns:1fr;gap:25px;padding-block:28px}.art{height:270px;width:100%;max-width:360px;margin:auto}h1{font-size:48px}.cards,.contact{grid-template-columns:1fr}.facts,footer{flex-direction:column;gap:7px}.cards{padding-block:10px 24px}.intro{padding-top:25px}}
`;

function shell(title, content, hours) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Juniper &amp; Stem</title><link rel="stylesheet" href="styles.css"></head><body>
<aside class="sample">Fictional website-delivery case for ProofBeforePay. No real shop, orders or email service.</aside>
<header><a class="brand" href="index.html">juniper &amp; stem.</a><nav aria-label="Main navigation"><a href="index.html">Home</a><a href="services.html">Services</a><a href="contact.html">Contact</a></nav></header>
<main>${content}</main><footer><span>Juniper &amp; Stem · Fictional Melbourne floral studio<br>hello@juniper.example.test · sample address, not monitored</span><span>Opening hours: ${hours}<br>All prices are illustrative AUD amounts.</span></footer></body></html>
`;
}

export function showcaseFiles(version) {
  if (![1, 2].includes(version)) throw new Error("Use showcase version 1 or 2.");
  const hours = version === 1 ? "Monday to Friday, 10am–6pm" : "Monday to Friday, 11am–8pm";
  // v2 deliberately uses different wording from the agreed policy: this is a
  // source-copy semantic check, separate from whether a form actually works.
  const policy = version === 1
    ? "Visit whenever inspiration strikes. Drop in without arranging a time and our florist will happily start a consultation."
    : "Every consultation is arranged in advance. We cannot accommodate walk-ins; please agree a time with our florist before visiting.";
  const cards = `<section class="cards" aria-label="Floral services"><article class="card"><h3>The daily posy</h3><p>Seasonal stems, wrapped simply. A small pleasure for an everyday table.</p><span class="price">From AUD 45</span></article><article class="card"><h3>Seasonal bouquet</h3><p>A generous hand-tied arrangement, chosen for colour and texture.</p><span class="price">From AUD 85</span></article><article class="card"><h3>Table flowers</h3><p>Thoughtful details for intimate gatherings and small celebrations.</p><span class="price">From AUD 160</span></article></section>`;
  return {
    "index.html": shell("Home", `<section class="hero"><div><p class="kicker">Melbourne · independent floral studio</p><h1>A little wild.<br>A little wonderful.</h1><p class="lead">Seasonal flowers, thoughtful gifts and a quiet appreciation for the everyday. Made one stem at a time.</p><a class="primary" href="contact.html#consultation">Book a call</a></div><div class="art" role="img" aria-label="Decorative bouquet illustration"><span class="stem"></span><span class="stem"></span><span class="stem"></span><span class="vase"></span></div></section><div class="facts"><span>Opening hours: ${hours}</span><span>Seasonal arrangements · thoughtful gifts</span></div><section class="intro"><h2>Flowers with a little character.</h2><p class="lead">Meet our three illustrative services.</p></section>${cards}`, hours),
    "services.html": shell("Services", `<section class="intro"><p class="kicker">Flowers for your moments</p><h1>Made with care.<br>Given with love.</h1><p class="lead">From an everyday posy to a small celebration, tell us what you have in mind.</p></section>${cards}<section class="policy"><h2>Consultation policy</h2><p>${policy}</p></section><a class="primary" href="contact.html#consultation">Book a call</a>`, hours),
    "contact.html": shell("Contact", `<section class="intro"><p class="kicker">Let's make something lovely</p><h1>Start a conversation.</h1></section><div class="contact"><section id="${version === 1 ? "enquiry" : "consultation"}"><h2>Consultation request</h2><p>Tell our fictional florist when you would like to talk.</p><form class="request"><label for="name">Your name</label><input id="name" name="name" autocomplete="name"><label for="email">Your email</label><input id="email" name="email" type="email" autocomplete="email"><button class="primary" type="submit">Request a time</button></form><p class="quiet">This demonstration form has no connected backend and does not send email. Source review cannot verify successful submission.</p></section><section><h2>Before you visit</h2><p>${policy}</p><p>Opening hours: ${hours}</p><p class="quiet">Fictional Melbourne location; no shop visits or real appointments.</p></section></div>`, hours),
    "styles.css": CSS + (version === 1 ? "\n/* Deliberate delivered defect: service cards overflow a narrow viewport. */\n.cards{min-width:760px}\n" : "\n/* Revised delivery: service cards can shrink at mobile widths. */\n.cards{min-width:0}\n"),
  };
}

export const SHOWCASE_REQUIREMENTS = Object.freeze({
  synthetic: true, language: "en", title: "Juniper & Stem — cross-border website delivery", amount: "480.00", currency: "AUD",
  summary: "A fictional Melbourne florist hires an overseas developer for a three-page static marketing website. Agreed scope covers source copy, a local consultation target and human-checked mobile presentation. Form processing and email delivery are excluded.",
  requiredPages: ["index.html", "services.html", "contact.html"],
  manualRequirements: [
    "Display opening hours: Monday to Friday, 11am–8pm.",
    "The page copy must clearly say consultations are by appointment only; walk-ins are not accepted.",
  ],
  criterionTitles: { "manual-1": "Opening hours", "manual-2": "Consultation policy copy", mobile: "Mobile usability" },
  assessmentBoundaryExample: {
    excludedFromAcceptedScope: true,
    criterion: { id: "manual-3", title: "Request form and email delivery", source: "The form must submit an appointment request and the owner must receive email." },
    expectedStatus: "insufficient_evidence",
    explanation: "This is not part of the accepted marketing-site scope. A form and source code cannot establish server processing or email receipt. Use runtime-labelled evaluation cases to demonstrate this boundary; never tick this as completed just to reach payment.",
  },
  link: { from: "index.html", text: "Book a call", to: "contact.html#consultation" },
  expected: {
    v1: { content: "Wrong opening hours and a policy that permits unscheduled visits.", rule: "The #consultation target is absent, although contact.html exists.", runtime: "Form/email remains unverified by source. The delivered service cards deliberately have min-width:760px: measure actual horizontal overflow at 375px and compare with 900px." },
    v2: { content: "Hours are corrected. Different wording says advance arrangement is required and walk-ins cannot be accommodated.", rule: "The #consultation target now exists.", runtime: "Service cards use min-width:0; measure actual 375px/900px widths. The form still has no backend/email service. Do not confirm runtime behavior from source; mobile usability needs rendered observations and human confirmation." },
  },
});

export async function buildShowcase(output) {
  if (!path.isAbsolute(output)) throw new Error("Use a new absolute output directory.");
  try { await lstat(output); throw new Error("Output already exists."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await mkdir(output, { recursive: true });
  const manifest = { generatedAt: new Date().toISOString(), synthetic: true, defaultFixtureChanged: false, files: [] };
  for (const version of [1, 2]) {
    await mkdir(path.join(output, `v${version}`));
    for (const [name, content] of Object.entries(showcaseFiles(version))) {
      await writeFile(path.join(output, `v${version}`, name), content, { flag: "wx" });
      manifest.files.push({ file: `v${version}/${name}`, bytes: Buffer.byteLength(content), utf16Characters: content.length, sha256: createHash("sha256").update(content).digest("hex") });
    }
  }
  await writeFile(path.join(output, "requirements.json"), JSON.stringify(SHOWCASE_REQUIREMENTS, null, 2) + "\n", { flag: "wx" });
  await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return { output, requirements: path.join(output, "requirements.json"), versions: ["v1", "v2"], deliveryFilesPerVersion: 4, synthetic: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--output") throw new Error("Usage: node scripts/build-showcase.mjs --output /absolute/new-directory");
  console.log(JSON.stringify(await buildShowcase(args[1])));
}
