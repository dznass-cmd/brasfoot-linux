// Reproducible Node-only measurements; all teams and storage are isolated.
// Usage: node scripts/benchmark-optimizations.cjs --baseline '.backups/before-optimizations-YYYYMMDD-HHMMSS'
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const baselineArg = process.argv.indexOf('--baseline');
const baseline = baselineArg >= 0 ? path.resolve(process.argv[baselineArg + 1]) : null;
const Match = require('../src/engine/match.js');
const Market = require('../src/engine/market.js');
const Career = require('../src/engine/career.js');
const Squad = require('../src/engine/squad.js');
const League = require('../src/engine/league.js');
const SaveStore = require('../src/engine/storage.js');
const database = require('../data/teams.json');
const config = require('../data/leagues.json');
const clone = value => JSON.parse(JSON.stringify(value));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rounded = value => +value.toFixed(3);
function seeded(n) { return () => { n = (Math.imul(1664525, n) + 1013904223) >>> 0; return n / 4294967296; }; }
function measure(run, count = 25, precision = 3) {
  for (let i = 0; i < 3; i++) run();
  const times = [];
  for (let i = 0; i < count; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  return +median(times).toFixed(precision);
}
function loadApp(folder, state) {
  const app = vm.runInNewContext(fs.readFileSync(path.join(folder, 'app.js'), 'utf8') + '\napp;', {
    window: { addEventListener() {} }, console, MarketEngine: Market
  });
  app.allTeams = database; app.gameState = state;
  return app;
}
const ids = config.BRA.divisions.flatMap(division => division.teams);
const clubs = ids.map(id => database.find(team => team.id === id));
const division = config.BRA.divisions[0];
const teams = division.teams.map(id => Squad.autoSelectStarters(clone(database.find(team => team.id === id))));
const state = { userTeamId: teams[0].id, userTeam: teams[0], divisionTeams: teams, divisionId: division.id,
  divisionName: division.name, seasonYear: 2026, currentRound: 1, totalRounds: 38, rounds: League.generateSchedule(division.teams) };
Career.ensureState(state, config, database);
state.activeMatch = Match.createMatch(teams[0], teams[1], { userSide: 0 }); state.activeMatch.roundIndex = 0;
for (let i = 0; i < 27; i++) Match.stepMatch(state.activeMatch, teams[0], teams[1], seeded(i + 90));

const versions = [{ name: 'after', Engine: Match, Market, folder: root }];
if (baseline) versions.unshift({ name: 'before', Engine: require(path.join(baseline, 'src/engine/match.js')),
  Market: require(path.join(baseline, 'src/engine/market.js')), folder: baseline });
const timings = Object.fromEntries(versions.map(version => [version.name, []]));
for (const version of versions) for (let i = 0; i < 6; i++) version.Engine.simulateMatch(clone(clubs[i]), clone(clubs[i + 7]), { random: seeded(i) });
for (let i = 0; i < 120; i++) {
  const outputs = [];
  for (const version of (i % 2 ? [...versions].reverse() : versions)) {
    const pair = [clone(clubs[i % 80]), clone(clubs[(i + 7) % 80])];
    const start = performance.now();
    const result = version.Engine.simulateMatch(...pair, { random: seeded(i + 2026), isCup: i % 3 === 0, isNeutral: i % 2 === 0 });
    timings[version.name].push(performance.now() - start);
    outputs.push(JSON.stringify({ teams: pair, result }));
  }
  if (outputs.length === 2) assert.equal(outputs[0], outputs[1], `Simulation changed at seed ${i + 2026}`);
}
const report = { generatedAt: new Date().toISOString(), environment: { node: process.version,
  scope: 'Node/V8, isolated teams and in-memory storage; no profiler, rendering or browser I/O',
  baseline: baseline ? path.relative(root, baseline) : null },
  engine: { matchesPerVersion: 120, identicalSeededMatches: baseline ? 120 : null, versions: {} }, market: {}, directory: {} };
for (const version of versions) {
  report.engine.versions[version.name] = { medianMatchMs: rounded(median(timings[version.name])),
    totalMs: rounded(timings[version.name].reduce((sum, time) => sum + time, 0)) };
  report.market[version.name] = { medianBroadSearchMs: measure(() => version.Market.searchPlayers(database, {}, state.userTeamId)) };
  const app = loadApp(version.folder, state);
  report.directory[version.name] = { medianRepeatedLookupMs: measure(() => app.currentTeams(), 25, 6) };
}
if (baseline) {
  const oldCareer = require(path.join(baseline, 'src/engine/career.js'));
  const completed = clone(state); delete completed.activeMatch; completed.currentRound = 39;
  for (const round of completed.rounds) {
    round.isFinished = true;
    for (const fixture of round.matches) Object.assign(fixture, { isPlayed: true, homeScore: 1, awayScore: 0 });
  }
  const expected = clone(completed), actual = clone(completed), left = seeded(41), right = seeded(41);
  for (let round = 0; round < 2; round++) oldCareer.simulateBackgroundRound(expected, left);
  for (let match = 0; match < 20; match++) Career.simulateBackgroundStep(actual, right);
  assert.deepEqual(actual, expected);
  report.career = { identicalBackgroundFixtures: 20, compared: 'original whole rounds vs optimized single-fixture steps' };
}
const storage = new Map(), store = new SaveStore({ getItem: key => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, 'isolated_benchmark');
report.save = { medianFullSaveMs: measure(() => store.save(state)), fullBytes: Buffer.byteLength(storage.get(store.key)),
  medianCheckpointMs: measure(() => store.checkpoint(state)), checkpointBytes: Buffer.byteLength(storage.get(store.checkpointKey)) };
assert.deepEqual(store.load(), state);
report.save.payloadReductionPercent = rounded((1 - report.save.checkpointBytes / report.save.fullBytes) * 100);
if (baseline) report.engine.elapsedReductionPercent = rounded((1 - report.engine.versions.after.totalMs / report.engine.versions.before.totalMs) * 100);
fs.writeFileSync(path.join(root, 'docs/optimization-benchmark-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
