import assert from "node:assert/strict";
import test from "node:test";
import { suggestBookingPolicy, validateBookingPolicy } from "../lib/booking-policy.ts";

function requirement(excerpt: string, start = 0) { return { start, end: start + excerpt.length, excerpt }; }

test("clear bilingual maximum-party clauses yield literal source proposals without adopting a plan", () => {
  for (const [text, expected] of [
    ["每笔预约最多6人。", 6],
    ["每次预订最多接待 4 位客人", 4],
    ["预约人数上限为 12 人！", 12],
    ["Each booking accepts at most 6 people.", 6],
    ["Every booking supports a maximum of 8 guests", 8],
    ["Maximum party size per booking: 2 persons.", 2],
  ] as const) {
    const original = requirement(text, 13);
    const policy = suggestBookingPolicy(original)!;
    assert.equal(policy.maxPartySize, expected);
    assert.equal(original.excerpt.slice(policy.source.start - original.start, policy.source.end - original.start), policy.source.excerpt);
    assert.deepEqual(validateBookingPolicy(policy, original), policy);
    assert.deepEqual(original, requirement(text, 13));
  }
});

test("only the supported integer range is proposed; manual values cannot override the cited maximum", () => {
  for (const n of [1, 13, 99]) assert.equal(suggestBookingPolicy(requirement(`每笔预约最多${n}人`)), undefined);
  for (const text of ["每笔预约最多6.5人", "每笔预约最多-6人", "每笔预约最多06人", "每笔预约最多６人"]) {
    assert.equal(suggestBookingPolicy(requirement(text)), undefined);
  }
  const original = requirement("每笔预约最多6人");
  const policy = suggestBookingPolicy(original)!;
  assert.throws(() => validateBookingPolicy({ ...policy, maxPartySize: 7 }, original), /exact source span/u);
  for (const n of ["6", true, NaN, Infinity, 1, 13, 2.5]) assert.throws(() => validateBookingPolicy({ ...policy, maxPartySize: n }, original));
});

test("money, minimums, negations, alternatives and compound limits remain unsupported", () => {
  for (const text of [
    "项目费用最多6澳元", "菜单最多6道菜", "每笔预约至少6人", "每笔预约最少6人",
    "不要限制每笔预约最多6人", "每笔预约不是最多6人", "每笔预约不再最多6人",
    "每笔预约最多6到8人", "每笔预约最多6人或8人", "每笔预约最多6人，节假日最多8人",
    "每笔预约最多6人且至少2人", "每笔预约最多6人，每笔预约最多6人",
    "Each booking accepts at least 6 people.", "Each booking does not accept at most 6 people.",
    "Each booking accepts at most 6 or 8 people.", "Each booking accepts at most 6 people except on Fridays.",
    "The project fee is6AUD; Each booking accepts at most 6 people.",
    '页面应显示“每笔预约最多6人”',
  ]) {
    const original = requirement(text);
    assert.equal(suggestBookingPolicy(original), undefined, text);
    assert.throws(() => validateBookingPolicy({ maxPartySize: 6, source: original }, original), /exact source span/u, text);
  }
});

test("absolute spans use UTF-16 and cannot cite a convenient substring or a different occurrence", () => {
  const prefix = "🍜\n";
  const original = requirement("预约人数上限为 6 人。", prefix.length);
  const whole = prefix + original.excerpt;
  const policy = suggestBookingPolicy(original)!;
  assert.equal(policy.source.start, 3);
  assert.equal(whole.slice(policy.source.start, policy.source.end), policy.source.excerpt);
  for (const changed of [
    { ...policy.source, start: policy.source.start - 1, end: policy.source.end - 1 },
    { ...policy.source, excerpt: policy.source.excerpt.replace("6", "7") },
    { start: original.start + 8, end: original.start + 9, excerpt: "6" },
    { ...policy.source, start: policy.source.start + 100, end: policy.source.end + 100 },
  ]) assert.throws(() => validateBookingPolicy({ ...policy, source: changed }, original));
  const compound = requirement("每笔预约最多6人，或每笔预约最多8人", 3);
  assert.throws(() => validateBookingPolicy({ maxPartySize: 6, source: { start: 3, end: 11, excerpt: "每笔预约最多6人" } }, compound));
});

test("malformed and extra source fields fail closed and returned policies share no caller-owned object", () => {
  const original = requirement("  Each booking accepts at most 6 people.  ", 7);
  const policy = suggestBookingPolicy(original)!;
  assert.equal(policy.source.start, 9);
  assert.equal(policy.source.excerpt, "Each booking accepts at most 6 people");
  const output = validateBookingPolicy(policy, original);
  assert.notEqual(output.source, policy.source);
  output.source.excerpt = "changed";
  assert.equal(policy.source.excerpt, "Each booking accepts at most 6 people");
  assert.throws(() => validateBookingPolicy({ ...policy, confirmed: true }, original));
  assert.throws(() => validateBookingPolicy({ ...policy, source: { ...policy.source, file: "other.txt" } }, original));
  for (const value of [null, [], new Date(), { start: -1, end: 8, excerpt: "each" }, requirement("每笔预约最多\u200b6人"), requirement("每笔预约最多6人\n")]) {
    assert.throws(() => suggestBookingPolicy(value));
  }
  assert.throws(() => suggestBookingPolicy({ ...original, end: original.end - 1 }));
});
