import assert from "node:assert/strict";
import test from "node:test";
import { deliveryFileUrl } from "../lib/delivery-upload.ts";
import { findSavedLayoutStylesheet } from "../lib/layout-probe.ts";

const origin = "https://app.example";
const files = {"index.html": "<html></html>", "pages/contact.html": "<html></html>", "assets/styles.css": "body {color: green}", "pages/contact.css": "main {width: 100%}", "styles.css": "body {margin: 0}"};
const saved = (html: string, reference: string) => new URL(reference, new URL(deliveryFileUrl("quote", "version", html), origin));

test("layout verification resolves root and nested HTML stylesheets against the saved version package", () => {
  for (const [html, reference, expected] of [
    ["index.html", "assets/styles.css", "assets/styles.css"],
    ["pages/contact.html", "../assets/styles.css", "assets/styles.css"],
    ["pages/contact.html", "contact.css", "pages/contact.css"],
    ["pages/contact.html", "../styles.css", "styles.css"],
    ["index.html", "styles.css", "styles.css"],
  ]) assert.equal(findSavedLayoutStylesheet(files, "quote", "version", saved(html, reference), origin), expected);
});

test("layout stylesheet matching preserves origin, quote, exact version and known CSS boundaries", () => {
  for (const url of [
    "https://other.example/deliveries/quote/version/assets/styles.css",
    origin + "/deliveries/other-quote/version/assets/styles.css",
    origin + "/deliveries/quote/older-version/assets/styles.css",
    origin + "/proof-versions/quote/version/assets/styles.css",
    origin + "/deliveries/quote/version/assets/missing.css",
    origin + "/deliveries/quote/version/assets%2Fstyles.css",
    origin + "/deliveries/quote/version/index.html",
  ]) assert.equal(findSavedLayoutStylesheet(files, "quote", "version", new URL(url), origin), undefined, url);
});
