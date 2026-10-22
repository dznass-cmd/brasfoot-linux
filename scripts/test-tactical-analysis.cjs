// Real engine scenarios with copied clubs; no access to the player's saves.
const assert = require('node:assert/strict');
const Match = require('../src/engine/match.js');
const Analysis = Match.Analysis;
const Squad = require('../src/engine/squad.js');
const Tactics = require('../src/engine/tactics.js');
const database = require('../data/teams.json');
const clone = value => JSON.parse(JSON.stringify(value));
const pair = () => [255, 487].map(id => Squad.autoSelectStarters(clone(database.find(team => team.id === id))));
const start = teams => Match.createMatch(...teams, { userSide: 0, aiControlled: [false, false], prepareTeams: false });
const advance = (state, teams, minutes, random = () => .8) => {
  for (let i = 0; i < minutes; i++) Match.stepMatch(state, ...teams, random);
};
function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
let groups = 0;
function test(name, run) { run(); groups++; console.log('PASS: ' + name); }

test('observation does not change random draws, events, score or player development', () => {
  const teams = pair(), baselineTeams = clone(teams), state = start(teams);
  const baseline = Match.createMatch(...baselineTeams, { aiControlled: [false, false], prepareTeams: false });
  const observedRandom = seeded(2026), baselineRandom = seeded(2026);
  let draws = 0, baselineDraws = 0;
  while (!state.finished) Match.stepMatch(state, ...teams, () => { draws++; return observedRandom(); });
  while (!baseline.finished) Match.stepMatch(baseline, ...baselineTeams, () => { baselineDraws++; return baselineRandom(); });
  assert.equal(draws, baselineDraws);
  const { tacticalAnalysis, userSide, ...observed } = state;
  assert.deepEqual(observed, baseline); assert.deepEqual(teams, baselineTeams);
  assert.equal(tacticalAnalysis.samples.length, state.minute + 1);
  assert.ok(!baseline.tacticalAnalysis, 'Automatic fixtures must not grow the career with chart samples');
  const finished = JSON.stringify(state);
  Match.stepMatch(state, ...teams); Match.finishMatch(state, ...teams);
  assert.equal(JSON.stringify(state), finished);
});

test('recent windows use real cumulative deltas; no shots, xG or passes are invented', () => {
  const teams = pair(), state = start(teams); advance(state, teams, 12);
  const samples = state.tacticalAnalysis.samples;
  assert.deepEqual(Analysis.series(state, 'possession')[0].values, [null, null]);
  for (const metric of Object.keys(Analysis.METRICS)) {
    const values = Analysis.series(state, metric).at(-1).values;
    for (const value of values) assert.ok(value === null || Number.isFinite(value));
  }
  const last = samples.at(-1), earlier = samples.at(-6);
  assert.deepEqual(Analysis.series(state, 'shots').at(-1).values, last.shots.map((count, side) => count - earlier.shots[side]));
  assert.deepEqual(Analysis.series(state, 'xG').at(-1).values, last.xG.map((count, side) => count - earlier.xG[side]));
  assert.equal(Analysis.series(state, 'possession').at(-1).values.reduce((a, b) => a + b), 100);
  for (const side of [0, 1]) {
    const passes = last.passes[side] - earlier.passes[side];
    assert.equal(Analysis.series(state, 'accuracy').at(-1).values[side], passes ? (last.completedPasses[side] - earlier.completedPasses[side]) / passes * 100 : null);
  }
  assert.deepEqual(Analysis.between(last, { ...last, minute: 13 }, 'accuracy'), [null, null]);
});

test('a possession plan changes the plotted observations and comparisons use equal periods', () => {
  const teams = pair(), state = start(teams); advance(state, teams, 10);
  const originalPossession = Analysis.series(state, 'possession').at(-1).values[0];
  const plan = Tactics.preset('possession');
  assert.ok(Match.changeTactics(state, ...teams, 0, state.formations[0], plan.style, plan.instructions).success);
  assert.equal(state.tacticalAnalysis.changes.length, 1);
  assert.equal(Analysis.comparison(state).minutes, 0);
  advance(state, teams, 2);
  let comparison = Analysis.comparison(state);
  assert.equal(comparison.minutes, 2); assert.deepEqual(comparison.beforeRange, [8, 10]); assert.deepEqual(comparison.afterRange, [10, 12]);
  advance(state, teams, 6);
  comparison = Analysis.comparison(state);
  assert.equal(comparison.minutes, 5); assert.deepEqual(comparison.afterRange, [10, 15]);
  assert.ok(comparison.metrics.possession.after[0] > comparison.metrics.possession.before[0]);
  assert.ok(Analysis.series(state, 'possession').at(-1).values[0] > originalPossession);
  Match.changeTactics(state, ...teams, 0, state.formations[0], plan.style, plan.instructions);
  assert.equal(state.tacticalAnalysis.changes.length, 1, 'Reapplying the same settings is not a new change');
});

test('opponent changes cut off the selected observation period and keep their own markers', () => {
  const teams = pair(), state = start(teams); advance(state, teams, 10);
  Match.changeTactics(state, ...teams, 0, '4-3-3', 'Ofensivo'); advance(state, teams, 2);
  Match.changeTactics(state, ...teams, 1, '5-4-1', 'Defensivo'); advance(state, teams, 5);
  assert.deepEqual(state.tacticalAnalysis.changes.map(change => [change.minute, change.side]), [[10, 0], [12, 1]]);
  assert.equal(Analysis.comparison(state).minutes, 2);
  assert.deepEqual(Analysis.comparison(state).afterRange, [10, 12]);
  assert.equal(Analysis.comparison(state, '1').change.side, 1);
  assert.equal(Analysis.comparison(state, '1').minutes, 2, 'The prior setup only lasted two minutes');
  const before = clone(state.tacticalAnalysis);
  state.instructions[0].tempo = 'fast';
  assert.deepEqual(state.tacticalAnalysis, before, 'Historical instructions must be independent copies');
});

test('existing matches begin at the restored minute, without reconstructing a false past', () => {
  const teams = pair(), state = start(teams); advance(state, teams, 27);
  delete state.tacticalAnalysis;
  const existing = clone(state);
  Match.ensureState(state, ...teams);
  assert.equal(state.tacticalAnalysis.startedAt, 27); assert.equal(state.tacticalAnalysis.samples.length, 1);
  const { tacticalAnalysis, ...rest } = state; assert.deepEqual(rest, existing);
  assert.deepEqual(Analysis.series(state, 'possession'), [{ minute: 27, values: [null, null] }]);
  advance(state, teams, 1);
  assert.deepEqual(state.tacticalAnalysis.samples.map(sample => sample.minute), [27, 28]);
  Match.changeTactics(state, ...teams, 0, '4-3-3', 'Ofensivo');
  advance(state, teams, 1); assert.equal(Analysis.comparison(state).minutes, 1);
});

test('saved observations, tactical markers and subsequent seeded observations survive JSON recovery', () => {
  const teams = pair(), state = start(teams); advance(state, teams, 20);
  Match.changeTactics(state, ...teams, 0, '4-3-3', 'Ofensivo'); advance(state, teams, 3);
  const recovered = clone({ teams, state });
  assert.deepEqual(Analysis.comparison(recovered.state), Analysis.comparison(state));
  for (const [s, clubs] of [[state, teams], [recovered.state, recovered.teams]]) {
    const random = seeded(70); while (!s.finished) Match.stepMatch(s, ...clubs, random);
  }
  assert.deepEqual(recovered, { teams, state });
  assert.ok(state.tacticalAnalysis.samples.length <= 91);
});

test('visitor coaching, kickoff changes and an abandoned match have valid histories', () => {
  const teams = pair(), state = Match.createMatch(...teams, { userSide: 1, aiControlled: [false, false] });
  Match.changeTactics(state, ...teams, 1, '4-3-3', 'Ofensivo'); advance(state, teams, 1);
  assert.equal(Analysis.comparison(state).change.side, 1); assert.equal(Analysis.comparison(state).minutes, 0);
  state.activeIds[0].splice(6);
  Match.stepMatch(state, ...teams);
  assert.ok(state.abandoned); assert.equal(state.tacticalAnalysis.samples.at(-1).minute, state.minute);
});

test('changes replaced at the same minute do not promise a future comparison', () => {
  const teams = pair(), state = start(teams); advance(state, teams, 10);
  Match.changeTactics(state, ...teams, 0, '4-3-3', 'Ofensivo');
  Match.changeTactics(state, ...teams, 1, '5-4-1', 'Defensivo'); advance(state, teams, 3);
  assert.equal(Analysis.comparison(state).minutes, 0); assert.equal(Analysis.comparison(state).pendingReason, 'replaced');
  assert.equal(Analysis.comparison(state, '1').pendingReason, 'no-before');
});

console.log(`PASS: ${groups} tactical analysis regression groups.`);
