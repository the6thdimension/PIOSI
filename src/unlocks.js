/**
 * unlocks.js
 *
 * Pure, DOM-free hero-unlock logic for the meta-progression spine. Heroes whose
 * JSON carries `locked: true` and an `unlock: { metric, count, hint }` object are
 * gated behind a career metric threshold. All functions here are side-effect free
 * and unit-testable in Node.
 *
 * Unlock conditions reference ONLY universal career metrics (kills, heroDeaths,
 * woundedHits, furthestLevel, totalRuns, victories, modeUps, flanks, foodEaten,
 * damageTaken, nearDeathSurvivals, flawlessLevels) — never a stat unique to the
 * locked hero itself — so every hero is reachable with the starter roster.
 */

/** Stable id for a hero (prefer `id`, fall back to `name`). */
export function heroKey(hero) {
  return hero.id || hero.name;
}

/** Ids of heroes available from the start (those without `locked: true`). */
export function getStarterHeroIds(heroes) {
  return (heroes || []).filter(h => !h.locked).map(heroKey);
}

/** True if the hero's unlock condition is satisfied by the given career totals. */
export function heroMeetsUnlock(hero, career) {
  if (!hero.locked || !hero.unlock) return true;
  const have = (career && career[hero.unlock.metric]) || 0;
  return have >= hero.unlock.count;
}

/** True if the hero is selectable (not locked, or present in the unlocked set). */
export function isHeroAvailable(hero, unlockedIds) {
  if (!hero.locked) return true;
  return Array.isArray(unlockedIds) && unlockedIds.includes(heroKey(hero));
}

/**
 * Ids of locked heroes whose condition is now met but who are not yet unlocked.
 * @param {Array} heroes - full hero list (with locked/unlock fields)
 * @param {Object} career - cumulative career metrics
 * @param {Array} unlockedIds - already-unlocked hero ids
 * @returns {Array<string>}
 */
export function computeNewUnlocks(heroes, career, unlockedIds) {
  const have = new Set(unlockedIds || []);
  return (heroes || [])
    .filter(h => h.locked && !have.has(heroKey(h)) && heroMeetsUnlock(h, career))
    .map(heroKey);
}

/**
 * The locked hero closest to unlocking (fewest remaining), for a "next goal" hint.
 * @returns {{id, name, hint, cur, need, remaining}|null}
 */
export function nextUnlockHint(heroes, career, unlockedIds) {
  const have = new Set(unlockedIds || []);
  let best = null;
  for (const h of heroes || []) {
    if (!h.locked || !h.unlock || have.has(heroKey(h))) continue;
    const cur = (career && career[h.unlock.metric]) || 0;
    const need = h.unlock.count;
    const remaining = Math.max(0, need - cur);
    if (best === null || remaining < best.remaining) {
      best = { id: heroKey(h), name: h.name, hint: h.unlock.hint, cur: Math.min(cur, need), need, remaining };
    }
  }
  return best;
}
