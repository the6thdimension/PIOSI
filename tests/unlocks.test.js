import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getStarterHeroIds, heroMeetsUnlock, isHeroAvailable,
  computeNewUnlocks, nextUnlockHint, heroKey,
} from '../src/unlocks.js';
import { __testing, SAVE_VERSION } from '../src/persistence.js';

const HEROES = [
  { id: 'knight', name: 'Knight' },
  { id: 'cleric', name: 'Cleric' },
  { id: 'wizard', name: 'Wizard', locked: true, unlock: { metric: 'kills', count: 30, hint: 'defeat 30' } },
  { id: 'kemetic', name: 'Kemetic', locked: true, unlock: { metric: 'heroDeaths', count: 1, hint: 'let a hero fall' } },
];

test('unlocks: getStarterHeroIds returns only non-locked heroes', () => {
  assert.deepEqual(getStarterHeroIds(HEROES), ['knight', 'cleric']);
});

test('unlocks: heroKey prefers id then name', () => {
  assert.equal(heroKey({ id: 'a', name: 'B' }), 'a');
  assert.equal(heroKey({ name: 'B' }), 'B');
});

test('unlocks: heroMeetsUnlock honors threshold and treats non-locked as met', () => {
  const wizard = HEROES[2];
  assert.equal(heroMeetsUnlock(wizard, { kills: 30 }), true);
  assert.equal(heroMeetsUnlock(wizard, { kills: 29 }), false);
  assert.equal(heroMeetsUnlock(wizard, {}), false);
  assert.equal(heroMeetsUnlock(HEROES[0], {}), true); // non-locked always available
});

test('unlocks: isHeroAvailable gates locked heroes on the unlocked set', () => {
  assert.equal(isHeroAvailable(HEROES[0], []), true);          // starter
  assert.equal(isHeroAvailable(HEROES[2], []), false);         // locked, not unlocked
  assert.equal(isHeroAvailable(HEROES[2], ['wizard']), true);  // locked, unlocked
});

test('unlocks: computeNewUnlocks returns met-but-not-yet-unlocked locked heroes', () => {
  const got = computeNewUnlocks(HEROES, { heroDeaths: 1, kills: 0 }, ['knight', 'cleric']);
  assert.deepEqual(got, ['kemetic']);
});

test('unlocks: computeNewUnlocks excludes already-unlocked heroes', () => {
  const got = computeNewUnlocks(HEROES, { heroDeaths: 1, kills: 30 }, ['knight', 'cleric', 'kemetic']);
  assert.deepEqual(got, ['wizard']);
});

test('unlocks: nextUnlockHint picks the closest locked hero by remaining', () => {
  const hint = nextUnlockHint(HEROES, { kills: 10, heroDeaths: 0 }, ['knight', 'cleric']);
  assert.equal(hint.id, 'kemetic'); // remaining 1 < wizard remaining 20
  assert.equal(hint.cur, 0);
  assert.equal(hint.need, 1);
  assert.equal(hint.remaining, 1);
});

test('unlocks: nextUnlockHint returns null when nothing is left to unlock', () => {
  const hint = nextUnlockHint(HEROES, {}, ['knight', 'cleric', 'wizard', 'kemetic']);
  assert.equal(hint, null);
});

test('persistence: migrate stamps a fresh blob to the current schema', () => {
  const m = __testing.migrate({});
  assert.equal(m.saveVersion, SAVE_VERSION);
  assert.deepEqual(m.unlockedHeroes, []);
  assert.deepEqual(m.career, {});
});

test('persistence: migrate preserves data and upgrades an old version', () => {
  const m = __testing.migrate({ saveVersion: 0, unlockedHeroes: ['knight'], career: { kills: 5 } });
  assert.equal(m.saveVersion, SAVE_VERSION);
  assert.deepEqual(m.unlockedHeroes, ['knight']);
  assert.equal(m.career.kills, 5);
});

test('persistence: migrate repairs a null/garbage blob into a fresh save', () => {
  const m = __testing.migrate(null);
  assert.equal(m.saveVersion, SAVE_VERSION);
  assert.deepEqual(m.unlockedHeroes, []);
  assert.deepEqual(m.career, {});
});
