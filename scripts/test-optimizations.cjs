// Isolated regression checks for persistence, caches, rendering and partial rounds.
// Never opens the application's real local storage or the player's save.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SaveStore = require('../src/engine/storage.js');
const Match = require('../src/engine/match.js');
const Squad = require('../src/engine/squad.js');
const Tactics = require('../src/engine/tactics.js');
const Market = require('../src/engine/market.js');
const Career = require('../src/engine/career.js');
const League = require('../src/engine/league.js');
const database = require('../data/teams.json');
const config = require('../data/leagues.json');
const clone = value => JSON.parse(JSON.stringify(value));
function seeded(n) { return () => { n = (Math.imul(1664525, n) + 1013904223) >>> 0; return n / 4294967296; }; }
const division = config.BRA.divisions[0];
const clubs = division.teams.map(id => Squad.autoSelectStarters(clone(database.find(team => team.id === id))));
const template = { userTeamId: clubs[0].id, userTeam: clubs[0], divisionTeams: clubs, divisionId: division.id,
  divisionName: division.name, seasonYear: 2026, currentRound: 1, totalRounds: 38, rounds: League.generateSchedule(division.teams) };
Career.ensureState(template, config, database);
function game(active = false, complete = false) {
  const state = clone(template); state.userTeam = state.divisionTeams.find(team => team.id === state.userTeamId);
  if (active) {
    const fixture = state.rounds[0].matches.find(match => [match.homeId, match.awayId].includes(state.userTeamId));
    const teams = [fixture.homeId, fixture.awayId].map(id => state.divisionTeams.find(team => team.id === id));
    state.activeMatch = Match.createMatch(...teams, { userSide: teams[0].id === state.userTeamId ? 0 : 1 });
    state.activeMatch.roundIndex = 0;
  }
  if (complete) {
    state.currentRound = 39;
    for (const round of state.rounds) {
      round.isFinished = true;
      for (const match of round.matches) Object.assign(match, { isPlayed: true, homeScore: 1, awayScore: 0 });
    }
  }
  return state;
}
function liveTeams(state) { return [state.activeMatch.homeId, state.activeMatch.awayId].map(id => state.divisionTeams.find(team => team.id === id)); }
class MemoryStorage {
  data = new Map(); writes = []; failKey = null; failCleanup = false;
  getItem(key) { return this.data.get(key) || null; }
  setItem(key, value) {
    if (key === this.failKey) throw new Error('Simulated storage failure');
    this.writes.push({ key, bytes: Buffer.byteLength(value) }); this.data.set(key, value);
  }
  removeItem(key) { if (this.failCleanup) throw new Error('Simulated cleanup failure'); this.data.delete(key); }
}
const key = 'isolated_brasfoot_save';
let cases = 0;
async function test(name, run) { await run(); cases++; console.log(`PASS: ${name}`); }

class Element {
  constructor(id = '') {
    this.id = id; this.children = []; this.dataset = {}; this.style = {}; this.className = ''; this.listeners = new Map();
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      toggle: (name, on) => { const names = new Set(this.className.split(' ').filter(Boolean)); on ? names.add(name) : names.delete(name); this.className = [...names].join(' '); }
    };
  }
  set textContent(value) { this.text = String(value); this.onText?.(this.text); }
  get textContent() { return this.text || ''; }
  set innerHTML(value) { this.html = value; this.htmlWrites = (this.htmlWrites || 0) + 1; this.replaceChildren(); }
  get innerHTML() { return this.html || ''; }
  setAttribute(key, value) { this[key] = value; }
  addEventListener(event, callback) { const list = this.listeners.get(event) || []; list.push(callback); this.listeners.set(event, list); }
  append(...nodes) { nodes.forEach(node => this.insertBefore(node, null)); }
  appendChild(node) { this.insertBefore(node, null); return node; }
  insertBefore(node, next) { node.remove(); const index = next ? this.children.indexOf(next) : this.children.length; this.children.splice(index, 0, node); node.parentElement = this; }
  remove() { if (this.parentElement) { const list = this.parentElement.children; list.splice(list.indexOf(this), 1); this.parentElement = null; } }
  replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this.append(...nodes); }
  focus() { document.activeElement = this; }
}
const nodes = new Map();
const document = { activeElement: null, documentElement: { style: { setProperty() {} } },
  getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element(id)); return nodes.get(id); },
  createElement() { return new Element(); }, querySelectorAll() { return []; }, querySelector() { return null; } };
const appStorage = new MemoryStorage();
const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
  EconomyEngine: require('../src/engine/economy.js'), ContractsEngine: require('../src/engine/contracts.js'),
  window: { addEventListener() {} }, document, console, setTimeout, clearTimeout, setInterval, clearInterval,
  SaveStore, MatchEngine: Match, SquadEngine: Squad, TacticsEngine: Tactics, MarketEngine: Market,
  CareerEngine: Career, LeagueEngine: League, PerformanceEngine: require('../src/engine/performance.js'),
  FinanceEngine: require('../src/engine/finance.js'), localStorage: appStorage
});
app.showToast = () => {}; app.allTeams = database; app.leaguesConfig = config;

async function main() {
  await test('legacy saves load unchanged and checkpoint data never leaks into the career', () => {
    const memory = new MemoryStorage(), store = new SaveStore(memory, key), state = game();
    memory.setItem(key, JSON.stringify(state)); assert.deepEqual(store.load(), state);
    store.save(state); assert.ok(!Object.hasOwn(state, '_saveRevision'));
    assert.deepEqual(store.load(), state); assert.ok(!Object.hasOwn(store.load(), '_saveRevision'));
  });
  await test('live recovery preserves tactics, substitutions, events, all player changes and seeded results', () => {
    const memory = new MemoryStorage(), store = new SaveStore(memory, key), state = game(true);
    store.save(state); const random = seeded(2026), teams = liveTeams(state), match = state.activeMatch;
    for (let minute = 0; minute < 27; minute++) Match.stepMatch(match, ...teams, random);
    Match.changeTactics(match, ...teams, match.userSide, '4-3-3', 'Ofensivo', Tactics.preset('highPress').instructions);
    const team = teams[match.userSide];
    assert.ok(Match.substitute(match, ...teams, match.userSide, match.activeIds[match.userSide][1], match.benchIds[match.userSide][0]).success);
    match.paused = true; store.checkpoint(state);
    const restored = new SaveStore(memory, key).load(); assert.deepEqual(restored, state);
    assert.equal(restored.userTeam, restored.divisionTeams.find(team => team.id === restored.userTeamId));
    for (const entry of [state, restored]) {
      const rng = seeded(87); while (!entry.activeMatch.finished) Match.stepMatch(entry.activeMatch, ...liveTeams(entry), rng);
    }
    assert.deepEqual(restored, state);
    store.checkpoint(state); assert.equal(memory.getItem(store.checkpointKey), null);
    assert.deepEqual(new SaveStore(memory, key).load(), state);
    assert.ok(team.players.some(player => player.lastMatchMinutes > 0));
  });
  await test('a failed journal write preserves the previous minute; failed full writes preserve recovery', () => {
    const memory = new MemoryStorage(), store = new SaveStore(memory, key), state = game(true);
    store.save(state); Match.stepMatch(state.activeMatch, ...liveTeams(state), seeded(3)); store.checkpoint(state);
    const before = clone(state); Match.stepMatch(state.activeMatch, ...liveTeams(state), seeded(4));
    memory.failKey = store.checkpointKey; assert.throws(() => store.checkpoint(state));
    assert.deepEqual(new SaveStore(memory, key).load(), before);
    memory.failKey = key; assert.throws(() => store.save(game()));
    assert.deepEqual(new SaveStore(memory, key).load(), before);
  });
  await test('a stale journal cannot overwrite a new career even when cleanup fails', () => {
    const memory = new MemoryStorage(), store = new SaveStore(memory, key), state = game(true);
    store.save(state); Match.stepMatch(state.activeMatch, ...liveTeams(state), seeded(5)); store.checkpoint(state);
    const next = game(); next.seasonYear++;
    memory.failCleanup = true; store.save(next);
    assert.ok(memory.getItem(store.checkpointKey)); assert.deepEqual(new SaveStore(memory, key).load(), next);
    memory.setItem(store.checkpointKey, JSON.stringify({ version: 99 }));
    assert.deepEqual(new SaveStore(memory, key).load(), next);
  });
  await test('malformed checkpoint data falls back to the committed career', () => {
    const memory = new MemoryStorage(), store = new SaveStore(memory, key), state = game(true);
    store.save(state); memory.setItem(store.checkpointKey, '{broken json');
    const warn = console.warn; console.warn = () => {};
    try { assert.deepEqual(store.load(), state); } finally { console.warn = warn; }
  });
  await test('live saves write only a small checkpoint and an automatic interval writes once', () => {
    app.gameState = game(true); app.currentSimMatch = app.gameState.activeMatch; app.matchPaused = false;
    app.persistState(); const full = appStorage.writes.at(-1).bytes;
    const saved = new Map(['appendPendingMatchEvents', 'updateLiveMatchUI', 'updateLiveMatchControls', 'renderLiveCoach'].map(name => [name, app[name]]));
    for (const name of saved.keys()) app[name] = () => {};
    try {
      app.currentSimMatch.minute = 44;
      const writes = appStorage.writes.length; app.advanceLiveMinute();
      assert.equal(appStorage.writes.length, writes + 1); assert.equal(app.currentSimMatch.minute, 45); assert.equal(app.matchPaused, true);
      assert.equal(appStorage.writes.at(-1).key, app.getSaveStore().checkpointKey);
      assert.ok(appStorage.writes.at(-1).bytes < full / 5);
    } finally { for (const [name, method] of saved) app[name] = method; }
  });
  await test('caches react to edited traits, tactics, fatigue and replacement rosters', () => {
    const player = clone(clubs[0].players[0]); player.cr1 = 'Técnica';
    const original = Match.traits(player); player.cr1 = 'Reflexo';
    assert.notDeepEqual(Match.traits(player), original);
    const strength = Match.attribute(player, 'saving'); player.energy = 10;
    assert.ok(Match.attribute(player, 'saving') < strength);
    const instructions = Tactics.normalize(); const normal = Tactics.effects(instructions);
    instructions.pressing = 'high'; assert.ok(Tactics.effects(instructions).energy > normal.energy);
    assert.deepEqual(Tactics.effects(instructions), Tactics.effects({ ...instructions }));
    const state = game(true), teams = liveTeams(state); Match.playersFor(state.activeMatch, teams[0], 0);
    teams[0].players = clone(teams[0].players);
    assert.equal(Match.playersFor(state.activeMatch, teams[0], 0)[0], teams[0].players.find(player => player.id === state.activeMatch.activeIds[0][0]));
  });
  await test('a failed live write pauses the game and a successful retry clears the failure', () => {
    app.gameState = game(true); app.currentSimMatch = app.gameState.activeMatch; app.matchPaused = false; app.persistState();
    Match.stepMatch(app.currentSimMatch, ...liveTeams(app.gameState), seeded(9));
    appStorage.failKey = app.getSaveStore().checkpointKey;
    const error = console.error; console.error = () => {};
    try {
      assert.equal(app.persistMatchProgress(), false); assert.equal(app.matchPaused, true); assert.equal(app.saveFailed, true);
      appStorage.failKey = null; assert.equal(app.persistMatchProgress(), true); assert.equal(app.saveFailed, false);
      assert.deepEqual(new SaveStore(appStorage, app.SAVE_KEY).load(), clone(app.gameState));
    } finally { console.error = error; appStorage.failKey = null; }
  });
  await test('market results keep the same filters and stable ordering including equal strengths', () => {
    function reference(teams, filters, userTeamId) {
      const results = [], name = (filters.name || '').toLowerCase().trim(), position = (filters.position || '').toUpperCase();
      for (const team of teams) for (const player of team.players) {
        if (userTeamId && team.id === userTeamId && !filters.includeOwn) continue;
        if (name && !player.name.toLowerCase().includes(name)) continue;
        if (position && position !== 'TODOS' && player.position !== position) continue;
        if (player.strength < (parseInt(filters.minStrength, 10) || 0) || player.strength > (parseInt(filters.maxStrength, 10) || 100)) continue;
        if (player.value > (parseInt(filters.maxPrice, 10) || Infinity)) continue;
        results.push({ ...player, teamId: team.id, teamName: team.name, teamShield: team.shield });
      }
      return results.sort((a, b) => b.strength - a.strength).slice(0, 100);
    }
    for (const filters of [{}, { name: ' Silva ' }, { position: 'G' }, { minStrength: 40, maxStrength: 63, maxPrice: 3000000 },
      { minStrength: 50, maxStrength: 50 }, { includeOwn: true }, { name: 'nome inexistente' }]) {
      assert.deepEqual(Market.searchPlayers(database, filters, clubs[0].id), reference(database, filters, clubs[0].id));
    }
    const legacy = [{ id: 1, players: [9, 50, 60, 50].map((strength, index) => ({ id: index, name: 'Legacy', strength: String(strength) })) }];
    assert.deepEqual(Market.searchPlayers(legacy), reference(legacy, {}, null));
    app.gameState = game(); const directory = app.currentTeams(); assert.equal(app.currentTeams(), directory);
    app.gameState = game(); assert.notEqual(app.currentTeams(), directory);
  });
  await test('refreshing renders the open tab; closed tabs and standings subviews update on demand', () => {
    const methods = ['renderClubSidebar', 'renderPlayerProfile', 'renderSeasonControls', 'renderManagerIndicators', 'renderMarketIndicators',
      'renderSquad', 'renderTacticalPitch', 'renderTeamTactics', 'updateTacticsPower', 'renderStandings', 'renderTopScorers',
      'renderRoundFixtures', 'renderSeasonHistory', 'renderStadiumTab', 'updateFinanceSummary', 'renderManagerProfile', 'renderMarket', 'renderPerformance', 'renderClubBrowser'];
    const calls = [], saved = new Map(methods.map(name => [name, app[name]]));
    for (const name of methods) app[name] = () => calls.push(name);
    try {
      app.gameState = game(); app.currentView = 'market-tab'; app.refreshUI();
      assert.ok(calls.includes('renderMarket')); assert.ok(!calls.includes('renderManagerProfile')); assert.ok(!calls.includes('renderSeasonHistory'));
      const count = calls.length; app.renderCurrentView(); assert.equal(calls.length, count);
      app.currentView = 'manager-profile-tab'; app.renderCurrentView(); assert.equal(calls.at(-1), 'renderManagerProfile');
      app.currentView = 'standings-tab'; app.standingsView = 'history-view'; app.renderCurrentView(); assert.equal(calls.at(-1), 'renderSeasonHistory');
      app.standingsView = 'scorers-view'; app.renderCurrentView(); assert.equal(calls.at(-1), 'renderTopScorers');
      app.persistState(); app.renderCurrentView(); assert.equal(calls.at(-1), 'renderTopScorers');
    } finally { for (const [name, method] of saved) app[name] = method; }
  });
  await test('live rows preserve their buttons, focus and listeners while energy and substitutions update', () => {
    app.gameState = game(true); app.currentSimMatch = app.gameState.activeMatch; app.matchSelection = { outId: null, inId: null }; app.matchTacticsDirty = true;
    app.renderLiveCoach(); const list = document.getElementById('match-on-field'), first = list.children[1]; first.focus();
    const team = app.gameState.userTeam, player = team.players.find(player => String(player.id) === first.dataset.playerId);
    const before = first._liveFields.name.htmlWrites; player.energy = 55; app.renderLiveCoach();
    assert.equal(list.children[1], first); assert.equal(document.activeElement, first);
    assert.equal(first._liveFields.energy.textContent, '55%'); assert.equal(first.listeners.get('click').length, 1);
    assert.equal(first._liveFields.name.htmlWrites, before);
    const match = app.currentSimMatch, side = match.userSide;
    const outgoing = match.activeIds[side][1], incoming = match.benchIds[side][0];
    assert.ok(Match.substitute(match, ...liveTeams(app.gameState), side, outgoing, incoming).success); app.renderLiveCoach();
    assert.ok(!list.children.some(button => button.dataset.playerId === String(outgoing)));
    assert.ok(list.children.some(button => button.dataset.playerId === String(incoming)));
    assert.ok(document.getElementById('match-reserves').children.find(button => button.dataset.playerId === String(outgoing)).disabled);
  });
  await test('partial background rounds survive a reload and match whole-round results and recovery exactly', () => {
    const reference = game(false, true); let state = clone(reference);
    const left = seeded(41), right = seeded(41);
    Career.simulateBackgroundRound(reference, left); Career.simulateBackgroundRound(reference, left);
    for (let index = 0; index < 7; index++) Career.simulateBackgroundStep(state, right);
    assert.equal(Career.preparationProgress(state).done, 0); assert.equal(Career.preparationProgress(state).matchesDone, 7);
    const memory = new MemoryStorage(), store = new SaveStore(memory, key); store.save(state); state = store.load();
    for (let index = 7; index < 20; index++) Career.simulateBackgroundStep(state, right);
    assert.deepEqual(state, reference); assert.equal(Career.preparationProgress(state).done, 2);
    const division = state.careerDivisions[1], calendar = Career.backgroundCalendar(division);
    assert.equal(Career.backgroundCalendar(division), calendar);
    [division.teams[0], division.teams[1]] = [division.teams[1], division.teams[0]];
    assert.deepEqual(Career.backgroundCalendar(division).schedule, League.generateSchedule(division.teams));
    assert.notEqual(Career.backgroundCalendar(division), calendar);
  });
  await test('closing and reopening season preparation saves each partial round without replaying fixtures', async () => {
    app.gameState = game(false, true); const status = document.getElementById('season-status');
    status.onText = text => { if (text.includes('%')) app.cancelSeasonPreparation(); };
    try {
      await app.openSeasonEnd(); assert.equal(Career.preparationProgress(app.gameState).matchesDone, 1);
      await app.openSeasonEnd(); assert.equal(Career.preparationProgress(app.gameState).matchesDone, 2);
      assert.equal(app.seasonJob, null);
      const restored = new SaveStore(appStorage, app.SAVE_KEY).load(); assert.deepEqual(restored, clone(app.gameState));
      const results = Object.values(restored.backgroundSeasons).flatMap(division => division.results);
      assert.equal(new Set(results.map(result => result.slice(0, 3).join(':'))).size, 2);
    } finally { status.onText = null; }
  });
  console.log(`PASS: ${cases} optimization regression groups.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
