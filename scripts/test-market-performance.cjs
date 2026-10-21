// All clubs and storage here are isolated copies of the local database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Market = require('../src/engine/market.js');
const Performance = require('../src/engine/performance.js');
const Career = require('../src/engine/career.js');
const Match = require('../src/engine/match.js');
const Squad = require('../src/engine/squad.js');
const League = require('../src/engine/league.js');
const Finance = require('../src/engine/finance.js');
const database = require('../data/teams.json');
const config = require('../data/leagues.json');
const clone = value => JSON.parse(JSON.stringify(value));
let cases = 0;
function test(name, fn) { fn(); cases++; console.log('PASS: ' + name); }
function game() {
  const division = config.BRA.divisions[0];
  const teams = division.teams.map(id => Squad.autoSelectStarters(clone(database.find(team => team.id === id))));
  const state = { userTeamId: teams[0].id, userTeam: teams[0], divisionTeams: teams, divisionId: division.id,
    divisionName: division.name, seasonYear: 2026, currentRound: 1, totalRounds: 38, rounds: League.generateSchedule(division.teams) };
  Career.ensureState(state, config, database); state.userTeam.balance = 1000000000;
  state.reserveTeams[0].balance = 1000000000;
  return state;
}
function external(state) { return database.find(team => !Market.worldTeams(state).some(other => other.id === team.id) && team.players.length > 17); }
function outfield(team) { return team.players.find(player => player.position !== 'G'); }
function assertUnique(state) {
  const teams = Market.worldTeams(state), ids = teams.flatMap(team => team.players.map(player => player.id));
  assert.equal(new Set(teams.map(team => team.id)).size, teams.length);
  assert.equal(new Set(ids).size, ids.length, 'A player must appear at exactly one participating club');
  assert.ok(state.divisionTeams.includes(state.userTeam));
}
function closeSeason(state) {
  for (const division of state.careerDivisions) {
    const rounds = League.generateSchedule(division.teams);
    for (const round of rounds) { round.isFinished = true; for (const match of round.matches) Object.assign(match, { isPlayed: true, homeScore: 1, awayScore: 0 }); }
    if (division.id === state.divisionId) state.rounds = rounds;
    else state.backgroundSeasons[division.id] = { completedRounds: 38,
      table: League.calculateStandings(Market.worldTeams(state).filter(team => division.teams.includes(team.id)), rounds),
      results: rounds.flatMap((round, index) => round.matches.map(match => [index + 1, match.homeId, match.awayId, match.homeScore, match.awayScore])) };
  }
  state.currentRound = 39; state.seasonSummary = Career.buildSummary(state);
  return Career.startNextSeason(state, () => .5);
}
function firstOffer(state) {
  for (let round = 3; round <= 35; round++) {
    state.currentRound = round + 1;
    const offer = Market.generateOffers(state, database);
    if (offer) return offer;
  }
  throw new Error('Expected an occasional proposal in 33 rounds');
}

test('transfers to and from an external club persist money and unique ownership after reload', () => {
  const state = game(), club = external(state), player = outfield(club), before = clone(state);
  const amount = Market.quote(player);
  let next = Market.transact(state, { type: 'buy', playerId: player.id, clubId: club.id, amount }, database).state;
  assert.deepEqual(state, before);
  assert.equal(next.userTeam.balance, state.userTeam.balance - amount);
  assert.equal(next.marketClubs[0].balance, club.balance + amount);
  assert.ok(next.userTeam.players.some(entry => entry.id === player.id));
  assert.ok(!next.marketClubs[0].players.some(entry => entry.id === player.id));
  next = clone(next); next.userTeam = next.divisionTeams.find(team => team.id === next.userTeamId);
  Career.ensureState(next, config, database); assertUnique(next);
  const sold = Market.transact(next, { type: 'sell', playerId: player.id, clubId: club.id, amount }, database).state;
  assert.ok(!sold.userTeam.players.some(entry => entry.id === player.id));
  assert.equal(sold.marketClubs[0].players.filter(entry => entry.id === player.id).length, 1);
  assert.equal(sold.userTeam.balance, state.userTeam.balance); assert.equal(sold.marketClubs[0].balance, club.balance);
  assertUnique(sold);
});

test('both directions of a seasonal loan charge a fee, move wages and return once before aging', () => {
  for (const outgoing of [false, true]) {
    const state = game(), club = external(state);
    const player = outfield(outgoing ? state.userTeam : club), amount = Market.quote(player, true);
    const result = Market.transact(state, { type: outgoing ? 'loan-out' : 'loan-in', playerId: player.id, clubId: club.id, amount }, database);
    const loanState = result.state, borrower = Market.worldTeams(loanState).find(team => team.players.some(entry => entry.id === player.id));
    const borrowed = borrower.players.find(entry => entry.id === player.id);
    Object.assign(borrowed, { age: 20, simulationAge: 20, ageEstimated: false });
    const ownerId = borrowed.loan.ownerTeamId;
    assert.equal(borrowed.loan.endYear, 2026); assert.equal(borrowed.loan.borrowerTeamId, borrower.id);
    assert.equal(loanState.userTeam.balance, state.userTeam.balance + (outgoing ? amount : -amount));
    const bill = Finance.processRoundFinances(clone(loanState.userTeam)).wageBill;
    const oldBill = Finance.processRoundFinances(clone(state.userTeam)).wageBill;
    assert.equal(bill, oldBill + (outgoing ? -player.wage : player.wage));
    const blocked = clone(loanState);
    if (!outgoing) assert.throws(() => Market.transact(loanState, { type: 'sell', playerId: player.id, clubId: club.id, amount }, database), /emprestados/);
    assert.deepEqual(loanState, blocked);
    const next = closeSeason(loanState), owner = Market.worldTeams(next).find(team => team.id === ownerId);
    const returned = owner.players.find(entry => entry.id === player.id);
    assert.ok(returned && !returned.loan); assert.equal(returned.age, 21); assertUnique(next);
    const money = Market.worldTeams(next).reduce((sum, team) => sum + team.balance, 0);
    assert.equal(Market.returnLoans(next).length, 0);
    assert.equal(Market.worldTeams(next).reduce((sum, team) => sum + team.balance, 0), money);
    assert.equal(next.marketState.history.filter(deal => deal.type === 'return').length, 1);
  }
});

test('invalid values, small squads, the last goalkeeper and live games cannot alter a save', () => {
  const state = game(), target = state.reserveTeams[0], player = outfield(state.userTeam);
  for (const amount of [NaN, Infinity, -1, 0, 1.5]) {
    const before = clone(state); assert.throws(() => Market.transact(state, { type: 'sell', clubId: target.id, playerId: player.id, amount }, database)); assert.deepEqual(state, before);
  }
  const short = clone(state); short.userTeam = short.divisionTeams.find(team => team.id === short.userTeamId); short.userTeam.players = short.userTeam.players.slice(0, 15);
  assert.throws(() => Market.transact(short, { type: 'sell', clubId: target.id, playerId: short.userTeam.players[0].id, amount: 1000 }, database), /15 jogadores/);
  const keeperState = game(), keepers = keeperState.userTeam.players.filter(entry => entry.position === 'G');
  keeperState.userTeam.players = keeperState.userTeam.players.filter(entry => entry.position !== 'G' || entry.id === keepers[0].id);
  assert.throws(() => Market.transact(keeperState, { type: 'sell', clubId: target.id, playerId: keepers[0].id, amount: 1000 }, database), /goleiro/);
  state.activeMatch = { minute: 4 }; const before = clone(state);
  assert.throws(() => Market.transact(state, { type: 'sell', clubId: target.id, playerId: player.id, amount: 1000 }, database), /partida/); assert.deepEqual(state, before);
});

test('performance attracts stable offers, refusals persist, expiration and funds are enforced', () => {
  const state = game(), player = outfield(state.userTeam);
  state.userTeam.players.forEach(entry => { entry.matchesPlayed = 0; entry.age = 30; });
  Object.assign(player, { matchesPlayed: 3, goals: 5, assists: 2, performance: { games: 3, ratingTotal: 26, motm: 2, recent: [[9, 90, 2, 1, 2, 2, 0]] } });
  const offer = firstOffer(state); assert.equal(offer.playerId, player.id); assert.equal(offer.type, 'transfer'); assert.ok(offer.amount > player.value);
  assert.ok(offer.reason.includes('5 gols')); const snapshot = clone(state);
  assert.equal(Market.generateOffers(state, database), null); assert.deepEqual(state, snapshot);
  const declined = Market.transact(state, { type: 'decline', offerId: offer.id }, database).state;
  assert.equal(declined.marketState.offers[0].status, 'declined');
  assert.throws(() => Market.transact(declined, { type: 'accept', offerId: offer.id }, database), /disponível/);
  const accepted = Market.transact(state, { type: 'accept', offerId: offer.id }, database).state;
  assert.equal(accepted.marketState.offers[0].status, 'accepted'); assertUnique(accepted);
  assert.ok(!accepted.userTeam.players.some(entry => entry.id === player.id));
  assert.throws(() => Market.transact(accepted, { type: 'accept', offerId: offer.id }, database), /disponível/);
  const expired = clone(state); expired.currentRound = offer.expiresRound + 1;
  assert.throws(() => Market.transact(expired, { type: 'accept', offerId: offer.id }, database), /disponível/);
  const broke = clone(state); Market.ensureClub(broke, offer.clubId, database).balance = 0;
  assert.throws(() => Market.transact(broke, { type: 'accept', offerId: offer.id }, database), /saldo/);
});

test('young players with few minutes can receive loan proposals', () => {
  const state = game(); state.userTeam.players.forEach(player => { player.age = 30; player.matchesPlayed = 0; });
  const young = outfield(state.userTeam); young.age = 20;
  let offer;
  for (let round = 3; round <= 38; round++) { state.currentRound = round + 1; offer = Market.generateOffers(state, database); if (offer) break; }
  assert.ok(offer); assert.equal(offer.type, 'loan'); assert.equal(offer.playerId, young.id);
  const next = Market.transact(state, { type: 'accept', offerId: offer.id }, database).state;
  assert.equal(Market.worldTeams(next).find(team => team.id === offer.clubId).players.find(player => player.id === young.id).loan.ownerTeamId, state.userTeamId);
});

test('match grades include scorer, assister, keeper, minutes and exactly one man of the match', () => {
  const state = game(), home = state.userTeam, away = state.divisionTeams[1];
  const match = Match.createMatch(home, away, { prepareTeams: false });
  const scorer = Squad.starters(home).find(player => player.position === 'A');
  const assister = Squad.starters(home).find(player => player.position === 'M');
  const keeper = Squad.starters(home).find(player => player.position === 'G');
  match.minutesPlayed = [home, away].map(team => Object.fromEntries(Squad.starters(team).map(player => [player.id, 90])));
  match.minute = 20; Match.scoreGoal(match, home, 0, scorer, assister, false);
  match.minute = 60; Match.scoreGoal(match, home, 0, scorer, assister, false);
  Match.emit(match, { type: 'DEFESA', teamIndex: 1, playerId: outfield(away).id, keeperId: keeper.id });
  match.minute = 90; Match.finishMatch(match, home, away);
  const rows = match.playerRatings.flat(), grade = id => rows.find(row => row.id === id);
  assert.equal(grade(scorer.id).goals, 2); assert.equal(grade(assister.id).assists, 2);
  assert.equal(grade(keeper.id).saves, 1); assert.equal(grade(keeper.id).cleanSheet, 1);
  assert.equal(rows.filter(row => row.motm).length, 1); assert.equal(grade(scorer.id).motm, 1);
  assert.ok(rows.every(row => row.minutes === 90 && row.rating >= 1 && row.rating <= 10));
  assert.ok(!rows.some(row => row.id === home.players.at(-1).id));
  const before = clone({ match, home, away }); Match.finishMatch(match, home, away); Performance.recordMatch(match, [home, away]); assert.deepEqual({ match, home, away }, before);
  assert.equal(Performance.unpack(Performance.pack(match.playerRatings), [home.id, away.id]).length, rows.length);
  assert.equal(Performance.average(scorer), grade(scorer.id).rating);
  assert.equal(Performance.average({ matchesPlayed: 10, goals: 8 }), null);
});

test('ratings survive live save/resume and historical reports remain after a player is sold', () => {
  let state = game(); const fixture = state.rounds[0].matches.find(match => [match.homeId, match.awayId].includes(state.userTeamId));
  let teams = [fixture.homeId, fixture.awayId].map(id => state.divisionTeams.find(team => team.id === id));
  let match = Match.createMatch(...teams, { userSide: teams[0].id === state.userTeamId ? 0 : 1 }); match.roundIndex = 0;
  for (let i = 0; i < 5; i++) Match.stepMatch(match, ...teams, () => .5);
  state.activeMatch = match; state = clone(state); state.userTeam = state.divisionTeams.find(team => team.id === state.userTeamId);
  match = state.activeMatch; teams = [fixture.homeId, fixture.awayId].map(id => state.divisionTeams.find(team => team.id === id));
  while (!match.finished) Match.stepMatch(match, ...teams, () => .5);
  const savedFixture = state.rounds[0].matches.find(entry => entry.homeId === match.homeId && entry.awayId === match.awayId);
  Object.assign(savedFixture, { isPlayed: true, homeScore: match.scores[0], awayScore: match.scores[1], playerRatings: Performance.pack(match.playerRatings) });
  delete state.activeMatch;
  const report = Performance.reports(state); assert.equal(report.length, 1); assert.ok(report[0].playerRatings.flat().length >= 22);
  const sold = outfield(state.userTeam); state = Market.transact(state, { type: 'sell', playerId: sold.id, clubId: state.reserveTeams[0].id, amount: Market.quote(sold) }, database).state;
  assert.deepEqual(Performance.reports(state), report);
  for (let year = 2026; year <= 2029; year++) { state.seasonYear = year; Performance.archiveSeason(state); Performance.archiveSeason(state); }
  assert.deepEqual(state.performanceArchive.map(record => record.year), [2028, 2029]);
});

const store = new Map();
const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
  SaveStore: require('../src/engine/storage.js'),
  EconomyEngine: require('../src/engine/economy.js'), ContractsEngine: require('../src/engine/contracts.js'),
  window: { addEventListener() {} }, console, MarketEngine: Market, PerformanceEngine: Performance, CareerEngine: Career,
  MatchEngine: Match, SquadEngine: Squad, FinanceEngine: Finance,
  localStorage: { setItem(key, value) { store.set(key, value); } }
});
app.showToast = () => {}; app.refreshUI = () => {}; app.allTeams = database;
test('the application commits a deal only after saving and its directory cannot resurrect a player', () => {
  app.gameState = game(); const old = app.gameState, player = outfield(old.userTeam), target = external(old);
  app.currentTeams(); // Prime the directory before changing player ownership.
  const action = { type: 'sell', playerId: player.id, clubId: target.id, amount: Market.quote(player) };
  const persist = app.persistState; app.persistState = () => false;
  assert.equal(app.commitMarketAction(action), false); assert.equal(app.gameState, old);
  app.persistState = persist; assert.equal(app.commitMarketAction(action), true);
  assert.notEqual(app.gameState, old); assert.equal(JSON.parse(store.get(app.SAVE_KEY)).marketState.history.length, 1);
  const occurrences = app.currentTeams().flatMap(team => team.players.filter(entry => entry.id === player.id).map(() => team.id));
  assert.deepEqual(Array.from(occurrences), [target.id]);
});

console.log(`PASS: ${cases} market/performance regression groups.`);
