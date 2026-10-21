// Isolated manager careers. This suite never opens the player's save storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Career = require('../src/engine/career.js');
const League = require('../src/engine/league.js');
const Squad = require('../src/engine/squad.js');
const Match = require('../src/engine/match.js');
const database = require('../data/teams.json');
const config = require('../data/leagues.json');
const clone = value => JSON.parse(JSON.stringify(value));
let cases = 0;
function test(name, fn) { fn(); cases++; console.log('PASS: ' + name); }
function game(index = 1) {
  const division = config.BRA.divisions[index];
  const teams = division.teams.map(id => Squad.autoSelectStarters(clone(database.find(team => team.id === id))));
  const state = { userTeamId: teams[0].id, userTeam: teams[0], divisionTeams: teams,
    divisionId: division.id, divisionName: division.name, rounds: League.generateSchedule(division.teams),
    seasonYear: 2026, currentRound: 1, totalRounds: 38 };
  Career.ensureState(state, config, database);
  return state;
}
function complete(state, win = true) {
  const teams = Career.teams(state);
  for (const division of state.careerDivisions) {
    const rounds = League.generateSchedule(division.teams);
    for (const round of rounds) {
      round.isFinished = true;
      for (const match of round.matches) {
        const homeWins = match.homeId === state.userTeamId ? win : match.awayId === state.userTeamId ? !win : match.homeId < match.awayId;
        Object.assign(match, { isPlayed: true, homeScore: homeWins ? 2 : 0, awayScore: homeWins ? 0 : 2 });
      }
    }
    if (division.id === state.divisionId) state.rounds = rounds;
    else state.backgroundSeasons[division.id] = { completedRounds: rounds.length,
      table: League.calculateStandings(teams.filter(team => division.teams.includes(team.id)), rounds),
      results: rounds.flatMap((round, i) => round.matches.map(match => [i + 1, match.homeId, match.awayId, match.homeScore, match.awayScore])) };
  }
  state.currentRound = 39;
  state.seasonSummary = Career.buildSummary(state);
  return state;
}
function preseason() { return Career.startNextSeason(complete(game()), () => .5); }
function crossOffer(state) { return state.managerProfile.offers.find(offer => offer.status === 'pending' && offer.divisionId !== state.divisionId); }

test('new and legacy profiles preserve the save and reconstruct old titles once', () => {
  const state = game();
  assert.equal(state.managerProfile.tenures.length, 1);
  assert.equal(Career.profileOverview(state).total.played, 0);
  const next = preseason(); delete next.managerProfile;
  const before = clone({ rounds: next.rounds, clubs: Career.teams(next), history: next.seasonHistory });
  Career.ensureState(next, config, database);
  const overview = Career.profileOverview(next);
  assert.equal(overview.total.titles, 1); assert.equal(overview.total.played, 38);
  assert.equal(overview.tenures.length, 1); assert.equal(overview.pendingOffers.length, 3);
  assert.deepEqual(next.rounds, before.rounds); assert.deepEqual(Career.teams(next), before.clubs);
  const migrated = clone(next); Career.ensureState(next, config, database); assert.deepEqual(next, migrated);
  Career.profileOverview(next); assert.equal(Career.profileOverview(next).trophies.length, 1);
});

test('a title is awarded at the last round and stays single after closure and reload', () => {
  const state = complete(game());
  assert.equal(Career.profileOverview(state).trophies.length, 1);
  const next = Career.startNextSeason(state, () => .5);
  const reload = clone(next); reload.userTeam = reload.divisionTeams.find(team => team.id === reload.userTeamId);
  Career.ensureState(reload, config, database);
  assert.equal(Career.profileOverview(reload).trophies.length, 1);
  assert.equal(Career.profileOverview(reload).total.promotions, 1);
  const last = complete(game(), false);
  assert.equal(Career.profileOverview(last).trophies.length, 0);
});

test('offers are stable, eligible, distinct and include the same and another division', () => {
  const state = preseason(), before = clone(state.managerProfile.offers);
  Career.generateJobOffers(state, state.seasonHistory.at(-1));
  assert.deepEqual(state.managerProfile.offers, before);
  assert.equal(new Set(before.map(offer => offer.teamId)).size, 3);
  assert.ok(before.every(offer => offer.teamId !== state.userTeamId && Career.teams(state).some(team => team.id === offer.teamId)));
  assert.ok(before.some(offer => offer.divisionId === state.divisionId)); assert.ok(crossOffer(state));
  const poor = Career.startNextSeason(complete(game(0), false), () => .5);
  assert.ok(poor.managerProfile.offers.every(offer => ['BRA_B', 'BRA_C'].includes(offer.divisionId)));
});

test('same-division and cross-division moves preserve club property and personal history', () => {
  for (const sameDivision of [false, true]) {
    const state = preseason(); state.managerProfile.name = 'Meu Técnico'; state.userTeam.manager = 'Meu Técnico';
    const offer = state.managerProfile.offers.find(entry => (entry.divisionId === state.divisionId) === sameDivision);
    const old = clone(state), destination = Career.teams(state).find(team => team.id === offer.teamId);
    const next = Career.acceptJobOffer(state, offer.id);
    assert.deepEqual(state, old, 'The original save must remain available until commit');
    assert.equal(next.userTeamId, destination.id); assert.equal(next.userTeam.id, destination.id);
    assert.ok(next.divisionTeams.includes(next.userTeam)); assert.equal(next.userTeam.manager, 'Meu Técnico');
    assert.equal(next.userTeam.balance, destination.balance); assert.deepEqual(next.userTeam.players, destination.players);
    assert.equal(Career.teams(next).find(team => team.id === old.userTeamId).balance, old.userTeam.balance);
    assert.equal(next.divisionId, offer.divisionId); assert.equal(next.seasonYear, old.seasonYear);
    assert.equal(next.rounds.length, 38); assert.ok(next.rounds.every(round => !round.isFinished));
    assert.equal(new Set(Career.teams(next).map(team => team.id)).size, 80);
    const playerIds = Career.teams(next).flatMap(team => team.players.map(player => player.id));
    assert.equal(new Set(playerIds).size, playerIds.length);
    assert.deepEqual(next.seasonHistory, old.seasonHistory);
    const overview = Career.profileOverview(next);
    assert.equal(overview.tenures.length, 2); assert.equal(overview.tenures[0].stats.played, 38);
    assert.equal(overview.tenures[1].stats.played, 0); assert.equal(overview.total.titles, 1);
    assert.equal(overview.pendingOffers.length, 0);
    assert.equal(next.managerProfile.offers.filter(entry => entry.status === 'accepted').length, 1);
    assert.throws(() => Career.acceptJobOffer(next, offer.id), /disponível/);
    const after = Career.startNextSeason(complete(next), () => .5);
    const history = Career.profileOverview(after);
    assert.equal(history.total.played, 76); assert.equal(history.total.titles, 2);
    assert.equal(history.tenures[0].stats.played, 38); assert.equal(history.tenures[1].stats.played, 38);
    assert.equal(history.trophies[0].teamId, old.userTeamId); assert.equal(history.trophies[1].teamId, destination.id);
  }
});

test('declining persists one decision and leaves the other invitations open', () => {
  const state = preseason(), before = clone(state), offer = state.managerProfile.offers[0];
  const next = Career.declineJobOffer(state, offer.id);
  assert.deepEqual(state, before); assert.equal(next.userTeamId, state.userTeamId);
  assert.equal(Career.profileOverview(next).pendingOffers.length, 2);
  assert.throws(() => Career.acceptJobOffer(next, offer.id), /disponível/);
  const copy = clone(next); Career.ensureState(copy, config, database);
  assert.equal(Career.profileOverview(copy).pendingOffers.length, 2);
});

test('live matches, played fixtures and expired invitations prevent club changes', () => {
  for (const mode of ['live', 'played', 'wrong-year']) {
    const state = preseason(), offer = crossOffer(state);
    if (mode === 'live') state.activeMatch = Match.createMatch(state.divisionTeams[0], state.divisionTeams[1]);
    if (mode === 'played') state.rounds[0].matches[0].isPlayed = true;
    if (mode === 'wrong-year') offer.seasonYear--;
    const before = clone(state);
    assert.throws(() => Career.acceptJobOffer(state, offer.id), /partida|disponível/); assert.deepEqual(state, before);
    Career.ensureState(state, config, database);
    assert.equal(state.managerProfile.offers.find(entry => entry.id === offer.id).status, 'expired');
  }
});

const store = new Map();
const managerNameInput = { value: '  Técnico Campeão  ' };
const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
  SaveStore: require('../src/engine/storage.js'),
  EconomyEngine: require('../src/engine/economy.js'), ContractsEngine: require('../src/engine/contracts.js'),
  window: { addEventListener() {} }, console, CareerEngine: Career, MatchEngine: Match, SquadEngine: Squad,
  FinanceEngine: require('../src/engine/finance.js'),
  MarketEngine: require('../src/engine/market.js'), PerformanceEngine: require('../src/engine/performance.js'),
  document: { getElementById(id) { assert.equal(id, 'manager-profile-name'); return managerNameInput; } },
  localStorage: { setItem(key, value) { store.set(key, value); } }
});
app.showToast = () => {}; app.onGameLoaded = () => {}; app.showView = () => {}; app.refreshUI = () => {};

test('the manager name is saved with the profile and survives a club change', () => {
  app.gameState = preseason(); const original = app.gameState;
  const persist = app.persistState; app.persistState = () => false;
  app.saveManagerName(); assert.equal(app.gameState, original);
  app.persistState = persist; app.saveManagerName();
  assert.equal(app.gameState.managerProfile.name, 'Técnico Campeão');
  assert.equal(app.gameState.userTeam.manager, 'Técnico Campeão');
  const offer = crossOffer(app.gameState), next = Career.acceptJobOffer(app.gameState, offer.id);
  assert.equal(next.userTeam.manager, 'Técnico Campeão');
  assert.equal(next.managerProfile.name, 'Técnico Campeão');
  assert.equal(Career.teams(next).find(team => team.id === original.userTeamId).manager, 'Comissão técnica');
});
test('accepting and declining commit the new career only after a successful save', () => {
  const persist = app.persistState;
  for (const accept of [true, false]) {
    app.gameState = preseason(); const original = app.gameState, offer = crossOffer(original);
    app.pendingJobOfferId = offer.id; app.persistState = () => false;
    if (accept) app.acceptJobOffer(); else app.declineJobOffer(offer.id);
    assert.equal(app.gameState, original);
    app.persistState = persist;
    if (accept) app.acceptJobOffer(); else app.declineJobOffer(offer.id);
    assert.notEqual(app.gameState, original);
    const saved = JSON.parse(store.get(app.SAVE_KEY));
    assert.equal(saved.userTeamId, accept ? offer.teamId : original.userTeamId);
    assert.equal(saved.managerProfile.offers.find(entry => entry.id === offer.id).status, accept ? 'accepted' : 'declined');
  }
});

test('the app plays, saves, resumes and finishes the first fixture after a division change', () => {
  const original = preseason(), offer = crossOffer(original);
  app.gameState = Career.acceptJobOffer(original, offer.id);
  app.startMatchLiveSimulation = () => {};
  app.playRound();
  let state = app.gameState, match = state.activeMatch;
  assert.ok(match && !match.finished);
  assert.ok([match.homeId, match.awayId].includes(offer.teamId));
  let home = state.divisionTeams.find(team => team.id === match.homeId);
  let away = state.divisionTeams.find(team => team.id === match.awayId);
  for (let i = 0; i < 3; i++) Match.stepMatch(match, home, away, () => .5);
  assert.equal(match.minute, 3);
  assert.ok(app.persistState());
  state = app.gameState = JSON.parse(store.get(app.SAVE_KEY));
  state.userTeam = state.divisionTeams.find(team => team.id === state.userTeamId);
  Career.ensureState(state, config, database);
  match = state.activeMatch; assert.equal(match.minute, 3);
  home = state.divisionTeams.find(team => team.id === match.homeId);
  away = state.divisionTeams.find(team => team.id === match.awayId);
  while (!match.finished) Match.stepMatch(match, home, away, () => .5);
  app.finalizeRound(match); delete state.activeMatch;
  const overview = Career.profileOverview(state);
  assert.equal(state.currentRound, 2); assert.equal(overview.total.played, 39);
  assert.equal(overview.tenures[0].stats.played, 38); assert.equal(overview.tenures[1].stats.played, 1);
  assert.equal(overview.trophies[0].teamId, original.userTeamId);
  const before = clone(state); app.finalizeRound(match); assert.deepEqual(state, before);
});

fs.writeFileSync('/tmp/brasfoot-profile-preseason.json', JSON.stringify(preseason()));
console.log(`PASS: ${cases} manager regression groups. Native fixture: /tmp/brasfoot-profile-preseason.json`);
