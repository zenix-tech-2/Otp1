import "server-only";
import { AppError } from "./server";
import { readyUpload } from "./uploads";
import { countryByCode } from "./countries";
import { courseUploadIds, normalizeCourse, normalizeLink, normalizeSlotPayload, type SlotKind } from "./delivery";

function friendly<T>(work: () => T): T {
  try { return work(); } catch (error) { throw new AppError(error instanceof Error ? error.message : "This delivery could not be validated.", 422); }
}

export async function validateCourseDelivery(text: string | null | undefined) {
  const course = friendly(() => normalizeCourse(text));
  for (const id of new Set(courseUploadIds(course))) await readyUpload(id, "delivery");
  return JSON.stringify(course);
}

export function validateLinkDelivery(text: string | null | undefined) {
  return JSON.stringify(friendly(() => normalizeLink(text)));
}

/** Validates and de-duplicates the new stock slots submitted with a product. */
export function validateSlots(kind: SlotKind, payloads: string[] | undefined) {
  const seen = new Set<string>();
  const slots: string[] = [];
  for (const payload of payloads || []) {
    const normalized = friendly(() => normalizeSlotPayload(kind, payload));
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    slots.push(normalized);
  }
  return slots;
}

export function validateCountry(metadata: Record<string, string>) {
  const country = countryByCode(metadata.countryCode);
  if (!country) throw new AppError("Choose the country this listing belongs to.", 422);
  metadata.country = country.name;
  metadata.countryCode = country.code;
}
