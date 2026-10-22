// test-calculated-transfer-offers.cjs - Comprehensive Test Suite for Calculated Transfer Offers
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MarketEngine = require('../src/engine/market.js');
const EconomyEngine = require('../src/engine/economy.js');
const ContractsEngine = require('../src/engine/contracts.js');
const SquadEngine = require('../src/engine/squad.js');
const FinanceEngine = require('../src/engine/finance.js');
const PerformanceEngine = require('../src/engine/performance.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

const teamsDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/teams.json'), 'utf8'));

function createTestState() {
  const teams = JSON.parse(JSON.stringify(teamsDb.slice(0, 30)));
  const userTeam = teams.find(t => t.name === 'Flamengo') || teams[0];
  const divTeams = teams.slice(0, 20);
  if (!divTeams.some(t => t.id === userTeam.id)) divTeams[0] = userTeam;

  const state = {
    seasonYear: 2026,
    currentRound: 5,
    totalRounds: 38,
    userTeamId: userTeam.id,
    userTeam,
    divisionTeams: divTeams,
    reserveTeams: teams.slice(20, 30),
    marketClubs: [],
    marketState: { version: 1, offers: [], history: [], lastCheck: null, lastGenerated: null, nextId: 1 }
  };
  return { state, allTeams: teams };
}

// 1. calculateTransferOffers returns valid calculated offers
test('1. calculateTransferOffers produces calculated offers with proper metadata', () => {
  const { state, allTeams } = createTestState();
  const player = state.userTeam.players[0];
  const offers = MarketEngine.calculateTransferOffers(player, state, allTeams);

  assert.ok(Array.isArray(offers), 'Returns an array of offers');
  assert.ok(offers.length >= 1 && offers.length <= 4, `Offers count is between 1 and 4 (got ${offers.length})`);

  for (const offer of offers) {
    assert.ok(offer.id && offer.id.startsWith('calc_offer_'), 'Offer has calc_offer_ id');
    assert.equal(offer.status, 'pending', 'Status is pending');
    assert.equal(offer.playerId, player.id, 'Matches player id');
    assert.equal(offer.playerName, player.name, 'Matches player name');
    assert.equal(offer.forTeamId, state.userTeamId, 'Matches user team');
    assert.ok(offer.clubId && offer.clubName, 'Has buyer club details');
    assert.ok(['transfer', 'loan'].includes(offer.type), 'Type is transfer or loan');
    assert.ok(Number.isFinite(offer.amount) && offer.amount > 0, 'Amount is positive number');
    assert.ok(typeof offer.reason === 'string' && offer.reason.length > 10, 'Has detailed reason in Portuguese');
    assert.ok(offer.isCalculated === true, 'Flagged as calculated');
  }
});

// 2. Buyer clubs have sufficient balance and budget for their calculated offers
test('2. Buyer clubs have verified budget and balance to afford calculated offers', () => {
  const { state, allTeams } = createTestState();
  const player = state.userTeam.players.find(p => p.strength >= 50) || state.userTeam.players[0];
  const offers = MarketEngine.calculateTransferOffers(player, state, allTeams);

  for (const offer of offers) {
    const buyer = allTeams.find(t => t.id === offer.clubId) || state.divisionTeams.find(t => t.id === offer.clubId);
    assert.ok(buyer, 'Buyer club exists');
    assert.notEqual(buyer.id, state.userTeamId, 'Buyer is not user team');

    const budget = EconomyEngine.budget(state, buyer);
    assert.ok(buyer.balance >= offer.amount, `Buyer has balance (${buyer.balance}) >= offer amount (${offer.amount})`);
    assert.ok(budget.available >= offer.amount, `Buyer has budget (${budget.available}) >= offer amount (${offer.amount})`);
  }
});

// 3. calculateTransferOffers is idempotent within round and preserves existing pending offers
test('3. calculateTransferOffers is idempotent and avoids duplicate pending offers for same club', () => {
  const { state, allTeams } = createTestState();
  const player = state.userTeam.players[0];

  const firstCall = MarketEngine.calculateTransferOffers(player, state, allTeams);
  const firstCount = firstCall.length;
  const firstClubIds = firstCall.map(o => o.clubId);

  const secondCall = MarketEngine.calculateTransferOffers(player, state, allTeams);
  assert.equal(secondCall.length, firstCount, 'Call count remains stable');
  assert.deepEqual(secondCall.map(o => o.clubId), firstClubIds, 'Same clubs returned without duplicates');
});

// 4. Ineligible transfers are rejected (player on loan, only GK, squad <= 15)
test('4. Ineligible players generate no calculated offers', () => {
  const { state, allTeams } = createTestState();
  const player = state.userTeam.players[0];

  // Test loaned player
  player.loan = { ownerTeamId: 999, endYear: 2026 };
  const loanOffers = MarketEngine.calculateTransferOffers(player, state, allTeams);
  assert.equal(loanOffers.length, 0, 'Loaned player receives no transfer offers');
  delete player.loan;

  // Test squad minimum 15
  const originalSquad = [...state.userTeam.players];
  state.userTeam.players = state.userTeam.players.slice(0, 15);
  const smallSquadOffers = MarketEngine.calculateTransferOffers(state.userTeam.players[0], state, allTeams);
  assert.equal(smallSquadOffers.length, 0, 'Squad with <= 15 players receives no transfer offers');
  state.userTeam.players = originalSquad;

  // Test sole goalkeeper
  const gks = state.userTeam.players.filter(p => p.position === 'G');
  if (gks.length > 0) {
    const backupPlayers = state.userTeam.players.filter(p => p.position !== 'G');
    state.userTeam.players = [gks[0], ...backupPlayers];
    const soleGkOffers = MarketEngine.calculateTransferOffers(gks[0], state, allTeams);
    assert.equal(soleGkOffers.length, 0, 'Sole goalkeeper receives no transfer offers');
  }
});

// 5. Accepting a calculated offer executes smoothly through transact pipeline
test('5. Accepting a calculated offer completes transaction, updates finances and squad cleanly', () => {
  const { state, allTeams } = createTestState();
  const player = state.userTeam.players.find(p => p.strength >= 45 && p.position !== 'G') || state.userTeam.players[1];
  const initialUserBalance = state.userTeam.balance;
  const initialSquadCount = state.userTeam.players.length;

  const offers = MarketEngine.calculateTransferOffers(player, state, allTeams);
  assert.ok(offers.length > 0, 'Has calculated offers');
  const targetOffer = offers[0];

  const result = MarketEngine.transact(state, { type: 'accept', offerId: targetOffer.id }, allTeams);
  assert.ok(result.state, 'Returns next state');
  assert.ok(result.message.includes(player.name), 'Success message includes player name');

  // Verify offer status is accepted
  const updatedOffer = result.state.marketState.offers.find(o => o.id === targetOffer.id);
  assert.equal(updatedOffer.status, 'accepted', 'Offer is marked accepted');

  // Verify other offers for this player are withdrawn
  const otherOffers = result.state.marketState.offers.filter(o => o.playerId === player.id && o.id !== targetOffer.id);
  for (const o of otherOffers) {
    assert.equal(o.status, 'withdrawn', 'Other offers for player are withdrawn');
  }

  // Verify financial and roster impact
  if (targetOffer.type === 'transfer') {
    assert.equal(result.state.userTeam.balance, initialUserBalance + targetOffer.amount, 'User balance credited');
    assert.equal(result.state.userTeam.players.length, initialSquadCount - 1, 'Player removed from user squad');
    assert.ok(!result.state.userTeam.players.some(p => p.id === player.id), 'Player no longer in user squad');
  } else {
    assert.equal(result.state.userTeam.balance, initialUserBalance + targetOffer.amount, 'Loan fee credited');
    const playerInSquad = result.state.userTeam.players.find(p => p.id === player.id);
    assert.ok(playerInSquad && playerInSquad.loan, 'Player is marked as loaned');
  }
});

// 6. DOM UI Integration: openTransfer renders calculated section and cards
test('6. openTransfer renders calculated offers section with cards and action buttons', () => {
  // Setup minimal DOM mock
  const elements = new Map();
  function getOrCreate(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        tagName: 'DIV',
        hidden: false,
        style: {},
        value: '',
        textContent: '',
        innerHTML: '',
        children: [],
        replaceChildren() { this.children = []; this.innerHTML = ''; },
        appendChild(c) { this.children.push(c); },
        querySelector() { return null; },
        querySelectorAll(selector) {
          if (selector === '[data-calc-accept]') return [{ dataset: { calcAccept: 'calc_offer_1' }, addEventListener() {} }];
          if (selector === '[data-calc-select]') return [{ dataset: { calcSelect: 'calc_offer_1' }, addEventListener() {} }];
          return [];
        },
        addEventListener() {},
        focus() {},
        select() {}
      });
    }
    return elements.get(id);
  }

  global.document = {
    getElementById: id => getOrCreate(id),
    createElement: tag => ({
      tagName: tag.toUpperCase(),
      classList: { add() {}, remove() {}, contains: () => false },
      style: {},
      addEventListener() {},
      appendChild() {},
      replaceChildren() {}
    })
  };
  global.window = {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  // Load app
  const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const sandbox = {
    MarketEngine,
    EconomyEngine,
    ContractsEngine,
    SquadEngine,
    FinanceEngine,
    PerformanceEngine,
    document: global.document,
    window: global.window,
    console
  };
  const vm = require('vm');
  vm.createContext(sandbox);
  vm.runInContext(appCode + '; this.app = app;', sandbox);
  const app = sandbox.app;

  const { state, allTeams } = createTestState();
  app.gameState = state;
  app.allTeams = allTeams;

  const player = state.userTeam.players[0];

  // Call openTransfer('sell', player.id)
  app.openTransfer('sell', player.id);

  const calcSection = getOrCreate('transfer-calculated-section');
  assert.equal(calcSection.hidden, false, 'Calculated section is visible for outgoing transfer');

  const calcList = getOrCreate('transfer-calculated-list');
  assert.ok(calcList.innerHTML.includes('transfer-calculated-card'), 'Renders calculated offer cards');
  assert.ok(calcList.innerHTML.includes('btn-calc-accept'), 'Renders accept buttons');
  assert.ok(calcList.innerHTML.includes('btn-calc-select'), 'Renders counter-proposal buttons');
  assert.ok(calcList.innerHTML.includes('calc-badge'), 'Renders offer badges');

  // Verify buying hides calculated section
  const rivalClub = allTeams.find(t => t.id !== state.userTeamId);
  const rivalPlayer = rivalClub.players[0];
  app.openTransfer('buy', rivalPlayer.id, rivalClub.id);
  assert.equal(calcSection.hidden, true, 'Calculated section is hidden when buying a player');
});

console.log(`Todos os ${passed} testes de ofertas calculadas de transferência foram validados com sucesso!`);
