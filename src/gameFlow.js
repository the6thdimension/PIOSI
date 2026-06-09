import { state } from './state.js';
import { logMessage, clearLog } from './logger.js';
import { renderBattlefield, resetRenderCaches } from './renderer.js';
import { showScreen } from './screenManager.js';
import { fadeOut, stopAudio } from './audioManager.js';
import { updateModeUpHeroDisplay } from './modeUpUI.js';
import { applyModeUp, getModeUpOptions } from './modeup.js';
import { BattleEngine } from './battleEngine.js';
import { SummitMode } from './summitMode.js';
import { getGriotReaction, commentOn } from './griot.js';
import { computeNewUnlocks, nextUnlockHint } from './unlocks.js';
import { saveMeta } from './persistence.js';

// Tunable transition pacing (ms). Trimmed from the original values to cut dead
// wait time between levels without losing the narrative beats.
const TRANSITION = {
  modeUpPulseMs: 450,   // Mode Up ceremony pulse before leaving the screen
  dispatchAutoMs: 6000, // dispatch auto-advance fallback (always Space/click-skippable)
  reviveRetryMs: 300,   // retry delay when no heroes survive a Mode Up window
};

/**
 * Inter-level dispatch (enhancement): shows a short narrative fragment when
 * entering a level, then runs `next()`. No-ops gracefully if no dispatch exists
 * for the level (or it was already shown), preserving the flow either way.
 */
function showDispatchThen(level, next) {
  const dispatch = (state.dispatches || []).find(d => d.enteringLevel === level);
  if (!dispatch || state.dispatchesShown[level]) { next(); return; }
  const textEl = document.getElementById('dispatch-text');
  if (!textEl) { next(); return; }
  state.dispatchesShown[level] = true;
  textEl.textContent = dispatch.text;

  let done = false;
  const cont = () => {
    if (done) return;
    done = true;
    if (state._dispatchTimer) { clearTimeout(state._dispatchTimer); state._dispatchTimer = null; }
    state._dispatchContinue = null;
    next();
  };
  state._dispatchContinue = cont;
  state._dispatchTimer = setTimeout(cont, TRANSITION.dispatchAutoMs); // auto-advance so it never blocks
  showScreen('dispatch');
}

export function initializeBattle() {
  const settings = state.getLevel(state.level);
  if (!settings) {
    // No more levels — the saga is complete.
    finalizeRun(true);
    _showVictoryWithGriot();
    return;
  }
  // Snapshot death count so onLevelComplete can detect a flawless clear.
  state._levelStartDeaths = state.runMetrics.heroDeaths || 0;
  // Track the highest REAL level entered (state.level overruns past the last
  // level on victory, so furthestLevel must come from here, not state.level).
  state.runMetrics.reached = Math.max(state.runMetrics.reached || 0, state.level);
  const { rows, cols, wallHP, title, subtitle, enemies: levelEnemies, layout } = settings;
  document.getElementById('level-title').textContent = title;

  // LEVEL EPITAPH (enhancement #7): show subtitle briefly then fade
  const subtitleEl = document.getElementById('level-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = subtitle || '';
    subtitleEl.classList.toggle('visible', !!subtitle);
    if (subtitle) setTimeout(() => subtitleEl.classList.remove('visible'), 3500);
  }

  state.enemies = levelEnemies;

  // Narrator callback: routes commentOn events to the battle log as styled griot lines
  const narratorCallback = (event) => {
    const line = commentOn(event);
    if (line) logMessage(`[℣] ${line}`);
  };

  state.battleEngine = new BattleEngine(
    state.party, state.enemies,
    rows, cols, wallHP,
    logMessage, onLevelComplete, onGameOver,
    layout || null,
    narratorCallback,
    state.runMetrics
  );
  resetRenderCaches(); // force a clean first paint for the new battle
  renderBattlefield();

  if (state.level === 5) document.getElementById('level-5-music').play().catch(() => {});
  if (state.level === 6) document.getElementById('level-6-music').play().catch(() => {});
  if (state.level === 99) {
    logMessage('Entering Level 99: The Hidden Arena!');
    showScreen('battle');
  }
}

export function onLevelComplete() {
  // Flawless clear: this level was cleared with no new permanent deaths.
  if ((state.runMetrics.heroDeaths || 0) === (state._levelStartDeaths || 0)) {
    state.runMetrics.flawlessLevels = (state.runMetrics.flawlessLevels || 0) + 1;
  }
  const worldMapEnabled = state.loadedManifest ? state.loadedManifest.modes.worldMap : true;
  if (state.level === 99) {
    logMessage('The veil of introspection lifts...');
    logMessage("You've broken through! The eternal wall falls!");
    finalizeRun(true);
    _showVictoryWithGriot();
  } else if (state.level === 20 && worldMapEnabled) {
    logMessage('Level 20 complete! Entering the world map...');
    showScreen('worldMap');
  } else {
    logMessage(`Level ${state.level} complete!`);
    showModeUpWindow();
  }
  if (state.level === 5) fadeOut(document.getElementById('level-5-music'));
}

export function onGameOver() {
  stopAudio(document.getElementById('level-6-music'));
  finalizeRun(false);
  renderPostMortem('game-over-summary');
  getGriotReaction().then(line => {
    const el = document.getElementById('game-over-griot');
    if (el) el.textContent = line;
  }).catch(() => {});
  document.getElementById('game-over').style.display = 'flex';
}

function _showVictoryWithGriot() {
  renderPostMortem('victory-summary');
  getGriotReaction().then(line => {
    const el = document.getElementById('victory-griot');
    if (el) el.textContent = line;
  }).catch(() => {});
  showScreen('victory');
}

export function showModeUpWindow() {
  state.livingHeroes = state.party.filter(h => h.hp > 0);
  if (state.livingHeroes.length === 0) {
    setTimeout(initializeBattle, TRANSITION.reviveRetryMs);
    return;
  }
  state.modeUpIndex = 0;
  state.modeUpOptionIndex = 0;
  showScreen('modeUp');
  updateModeUpHeroDisplay();
  if (state.level === 4) fadeOut(document.getElementById('background-music'));
}

export function applyCurrentModeUp() {
  if (state.livingHeroes.length > 0) {
    const hero = state.livingHeroes[state.modeUpIndex];
    const options = getModeUpOptions(hero, state.level);
    const chosenBuff = options[state.modeUpOptionIndex] || options[0];
    applyModeUp(hero, state.level, state.party, logMessage, chosenBuff);
    state.runMetrics.modeUps = (state.runMetrics.modeUps || 0) + 1;

    // Mode Up ceremony: pulse the window before transitioning
    const win = document.getElementById('mode-up-window');
    if (win) win.classList.add('modeup-pulse');
    setTimeout(() => {
      if (win) win.classList.remove('modeup-pulse');
      state.level++;
      // Show the dispatch for the level we're entering, then start the battle.
      showDispatchThen(state.level, () => {
        showScreen('battle');
        initializeBattle();
      });
    }, TRANSITION.modeUpPulseMs);
  }
}

export function startGame() {
  if (state.selectedHeroes.length < 1) {
    return; // Start button only appears when ≥1 hero selected; no alert needed
  }
  const heroSelectMusic = document.getElementById('hero-select-music');
  const backgroundMusic = document.getElementById('background-music');
  fadeOut(heroSelectMusic, () => backgroundMusic.play().catch(() => {}));
  state.lastParty = [...state.selectedHeroes]; // remember for quick retry
  beginRun();
}

/**
 * Builds the party from selectedHeroes, resets per-run state, and enters level 1
 * (via the opening dispatch). Shared by startGame and retrySameParty.
 */
function beginRun() {
  state.party = state.selectedHeroes.map(i => Object.assign({}, state.allHeroes[i]));
  state.party.sort((a, b) => (b.agility || 0) - (a.agility || 0));
  state.runMetrics = {};
  state._levelStartDeaths = 0;
  showDispatchThen(state.level, () => {
    initializeBattle();
    showScreen('battle');
  });
}

/** Restart immediately with the same party as the last run (quick iteration). */
export function retrySameParty() {
  if (!state.lastParty || !state.lastParty.length) { restartGame(); return; }
  state.level = 1;
  state.selectedHeroes = [...state.lastParty];
  state.modeUpOptionIndex = 0;
  state.cheatActive = false;
  state.dispatchesShown = {};
  state.lastRunReport = null;
  clearLog();
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('victory').style.display = 'none';
  stopAudio(document.getElementById('level-5-music'));
  stopAudio(document.getElementById('level-6-music'));
  const bg = document.getElementById('background-music');
  if (bg) bg.play().catch(() => {});
  beginRun();
}

export function restartGame() {
  state.level = 1;
  state.selectedHeroes = [];
  state.party = [];
  state.heroIndex = 0;
  state.modeUpOptionIndex = 0;
  state.cheatActive = false;
  state.dispatchesShown = {};
  state.runMetrics = {};
  state._levelStartDeaths = 0;
  state.lastRunReport = null;
  state._dispatchContinue = null;
  if (state._dispatchTimer) { clearTimeout(state._dispatchTimer); state._dispatchTimer = null; }
  clearLog();
  document.getElementById('game-over').style.display = 'none';
  stopAudio(document.getElementById('background-music'));
  stopAudio(document.getElementById('level-5-music'));
  stopAudio(document.getElementById('level-6-music'));
  const heroSelectMusic = document.getElementById('hero-select-music');
  heroSelectMusic.currentTime = 0;
  heroSelectMusic.volume = 1;
  heroSelectMusic.play().catch(() => {});
  showScreen('party');
  // Re-import updateHeroDisplay dynamically to avoid circular dep
  import('./partySelectUI.js').then(m => m.updateHeroDisplay()).catch(() => {});
}

export function activateCheat() {
  if (!state.cheatActive) {
    state.cheatActive = true;
    console.log('Cheat code detected! Activating Level 99: The Hidden Arena!');
    state.level = 99;
    initializeBattle();
  }
}

export function worldMapCheatCode() {
  if (state.loadedManifest && !state.loadedManifest.modes.worldMap) {
    console.log('World map is disabled in CORE mode.');
    return;
  }
  console.log('World Map cheat code detected! Opening THE BROADLANDS!');
  showScreen('worldMap');
}

export function startSummitMode() {
  const logCallback = message => {
    const logDiv = document.getElementById('summit-log');
    logDiv.innerHTML += `<p>${message}</p>`;
    logDiv.scrollTop = logDiv.scrollHeight;
  };
  // Summit uses its own end-of-sim callbacks so it never runs finalizeRun —
  // it has no run metrics and would otherwise corrupt the battle-run career totals.
  const summitGameOver = () => {
    const sum = document.getElementById('game-over-summary');
    if (sum) sum.innerHTML = '';
    getGriotReaction().then(line => {
      const el = document.getElementById('game-over-griot');
      if (el) el.textContent = line;
    }).catch(() => {});
    document.getElementById('game-over').style.display = 'flex';
  };
  const summitVictory = () => {
    const sum = document.getElementById('victory-summary');
    if (sum) sum.innerHTML = '';
    getGriotReaction().then(line => {
      const el = document.getElementById('victory-griot');
      if (el) el.textContent = line;
    }).catch(() => {});
    showScreen('victory');
  };
  const summitMode = new SummitMode(logCallback, summitGameOver, summitVictory);
  summitMode.start();
  showScreen('summitMode');
}

export function startEmanationsMode() {
  showScreen('emanationsMode');
}

// ── Run finalization, unlocks, and post-mortem ──────────────────────────────

const CAREER_CUMULATIVE = [
  'kills', 'heroDeaths', 'woundedHits', 'damageTaken', 'nearDeathSurvivals',
  'flanks', 'foodEaten', 'rises', 'modeUps', 'flawlessLevels',
];

/**
 * Roll the just-finished run's metrics into the persisted career totals, grant
 * any newly-earned hero unlocks, persist, and build the post-mortem report.
 */
function finalizeRun(won) {
  const rm = state.runMetrics || {};
  const meta = state.metaProgress || { saveVersion: 1, unlockedHeroes: [], career: {} };
  const career = meta.career = meta.career || {};

  CAREER_CUMULATIVE.forEach(k => { if (rm[k]) career[k] = (career[k] || 0) + rm[k]; });
  career.totalRuns = (career.totalRuns || 0) + 1;
  if (won) career.victories = (career.victories || 0) + 1;
  const reached = rm.reached || state.level || 1; // highest real level entered
  career.furthestLevel = Math.max(career.furthestLevel || 0, reached);

  let newUnlocks = [];
  if (state.unlocksEnabled) {
    newUnlocks = computeNewUnlocks(state.allHeroes, career, meta.unlockedHeroes);
    if (newUnlocks.length) {
      meta.unlockedHeroes = meta.unlockedHeroes.concat(newUnlocks);
      state.unlockedHeroes = meta.unlockedHeroes.slice();
    }
  }

  state.metaProgress = meta;
  saveMeta(meta);

  state.lastRunReport = {
    won,
    levelReached: reached,
    fallen: rm.fallen || [],
    kills: rm.kills || 0,
    mvp: _computeMvp(rm.killsByHero),
    newUnlocks: newUnlocks.map(_heroName),
    nextHint: state.unlocksEnabled ? nextUnlockHint(state.allHeroes, career, meta.unlockedHeroes) : null,
  };
}

function _heroName(id) {
  const h = (state.allHeroes || []).find(x => (x.id || x.name) === id);
  return h ? h.name : id;
}

function _computeMvp(killsByHero) {
  if (!killsByHero) return null;
  let bestId = null, best = 0;
  for (const id in killsByHero) {
    if (killsByHero[id] > best) { best = killsByHero[id]; bestId = id; }
  }
  return bestId ? { name: _heroName(bestId), kills: best } : null;
}

function buildPostMortemHtml(r) {
  if (!r) return '';
  const rows = [];
  if (!r.won) rows.push(`<div class="pm-stat"><span class="pm-k">Reached</span><span class="pm-v">Wall ${r.levelReached}</span></div>`);
  rows.push(`<div class="pm-stat"><span class="pm-k">Enemies felled</span><span class="pm-v">${r.kills}</span></div>`);
  if (r.mvp) rows.push(`<div class="pm-stat"><span class="pm-k">Most valiant</span><span class="pm-v">${r.mvp.name} · ${r.mvp.kills} kills</span></div>`);
  rows.push(`<div class="pm-stat"><span class="pm-k">Fallen</span><span class="pm-v">${r.fallen && r.fallen.length ? r.fallen.join(', ') : 'none — the company endured'}</span></div>`);

  let footer = '';
  if (r.newUnlocks && r.newUnlocks.length) {
    footer = `<div class="pm-unlocks"><div class="pm-unlocks-title">✦ NEW HEROES JOIN THE SAGA</div>${
      r.newUnlocks.map(n => `<div class="pm-unlock">${n}</div>`).join('')}</div>`;
  } else if (r.nextHint) {
    footer = `<div class="pm-next">Next to answer the call: <b>${r.nextHint.name}</b><br><span class="pm-hint">${r.nextHint.hint}</span> <span class="pm-prog">(${r.nextHint.cur}/${r.nextHint.need})</span></div>`;
  }
  return `<div class="post-mortem">${rows.join('')}${footer}</div>`;
}

function renderPostMortem(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = buildPostMortemHtml(state.lastRunReport);
}
