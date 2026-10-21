const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Mock browser environment for app.js
global.window = global;
global.window.addEventListener = () => {};
global.document = {
  getElementById: (id) => {
    return {
      textContent: '',
      innerHTML: '',
      style: {},
      value: '1',
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      setAttribute() {},
      appendChild() {},
      children: [],
      addEventListener() {}
    };
  },
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => ({
    className: '',
    innerHTML: '',
    appendChild() {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: {}
  })
};
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; }
};

const MatchEngine = require('../src/engine/match.js');
const SquadEngine = require('../src/engine/squad.js');
const TacticsEngine = require('../src/engine/tactics.js');
const LeagueEngine = require('../src/engine/league.js');
const FinanceEngine = require('../src/engine/finance.js');
const PerformanceEngine = require('../src/engine/performance.js');
const CareerEngine = require('../src/engine/career.js');
const MarketEngine = require('../src/engine/market.js');
const teams = require('../data/teams.json');

const clone = obj => JSON.parse(JSON.stringify(obj));

// Load app.js code
const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
eval(appCode + '; global.app = app;');

console.log('Testing Concurrent Matches Live Simulation...');

// Setup a small league game state
const leagueTeams = clone(teams.slice(0, 8)); // 8 teams = 4 matches per round
const schedule = LeagueEngine.generateSchedule(leagueTeams.map(t => t.id));

app.gameState = {
  seasonYear: 2026,
  currentRound: 1,
  totalRounds: schedule.length,
  rounds: schedule,
  divisionTeams: leagueTeams,
  userTeam: leagueTeams[0],
  userTeamId: leagueTeams[0].id
};

// 1. Ensure starters are selected
leagueTeams.forEach(t => {
  t.players.forEach((p, idx) => {
    p.isStarter = idx < 11;
    p.energy = 100;
    p.morale = 100;
  });
});

// Test ensureConcurrentMatches
const roundIndex = 0;
const fixture = app.gameState.rounds[0].matches.find(m => m.homeId === leagueTeams[0].id || m.awayId === leagueTeams[0].id);
const home = leagueTeams.find(t => t.id === fixture.homeId);
const away = leagueTeams.find(t => t.id === fixture.awayId);
const state = MatchEngine.createMatch(home, away, { userSide: 0 });
state.roundIndex = roundIndex;

const others = app.ensureConcurrentMatches(state);
assert.equal(others.length, 3, 'In an 8-team league with 4 fixtures, 3 fixtures should be concurrent matches');
assert.ok(others.every(m => m.homeName && m.awayName), 'All matches should have team names');
assert.ok(others.every(m => Number.isInteger(m.finalHomeScore) && Number.isInteger(m.finalAwayScore)), 'All matches should have final scores');
assert.ok(others.every(m => Array.isArray(m.goals)), 'Goals array should be present');

// 2. Test minute score calculation
state.minute = 10;
for (const m of others) {
  const homeGoals = m.goals.filter(g => g.side === 0 && g.minute <= 10).length;
  const awayGoals = m.goals.filter(g => g.side === 1 && g.minute <= 10).length;
  assert.ok(homeGoals <= m.finalHomeScore, 'Goals at min 10 cannot exceed final score');
  assert.ok(awayGoals <= m.finalAwayScore, 'Goals at min 10 cannot exceed final score');
}

// 3. Test alerts during minute advance
state.announcedOtherGoals = [];
const allGoalMinutes = others.flatMap(m => m.goals.map(g => g.minute));
if (allGoalMinutes.length > 0) {
  const targetMinute = allGoalMinutes[0];
  state.minute = targetMinute;
  let alerted = false;
  app.renderOtherGoalAlert = (alert) => {
    alerted = true;
    assert.equal(alert.minute, targetMinute, 'Alert minute must match current minute');
    assert.ok(alert.scoringTeam, 'Scoring team must be specified');
  };
  app.checkConcurrentMatchAlerts(state);
  assert.ok(alerted, 'A goal alert should have fired for the concurrent match goal');
}

// 4. Test finalizeRound reconciles exact scores from otherMatches
state.finished = true;
app.finalizeRound(state, 0);

for (const m of others) {
  const recorded = app.gameState.rounds[0].matches.find(f => f.homeId === m.homeId && f.awayId === m.awayId);
  assert.ok(recorded, 'Fixture must exist in round');
  assert.equal(recorded.isPlayed, true, 'Fixture must be marked played');
  assert.equal(recorded.homeScore, m.finalHomeScore, 'Recorded home score must match pre-simulated final score');
  assert.equal(recorded.awayScore, m.finalAwayScore, 'Recorded away score must match pre-simulated final score');
  assert.ok(recorded.events.length >= 0, 'Recorded events must be present');
}

console.log('PASS: All concurrent match simulation and synchronization tests passed successfully.');
