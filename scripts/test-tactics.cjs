// Tactical scenarios use copied clubs and isolated storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Match = require('../src/engine/match.js');
const Squad = require('../src/engine/squad.js');
const Tactics = require('../src/engine/tactics.js');
const Career = require('../src/engine/career.js');
const database = require('../data/teams.json');
const clone = value => JSON.parse(JSON.stringify(value));
function seeded(seed) { let n = seed; return () => { n = (Math.imul(1664525, n) + 1013904223) >>> 0; return n / 4294967296; }; }
function pair(instructions = {}) {
  return [255, 487].map(id => { const team = Squad.autoSelectStarters(clone(database.find(entry => entry.id === id))); team.tactics = Tactics.normalize(instructions); return team; });
}
function start(teams) { return Match.createMatch(...teams, { aiControlled: [false, false], prepareTeams: false, userSide: 0 }); }
function finish(state, teams, random) { while (!state.finished) Match.stepMatch(state, ...teams, random); }
let cases = 0;
function test(name, fn) { fn(); cases++; console.log('PASS: ' + name); }

test('eleven formations have eleven unique and correctly assigned places', () => {
  assert.equal(Match.FORMATIONS.length, 11);
  for (const formation of Match.FORMATIONS) {
    const team = pair()[0]; Squad.autoSelectStarters(team, formation);
    const slots = Squad.formationSlots(formation), assignments = Squad.assignPositions(Squad.starters(team), formation);
    assert.equal(slots.length, 11); assert.equal(Object.keys(assignments).length, 11);
    assert.equal(new Set(Object.values(assignments).map(slot => slot.index)).size, 11);
    for (const [role, count] of Object.entries(Squad.FORMATIONS[formation])) assert.equal(slots.filter(slot => slot.role === role).length, count);
    const power = Match.calculateTeamPower(team, false);
    assert.ok(['gk', 'defense', 'midfield', 'attack'].every(key => Number.isFinite(power[key]) && power[key] > 0));
  }
});

test('short and direct passing change actual circulation and completed passes', () => {
  const totals = {};
  for (const passing of ['short', 'direct']) {
    const teams = pair({ passing });
    for (const team of teams) for (const player of team.players) Object.assign(player, { strength: 50, energy: 100, morale: 100, cr1: '', cr2: '', sideEstimated: true });
    const state = start(teams);
    for (let i = 0; i < 30; i++) Match.stepMatch(state, ...teams, () => .8);
    totals[passing] = { passes: state.stats.passes.reduce((a, b) => a + b), completed: state.stats.completedPasses.reduce((a, b) => a + b) };
  }
  assert.ok(totals.short.passes > totals.direct.passes, JSON.stringify(totals));
  assert.ok(totals.short.completed / totals.short.passes > totals.direct.completed / totals.direct.passes, JSON.stringify(totals));
});

test('high pressure and a fast rhythm cost more energy than a low block', () => {
  const energy = {};
  for (const plan of ['highPress', 'protect']) {
    const teams = pair(Tactics.preset(plan).instructions), state = start(teams);
    for (let i = 0; i < 30; i++) Match.stepMatch(state, ...teams, () => .99);
    energy[plan] = Squad.starters(teams[0]).reduce((sum, player) => sum + player.energy, 0) / 11;
  }
  assert.ok(energy.highPress < energy.protect - 3, JSON.stringify(energy));
});

test('firm tackling produces more fouls and cards across seeded matches', () => {
  const totals = {};
  for (const tackling of ['careful', 'hard']) {
    totals[tackling] = { fouls: 0, cards: 0 };
    for (let index = 0; index < 12; index++) {
      const teams = pair({ tackling }), state = start(teams); finish(state, teams, seeded(200 + index));
      totals[tackling].fouls += state.stats.fouls[0] + state.stats.fouls[1];
      totals[tackling].cards += [...state.stats.yellowCards, ...state.stats.redCards].reduce((a, b) => a + b);
    }
  }
  assert.ok(totals.hard.fouls > totals.careful.fouls * 1.4, JSON.stringify(totals));
  assert.ok(totals.hard.cards > totals.careful.cards, JSON.stringify(totals));
});

test('attack focus changes who creates chances on the selected side', () => {
  const counts = {};
  for (const focus of ['left', 'right']) {
    const teams = pair({ focus }), state = start(teams); counts[focus] = { E: 0, C: 0, D: 0 };
    for (let index = 0; index < 100; index++) {
      const rolls = [.1, (index + .5) / 100, .5, .1, .999];
      const power = teams.map((team, side) => Match.powerFor(state, team, side));
      Match.simulateAttack(state, teams, power, 50, () => rolls.shift() ?? .999);
      const event = state.events.at(-1); assert.equal(event.type, 'DESARME');
      counts[focus][state.assignments[0][event.creatorId].side]++;
    }
  }
  assert.ok(counts.left.E > counts.left.D * 2, JSON.stringify(counts));
  assert.ok(counts.right.D > counts.right.E * 2, JSON.stringify(counts));
});

test('counterattacks have their own events and can exploit an advanced line', () => {
  const teams = pair(); teams[0].tactics = Tactics.preset('counter').instructions; teams[1].tactics.line = 'high';
  const state = start(teams), power = teams.map((team, side) => Match.powerFor(state, team, side));
  Match.simulateAttack(state, teams, power, 50, () => .1);
  assert.ok(state.events.some(event => event.type === 'CONTRA_ATAQUE' && event.teamIndex === 0));
  assert.ok(state.stats.shots[0] > 0);
});

test('chosen penalty, free-kick and corner takers are used, with a fallback off the field', () => {
  const teams = pair(), state = start(teams), starters = Squad.starters(teams[0]);
  const taker = starters.find(player => player.position === 'M');
  state.setPieces[0].penalty = taker.id;
  Match.takePenalty(state, teams, 0, () => 0);
  assert.equal(state.events.at(-1).playerId, taker.id);
  state.setPieces[0].freeKick = taker.id;
  let power = teams.map((team, side) => Match.powerFor(state, team, side));
  Match.takeShot(state, teams, power, 0, null, 'free-kick', () => 0, false);
  assert.equal(state.events.at(-1).playerId, taker.id);
  state.setPieces[0].corner = taker.id;
  const rolls = [0, .99, 0, 0, 0, 0, 0];
  Match.takeShot(state, teams, power, 0, null, 'pass', () => rolls.shift() ?? 0);
  assert.equal(state.events.at(-1).assistId, taker.id);
  assert.notEqual(state.events.at(-1).playerId, taker.id, 'A player cannot head his own corner');
  state.activeIds[0] = state.activeIds[0].filter(id => id !== taker.id);
  Match.takePenalty(state, teams, 0, () => 0);
  assert.notEqual(state.events.at(-1).playerId, taker.id);
});

test('instructions can change without changing formation, score, players or past events', () => {
  const teams = pair(), state = start(teams); for (let i = 0; i < 18; i++) Match.stepMatch(state, ...teams, seeded(i));
  const before = clone(state), plan = Tactics.preset('possession');
  assert.equal(Match.changeTactics(state, ...teams, 0, state.formations[0], state.styles[0], plan.instructions).success, true);
  assert.equal(state.minute, before.minute); assert.deepEqual(state.scores, before.scores); assert.deepEqual(state.activeIds, before.activeIds);
  assert.deepEqual(state.events.slice(0, -1), before.events); assert.equal(state.events.at(-1).type, 'TATICA');
  assert.equal(state.instructions[0].passing, 'short');
  const changed = clone(state); assert.equal(Match.changeTactics(state, ...teams, 0, state.formations[0], state.styles[0], { pressing: 'invalid' }).success, false); assert.deepEqual(state, changed);
  const copy = clone({ state, teams }), left = seeded(871), right = seeded(871);
  finish(state, teams, left); finish(copy.state, copy.teams, right); assert.deepEqual(copy, { state, teams });
  assert.equal(Match.changeTactics(state, ...teams, 0, '4-4-2', 'Equilibrado', Tactics.DEFAULTS).success, false);
});

test('an existing version-two match receives neutral settings without losing its progress', () => {
  const teams = pair(), state = start(teams); for (let i = 0; i < 12; i++) Match.stepMatch(state, ...teams, seeded(i + 9));
  delete state.instructions; delete state.setPieces;
  const before = clone({ scores: state.scores, events: state.events, minutes: state.minutesPlayed, active: state.activeIds });
  Match.ensureState(state, ...teams);
  assert.deepEqual(state.instructions[0], Tactics.DEFAULTS);
  assert.deepEqual({ scores: state.scores, events: state.events, minutes: state.minutesPlayed, active: state.activeIds }, before);
  const snapshot = clone(state); Match.ensureState(state, ...teams); assert.deepEqual(state, snapshot);
});

const nodes = new Map();
function node() {
  return { children: [], style: {}, dataset: {}, value: '', classList: { toggle() {} }, setAttribute() {}, addEventListener() {},
    set innerHTML(value) { this.children = []; this.html = value; }, appendChild(child) { this.children.push(child); } };
}
const store = new Map();
const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
  SaveStore: require('../src/engine/storage.js'),
  window: { addEventListener() {} }, console, SquadEngine: Squad, MatchEngine: Match, TacticsEngine: Tactics, CareerEngine: Career,
  document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }, createElement() { return node(); } },
  localStorage: { setItem(key, value) { store.set(key, value); } }
});
app.showToast = () => {};
test('every new formation draws eleven players in the tactical field', () => {
  for (const formation of Match.FORMATIONS) {
    const team = pair()[0]; Squad.autoSelectStarters(team, formation); app.gameState = { userTeam: team };
    app.renderTacticalPitch(); const players = nodes.get('tactical-pitch').children;
    assert.equal(players.length, 11);
    assert.ok(players.every(player => parseFloat(player.style.left) >= 0 && parseFloat(player.style.left) <= 100 && parseFloat(player.style.top) > 0 && parseFloat(player.style.top) < 100));
  }
});

test('pregame instructions and takers replace the state only after saving succeeds', () => {
  const team = pair()[0]; app.gameState = { userTeamId: team.id, userTeam: team, divisionTeams: [team] };
  app.renderTeamTactics = () => {}; app.updateTacticsPower = () => {};
  const plan = Tactics.preset('highPress');
  for (const [key, value] of Object.entries(plan.instructions)) { if (!nodes.has(`tactics-${key}`)) nodes.set(`tactics-${key}`, node()); nodes.get(`tactics-${key}`).value = value; }
  for (const key of Object.keys(Tactics.SET_PIECES)) { nodes.set(`tactics-taker-${key}`, node()); nodes.get(`tactics-taker-${key}`).value = team.players[9].id; }
  const original = app.gameState, persist = app.persistState; app.persistState = () => false;
  app.saveTeamInstructions(plan.style); assert.equal(app.gameState, original);
  app.persistState = persist; app.saveTeamInstructions(plan.style);
  assert.notEqual(app.gameState, original); assert.equal(app.gameState.userTeam.tacticStyle, 'Ofensivo');
  assert.equal(app.gameState.userTeam.tactics.pressing, 'high'); assert.equal(app.gameState.userTeam.setPieces.penalty, team.players[9].id);
  const saved = JSON.parse(store.get(app.SAVE_KEY)); assert.equal(saved.userTeam.tactics.tempo, 'fast');
});

console.log(`PASS: ${cases} tactical regression groups and 24 seeded tackling comparisons.`);
