import { heroes as staticHeroes } from './heroes.js';
import { getLevel as getStaticLevel } from './levels.js';

export const state = {
  currentScreen: 'title',
  level: 1,
  party: [],
  selectedHeroes: [],
  heroIndex: 0,
  enemies: [],
  battleEngine: null,
  cheatActive: false,
  isometricMode: false,
  modeUpIndex: 0,
  modeUpOptionIndex: 0,   // 0 = prescribed path, 1 = emergent (stat-derived)
  offlineMode: false,
  dispatches: [],         // inter-level narrative fragments (loaded from content)
  dispatchesShown: {},    // tracks which level dispatches have already been shown
  _dispatchContinue: null,// active dispatch-screen continue callback
  _dispatchTimer: null,   // auto-advance timer handle for the dispatch screen
  // ── Meta-progression / hero unlocks ──
  metaProgress: null,     // persisted { saveVersion, unlockedHeroes, career }
  unlockedHeroes: [],     // hero ids currently selectable
  unlocksEnabled: false,  // manifest.modes.heroUnlocks gate
  runMetrics: {},         // per-run accumulator, merged into career at run end
  _levelStartDeaths: 0,   // heroDeaths snapshot at level start (flawless tracking)
  lastParty: [],          // selectedHeroes indices of the last run (quick retry)
  lastRunReport: null,    // post-mortem data for the game-over / victory screens
  livingHeroes: [],
  loadedManifest: null,
  allHeroes: staticHeroes,
  getLevel: getStaticLevel,
  uiOptions: {
    showTimeline: true,
    showIntent: true,
    showReadability: true,
  },
};
