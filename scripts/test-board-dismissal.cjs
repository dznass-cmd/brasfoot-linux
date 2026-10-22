// test-board-dismissal.cjs - Board performance, confidence tracking, and manager dismissal
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

const BoardEngine = Career.BoardEngine;

const clone = value => JSON.parse(JSON.stringify(value));

function createGameState(divisionIndex = 0) {
  const division = config.BRA.divisions[divisionIndex];
  const teams = division.teams.map(id => Squad.autoSelectStarters(clone(database.find(t => t.id === id))));
  const state = {
    userTeam: teams[0],
    userTeamId: teams[0].id,
    divisionTeams: teams,
    rounds: League.generateSchedule(division.teams),
    divisionId: division.id,
    divisionName: division.name,
    seasonYear: 2026,
    currentRound: 1,
    totalRounds: 38
  };
  Career.ensureState(state, config, database);
  return state;
}

function simulateRounds(state, count, userResult = 'W') {
  const userTeamId = state.userTeamId;
  for (let r = 0; r < count && r < state.rounds.length; r++) {
    const round = state.rounds[r];
    round.isFinished = true;
    for (const match of round.matches) {
      match.isPlayed = true;
      if (match.homeId === userTeamId) {
        if (userResult === 'W') { match.homeScore = 2; match.awayScore = 0; }
        else if (userResult === 'L') { match.homeScore = 0; match.awayScore = 2; }
        else { match.homeScore = 1; match.awayScore = 1; }
      } else if (match.awayId === userTeamId) {
        if (userResult === 'W') { match.homeScore = 0; match.awayScore = 2; }
        else if (userResult === 'L') { match.homeScore = 2; match.awayScore = 0; }
        else { match.homeScore = 1; match.awayScore = 1; }
      } else {
        match.homeScore = 1; match.awayScore = 0;
      }
    }
  }
  state.currentRound = count + 1;
}

let testCases = 0;
function test(name, fn) {
  fn();
  testCases++;
  console.log('PASS: ' + name);
}

// 1. Board Expectations
test('1. Board expectations reflect squad strength ranking in top and lower divisions', () => {
  const stateA = createGameState(0); // Serie A
  const expA = BoardEngine.expectation(stateA, stateA.userTeamId);
  assert.ok(expA.targetPosition >= 1 && expA.targetPosition <= 16);
  assert.ok(typeof expA.label === 'string' && expA.label.length > 0);
  assert.ok(['title_g4', 'continental', 'midtable', 'survival'].includes(expA.type));

  const stateB = createGameState(1); // Serie B
  const expB = BoardEngine.expectation(stateB, stateB.userTeamId);
  assert.ok(expB.targetPosition >= 1);
  assert.ok(['promotion', 'midtable', 'survival'].includes(expB.type));
});

// 2. Evaluation and Grace Period
test('2. Early season rounds (1-4) have grace period protecting manager confidence', () => {
  const state = createGameState(0);
  simulateRounds(state, 3, 'L'); // 3 consecutive losses
  const evaluation = BoardEngine.evaluate(state);
  assert.equal(evaluation.played, 3);
  assert.equal(evaluation.lost, 3);
  assert.ok(evaluation.score >= 45, `Early round score should be at least 45, got ${evaluation.score}`);
  assert.equal(evaluation.canBeDismissed, false, 'Manager cannot be dismissed during grace period (played <= 4)');
});

// 3. Winning Streak Confidence
test('3. Winning streak boosts board confidence to high ratings', () => {
  const state = createGameState(0);
  simulateRounds(state, 6, 'W'); // 6 consecutive wins
  const evaluation = BoardEngine.evaluate(state);
  assert.equal(evaluation.played, 6);
  assert.equal(evaluation.won, 6);
  assert.ok(evaluation.score >= 80, `Winning streak should give high score, got ${evaluation.score}`);
  assert.ok(['inabalavel', 'muito_boa'].includes(evaluation.status));
  assert.equal(evaluation.threatened, false);
  assert.equal(evaluation.canBeDismissed, false);
});

// 4. Slump, Z4 and Dismissal Threshold
test('4. Severe losing slump after round 5 triggers threatened status and dismissal readiness', () => {
  const state = createGameState(0);
  state.userTeam.balance = -2500000; // Negative balance penalty
  simulateRounds(state, 8, 'L'); // 8 consecutive losses
  const evaluation = BoardEngine.evaluate(state);
  assert.equal(evaluation.played, 8);
  assert.equal(evaluation.lost, 8);
  assert.ok(evaluation.score < 20, `Score after 8 losses and bad finances should be < 20, got ${evaluation.score}`);
  assert.equal(evaluation.status, 'demissao');
  assert.equal(evaluation.threatened, true);
  assert.equal(evaluation.canBeDismissed, true, 'Manager should be eligible for dismissal after 8 losses');
});

// 5. Recovery Win Protection
test('5. Manager is NOT dismissed immediately following a victory, even if overall confidence is low', () => {
  const state = createGameState(0);
  simulateRounds(state, 7, 'L'); // 7 losses
  // Round 8: user wins
  const r8 = state.rounds[7];
  r8.isFinished = true;
  for (const m of r8.matches) {
    m.isPlayed = true;
    if (m.homeId === state.userTeamId) { m.homeScore = 3; m.awayScore = 0; }
    else if (m.awayId === state.userTeamId) { m.homeScore = 0; m.awayScore = 3; }
    else { m.homeScore = 1; m.awayScore = 0; }
  }
  state.currentRound = 9;

  const evaluation = BoardEngine.evaluate(state);
  assert.equal(evaluation.played, 8);
  assert.equal(evaluation.won, 1);
  assert.equal(evaluation.canBeDismissed, false, 'Winning the latest match protects manager from dismissal');
});

// 6. Dismissal Offers Generation
test('6. generateDismissalOffers produces up to 3 viable rival clubs', () => {
  const state = createGameState(0);
  const offers = BoardEngine.generateDismissalOffers(state);
  assert.ok(Array.isArray(offers));
  assert.ok(offers.length > 0 && offers.length <= 3);
  for (const offer of offers) {
    assert.ok(offer.teamId !== state.userTeamId, 'Dismissal offer cannot be from the current club');
    assert.ok(typeof offer.teamName === 'string' && offer.teamName.length > 0);
    assert.ok(typeof offer.divisionName === 'string');
    assert.ok(typeof offer.reason === 'string');
    assert.ok(offer.shield);
  }
});

// 7. Applying Dismissal and Career Transition
test('7. applyDismissal terminates old contract as dismissed and starts fresh tenure at new club', () => {
  const state = createGameState(0);
  simulateRounds(state, 6, 'L');
  const offers = BoardEngine.generateDismissalOffers(state);
  const chosenOffer = offers[0];

  const profileBefore = Career.ensureProfile(state);
  assert.equal(profileBefore.tenures.length, 1);

  const nextState = BoardEngine.applyDismissal(state, chosenOffer.teamId);
  const profileAfter = nextState.managerProfile;

  assert.equal(profileAfter.tenures.length, 2);
  const dismissedTenure = profileAfter.tenures[0];
  assert.equal(dismissedTenure.status, 'dismissed');
  assert.equal(dismissedTenure.toYear, nextState.seasonYear);
  assert.ok(dismissedTenure.reason.includes('Rescisão'));

  const newTenure = profileAfter.tenures[1];
  assert.equal(newTenure.teamId, chosenOffer.teamId);
  assert.equal(newTenure.toYear, null);

  assert.equal(nextState.userTeamId, chosenOffer.teamId);
  assert.equal(nextState.userTeam.id, chosenOffer.teamId);
  assert.equal(nextState.userTeam.manager, profileAfter.name);
});

// 8. UI Integration (app.js in VM environment)
test('8. app.js handles checkManagerDismissal, showDismissalModal, and acceptDismissalOffer', () => {
  const domElements = new Map();
  function getOrCreateElement(id) {
    if (!domElements.has(id)) {
      domElements.set(id, {
        id,
        textContent: '',
        value: '',
        innerHTML: '',
        style: {},
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          toggle(c, force) { if (force !== undefined) { if (force) this.classes.add(c); else this.classes.delete(c); } else { if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c); } },
          contains(c) { return this.classes.has(c); }
        },
        querySelectorAll() { return []; },
        addEventListener() {}
      });
    }
    return domElements.get(id);
  }

  const store = new Map();
  const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
    SaveStore: require('../src/engine/storage.js'),
    EconomyEngine: require('../src/engine/economy.js'),
    ContractsEngine: require('../src/engine/contracts.js'),
    window: { addEventListener() {} },
    console,
    CareerEngine: Career,
    BoardEngine: BoardEngine,
    MatchEngine: Match,
    SquadEngine: Squad,
    FinanceEngine: Finance,
    MarketEngine: require('../src/engine/market.js'),
    PerformanceEngine: require('../src/engine/performance.js'),
    TacticsEngine: require('../src/engine/tactics.js'),
    document: {
      getElementById(id) { return getOrCreateElement(id); },
      querySelector(sel) { return getOrCreateElement(sel); },
      querySelectorAll() { return []; },
      documentElement: { style: { setProperty() {} } }
    },
    localStorage: { setItem(key, val) { store.set(key, val); }, getItem(key) { return store.get(key); } }
  });

  app.showToast = () => {};
  app.onGameLoaded = () => {};
  app.showView = () => {};
  app.refreshUI = () => {};
  app.assetPath = (folder, file) => `assets/${folder}/${file}`;

  const state = createGameState(0);
  app.gameState = state;

  // Render sidebar updates board confidence
  app.renderClubSidebar();
  const fill = getOrCreateElement('board-confidence-fill');
  assert.ok(fill.style.width, 'Sidebar confidence bar width was set');
  const pct = getOrCreateElement('board-confidence-pct');
  assert.ok(pct.textContent.includes('%'), 'Sidebar confidence percentage was set');

  // Trigger dismissal conditions
  simulateRounds(app.gameState, 8, 'L');
  app.gameState.userTeam.balance = -3000000;
  const dismissed = app.checkManagerDismissal();
  assert.equal(dismissed, true, 'checkManagerDismissal returned true under crisis');

  const modal = getOrCreateElement('dismissal-modal');
  assert.equal(modal.style.display, 'flex', 'Dismissal modal opened');

  const statement = getOrCreateElement('dismissal-statement');
  assert.ok(statement.textContent.includes('rescisão') || statement.textContent.includes('encerrou'), 'Dismissal communiqué populated');

  // Accept job offer
  const offers = BoardEngine.generateDismissalOffers(app.gameState);
  assert.ok(offers.length > 0);
  app.acceptDismissalOffer(offers[0].teamId);

  assert.equal(modal.style.display, 'none', 'Dismissal modal closed upon taking new job');
  assert.equal(app.gameState.userTeamId, offers[0].teamId, 'User team changed to newly accepted club');
});

console.log(`PASS: Todos os ${testCases} grupos de teste de avaliação da diretoria e demissão foram validados com sucesso!`);
