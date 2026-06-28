import type { CardAttributes, DasAsset } from '@battler/core';
import { emptyAttributes, nameOf } from '@battler/core';

/**
 * Map a DAS asset's free-form `content.metadata.attributes` to the standard
 * tokenized-card schema. The exact trait_type keys are NOT publicly confirmed
 * for Phygitals, so we try multiple variants per field and fall back to parsing
 * the NFT name string itself. (Plan: "Build your parser against the observed
 * schema; fall back to the name.")
 */
const KEY_ALIASES: Record<keyof CardAttributes, string[]> = {
  grade: ['grade', 'psa grade', 'cgc grade', 'bgs grade', 'card grade'],
  gradingCompany: ['grading company', 'grading_company', 'grader', 'certification', 'grading service', 'company'],
  set: ['set', 'set name', 'series', 'edition', 'expansion'],
  cardNumber: ['card number', 'card_number', 'number', 'collector number', 'card no', '#'],
  rarity: ['rarity', 'card rarity', 'card_rarity'],
  year: ['year', 'release year', 'release_year', 'date'],
  language: ['language', 'lang'],
  certNumber: ['certification number', 'certification_number', 'cert number', 'cert', 'cert_number', 'certnumber'],
};

function normKey(k: string): string {
  return k.trim().toLowerCase();
}

export function extractAttributes(asset: DasAsset): CardAttributes {
  const attrs = emptyAttributes();
  const list = asset.content?.metadata?.attributes ?? [];
  const name = nameOf(asset);

  const lookup = new Map<string, string>();
  for (const a of list) {
    if (!a?.trait_type || a.value == null) continue;
    lookup.set(normKey(a.trait_type), String(a.value).trim());
  }

  for (const field of Object.keys(KEY_ALIASES) as (keyof CardAttributes)[]) {
    for (const alias of KEY_ALIASES[field]) {
      const v = lookup.get(alias);
      if (v != null && v !== '') {
        attrs[field] = v;
        break;
      }
    }
  }

  // ---- name-string fallbacks (Phygitals pattern "{YEAR} {Pokemon} {Set} #{num}") ----
  if (!attrs.year) {
    const m = /\b(19|20)\d{2}\b/.exec(name);
    if (m) attrs.year = m[0];
  }
  if (!attrs.cardNumber) {
    const m = /#?\s*([a-z]{0,3}\d{1,3}\s*\/\s*[a-z]{0,3}\d{1,3}[a-z]?)/i.exec(name);
    if (m) attrs.cardNumber = m[1]!.replace(/\s+/g, '');
  }

  // Normalize a combined "PSA 10" grade field into company + numeric grade.
  if (attrs.grade && !attrs.gradingCompany) {
    const gm = /\b(PSA|BGS|CGC|SGC|GAI|HGA)\b/i.exec(attrs.grade);
    if (gm) attrs.gradingCompany = gm[1]!.toUpperCase();
  }
  if (attrs.grade) {
    const num = /\d{1,2}(?:\.\d)?/.exec(attrs.grade);
    if (num) attrs.grade = num[0];
  }

  return attrs;
}
