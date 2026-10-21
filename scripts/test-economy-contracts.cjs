// Isolated careers and in-memory storage; never opens the player's saved game.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Finance = require('../src/engine/finance.js');
const Economy = require('../src/engine/economy.js');
const Contracts = require('../src/engine/contracts.js');
const Market = require('../src/engine/market.js');
const Career = require('../src/engine/career.js');
const Squad = require('../src/engine/squad.js');
const League = require('../src/engine/league.js');
const Match = require('../src/engine/match.js');
const Performance = require('../src/engine/performance.js');
const SaveStore = require('../src/engine/storage.js');
const database = require('../data/teams.json');
const config = require('../data/leagues.json');
const clone = value => JSON.parse(JSON.stringify(value));
function game(prepared = true, divisionIndex = 0) {
  const division = config.BRA.divisions[divisionIndex];
  const teams = division.teams.map(id => Squad.autoSelectStarters(clone(database.find(team => team.id === id))));
  const state = { userTeam: teams[0], userTeamId: teams[0].id, divisionTeams: teams,
    divisionId: division.id, divisionName: division.name, rounds: League.generateSchedule(division.teams),
    currentRound: 1, totalRounds: 38, seasonYear: 2026 };
  Career.ensureState(state, config, database); state.userTeam.balance = 1000000000;
  if (prepared) { Contracts.ensureState(state); Economy.ensure(state); }
  return state;
}
function complete(state) {
  for (const division of state.careerDivisions) {
    const ranked = [...division.teams].sort((a, b) => (a === state.userTeamId ? -1 : b === state.userTeamId ? 1 : a - b));
    const rounds = League.generateSchedule(division.teams);
    for (const round of rounds) {
      round.isFinished = true;
      for (const match of round.matches) Object.assign(match, { isPlayed: true,
        homeScore: ranked.indexOf(match.homeId) < ranked.indexOf(match.awayId) ? 1 : 0,
        awayScore: ranked.indexOf(match.homeId) < ranked.indexOf(match.awayId) ? 0 : 1 });
    }
    if (division.id === state.divisionId) state.rounds = rounds;
    else state.backgroundSeasons[division.id] = { completedRounds: 38,
      table: League.calculateStandings(Career.teams(state).filter(team => division.teams.includes(team.id)), rounds),
      results: rounds.flatMap((round, index) => round.matches.map(match => [index + 1, match.homeId, match.awayId, match.homeScore, match.awayScore])) };
  }
  state.currentRound = 39; state.seasonSummary = Career.buildSummary(state); return state;
}
function playerAt(state, id) { return Market.worldTeams(state).flatMap(team => team.players).find(player => player.id === id); }
const outfield = team => team.players.find(player => player.position !== 'G');
let cases = 0;
function test(name, run) { run(); cases++; console.log(`PASS: ${name}`); }

test('legacy migration preserves cash, salaries, fixtures and active matches without retroactive fees', () => {
  const state = game(false); state.currentRound = 17;
  state.activeMatch = Match.createMatch(...state.divisionTeams.slice(0, 2), { userSide: 0 });
  const balance = state.userTeam.balance, wages = state.userTeam.players.map(player => player.wage), live = clone(state.activeMatch), rounds = clone(state.rounds);
  Contracts.ensureState(state); Economy.ensure(state);
  assert.equal(state.userTeam.balance, balance); assert.deepEqual(state.userTeam.players.map(player => player.wage), wages);
  assert.deepEqual(state.activeMatch, live); assert.deepEqual(state.rounds, rounds);
  assert.equal(state.userTeam.economy.startsRound, 17); assert.equal(state.userTeam.finances.seasons[0].entries.length, 0);
  for (const team of Market.worldTeams(state)) for (const player of team.players) {
    assert.equal(player.contract.clubId, team.id); assert.equal(player.contract.wage, player.wage);
    assert.ok(player.contract.endYear >= 2027 && player.contract.endYear <= 2029);
  }
  const before = clone(state); Contracts.ensureState(state); Economy.ensure(state); assert.deepEqual(state, before);
});

test('three annual sponsorships have distinct terms, no upfront cash, and cannot be replaced or backdated', () => {
  const state = game(); state.currentRound = 17;
  const offers = Economy.sponsorOffers(state); assert.equal(new Set(offers.map(offer => offer.id)).size, 3);
  assert.ok(offers.find(offer => offer.id === 'wins').winBonus > 0); assert.equal(offers.find(offer => offer.id === 'target').targetPosition, 4);
  const before = clone(state), next = Economy.transact(state, { type: 'sponsor', offerId: 'stable' }).state;
  assert.deepEqual(state, before); assert.equal(next.userTeam.balance, state.userTeam.balance);
  assert.equal(next.userTeam.economy.sponsor.signedRound, 17);
  assert.equal(Finance.recurringIncome(next.userTeam, { year: 2026, round: 16 }).sponsor, 0);
  assert.throws(() => Economy.transact(next, { type: 'sponsor', offerId: 'wins' }), /já foi/);
  assert.throws(() => Economy.transact(state, { type: 'sponsor', offerId: 'invalid' }), /inválida/);
  assert.throws(() => Economy.transact(complete(game()), { type: 'sponsor', offerId: 'stable' }), /terminou/);
});

test('TV, fixed sponsorship and victory bonus reconcile once per round and forecasts exclude earned bonuses', () => {
  const state = Economy.transact(game(), { type: 'sponsor', offerId: 'wins' }).state, team = state.userTeam;
  const base = Finance.estimateRound(team, false), cash = team.balance, funding = Finance.recurringIncome(team, { year: 2026, round: 1, won: true });
  const report = Finance.processRoundFinances(team, false, null, { year: 2026, round: 1, won: true });
  assert.equal(report.netWeekly, base.netWeekly + funding.tv + funding.sponsor + funding.sponsorBonus);
  assert.equal(team.balance, cash + report.netWeekly);
  const before = clone(team), random = Math.random;
  Math.random = () => { throw new Error('No random draw is allowed when replaying a round or estimating revenue'); };
  try {
    Finance.processRoundFinances(team, true, null, { year: 2026, round: 1, won: true }); assert.deepEqual(team, before);
    const forecast = Finance.project(state);
    assert.equal(forecast.fixedPerRound, funding.tv + funding.sponsor);
    const plain = clone(state); delete plain.userTeam.economy;
    assert.equal(forecast.projectedBalance - Finance.project(plain).projectedBalance, 38 * forecast.fixedPerRound);
    assert.deepEqual(team, before);
  } finally { Math.random = random; }
  const model = Finance.overview(team, 2026);
  assert.equal(model.categories.tv, funding.tv); assert.equal(model.categories.sponsorBonus, funding.sponsorBonus);
  assert.equal(model.season.openingBalance + model.net, team.balance);
  const noWin = Finance.processRoundFinances(team, false, null, { year: 2026, round: 2, won: false }); assert.equal(noWin.sponsorBonus, 0);
});

test('the placement bonus is prorated, belongs to the old year and survives the real season transition exactly once', () => {
  let state = game(); state.currentRound = 20;
  state = Economy.transact(state, { type: 'sponsor', offerId: 'target' }).state;
  const sponsor = state.userTeam.economy.sponsor, amount = Math.round(sponsor.targetBonus * 19 / 38);
  complete(state); assert.equal(state.seasonSummary.user.position, 1);
  const cash = state.userTeam.balance, before = clone(state), next = Career.startNextSeason(state, () => .5);
  assert.deepEqual(state, before); assert.equal(next.userTeam.balance, cash + state.seasonSummary.user.prize + amount);
  assert.equal(Finance.overview(next.userTeam, 2026).categories.sponsorBonus, amount);
  assert.equal(next.lastSeasonTransition.sponsorBonus, amount);
  Economy.closeSeason(next, next.seasonHistory[0]); assert.equal(next.userTeam.balance, cash + state.seasonSummary.user.prize + amount);
  Economy.ensure(next); assert.equal(next.userTeam.economy.sponsor, null);
  assert.equal(next.userTeam.finances.seasons.find(season => season.year === 2027).openingBalance, next.userTeam.balance);
  const missed = game(); missed.userTeam.economy.sponsor = { ...Economy.sponsorOffers(missed).find(offer => offer.id === 'target'), signedRound: 1 };
  assert.equal(Economy.closeSeason(missed, { year: 2026, user: { position: 5 } }), 0);
});

test('board budgets reject fees plus bonuses or salary excess and sales restore available funds', () => {
  const state = game(), other = state.reserveTeams[0], player = outfield(other), amount = Market.quote(player);
  state.userTeam.economy.board.transferLimit = amount;
  const before = clone(state);
  assert.throws(() => Market.transact(state, { type: 'buy', clubId: other.id, playerId: player.id, amount,
    terms: { years: 3, wage: player.wage, bonus: 1 } }), /orçamento/);
  state.userTeam.economy.board.wageLimit = Economy.committedWages(state, state.userTeam);
  assert.throws(() => Market.transact(state, { type: 'loan-in', clubId: other.id, playerId: player.id, amount: Market.quote(player, true) }), /salário/);
  state.userTeam.economy.board.wageLimit = before.userTeam.economy.board.wageLimit;
  const next = Market.transact(state, { type: 'buy', clubId: other.id, playerId: player.id, amount }).state;
  assert.equal(Economy.budget(next).available, 0); assert.equal(Economy.budget(next).spent, amount);
  const sold = outfield(next.userTeam), sellingClub = Market.worldTeams(next).find(team => team.id === other.id); sellingClub.balance = 1000000000;
  const price = Market.quote(sold), sale = Market.transact(next, { type: 'sell', clubId: other.id, playerId: sold.id, amount: price }).state;
  assert.equal(Economy.budget(sale).available, price); assert.equal(Economy.budget(sale).sales, price);
});

test('budget reviews observe four rounds, expand with cash and reset annually without granting cash', () => {
  const state = game(), cash = state.userTeam.balance;
  assert.throws(() => Economy.transact(state, { type: 'review-budget' }), /quatro/);
  state.currentRound = 5; state.userTeam.balance += 2000000;
  const next = Economy.transact(state, { type: 'review-budget' }).state;
  assert.equal(next.userTeam.balance, cash + 2000000);
  assert.equal(Economy.budget(next).available, next.userTeam.balance / 2);
  assert.throws(() => Economy.transact(next, { type: 'review-budget' }), /quatro/);
});

test('renewals price performance, debit only signing bonuses and cannot shorten or renew twice in a year', () => {
  const state = game(), player = outfield(state.userTeam); player.contract.endYear = 2026;
  player.performance = { games: 5, ratingTotal: 40 };
  const quote = Contracts.quote(player), wage = player.wage, cash = state.userTeam.balance, before = clone(state);
  assert.ok(quote.wage >= wage * 1.10);
  const next = Contracts.transact(state, { type: 'renew', playerId: player.id, terms: quote }).state;
  assert.deepEqual(state, before); assert.equal(next.userTeam.balance, cash - quote.bonus);
  const renewed = playerAt(next, player.id); assert.equal(renewed.wage, quote.wage); assert.equal(renewed.contract.endYear, 2028);
  assert.equal(Finance.overview(next.userTeam, 2026).categories.signingBonus, -quote.bonus);
  assert.throws(() => Contracts.transact(next, { type: 'renew', playerId: player.id, terms: quote }), /já foi/);
  player.contract.endYear = 2029;
  assert.throws(() => Contracts.transact(state, { type: 'renew', playerId: player.id, terms: quote }), /encurtar/);
  for (const terms of [{ years: 0 }, { years: 6 }, { wage: wage - 1 }, { bonus: -1 }, { wage: NaN }, { years: 1.5 }])
    assert.throws(() => Contracts.transact(state, { type: 'renew', playerId: player.id, terms }), /recusadas/);
});

test('loan renewals reserve the future salary while the borrower pays the original salary until return', () => {
  let state = game(); const player = outfield(state.userTeam), originalWage = player.wage, other = state.reserveTeams[0]; other.balance = 1000000000;
  state = Market.transact(state, { type: 'loan-out', clubId: other.id, playerId: player.id, amount: Market.quote(player, true) }).state;
  const loaned = playerAt(state, player.id); loaned.contract.endYear = 2026;
  const quote = Contracts.quote(loaned), commitment = Economy.committedWages(state, state.userTeam);
  state = Contracts.transact(state, { type: 'renew', playerId: player.id, terms: quote }).state;
  assert.equal(Finance.wage(playerAt(state, player.id)), originalWage);
  assert.equal(Economy.committedWages(state, state.userTeam), commitment + quote.wage - originalWage);
  assert.throws(() => Contracts.transact(state, { type: 'release', playerId: player.id }), /retorno/);
  Market.returnLoans(state); assert.equal(Finance.wage(playerAt(state, player.id)), quote.wage);
  assert.ok(state.userTeam.players.some(entry => entry.id === player.id));
});

test('expiration releases players once, ages free agents once and replenishes the squad with contracted youth', () => {
  const state = game(), player = outfield(state.userTeam); player.age = 26; player.simulationAge = 26; player.contract.endYear = 2026;
  const id = player.id, next = Career.startNextSeason(complete(state), () => .5);
  assert.equal(next.freeAgents.filter(entry => entry.id === id).length, 1);
  assert.equal(next.freeAgents.find(entry => entry.id === id).simulationAge, 27);
  assert.ok(!next.userTeam.players.some(entry => entry.id === id)); assert.ok(next.lastSeasonTransition.released.some(entry => entry.id === id));
  assert.ok(next.userTeam.players.length >= 18); assert.ok(next.userTeam.players.every(entry => entry.contract));
  const again = Career.startNextSeason(complete(next), () => .5);
  assert.equal(again.freeAgents.filter(entry => entry.id === id).length, 1);
  assert.equal(again.freeAgents.find(entry => entry.id === id).simulationAge, 28);
  const all = [...Market.worldTeams(again).flatMap(team => team.players), ...again.freeAgents];
  assert.equal(all.length, new Set(all.map(entry => entry.id)).size);
});

test('release and free-agent hiring preserve ownership, enforce minimum squad and record all immediate costs', () => {
  const state = game(), player = outfield(state.userTeam), cash = state.userTeam.balance, fee = Contracts.terminationCost(state, player);
  assert.equal(fee, player.wage * 6);
  const released = Contracts.transact(state, { type: 'release', playerId: player.id }).state;
  assert.equal(released.userTeam.balance, cash - fee); assert.equal(Finance.overview(released.userTeam, 2026).categories.termination, -fee);
  const agent = released.freeAgents.find(entry => entry.id === player.id), terms = Contracts.quote(agent, 'sign');
  const signed = Contracts.transact(released, { type: 'sign', playerId: player.id, terms }).state;
  assert.equal(signed.userTeam.balance, cash - fee - terms.bonus); assert.equal(signed.freeAgents.length, 0);
  assert.equal(playerAt(signed, player.id).contract.clubId, signed.userTeamId);
  assert.equal(Economy.budget(signed).spent, fee + terms.bonus);
  assert.throws(() => Contracts.transact(signed, { type: 'sign', playerId: player.id, terms }), /disponível/);
  const small = game(); small.userTeam.players = small.userTeam.players.slice(0, 15);
  assert.throws(() => Contracts.transact(small, { type: 'release', playerId: outfield(small.userTeam).id }), /15 atletas/);
  const keeperState = game(), keeper = keeperState.userTeam.players.find(entry => entry.position === 'G');
  keeperState.userTeam.players = keeperState.userTeam.players.filter(entry => entry.position !== 'G' || entry === keeper);
  assert.throws(() => Contracts.transact(keeperState, { type: 'release', playerId: keeper.id }), /goleiro/);
  state.currentRound = 38; player.contract.endYear = 2026; assert.equal(Contracts.terminationCost(state, player), player.wage);
});

test('signed transfer terms charge the buyer only, persist with club accounts and cannot bypass cash or live-match guards', () => {
  const state = game(), other = state.reserveTeams[0], player = outfield(other), amount = Market.quote(player), bonus = 12345;
  const buyerCash = state.userTeam.balance, sellerCash = other.balance;
  const next = Market.transact(state, { type: 'buy', clubId: other.id, playerId: player.id, amount,
    terms: { years: 5, wage: player.wage, bonus } }).state;
  assert.equal(next.userTeam.balance, buyerCash - amount - bonus);
  assert.equal(Market.worldTeams(next).find(team => team.id === other.id).balance, sellerCash + amount);
  assert.equal(playerAt(next, player.id).contract.endYear, 2030);
  const map = new Map(), store = new SaveStore({ setItem: (k, v) => map.set(k, v), getItem: k => map.get(k), removeItem: k => map.delete(k) }, 'isolated');
  store.save(next); assert.deepEqual(store.load(), next);
  const poor = game(); poor.userTeam.balance = amount;
  assert.throws(() => Market.transact(poor, { type: 'buy', clubId: other.id, playerId: player.id, amount, terms: { bonus } }), /saldo/);
  const active = game(); active.activeMatch = {}; const before = clone(active);
  assert.throws(() => Contracts.transact(active, { type: 'renew', playerId: outfield(active.userTeam).id }), /partida/);
  assert.throws(() => Economy.transact(active, { type: 'sponsor', offerId: 'stable' }), /partida/);
  assert.deepEqual(active, before);
});

const nodes = new Map();
function node() { return { value: '', children: [], style: {}, classList: { toggle() {}, contains() { return true; } }, dataset: {},
  querySelectorAll() { return []; }, setAttribute() {}, replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); }, focus() {} }; }
const getNode = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
  window: { addEventListener() {} }, console, FinanceEngine: Finance, EconomyEngine: Economy, ContractsEngine: Contracts,
  CareerEngine: Career, MarketEngine: Market, SquadEngine: Squad, MatchEngine: Match, PerformanceEngine: Performance,
  document: { getElementById: getNode, createElement: node, querySelectorAll() { return []; } }
});
app.refreshUI = () => {}; app.showToast = () => {}; app.allTeams = database; app.persistState = () => true;

test('finance, contract and free-agent screens render terms, expiration warnings and escaped names', () => {
  app.gameState = game(); const player = outfield(app.gameState.userTeam); player.name = '<b>Atleta</b>'; player.contract.endYear = 2026;
  app.renderFinances();
  assert.ok(getNode('finance-sponsor-offers').innerHTML.includes('Horizonte Esportes'));
  assert.ok(getNode('finance-transfer-room').textContent.includes('R$'));
  app.marketView = 'contracts'; app.renderMarket();
  assert.ok(getNode('market-contracts-tbody').innerHTML.includes('&lt;b&gt;Atleta&lt;/b&gt;'));
  assert.ok(getNode('market-contracts-tbody').innerHTML.includes('Vence nesta temporada'));
  app.openContract('renew', player.id); assert.equal(getNode('contract-modal').style.display, 'flex');
  assert.ok(getNode('contract-total').textContent.includes('Luvas agora'));
  app.submitContract(); assert.equal(playerAt(app.gameState, player.id).contract.renewedYear, 2026);
  app.gameState = Contracts.transact(app.gameState, { type: 'release', playerId: player.id }).state;
  app.marketView = 'freeAgents'; app.renderMarket();
  assert.ok(getNode('market-free-agents-tbody').innerHTML.includes('&lt;b&gt;Atleta&lt;/b&gt;'));
  app.openContract('sign', player.id); app.submitContract(); assert.equal(app.gameState.freeAgents.length, 0);
});

test('failed persistence keeps sponsorship, budget and player contracts unchanged and modal forms submit actual terms', () => {
  app.gameState = game(); const state = app.gameState, before = clone(state), player = outfield(state.userTeam);
  player.contract.endYear = 2026; const prepared = clone(state);
  app.persistState = () => false;
  assert.equal(app.commitEconomyAction({ type: 'sponsor', offerId: 'stable' }), false);
  assert.equal(app.commitContractAction({ type: 'renew', playerId: player.id }), false);
  assert.equal(app.gameState, state); assert.deepEqual(state, prepared);
  state.currentRound = 5; const review = clone(state);
  assert.equal(app.commitEconomyAction({ type: 'review-budget' }), false); assert.deepEqual(state, review);
  app.persistState = () => true;
  const other = state.reserveTeams[0], incoming = outfield(other);
  app.openTransfer('buy', incoming.id, other.id);
  assert.equal(getNode('transfer-contract-fields').hidden, false);
  getNode('transfer-contract-years').value = 5; getNode('transfer-contract-bonus').value = 1000;
  app.submitTransfer(); const signed = playerAt(app.gameState, incoming.id);
  assert.equal(signed.contract.endYear, 2030); assert.equal(Finance.overview(app.gameState.userTeam, 2026).categories.signingBonus, -1000);
  assert.equal(before.userTeam.balance, app.gameState.userTeam.balance + Market.quote(incoming) + 1000);
});

test('released players cannot reappear in the database directory or when an external club is materialized', () => {
  const state = game(), external = database.find(team => !Market.worldTeams(state).some(club => club.id === team.id) && team.players.length > 17);
  const player = outfield(external);
  let next = Market.transact(state, { type: 'buy', clubId: external.id, playerId: player.id, amount: Market.quote(player) }, database).state;
  next = Contracts.transact(next, { type: 'release', playerId: player.id }).state;
  app.gameState = next; app.teamDirectory = null;
  assert.equal(app.currentTeams().flatMap(team => team.players).filter(entry => entry.id === player.id).length, 0);
  next.marketClubs = []; const rematerialized = Market.ensureClub(next, external.id, database);
  assert.ok(!rematerialized.players.some(entry => entry.id === player.id));
});

test('round finalization reads the actual result for sponsorship bonuses on either side and never pays twice', () => {
  for (const home of [true, false]) {
    app.gameState = Economy.transact(game(), { type: 'sponsor', offerId: 'wins' }).state;
    const state = app.gameState, user = state.userTeamId, other = state.divisionTeams.find(team => team.id !== user).id;
    state.rounds[0].matches = [{ homeId: home ? user : other, awayId: home ? other : user,
      homeScore: home ? 2 : 0, awayScore: home ? 0 : 2, isPlayed: true }];
    app.finalizeRound(null, 0);
    const report = Finance.overview(state.userTeam, 2026); assert.equal(report.categories.sponsorBonus, state.userTeam.economy.sponsor.winBonus);
    assert.equal(report.season.entries[0].details.isHomeMatch, home);
    const before = clone(state); app.finalizeRound(null, 0); assert.deepEqual(state, before);
  }
});

const projections = config.BRA.divisions.flatMap((division, index) => division.teams.map(id => {
  const state = game(false, index); state.userTeam = state.divisionTeams.find(team => team.id === id); state.userTeamId = id;
  // Restore the database balance: the generous test fixture is not used for this scan.
  state.userTeam.balance = database.find(team => team.id === id).balance;
  Economy.ensure(state); const base = Finance.project(state).projectedBalance;
  const sponsored = Economy.transact(state, { type: 'sponsor', offerId: 'stable' }).state;
  return { id, division: division.id, tvOnly: base, stableSponsor: Finance.project(sponsored).projectedBalance };
}));
fs.writeFileSync(path.join(__dirname, '../docs/economy-contracts-test-results.json'), JSON.stringify({ regressionGroups: cases,
  storage: 'isolated in-memory only', visualWebKitTest: false,
  economyScan: { freshDatabaseClubs: projections.length, negativeWithTV: projections.filter(row => row.tvOnly < 0).length,
    negativeWithStableSponsor: projections.filter(row => row.stableSponsor < 0).length,
    assumptions: 'Initial club balances, unchanged wages, full unplayed season, central attendance; no prizes, bonuses or future negotiations.' }
}, null, 2) + '\n');
console.log(`PASS: ${cases} economy/contract regression groups.`);
