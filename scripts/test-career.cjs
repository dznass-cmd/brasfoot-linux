// Season continuity: isolated fixtures only; never reads or writes the player's storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Career = require('../src/engine/career.js');
const League = require('../src/engine/league.js');
const Squad = require('../src/engine/squad.js');
const Match = require('../src/engine/match.js');
const Finance = require('../src/engine/finance.js');
const database = require('../data/teams.json');
const config = require('../data/leagues.json');
const clone = value => JSON.parse(JSON.stringify(value));
function seeded(seed) { let n = seed; return () => { n = (Math.imul(1664525, n) + 1013904223) >>> 0; return n / 4294967296; }; }
function game(divisionIndex = 0) {
  const division = config.BRA.divisions[divisionIndex];
  const teams = division.teams.map(id => Squad.autoSelectStarters(clone(database.find(t => t.id === id))));
  return { userTeam: teams[0], userTeamId: teams[0].id, divisionTeams: teams, rounds: League.generateSchedule(division.teams),
    divisionId: division.id, divisionName: division.name, seasonYear: 2026, currentRound: 1, totalRounds: 38 };
}
function results(ids, leader = null, last = null) {
  const ranked = [...ids];
  if (leader !== null) { ranked.splice(ranked.indexOf(leader), 1); ranked.unshift(leader); }
  if (last !== null) { ranked.splice(ranked.indexOf(last), 1); ranked.push(last); }
  const rounds = League.generateSchedule(ids);
  for (const round of rounds) {
    round.isFinished = true;
    for (const match of round.matches) {
      const homeWins = ranked.indexOf(match.homeId) < ranked.indexOf(match.awayId);
      match.homeScore = homeWins ? 2 : 0; match.awayScore = homeWins ? 0 : 2; match.isPlayed = true;
    }
  }
  return rounds;
}
function completed(divisionIndex = 0, userBottom = false) {
  const state = game(divisionIndex);
  state.rounds = results(state.divisionTeams.map(t => t.id), userBottom ? null : state.userTeamId, userBottom ? state.userTeamId : null);
  state.currentRound = 39;
  Career.ensureState(state, config, database);
  for (const division of state.careerDivisions.filter(d => d.id !== state.divisionId)) {
    const clubs = Career.teams(state).filter(t => division.teams.includes(t.id));
    const rounds = results(division.teams), progress = state.backgroundSeasons[division.id];
    progress.completedRounds = rounds.length; progress.table = League.calculateStandings(clubs, rounds);
    progress.results = rounds.flatMap((round, index) => round.matches.map(m => [index + 1, m.homeId, m.awayId, m.homeScore, m.awayScore]));
  }
  state.seasonSummary = Career.buildSummary(state);
  return state;
}
function assertWorld(state) {
  const allIds = state.careerDivisions.flatMap(d => d.teams);
  assert.equal(allIds.length, 80); assert.equal(new Set(allIds).size, 80);
  assert.ok(state.careerDivisions.every(d => d.teams.length === 20));
  assert.equal(Career.teams(state).length, 80);
  assert.equal(state.divisionTeams.length, 20); assert.equal(state.reserveTeams.length, 60);
  assert.ok(state.divisionTeams.includes(state.userTeam));
}
let cases = 0;
function test(name, fn) { fn(); cases++; console.log('PASS: ' + name); }

test('legacy live save migration preserves matches, team, balance and active match', () => {
  const state = game(); state.activeMatch = Match.createMatch(state.divisionTeams[0], state.divisionTeams[1], { userSide: 0 });
  Match.stepMatch(state.activeMatch, state.divisionTeams[0], state.divisionTeams[1], seeded(3));
  const before = clone({ teams: state.divisionTeams, rounds: state.rounds, active: state.activeMatch, user: state.userTeam });
  Career.ensureState(state, config, database); assertWorld(state);
  assert.deepEqual({ teams: state.divisionTeams, rounds: state.rounds, active: state.activeMatch, user: state.userTeam }, before);
  const renamed = state.reserveTeams[0]; renamed.name += ' Editado';
  const otherDivision = state.careerDivisions.find(d => d.teams.includes(renamed.id));
  assert.equal(Career.standingsFor(state, otherDivision.id).find(row => row.id === renamed.id).name, renamed.name);
  const migrated = clone(state); Career.ensureState(state, config, database); assert.deepEqual(state, migrated);
});

test('transferred players do not reappear at their original reserve club on migration', () => {
  const state = game();
  const source = database.find(t => t.id === config.BRA.divisions[1].teams[0]);
  const player = source.players.find(p => !state.divisionTeams.some(t => t.players.some(other => other.id === p.id)));
  state.userTeam.players.push(clone(player));
  Career.ensureState(state, config, database);
  assert.equal(Career.teams(state).flatMap(t => t.players).filter(p => p.id === player.id).length, 1);
  assert.ok(source.players.some(p => p.id === player.id), 'The original database must remain unchanged');
});

test('round counter alone cannot end an incomplete season or a live match', () => {
  const state = game(); state.currentRound = 39; Career.ensureState(state, config, database);
  assert.equal(Career.isSeasonComplete(state), false);
  assert.throws(() => Career.simulateBackgroundRound(state), /Conclua/);
  const complete = completed(); complete.activeMatch = { finished: false };
  assert.equal(Career.isSeasonComplete(complete), false);
  assert.throws(() => Career.startNextSeason(complete), /terminou/);
});

test('background simulation resumes deterministically from a saved round', () => {
  const state = game(); state.rounds = results(state.divisionTeams.map(t => t.id)); state.currentRound = 39;
  Career.ensureState(state, config, database);
  Career.simulateBackgroundRound(state, seeded(41));
  assert.equal(Career.preparationProgress(state).done, 1);
  const copy = clone(state);
  Career.simulateBackgroundRound(state, seeded(52)); Career.simulateBackgroundRound(copy, seeded(52));
  assert.deepEqual(copy, state);
  assert.equal(Object.values(state.backgroundSeasons).reduce((n, d) => n + d.results.length, 0), 20);
  assert.throws(() => Career.buildSummary(state), /Aguarde/);
});

test('access and relegation are simultaneous, preserve 80 clubs and work from A to D', () => {
  for (let index = 0; index < 4; index++) for (const bottom of [false, true]) {
    const state = completed(index, bottom), old = clone(state), summary = state.seasonSummary;
    const expected = config.BRA.divisions[bottom ? Math.min(3, index + 1) : Math.max(0, index - 1)].id;
    const next = Career.startNextSeason(state, seeded(99));
    assertWorld(next); assert.deepEqual(state, old, 'Transition must not mutate the old save');
    assert.equal(next.divisionId, expected); assert.equal(next.seasonYear, 2027);
    assert.equal(next.currentRound, 1); assert.equal(next.rounds.length, 38);
    assert.ok(next.rounds.every(r => !r.isFinished && r.matches.every(m => !m.isPlayed && m.homeScore === null)));
    assert.equal(new Set(summary.moves.map(m => m.teamId)).size, 24, 'A club cannot move twice in one closure');
    assert.equal(next.userTeam.balance, state.userTeam.balance + summary.user.prize);
    assert.equal(next.seasonHistory.length, 1); assert.equal(next.seasonHistory[0].divisions.reduce((n,d)=>n+d.results.length,0), 1520);
    assert.ok(next.seasonHistory[0].squadChanges);
    for (const movement of summary.moves) assert.ok(next.careerDivisions.find(d => d.id === movement.toId).teams.includes(movement.teamId));
    for (const division of next.careerDivisions) assert.equal(next.backgroundSeasons[division.id]?.completedRounds || 0, 0);
    assert.throws(() => Career.startNextSeason(next), /terminou/);
  }
});

test('preseason preserves identities, money and suspensions, records career stats and renews squads', () => {
  const state = completed(1), young = state.userTeam.players.find(p => p.position === 'M');
  Object.assign(young, { age: 20, simulationAge: 20, ageEstimated: false, goals: 9, assists: 4, matchesPlayed: 30, energy: 30, suspendedWeeks: 2, injuredWeeks: 2, yellowCardCycle: 2 });
  const retired = state.userTeam.players.find(p => p.position === 'A');
  Object.assign(retired, { age: 46, simulationAge: 46, ageEstimated: false });
  const previousStrength = young.strength, id = young.id;
  const next = Career.startNextSeason(state, seeded(4)), player = next.userTeam.players.find(p => p.id === id);
  assert.equal(player.age, 21); assert.equal(player.energy, 100); assert.equal(player.suspendedWeeks, 2); assert.equal(player.injuredWeeks, 0);
  assert.equal(player.careerStats.goals, 9); assert.equal(player.careerStats.assists, 4); assert.equal(player.careerStats.matchesPlayed, 30);
  assert.equal(player.goals, 0); assert.equal(player.matchesPlayed, 0); assert.equal(player.yellowCardCycle, 0);
  assert.ok(player.strength > previousStrength && player.strength <= previousStrength + 3);
  assert.ok(!next.userTeam.players.some(p => p.id === retired.id));
  assert.ok(next.lastSeasonTransition.retired.some(p => p.id === retired.id));
  assert.ok(next.seasonHistory[0].squadChanges.retired.some(p => p.id === retired.id));
  assert.ok(next.userTeam.players.length >= 18);
  for (const club of Career.teams(next)) assert.equal(new Set(club.players.map(p=>p.id)).size, club.players.length);
  const generated = Career.teams(next).flatMap(t => t.players).filter(p => p.generated);
  assert.ok(generated.length > 0 && generated.every(p => p.isYouth && p.age >= 17 && p.age <= 20 && String(p.id).startsWith('youth_')));
});

test('corrupt movement is rejected before replacing the current career', () => {
  const state = completed(); state.seasonSummary.moves.push(clone(state.seasonSummary.moves[0]));
  const before = clone(state); assert.throws(() => Career.startNextSeason(state), /inconsistente/); assert.deepEqual(state, before);
});

test('ten annual transitions preserve the pyramid, history and unique player IDs', () => {
  let state = completed(3);
  for (let year = 2027; year <= 2036; year++) {
    if (year !== 2027) {
      state.rounds = results(state.divisionTeams.map(t => t.id), state.userTeamId); state.currentRound = 39;
      for (const division of state.careerDivisions.filter(d=>d.id!==state.divisionId)) {
        const clubs = Career.teams(state).filter(t=>division.teams.includes(t.id)), rounds = results(division.teams);
        state.backgroundSeasons[division.id] = { completedRounds: 38, table: League.calculateStandings(clubs, rounds), results: rounds.flatMap((r,i)=>r.matches.map(m=>[i+1,m.homeId,m.awayId,m.homeScore,m.awayScore])) };
      }
      state.seasonSummary = Career.buildSummary(state);
    }
    state = Career.startNextSeason(state, seeded(year)); assertWorld(state);
    assert.equal(state.seasonYear, year); assert.equal(state.seasonHistory.length, year - 2026);
    const ids = Career.teams(state).flatMap(t=>t.players.map(p=>p.id)); assert.equal(new Set(ids).size, ids.length);
    const copy = clone(state); copy.userTeam = copy.divisionTeams.find(t=>t.id===copy.userTeamId); assertWorld(copy);
  }
});

const store = new Map();
const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
  SaveStore: require('../src/engine/storage.js'),
  window: { addEventListener() {} }, console, CareerEngine: Career, LeagueEngine: League, SquadEngine: Squad, MatchEngine: Match, FinanceEngine: Finance,
  MarketEngine: require('../src/engine/market.js'), PerformanceEngine: require('../src/engine/performance.js'),
  localStorage: { setItem(k,v){store.set(k,v);}, getItem(k){return store.get(k)||null;} }
});
app.showToast = () => {}; app.onGameLoaded = () => {};
test('app commits the next year only when saving succeeds and ignores a second advance', () => {
  app.gameState = completed(); const old = app.gameState;
  const write = app.persistState; app.persistState = () => false; app.startNextSeason(); assert.equal(app.gameState, old);
  app.persistState = write; app.startNextSeason(); assert.equal(app.gameState.seasonYear, 2027);
  const stored = store.get(app.SAVE_KEY); app.startNextSeason(); assert.equal(store.get(app.SAVE_KEY), stored);
  assert.equal(app.gameState.seasonHistory.length, 1);
});

if (process.argv.includes('--quick')) {
  console.log(`PASS: ${cases} career regression groups and 10 synthetic annual transitions.`);
  process.exit(0);
}

const report = { regressionGroups: cases, simulatedSeasons: [], syntheticTransitions: 10 };
const originalRandom = Math.random;
try {
  Math.random = seeded(20271021);
  app.gameState = game(); Career.ensureState(app.gameState, config, database);
  for (let season = 0; season < 2; season++) {
    const state = app.gameState, year = state.seasonYear;
    for (let index = 0; index < state.rounds.length; index++) {
      Squad.autoSelectStarters(state.userTeam, state.userTeam.formation);
      const fixture = state.rounds[index].matches.find(m=>m.homeId===state.userTeamId||m.awayId===state.userTeamId);
      const teams = [fixture.homeId,fixture.awayId].map(id=>state.divisionTeams.find(t=>t.id===id));
      const match = Match.createMatch(...teams,{userSide:teams[0].id===state.userTeamId?0:1}); match.roundIndex=index;
      while(!match.finished)Match.stepMatch(match,...teams,Math.random);
      state.activeMatch=match; app.finalizeRound(match); delete state.activeMatch;
    }
    assert.equal(Career.isSeasonComplete(state), true);
    if (season===0) {
      const legacy = clone(state);
      for(const key of ['careerVersion','careerDivisions','reserveTeams','backgroundSeasons','seasonHistory'])delete legacy[key];
      fs.writeFileSync(path.join(require('node:os').tmpdir(), 'brasfoot-career-legacy-complete.json'),JSON.stringify(legacy));
      console.log('FIXTURE: legacy completed season generated for the offline native transition test.');
    }
    let simulated = 0;
    while(Career.simulateBackgroundRound(state,Math.random))simulated++;
    assert.equal(simulated,114);
    state.seasonSummary=Career.buildSummary(state);
    for(const division of state.seasonSummary.divisions){
      assert.equal(division.results.length,380); assert.ok(division.standings.every(row=>row.played===38));
      assert.equal(division.standings.reduce((n,row)=>n+row.goalsFor-row.goalsAgainst,0),0);
    }
    const entry = { year, playedDivision:state.divisionId, nextDivision:state.seasonSummary.user.nextDivisionId,
      matches:state.seasonSummary.divisions.reduce((n,d)=>n+d.results.length,0), position:state.seasonSummary.user.position,
      saveBeforeTransitionBytes:Buffer.byteLength(JSON.stringify(state)) };
    app.startNextSeason(); assert.equal(app.gameState.seasonYear,year+1); assertWorld(app.gameState);
    assert.equal(app.gameState.seasonHistory.length,season+1);
    entry.saveAfterTransitionBytes=Buffer.byteLength(JSON.stringify(app.gameState)); report.simulatedSeasons.push(entry);
    console.log(`PASS: real ${year} season -> ${year+1}, ${entry.matches} games in 4 divisions, ${entry.playedDivision} -> ${entry.nextDivision}, history ${season+1}`);
  }
} finally { Math.random=originalRandom; }
fs.writeFileSync(path.join(__dirname,'../docs/career-test-results.json'),JSON.stringify(report,null,2)+'\n');
console.log(`PASS: ${cases} regression groups, 10 synthetic annual transitions and 3040 real simulated fixtures over two consecutive seasons.`);
