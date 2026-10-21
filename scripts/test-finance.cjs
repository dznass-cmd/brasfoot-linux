// Club-finance regressions: copied clubs and in-memory storage only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Finance = require('../src/engine/finance.js');
const Career = require('../src/engine/career.js');
const Market = require('../src/engine/market.js');
const Match = require('../src/engine/match.js');
const Squad = require('../src/engine/squad.js');
const League = require('../src/engine/league.js');
const SaveStore = require('../src/engine/storage.js');
const database = require('../data/teams.json');
const config = require('../data/leagues.json');
const clone = value => JSON.parse(JSON.stringify(value));
const context = { year: 2026, round: 1 };
function seeded(n) { return () => { n = (Math.imul(1664525, n) + 1013904223) >>> 0; return n / 4294967296; }; }
function game() {
  const division = config.BRA.divisions[0], teams = division.teams.map(id => Squad.autoSelectStarters(clone(database.find(team => team.id === id))));
  const state = { userTeam: teams[0], userTeamId: teams[0].id, divisionTeams: teams, divisionId: division.id, divisionName: division.name,
    seasonYear: 2026, currentRound: 1, totalRounds: 38, rounds: League.generateSchedule(division.teams) };
  Career.ensureState(state, config, database); state.userTeam.balance = 1000000000;
  return state;
}
function complete(state) {
  for (const division of state.careerDivisions) {
    const rounds = League.generateSchedule(division.teams);
    for (const round of rounds) {
      round.isFinished = true;
      for (const match of round.matches) Object.assign(match, { isPlayed: true, homeScore: 1, awayScore: 0 });
    }
    if (division.id === state.divisionId) state.rounds = rounds;
    else state.backgroundSeasons[division.id] = { completedRounds: 38,
      table: League.calculateStandings(Career.teams(state).filter(team => division.teams.includes(team.id)), rounds),
      results: rounds.flatMap((round, index) => round.matches.map(match => [index + 1, match.homeId, match.awayId, match.homeScore, match.awayScore])) };
  }
  state.currentRound = 39; state.seasonSummary = Career.buildSummary(state); return state;
}
function reconcile(team, year) {
  const model = Finance.overview(team, year);
  assert.equal(model.season.openingBalance + model.income - model.expenses, model.closingBalance);
  return model;
}
let cases = 0;
function test(name, run) { run(); cases++; console.log(`PASS: ${name}`); }

test('an old save starts an empty ledger at its existing balance and round without fabricated revenue', () => {
  const team = clone(database[0]), balance = team.balance;
  const season = Finance.ensureLedger(team, { year: 2026, round: 17 });
  assert.equal(team.balance, balance); assert.equal(season.openingBalance, balance); assert.equal(season.startedRound, 17);
  assert.deepEqual(season.entries, []); const before = clone(team);
  Finance.ensureLedger(team, { year: 2026, round: 18 }); assert.deepEqual(team, before);
  assert.equal(Finance.overview(team, 2026).income, 0); assert.equal(Finance.overview(team, 2026).expenses, 0);
});

test('home and away accounts reconcile and replaying a round cannot charge again or draw randomness', () => {
  const team = { id: 1, balance: 1000000, capacity: 20000, reputation: 3, players: [{ wage: 5000 }, { wage: 5000 }] };
  const random = Math.random; let draws = 0;
  Math.random = () => { draws++; return .5; };
  try {
    const home = Finance.processRoundFinances(team, true, 30, context);
    assert.equal(home.attendance, 9900); assert.equal(home.matchIncome, 297000); assert.equal(home.wageBill, 10000);
    assert.equal(home.maintenance, 10000); assert.equal(home.netWeekly, 277000); assert.equal(team.balance, 1277000);
    const before = clone(team); Finance.processRoundFinances(team, true, 150, context);
    assert.deepEqual(team, before); assert.equal(draws, 1);
    Finance.processRoundFinances(team, false, 30, { year: 2026, round: 2 });
    assert.equal(draws, 1); assert.equal(team.balance, 1257000);
    const model = reconcile(team, 2026); assert.equal(model.income, 297000); assert.equal(model.expenses, 40000);
  } finally { Math.random = random; }
});

test('projections use remaining fixtures and the real price curve without changing cash or randomness', () => {
  const team = { id: 1, balance: 1000000, capacity: 20000, reputation: 3, players: [{ wage: 5000 }, { wage: 5000 }] };
  const state = { userTeam: team, rounds: League.generateSchedule(Array.from({ length: 20 }, (_, i) => i + 1)) };
  const before = clone(state), random = Math.random;
  Math.random = () => { throw new Error('A preview must not draw randomness'); };
  try {
    const forecast = Finance.project(state, 30);
    assert.equal(forecast.remainingRounds, 38); assert.equal(forecast.homeGames, 19); assert.equal(forecast.projectedBalance, 5883000);
    assert.ok(Finance.project(state, 50).home.attendance < forecast.home.attendance);
    assert.deepEqual(state, before);
    state.rounds.forEach(round => { round.isFinished = true; });
    assert.equal(Finance.project(state).projectedBalance, team.balance); assert.equal(Finance.project(state).remainingRounds, 0);
  } finally { Math.random = random; }
});

test('purchases, sales and both loan directions record matching amounts in each club and preserve total cash', () => {
  for (const type of ['buy', 'sell', 'loan-in', 'loan-out']) {
    const state = game(), other = state.reserveTeams[0]; other.balance = 1000000000;
    const outgoing = ['sell', 'loan-out'].includes(type), loan = type.startsWith('loan');
    const player = (outgoing ? state.userTeam : other).players.find(player => player.position !== 'G');
    const amount = Market.quote(player, loan), before = clone(state);
    const next = Market.transact(state, { type, clubId: other.id, playerId: player.id, amount }, database).state;
    assert.deepEqual(state, before);
    const counterpart = Market.worldTeams(next).find(team => team.id === other.id);
    const userModel = reconcile(next.userTeam, 2026), otherModel = reconcile(counterpart, 2026);
    assert.equal(userModel.net, outgoing ? amount : -amount); assert.equal(otherModel.net, -userModel.net);
    assert.equal(next.userTeam.balance + counterpart.balance, state.userTeam.balance + other.balance);
    assert.equal(userModel.season.entries.length, 1);
    const category = loan ? outgoing ? 'loanIncome' : 'loanFee' : outgoing ? 'playerSale' : 'playerPurchase';
    assert.equal(userModel.categories[category], outgoing ? amount : -amount);
    if (loan) {
      const beforeReturn = clone(next); Market.returnLoans(next);
      assert.deepEqual(next.userTeam.finances, beforeReturn.userTeam.finances);
      assert.equal(next.userTeam.balance, beforeReturn.userTeam.balance);
    }
  }
});

test('stadium costs enter the ledger once and invalid expansions cannot mint cash or change capacity', () => {
  const team = { id: 1, balance: 5000000, capacity: 20000, stadium: 'Teste', players: [] };
  for (const seats of [-5000, 0, 1.5, Infinity, NaN, '5000', Number.MAX_SAFE_INTEGER]) {
    const before = clone(team); assert.equal(Finance.upgradeStadium(team, seats, context).success, false); assert.deepEqual(team, before);
  }
  assert.equal(Finance.upgradeStadium(team, 5000, context).success, true);
  assert.equal(team.capacity, 25000); assert.equal(team.balance, 3000000);
  assert.equal(reconcile(team, 2026).categories.stadium, -2000000);
  assert.equal(Finance.estimateRound(team).maintenance, 12500);
});

test('season prizes belong to the completed year and are paid once before the next opening balance', () => {
  const state = complete(game()), before = clone(state), prize = state.seasonSummary.user.prize;
  const next = Career.startNextSeason(state, () => .5);
  assert.deepEqual(state, before); assert.equal(next.userTeam.balance, state.userTeam.balance + prize);
  assert.equal(reconcile(next.userTeam, 2026).categories.prize, prize);
  assert.throws(() => Career.startNextSeason(next), /terminou/);
  Finance.ensureLedger(next.userTeam, { year: 2027, round: 1 });
  assert.equal(Finance.overview(next.userTeam, 2027).season.openingBalance, next.userTeam.balance);
  const stored = new Map(), store = new SaveStore({ setItem: (key, value) => stored.set(key, value), getItem: key => stored.get(key), removeItem: key => stored.delete(key) }, 'isolated_finances');
  store.save(next); const loaded = store.load(); assert.deepEqual(loaded, next); reconcile(loaded.userTeam, 2026);
});

test('accounts stay with their clubs when the coach changes jobs', () => {
  const state = game(), old = state.userTeam, destination = state.reserveTeams[0];
  Finance.ensureLedger(old, context); Finance.upgradeStadium(old, 5000, context);
  Finance.ensureLedger(destination, context); const oldAccounts = clone(old.finances), destinationBalance = destination.balance;
  state.managerProfile.offers.push({ id: 'finance-job', teamId: destination.id, status: 'pending', seasonYear: 2026 });
  const next = Career.acceptJobOffer(state, 'finance-job');
  assert.equal(next.userTeam.balance, destinationBalance); assert.deepEqual(next.userTeam.finances, destination.finances);
  assert.deepEqual(Career.teams(next).find(team => team.id === old.id).finances, oldAccounts);
});

test('the ledger keeps five seasons and historical totals survive a new season', () => {
  const team = { id: 1, balance: 10000 };
  for (let year = 2026; year <= 2032; year++) Finance.post(team, { year, round: 1 }, {
    kind: 'prize', source: `prize:${year}`, description: 'Teste', lines: [{ category: 'prize', amount: 1000 }] });
  assert.deepEqual(team.finances.seasons.map(season => season.year), [2028, 2029, 2030, 2031, 2032]);
  assert.equal(team.balance, 17000); for (let year = 2028; year <= 2032; year++) reconcile(team, year);
});

test('invalid financial entries cannot modify cash or create partial records', () => {
  const team = { id: 1, balance: 5000000 };
  for (const lines of [[], [{ category: 'unknown', amount: 10 }], [{ category: 'prize', amount: NaN }],
    [{ category: 'prize', amount: Infinity }], [{ category: 'prize', amount: 1e308 }, { category: 'prize', amount: 1e308 }]]) {
    const before = clone(team);
    assert.throws(() => Finance.post(team, context, { kind: 'prize', description: 'Invalid', lines }));
    assert.deepEqual(team, before);
  }
});

const nodes = new Map();
function node() { return { querySelectorAll() { return []; }, children: [], value: '', style: {}, classList: { toggle() {} },
  replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); } }; }
const memory = new Map();
const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
  EconomyEngine: require('../src/engine/economy.js'), ContractsEngine: require('../src/engine/contracts.js'),
  window: { addEventListener() {} }, console, FinanceEngine: Finance, CareerEngine: Career, MarketEngine: Market,
  MatchEngine: Match, SquadEngine: Squad, PerformanceEngine: require('../src/engine/performance.js'), SaveStore,
  document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }, createElement: node },
  localStorage: { setItem: (key, value) => memory.set(key, value), getItem: key => memory.get(key), removeItem: key => memory.delete(key) }
});
app.showToast = () => {}; app.refreshUI = () => {}; app.allTeams = database;

test('the finance tab shows real totals, salaries, chart and filtered history with escaped text', () => {
  app.gameState = game(); const team = app.gameState.userTeam;
  team.players[0].name = '<script>test</script>';
  Finance.post(team, context, { kind: 'market', source: 'test', description: '<b>Venda</b>', lines: [{ category: 'playerSale', amount: 12345 }] });
  Finance.processRoundFinances(team, false, 30, context);
  require('../src/engine/economy.js').ensure(app.gameState);
  const before = clone(team); app.currentView = 'finance-tab'; app.invalidateViews(); app.renderCurrentView();
  assert.deepEqual(team, before); assert.equal(nodes.get('finance-income').textContent, app.financeMoney(12345));
  assert.ok(nodes.get('finance-wages-tbody').innerHTML.includes('&lt;script&gt;'));
  assert.ok(nodes.get('finance-chart').innerHTML.includes('<svg'));
  assert.ok(nodes.get('finance-statement-tbody').innerHTML.includes('&lt;b&gt;Venda&lt;/b&gt;'));
  nodes.get('finance-entry-filter').value = 'market'; app.renderFinanceStatement();
  assert.ok(!nodes.get('finance-statement-tbody').innerHTML.includes('Rodada fora'));
  const price = team.ticketPrice; app.updateFinanceSummary(50); assert.equal(team.ticketPrice, price);
});

test('ticket changes and stadium construction commit only after saving and cannot change an active match', () => {
  app.gameState = game(); const old = app.gameState, before = clone(old), persist = app.persistState;
  app.persistState = () => false;
  assert.equal(app.saveTicketPrice(50), false); assert.equal(app.upgradeStadium(5000), false);
  assert.equal(app.gameState, old); assert.deepEqual(old, before);
  app.persistState = persist; assert.equal(app.saveTicketPrice(50), true); assert.equal(app.gameState.userTeam.ticketPrice, 50);
  const balance = app.gameState.userTeam.balance; assert.equal(app.upgradeStadium(5000), true);
  assert.equal(app.gameState.userTeam.balance, balance - 2000000);
  assert.equal(reconcile(app.gameState.userTeam, 2026).expenses, 2000000);
  app.gameState.activeMatch = {}; const active = clone(app.gameState);
  app.saveTicketPrice(70); app.upgradeStadium(5000); assert.deepEqual(clone(app.gameState), active);
});

test('finishing and reopening a live round cannot duplicate its gate or wages', () => {
  app.gameState = game(); const fixture = app.gameState.rounds[0].matches.find(match => [match.homeId, match.awayId].includes(app.gameState.userTeamId));
  const teams = [fixture.homeId, fixture.awayId].map(id => app.gameState.divisionTeams.find(team => team.id === id));
  const match = Match.createMatch(...teams, { userSide: teams[0].id === app.gameState.userTeamId ? 0 : 1 }); match.roundIndex = 0;
  const rng = seeded(26); while (!match.finished) Match.stepMatch(match, ...teams, rng);
  app.finalizeRound(match); const before = clone(app.gameState); app.finalizeRound(match);
  assert.deepEqual(clone(app.gameState), before); assert.equal(Finance.overview(app.gameState.userTeam, 2026).season.entries.length, 1);
  assert.equal(reconcile(app.gameState.userTeam, 2026).closingBalance, app.gameState.userTeam.balance);
});

const projections = config.BRA.divisions.flatMap(division => {
  const rounds = League.generateSchedule(division.teams);
  return division.teams.map(id => Finance.project({ userTeam: database.find(team => team.id === id), rounds }));
});
fs.writeFileSync(path.join(__dirname, '../docs/finance-test-results.json'), JSON.stringify({ regressionGroups: cases,
  coverage: ['legacy opening balance', 'round reconciliation and idempotence', 'pure forecasts', 'transfer and loan accounting',
    'stadium costs and invalid inputs', 'prizes and reload', 'club ownership', 'five-season history', 'finance rendering and filters',
    'invalid entries', 'failed persistence', 'live-round finalization'], storage: 'isolated in-memory only', visualWebKitTest: false,
  economyScan: { freshDatabaseClubs: projections.length, negativeProjectedCash: projections.filter(result => result.projectedBalance < 0).length,
    assumptions: 'Full unplayed calendar; existing cash, wages, stadium and ticket price; central attendance; excludes prizes and future deals. No player save.' }
}, null, 2) + '\n');
console.log(`PASS: ${cases} club-finance regression groups.`);
