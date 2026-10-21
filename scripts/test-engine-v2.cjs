// Deterministic regression tests and a full season in each configured Brazilian division.
// Uses cloned fixtures and isolated app state; never opens the player's local storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('../src/engine/match.js');
const Squad = require('../src/engine/squad.js');
const League = require('../src/engine/league.js');
const Finance = require('../src/engine/finance.js');
const database = require('../data/teams.json');
const leagues = require('../data/leagues.json');
const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
function seeded(seed) { let n = seed; return () => { n = (Math.imul(1664525, n) + 1013904223) >>> 0; return n / 4294967296; }; }
function sequence(values) { let index = 0; return () => { assert.ok(index < values.length, 'Unexpected random draw'); return values[index++]; }; }
function team(id, strength = 50) {
  const positions = ['G', 'G', 'L', 'L', 'L', 'L', 'Z', 'Z', 'Z', 'Z', ...Array(8).fill('M'), ...Array(5).fill('A')];
  const result = { id, name: `Clube ${id}`, formation: '4-4-2', tacticStyle: 'Equilibrado', players: positions.map((position, index) => ({
    id: `${id}_${index}`, name: `Jogador ${id}-${index}`, position, strength, side: 'C', energy: 100, morale: 100,
    cr1: '', cr2: '', goals: 0, assists: 0, matchesPlayed: 0, yellowCards: 0, redCards: 0, injuredWeeks: 0, suspendedWeeks: 0
  })) };
  return Squad.autoSelectStarters(result);
}
const pair = () => [team(1), team(2)];
const power = (state, teams) => teams.map((t, side) => Engine.powerFor(state, t, side));
const finish = (state, teams, random = seeded(2026)) => { while (!state.finished) Engine.stepMatch(state, ...teams, random); };
let cases = 0;
function test(name, run) { run(); cases++; console.log(`PASS: ${name}`); }
function validateStats(stats, scores) {
  assert.equal(stats.possession[0] + stats.possession[1], 100);
  for (const values of Object.values(stats)) for (const value of values) assert.ok(Number.isFinite(value) && value >= 0);
  for (let side = 0; side < 2; side++) {
    assert.ok(stats.completedPasses[side] <= stats.passes[side]);
    assert.ok(stats.shotsOnTarget[side] <= stats.shots[side]);
    assert.ok(stats.xG[side] <= stats.shots[side]);
    if (stats.shots[side]) assert.ok(stats.xG[side] > 0);
    if (scores) assert.ok(scores[side] <= stats.shotsOnTarget[side]);
  }
}

test('traits, energy, morale and injury affect individual skills', () => {
  const p = team(1).players.find(p => p.position === 'A');
  const plain = Engine.attribute(p, 'finishing');
  p.cr1 = 'Finalização'; p.cr2 = 'Técnica';
  assert.ok(Math.abs(Engine.attribute(p, 'finishing') / plain - 1.2) < 1e-10);
  const boosted = Engine.attribute(p, 'finishing');
  p.energy = 45; assert.ok(Engine.attribute(p, 'finishing') < boosted);
  const tired = Engine.attribute(p, 'finishing');
  p.morale = 60; assert.ok(Engine.attribute(p, 'finishing') < tired);
  assert.ok(Math.abs(Engine.attribute(p, 'finishing', { injured: true }) / Engine.attribute(p, 'finishing') - .55) < 1e-10);
  for (const [skill, trait] of [['passing', 'Passe'], ['heading', 'Cabeceio'], ['creation', 'Armação'], ['dribbling', 'Drible'], ['tackling', 'Desarme'], ['saving', 'Reflexo']]) {
    const q = { ...p, cr1: '', cr2: '' }, before = Engine.attribute(q, skill);
    q.cr1 = trait; assert.ok(Engine.attribute(q, skill) > before);
  }
});

test('all formations assign unique slots and apply position and side penalties', () => {
  for (const formation of Engine.FORMATIONS) {
    const t = team(1); Squad.autoSelectStarters(t, formation);
    const assignments = Squad.assignPositions(Squad.starters(t), formation);
    assert.equal(Object.keys(assignments).length, 11);
    assert.equal(new Set(Object.values(assignments).map(s => s.index)).size, 11);
    for (const [role, count] of Object.entries(Squad.FORMATIONS[formation])) assert.equal(Object.values(assignments).filter(s => s.role === role).length, count);
  }
  const p = { position: 'Z', side: 'E' };
  assert.equal(Squad.positionFit(p, { role: 'A', side: 'C' }), .52);
  assert.equal(Squad.positionFit(p, { role: 'G', side: 'C' }), .18);
  assert.equal(Squad.positionFit(p, { role: 'Z', side: 'D' }), .94);
  assert.equal(Squad.positionFit({ ...p, sideEstimated: true }, { role: 'Z', side: 'D' }), 1);
  assert.equal(Squad.positionFit({ ...p, positionDetailEstimated: true }, { role: 'L', side: 'C' }), .96);
});

test('automatic and manual selection exclude unavailable players and prefer fit players', () => {
  const t = team(1), keepers = t.players.filter(p => p.position === 'G');
  keepers[0].strength = 80; keepers[0].energy = 10;
  const blocked = t.players.filter(p => p.position === 'M').slice(0, 4);
  blocked[0].injuredWeeks = 2; blocked[1].suspendedWeeks = 1;
  blocked[2].pendingInjuryWeeks = 1; blocked[3].pendingSuspensionWeeks = 1;
  Squad.autoSelectStarters(t);
  assert.ok(Squad.starters(t).includes(keepers[1]));
  assert.ok(Squad.starters(t).every(p => Squad.isAvailable(p)));
  const before = t.players.map(p => p.id);
  assert.equal(Squad.swapPlayers(t, 0, t.players.indexOf(blocked[0])), false);
  assert.deepEqual(t.players.map(p => p.id), before);
  t.players.forEach((p, i) => { if (i >= 8) p.injuredWeeks = 1; });
  Squad.autoSelectStarters(t);
  assert.ok(Squad.starters(t).length <= 8);
  assert.ok(Squad.starters(t).every(p => Squad.isAvailable(p)));
});

test('third yellow suspends the next match, resets the cycle and survives a bye', () => {
  const teams = pair(), state = Engine.createMatch(...teams);
  teams[1].players.forEach(p => { p.yellowCards = 2; });
  state.minute = 12;
  Engine.simulateFoul(state, teams, power(state, teams), 50, sequence([.1, .3, .1, .9, .9]));
  const id = state.events.find(e => e.type === 'CARTAO_AMARELO').playerId;
  const p = teams[1].players.find(p => p.id === id);
  assert.equal(p.yellowCards, 3); assert.equal(p.yellowCardCycle, 0);
  assert.equal(state.pendingSuspensions[1][id], 1);
  assert.equal(Squad.isAvailable(p), true, 'New yellow does not remove the player from the current match');
  Engine.finishMatch(state, ...teams);
  Squad.recoverEnergy(teams[1]);
  assert.equal(p.suspendedWeeks, 1); assert.equal(Squad.isAvailable(p), false);
  Squad.recoverEnergy(teams[1], { played: false }); assert.equal(p.suspendedWeeks, 1);
  const next = Engine.createMatch(...teams, { aiControlled: [true, true] });
  assert.ok(!next.activeIds[1].includes(id));
  assert.equal(Engine.substitute(next, ...teams, 1, next.activeIds[1][1], id).success, false);
  finish(next, teams, () => .8); Squad.recoverEnergy(teams[1]);
  assert.equal(p.suspendedWeeks, 0); assert.equal(Squad.isAvailable(p), true);
});

test('second yellow and direct red have persistent, nonduplicated sanctions', () => {
  for (const direct of [false, true]) {
    const teams = pair(), state = Engine.createMatch(...teams); state.minute = 20;
    let p;
    if (direct) { p = teams[1].players[2]; Engine.sendOff(state, teams[1], 1, p, false); }
    else {
      for (let i = 0; i < 2; i++) Engine.simulateFoul(state, teams, power(state, teams), 50, sequence([.1, .3, .1, .9, .9]));
      p = teams[1].players.find(p => state.sentOffIds[1].includes(p.id));
    }
    assert.ok(p); assert.equal(state.activeIds[1].length, 10);
    Engine.finishMatch(state, ...teams); Squad.recoverEnergy(teams[1]);
    assert.equal(p.suspendedWeeks, direct ? 2 : 1);
    const before = clone({ state, teams }); Engine.finishMatch(state, ...teams);
    assert.deepEqual({ state, teams }, before);
  }
});

test('injuries of one, two and four rounds reduce performance and expire correctly', () => {
  for (const [roll, duration] of [[.1, 1], [.8, 2], [.99, 4]]) {
    const teams = pair(), state = Engine.createMatch(...teams); state.minute = 14;
    Engine.simulateInjury(state, teams, sequence([0, .2, roll]));
    const event = state.events.at(-1), side = event.teamIndex;
    const p = teams[side].players.find(p => p.id === event.playerId);
    assert.equal(event.type, 'CONTUSAO'); assert.equal(state.injuryDurations[side][p.id], duration);
    const context = Engine.playerContext(state, side, p);
    assert.ok(Engine.attribute(p, 'passing', context) < Engine.attribute(p, 'passing', { ...context, injured: false }));
    Engine.finishMatch(state, ...teams); Squad.recoverEnergy(teams[side]);
    assert.equal(p.injuredWeeks, duration);
    for (let remaining = duration; remaining > 0; remaining--) {
      assert.equal(Squad.isAvailable(p), false);
      Squad.autoSelectStarters(teams[side]); assert.ok(!Squad.starters(teams[side]).includes(p));
      Squad.recoverEnergy(teams[side]); assert.equal(p.injuredWeeks, remaining - 1);
    }
    assert.equal(Squad.isAvailable(p), true);
  }
});

test('opponent changes tactics with the score and substitutes tired players', () => {
  const teams = pair(), state = Engine.createMatch(...teams, { userSide: 1 });
  const userLineup = clone(state.activeIds[1]), userStyle = state.styles[1];
  state.minute = 60; state.scores = [0, 2];
  Engine.playersFor(state, teams[0], 0).filter(p => p.position !== 'G').forEach(p => { p.energy = 45; });
  Engine.manageOpponent(state, teams, 0);
  assert.equal(state.styles[0], 'Ofensivo'); assert.equal(state.substitutions[0], 1);
  assert.deepEqual(state.activeIds[1], userLineup); assert.equal(state.styles[1], userStyle);
  state.minute = 75; state.scores = [3, 2]; Engine.manageOpponent(state, teams, 0);
  assert.equal(state.styles[0], 'Defensivo'); assert.ok(state.substitutions[0] <= 5);
});

test('goalkeeper sent off can be replaced only by withdrawing another player', () => {
  for (const automatic of [true, false]) {
    const teams = pair(), state = Engine.createMatch(...teams, { userSide: 0 }); state.minute = 12;
    const keeper = Engine.goalkeeper(state, teams[1], 1);
    Engine.sendOff(state, teams[1], 1, keeper, false);
    const replacement = teams[1].players.find(p => p.position === 'G' && p.id !== keeper.id);
    assert.equal(Engine.substitute(state, ...teams, 1, keeper.id, replacement.id).success, false);
    if (automatic) Engine.manageOpponent(state, teams, 1);
    else assert.equal(Engine.substitute(state, ...teams, 1, state.activeIds[1][0], replacement.id).success, true);
    assert.equal(state.activeIds[1].length, 10); assert.equal(state.substitutions[1], 1);
    assert.equal(Engine.goalkeeper(state, teams[1], 1).id, replacement.id);
    assert.ok(!state.activeIds[1].includes(keeper.id));
  }
});

test('AI makes an immediate injury substitution and never exceeds five changes', () => {
  const teams = pair(), state = Engine.createMatch(...teams, { userSide: 0 }); state.minute = 10;
  const injured = Engine.playersFor(state, teams[1], 1).find(p => p.position === 'M');
  state.injuredIds[1].push(injured.id); state.injuryDurations[1][injured.id] = 1;
  Engine.manageOpponent(state, teams, 1);
  assert.ok(!state.activeIds[1].includes(injured.id)); assert.equal(state.substitutions[1], 1);
  for (let minute = 55; minute < 90; minute++) {
    state.minute = minute; Engine.playersFor(state, teams[1], 1).forEach(p => { p.energy = 10; });
    Engine.manageOpponent(state, teams, 1);
    assert.ok(state.substitutions[1] <= 5);
    assert.ok(state.activeIds[1].every(id => !state.exitedIds[1].includes(id)));
  }
  assert.equal(state.substitutions[1], 5);
});

test('save/resume preserves AI decisions, history, sanctions and final snapshots', () => {
  const goalTeams = pair(), goalState = Engine.createMatch(...goalTeams);
  Engine.scoreGoal(goalState, goalTeams[0], 0, goalTeams[0].players.find(p => p.position === 'A'), null, false);
  assert.equal(goalState.events[0].assist, null);
  assert.deepEqual(clone(goalState.events), goalState.events, 'A goal without an assist must survive JSON serialization unchanged');
  const teams = pair(), state = Engine.createMatch(...teams, { userSide: 0 }), random = seeded(96);
  for (let minute = 0; minute < 62; minute++) Engine.stepMatch(state, ...teams, random);
  assert.deepEqual(clone({ state, teams }), { state, teams });
  const copy = clone({ state, teams }); finish(state, teams, seeded(177)); finish(copy.state, copy.teams, seeded(177));
  assert.deepEqual(copy, { state, teams });
  const energy = clone(state.finalEnergy), strengths = clone(state.finalPower);
  teams.forEach(t => Squad.recoverEnergy(t));
  assert.deepEqual(state.finalEnergy, energy); assert.deepEqual(state.finalPower, strengths);
  validateStats(state.stats, state.scores);
});

test('old live saves migrate once without changing scores, events or player counters', () => {
  const teams = pair(), state = Engine.createMatch(...teams, { userSide: 0 });
  for (let i = 0; i < 20; i++) Engine.stepMatch(state, ...teams, () => .8);
  const outgoing = teams[0].players[1], incoming = teams[0].players[11];
  assert.equal(Engine.substitute(state, ...teams, 0, outgoing.id, incoming.id).success, true);
  for (let i = 20; i < 27; i++) Engine.stepMatch(state, ...teams, () => .8);
  for (const key of ['engineVersion', 'assignments', 'aiControlled', 'lastAiTacticsAt', 'lastAiSubAt', 'injuryDurations', 'pendingSuspensions', 'minutesPlayed']) delete state[key];
  for (const key of ['xG', 'passes', 'completedPasses']) delete state.stats[key];
  const before = clone({ scores: state.scores, events: state.events, active: state.activeIds, teams });
  Engine.ensureState(state, ...teams);
  assert.deepEqual({ scores: state.scores, events: state.events, active: state.activeIds, teams }, before);
  assert.equal(state.minutesPlayed[0][outgoing.id], 20); assert.equal(state.minutesPlayed[0][incoming.id], 7);
  assert.equal(state.statsSinceMinute, 27); assert.deepEqual(state.aiControlled, [false, true]);
  const migrated = clone(state); Engine.ensureState(state, ...teams); assert.deepEqual(state, migrated);
  finish(state, teams, seeded(12)); validateStats(state.stats, state.scores);
});

test('home advantage, neutral field, forfeit and penalty shootouts terminate correctly', () => {
  const teams = pair(), regular = Engine.createMatch(...teams), neutral = Engine.createMatch(...teams, { isNeutral: true });
  for (const key of ['gk', 'defense', 'midfield', 'attack']) assert.ok(Math.abs(Engine.powerFor(regular, teams[0], 0)[key] / Engine.powerFor(neutral, teams[0], 0)[key] - 1.05) < 1e-10);
  const short = clone(regular); short.activeIds[1] = short.activeIds[1].slice(0, 6);
  Engine.stepMatch(short, ...teams, () => .8); assert.equal(short.finished, true); assert.deepEqual(short.scores, [3, 0]);
  const both = Engine.createMatch(...pair()); both.activeIds = [[], []]; Engine.stepMatch(both, ...pair(), () => .8);
  assert.equal(both.finished, true); assert.deepEqual(both.scores, [0, 0]);
  const cupTeams = pair(), cup = Engine.createMatch(...cupTeams, { isCup: true }); cup.minute = 90;
  Engine.finishMatch(cup, ...cupTeams, () => .5);
  assert.notEqual(cup.penalties.home, cup.penalties.away);
});

const report = { regressionCases: cases, seasons: [], exhibition: {}, balance: {} };
const originalRandom = Math.random;
try {
  Math.random = seeded(20261021);
  const isolatedApp = vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8') + '\napp;', {
    window: { addEventListener() {} }, console, MatchEngine: Engine, SquadEngine: Squad, FinanceEngine: Finance,
    MarketEngine: require('../src/engine/market.js'), PerformanceEngine: require('../src/engine/performance.js')
  });
  for (const division of leagues.BRA.divisions) {
    const clubs = division.teams.map(id => Squad.autoSelectStarters(clone(database.find(t => t.id === id))));
    isolatedApp.gameState = { userTeamId: clubs[0].id, userTeam: clubs[0], divisionTeams: clubs, rounds: League.generateSchedule(division.teams), currentRound: 1, totalRounds: 38, seasonYear: 2026, divisionId: division.id, divisionName: division.name };
    const game = isolatedApp.gameState;
    const totals = { division: division.id, matches: 0, goals: 0, xG: 0, shots: 0, injuries: 0, yellowCards: 0, redCards: 0, substitutions: 0, tacticalChanges: 0, forfeits: 0 };
    for (let roundIndex = 0; roundIndex < game.rounds.length; roundIndex++) {
      Squad.autoSelectStarters(game.userTeam, game.userTeam.formation);
      const fixture = game.rounds[roundIndex].matches.find(m => m.homeId === game.userTeamId || m.awayId === game.userTeamId);
      const home = clubs.find(t => t.id === fixture.homeId), away = clubs.find(t => t.id === fixture.awayId);
      const userSide = home.id === game.userTeamId ? 0 : 1;
      const state = Engine.createMatch(home, away, { userSide }); state.roundIndex = roundIndex;
      finish(state, [home, away], Math.random); game.activeMatch = state;
      isolatedApp.finalizeRound(state);
      assert.equal(state.finalized, true); assert.equal(game.currentRound, roundIndex + 2);
      const serialized = JSON.stringify(game); isolatedApp.finalizeRound(state); assert.equal(JSON.stringify(game), serialized);
      for (const match of game.rounds[roundIndex].matches) {
        assert.equal(match.isPlayed, true); validateStats(match.stats, match.events.some(e => e.type === 'ABANDONO') ? null : [match.homeScore, match.awayScore]);
        totals.matches++; totals.goals += match.homeScore + match.awayScore;
        totals.xG += match.stats.xG[0] + match.stats.xG[1]; totals.shots += match.stats.shots[0] + match.stats.shots[1];
        totals.yellowCards += match.stats.yellowCards[0] + match.stats.yellowCards[1]; totals.redCards += match.stats.redCards[0] + match.stats.redCards[1];
        for (const event of match.events) {
          if (event.type === 'CONTUSAO') totals.injuries++;
          if (event.type === 'SUBSTITUICAO') totals.substitutions++;
          if (event.type === 'TATICA') totals.tacticalChanges++;
          if (event.type === 'ABANDONO') totals.forfeits++;
        }
      }
      for (const club of clubs) for (const p of club.players) {
        assert.ok(p.energy >= 0 && p.energy <= 100 && Number.isFinite(p.energy));
        assert.ok((p.morale ?? 100) >= 40 && (p.morale ?? 100) <= 110);
        assert.ok(p.injuredWeeks >= 0 && p.injuredWeeks <= 4 && p.suspendedWeeks >= 0 && p.suspendedWeeks <= 2);
        assert.ok((p.matchesPlayed || 0) <= roundIndex + 1);
      }
      delete game.activeMatch;
    }
    const standings = League.calculateStandings(clubs, game.rounds);
    assert.equal(totals.matches, 380); assert.ok(standings.every(t => t.played === 38));
    assert.equal(standings.reduce((sum, t) => sum + t.goalsFor - t.goalsAgainst, 0), 0);
    const saved = JSON.stringify(game);
    totals.saveBytes = Buffer.byteLength(saved); totals.saveUtf16Bytes = saved.length * 2;
    totals.goalsPerMatch = Number((totals.goals / totals.matches).toFixed(3));
    totals.xGPerMatch = Number((totals.xG / totals.matches).toFixed(3));
    report.seasons.push(totals);
    if (division.id === 'BRA_A') fs.writeFileSync('/tmp/brasfoot-engine-season-BRA_A.json', saved);
    console.log(`PASS: ${division.id}, 38 rounds, ${totals.matches} matches, ${totals.goalsPerMatch} goals/game, ${totals.xGPerMatch} xG/game, save ${totals.saveBytes} bytes (${totals.saveUtf16Bytes} UTF-16 bytes)`);
  }

  let games = 0, forfeits = 0;
  for (let i = 0; i < database.length; i += 2) {
    const home = clone(database[i]), away = clone(database[(i + 1) % database.length]);
    const result = Engine.simulateMatch(home, away, { random: Math.random }); games++;
    validateStats(result.stats, result.events.some(e => e.type === 'ABANDONO') ? null : [result.homeTeam.score, result.awayTeam.score]);
    assert.equal(result.events.at(-1).type, 'FIM_JOGO');
    if (result.events.some(e => e.type === 'ABANDONO')) forfeits++;
  }
  report.exhibition = { clubsCovered: database.length, matches: games, forfeits };
  console.log(`PASS: ${database.length} clubs covered in ${games} exhibition fixtures`);

  function comparison(label, homeStrength, awayStrength, options = {}) {
    const result = { matches: 300, homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, homeXG: 0, awayXG: 0 };
    for (let i = 0; i < result.matches; i++) {
      const t = [team(1, homeStrength), team(2, awayStrength)];
      if (options.energy !== undefined) t[0].players.forEach(p => { p.energy = options.energy; });
      const match = Engine.simulateMatch(...t, { random: seeded(1337 + i), isNeutral: Boolean(options.isNeutral) });
      const h = match.homeTeam.score, a = match.awayTeam.score;
      result.homeGoals += h; result.awayGoals += a; result.homeXG += match.stats.xG[0]; result.awayXG += match.stats.xG[1];
      if (h > a) result.homeWins++; else if (h < a) result.awayWins++; else result.draws++;
    }
    report.balance[label] = result;
    console.log(`BALANCE: ${label}: ${result.homeWins} home wins, ${result.draws} draws, ${result.awayWins} away wins, goals ${result.homeGoals}:${result.awayGoals}`);
    return result;
  }
  const equal = comparison('equal-neutral', 50, 50, { isNeutral: true });
  const strong = comparison('strong-vs-weak', 60, 35, { isNeutral: true });
  const tired = comparison('tired-vs-fresh', 50, 50, { isNeutral: true, energy: 45 });
  const homeAdvantage = comparison('equal-home-advantage', 50, 50);
  assert.ok(strong.homeWins > strong.awayWins * 2); assert.ok(strong.homeXG > strong.awayXG * 1.5);
  assert.ok(tired.homeXG < equal.homeXG * .85); assert.ok(tired.awayWins > tired.homeWins);
  assert.ok(Math.abs(equal.homeWins - equal.awayWins) < equal.matches * .2);
  assert.ok(homeAdvantage.homeXG > equal.homeXG);
} finally { Math.random = originalRandom; }
const reportPath = path.join(root, 'docs/engine-test-results.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`PASS: ${cases} regression cases, 1520 season fixtures, ${report.exhibition.matches} exhibition fixtures and 1200 balance fixtures. Report: docs/engine-test-results.json`);
