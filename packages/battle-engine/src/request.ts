import { Dex } from './data.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Enrich a Showdown `|request|` with move + species typing so the web client can
 * render a Showdown-style UI (type-coloured move buttons, type badges) without
 * bundling the whole dex into the browser. Best-effort and mutation-in-place.
 */
export function enrichRequest(request: unknown): unknown {
  if (!request || typeof request !== 'object') return request;
  const r = request as Record<string, any>;
  try {
    if (Array.isArray(r.active)) {
      for (const a of r.active) {
        if (a && Array.isArray(a.moves)) {
          for (const m of a.moves) {
            if (m && m.id) {
              const md = Dex.moves.get(m.id);
              if (md && md.exists) {
                m.type = md.type;
                m.category = md.category;
              }
            }
          }
        }
      }
    }
    if (r.side && Array.isArray(r.side.pokemon)) {
      for (const p of r.side.pokemon) {
        const species = String(p.details ?? '').split(',')[0]?.trim();
        if (species) {
          const sp = Dex.species.get(species);
          if (sp && sp.exists) {
            p.types = sp.types;
            p.speciesForme = sp.name;
          }
        }
      }
    }
  } catch {
    /* best-effort enrichment only */
  }
  return request;
}
