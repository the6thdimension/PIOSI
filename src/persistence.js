/**
 * persistence.js
 *
 * Minimal meta-progression persistence over localStorage, with a saveVersion and
 * a migrate() hook from day one so future schema changes never corrupt old saves.
 *
 * Degrades gracefully: if localStorage is unavailable (private mode, some file://
 * contexts), load returns a fresh save and save no-ops with a console.warn — the
 * game stays fully playable, it just won't remember unlocks between sessions.
 * (play.bat serves over http://localhost where localStorage works.)
 */

const SAVE_KEY = 'piosi.meta';
export const SAVE_VERSION = 1;

function freshSave() {
  return { saveVersion: SAVE_VERSION, unlockedHeroes: [], career: {} };
}

/**
 * Bring an arbitrary persisted blob up to the current schema. Branch on
 * data.saveVersion for each future migration; always stamp to SAVE_VERSION last.
 */
function migrate(data) {
  if (!data || typeof data !== 'object') return freshSave();
  if (typeof data.saveVersion !== 'number') data.saveVersion = 0;
  // Future migrations go here, e.g.:
  //   if (data.saveVersion < 2) { /* transform */ data.saveVersion = 2; }
  if (data.saveVersion < SAVE_VERSION) data.saveVersion = SAVE_VERSION;
  if (!Array.isArray(data.unlockedHeroes)) data.unlockedHeroes = [];
  if (!data.career || typeof data.career !== 'object') data.career = {};
  return data;
}

/** Load + migrate the meta save. Never throws; returns a usable object. */
export function loadMeta() {
  try {
    if (typeof localStorage === 'undefined') return freshSave();
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshSave();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('[persistence] load failed; starting fresh.', e);
    return freshSave();
  }
}

/** Persist the meta save. Returns true on success, false if storage is unavailable. */
export function saveMeta(meta) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(SAVE_KEY, JSON.stringify(meta));
    return true;
  } catch (e) {
    console.warn('[persistence] save unavailable (private mode / file://?).', e);
    return false;
  }
}

// Exposed for tests.
export const __testing = { freshSave, migrate, SAVE_KEY };
