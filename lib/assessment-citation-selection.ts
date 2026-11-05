import type {AssessmentCitationEncoding} from "./assessment-completion.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT} from "./assessment-limits.ts";
import {AssessmentResponseError} from "./assessment-response.ts";

const fail = (reason: "structure" | "citation" = "structure"): never => {throw new AssessmentResponseError(reason);};
function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/** Decode selectors, never source text. V3 must contain precisely the fixed
 * c1..cN data fields, with a contiguous selected prefix and trailing empty
 * strings. IDs stay verbatim for the existing catalog resolver; unknown IDs
 * cannot be repaired here. Earlier encodings retain their original validators. */
export function assessmentCitationSelection(value: unknown, maximum: number, encoding: AssessmentCitationEncoding): unknown {
  if (encoding !== "catalog_slots") return value;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > ASSESSMENT_ITEM_CITATION_LIMIT || !plain(value)) return fail();
  const keys = Reflect.ownKeys(value), expected = Array.from({length: maximum}, (_, index) => `c${index + 1}`);
  if (keys.length !== expected.length || keys.some(key => typeof key !== "string" || !expected.includes(key))) return fail();
  const slots = expected.map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") return fail();
    return descriptor.value as string;
  });
  const selected = slots.filter(slot => slot !== "");
  if (new Set(selected).size !== selected.length) return fail("citation");
  const firstEmpty = slots.indexOf("");
  if (firstEmpty !== -1 && slots.slice(firstEmpty).some(slot => slot !== "")) return fail();
  return selected;
}

/** Normalize only the selectors in a separate validation view. Raw provider
 * items are untouched. Missing fields, statuses, IDs, extra fields and list
 * bounds remain the existing item/coverage validators' responsibility. */
export function assessmentItemsForValidation(value: unknown, encoding: AssessmentCitationEncoding): unknown {
  if (encoding !== "catalog_slots" || !Array.isArray(value)) return value;
  return value.map(item => {
    if (!plain(item)) return item;
    const keys = Reflect.ownKeys(item);
    if (keys.some(key => typeof key !== "string" || !("value" in Object.getOwnPropertyDescriptor(item, key)!)) || !Object.hasOwn(item, "citations")) return item;
    return {...item, citations: assessmentCitationSelection(item.citations, ASSESSMENT_ITEM_CITATION_LIMIT, encoding)};
  });
}
