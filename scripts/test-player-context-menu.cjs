// test-player-context-menu.cjs - Test right-click context menu and transfer option
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Career = require('../src/engine/career.js');
const League = require('../src/engine/league.js');
const Squad = require('../src/engine/squad.js');
const Match = require('../src/engine/match.js');
const Finance = require('../src/engine/finance.js');
const Economy = require('../src/engine/economy.js');
const Contracts = require('../src/engine/contracts.js');
const Market = require('../src/engine/market.js');
const database = require('../data/teams.json');
const config = require('../data/leagues.json');

const clone = value => JSON.parse(JSON.stringify(value));

function createGameState() {
  const division = config.BRA.divisions[0];
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
  Contracts.ensureState(state);
  Economy.ensure(state);
  return state;
}

let testCases = 0;
function test(name, fn) {
  fn();
  testCases++;
  console.log('PASS: ' + name);
}

// Mock DOM factory
function createMockDOM() {
  const elements = new Map();

  function makeEl(id = '') {
    const listeners = new Map();
    const children = [];
    let _className = '';
    const classListObj = {
      classes: new Set(),
      add(c) { this.classes.add(c); _className = [...this.classes].join(' '); },
      remove(c) { this.classes.delete(c); _className = [...this.classes].join(' '); },
      toggle(c, force) {
        if (force !== undefined) {
          if (force) this.classes.add(c); else this.classes.delete(c);
        } else {
          if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c);
        }
        _className = [...this.classes].join(' ');
      },
      contains(c) { return this.classes.has(c); }
    };
    return {
      id,
      get className() { return _className; },
      set className(val) {
        _className = val || '';
        classListObj.classes = new Set(String(val).trim().split(/\s+/).filter(Boolean));
      },
      textContent: '',
      value: '',
      innerHTML: '',
      style: {},
      offsetWidth: 240,
      offsetHeight: 180,
      classList: classListObj,
      children,
      appendChild(child) { children.push(child); return child; },
      replaceChildren(...newChildren) { children.length = 0; if (newChildren.length) children.push(...newChildren); },
      querySelectorAll(selector) {
        const found = [];
        for (const child of children) {
          if (selector === 'button' && child.tagName === 'BUTTON') found.push(child);
          if (child.querySelectorAll) found.push(...child.querySelectorAll(selector));
        }
        return found;
      },
      addEventListener(event, handler) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(handler);
      },
      dispatchEvent(event) {
        const list = listeners.get(event.type || event);
        if (list) for (const handler of list) handler(event);
      },
      getBoundingClientRect() { return { top: 100, left: 100, right: 200, bottom: 150, width: 100, height: 50 }; },
      focus() {}
    };
  }

  function getOrCreate(id) {
    if (!elements.has(id)) {
      elements.set(id, makeEl(id));
    }
    return elements.get(id);
  }

  const documentListeners = new Map();

  return {
    getOrCreate,
    document: {
      getElementById(id) { return getOrCreate(id); },
      querySelector(sel) { return getOrCreate(sel.replace(/^[#.]/, '')); },
      querySelectorAll() { return []; },
      createElement(tag) {
        const el = makeEl();
        el.tagName = tag.toUpperCase();
        return el;
      },
      documentElement: { style: { setProperty() {} } },
      addEventListener(type, handler) {
        if (!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type).push(handler);
      },
      dispatchEvent(event) {
        const list = documentListeners.get(event.type || event);
        if (list) for (const handler of list) handler(event);
      }
    }
  };
}

// 1. openPlayerContextMenu on own team player
test('1. openPlayerContextMenu displays transfer, loan, renew and release options for own club player', () => {
  const { document, getOrCreate } = createMockDOM();
  const state = createGameState();
  const player = state.userTeam.players[0];

  const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
    SaveStore: require('../src/engine/storage.js'),
    EconomyEngine: Economy,
    ContractsEngine: Contracts,
    window: { innerWidth: 1280, innerHeight: 720, addEventListener() {} },
    console,
    CareerEngine: Career,
    BoardEngine: Career.BoardEngine,
    MatchEngine: Match,
    SquadEngine: Squad,
    FinanceEngine: Finance,
    MarketEngine: Market,
    PerformanceEngine: require('../src/engine/performance.js'),
    TacticsEngine: require('../src/engine/tactics.js'),
    document,
    localStorage: { setItem() {}, getItem() { return null; } }
  });

  app.gameState = state;
  app.allTeams = clone(database);

  app.openPlayerContextMenu(player, state.userTeam, 200, 300);

  const menu = getOrCreate('player-context-menu');
  assert.equal(menu.style.display, 'block', 'Menu is visible');
  assert.equal(menu.style.left, '200px');
  assert.equal(menu.style.top, '300px');

  const nameEl = getOrCreate('ctx-player-name');
  assert.ok(nameEl.textContent.includes(player.name), 'Player name is rendered');

  const actions = getOrCreate('ctx-player-actions');
  assert.equal(actions.children.length, 4, 'Own player menu has 4 options');

  const transferBtn = actions.children[0];
  assert.ok(transferBtn.innerHTML.includes('Transferir jogador'), 'First option is Transferir jogador');
  assert.ok(transferBtn.classList.contains('primary-action'), 'Transferir is highlighted as primary action');

  const loanBtn = actions.children[1];
  assert.ok(loanBtn.innerHTML.includes('Emprestar jogador'), 'Second option is Emprestar jogador');

  const renewBtn = actions.children[2];
  assert.ok(renewBtn.innerHTML.includes('Renovar contrato'), 'Third option is Renovar contrato');

  const releaseBtn = actions.children[3];
  assert.ok(releaseBtn.innerHTML.includes('Rescindir contrato'), 'Fourth option is Rescindir contrato');
});

// 2. Clicking transfer option opens transfer modal
test('2. Clicking "Transferir jogador" closes context menu and triggers openTransfer', () => {
  const { document, getOrCreate } = createMockDOM();
  const state = createGameState();
  const player = state.userTeam.players[0];

  const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
    SaveStore: require('../src/engine/storage.js'),
    EconomyEngine: Economy,
    ContractsEngine: Contracts,
    window: { innerWidth: 1280, innerHeight: 720, addEventListener() {} },
    console,
    CareerEngine: Career,
    BoardEngine: Career.BoardEngine,
    MatchEngine: Match,
    SquadEngine: Squad,
    FinanceEngine: Finance,
    MarketEngine: Market,
    PerformanceEngine: require('../src/engine/performance.js'),
    TacticsEngine: require('../src/engine/tactics.js'),
    document,
    localStorage: { setItem() {}, getItem() { return null; } }
  });

  app.gameState = state;
  app.allTeams = clone(database);

  let openedTransferType = null;
  let openedTransferPlayerId = null;
  app.openTransfer = (type, playerId) => {
    openedTransferType = type;
    openedTransferPlayerId = playerId;
  };

  app.openPlayerContextMenu(player, state.userTeam, 150, 250);

  const actions = getOrCreate('ctx-player-actions');
  const transferBtn = actions.children[0];

  // Click the transfer button
  transferBtn.dispatchEvent({ type: 'click' });

  const menu = getOrCreate('player-context-menu');
  assert.equal(menu.style.display, 'none', 'Context menu closed upon clicking transfer');
  assert.equal(openedTransferType, 'sell', 'openTransfer was invoked with sell');
  assert.equal(openedTransferPlayerId, player.id, 'openTransfer was invoked with the clicked player id');
});

// 3. openPlayerContextMenu on rival team player
test('3. openPlayerContextMenu on rival player presents Buy/Transfer and Loan options', () => {
  const { document, getOrCreate } = createMockDOM();
  const state = createGameState();
  const rivalTeam = state.divisionTeams[1];
  const rivalPlayer = rivalTeam.players[0];

  const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
    SaveStore: require('../src/engine/storage.js'),
    EconomyEngine: Economy,
    ContractsEngine: Contracts,
    window: { innerWidth: 1280, innerHeight: 720, addEventListener() {} },
    console,
    CareerEngine: Career,
    BoardEngine: Career.BoardEngine,
    MatchEngine: Match,
    SquadEngine: Squad,
    FinanceEngine: Finance,
    MarketEngine: Market,
    PerformanceEngine: require('../src/engine/performance.js'),
    TacticsEngine: require('../src/engine/tactics.js'),
    document,
    localStorage: { setItem() {}, getItem() { return null; } }
  });

  app.gameState = state;
  app.allTeams = clone(database);

  app.openPlayerContextMenu(rivalPlayer, rivalTeam, 400, 200);

  const actions = getOrCreate('ctx-player-actions');
  assert.equal(actions.children.length, 2, 'Rival player menu has 2 options (Buy & Loan)');

  const buyBtn = actions.children[0];
  assert.ok(buyBtn.innerHTML.includes('Comprar / Transferir'), 'First option is Comprar / Transferir');

  const loanBtn = actions.children[1];
  assert.ok(loanBtn.innerHTML.includes('Pedir por empréstimo'), 'Second option is Pedir por empréstimo');
});

// 4. Clamping logic keeps context menu within screen bounds
test('4. Coordinates clamping ensures context menu remains inside viewport bounds', () => {
  const { document, getOrCreate } = createMockDOM();
  const state = createGameState();
  const player = state.userTeam.players[0];

  const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
    SaveStore: require('../src/engine/storage.js'),
    EconomyEngine: Economy,
    ContractsEngine: Contracts,
    window: { innerWidth: 1000, innerHeight: 600, addEventListener() {} },
    console,
    CareerEngine: Career,
    BoardEngine: Career.BoardEngine,
    MatchEngine: Match,
    SquadEngine: Squad,
    FinanceEngine: Finance,
    MarketEngine: Market,
    PerformanceEngine: require('../src/engine/performance.js'),
    TacticsEngine: require('../src/engine/tactics.js'),
    document,
    localStorage: { setItem() {}, getItem() { return null; } }
  });

  app.gameState = state;
  app.allTeams = clone(database);

  // Attempt to open at far right/bottom edge: x = 990, y = 590
  app.openPlayerContextMenu(player, state.userTeam, 990, 590);

  const menu = getOrCreate('player-context-menu');
  const left = parseInt(menu.style.left, 10);
  const top = parseInt(menu.style.top, 10);

  assert.ok(left <= 1000 - 250, `left ${left} should be clamped to <= 750`);
  assert.ok(top <= 600 - 220, `top ${top} should be clamped to <= 380`);
});

// 5. closePlayerContextMenu hides menu
test('5. closePlayerContextMenu sets display none', () => {
  const { document, getOrCreate } = createMockDOM();
  const state = createGameState();
  const player = state.userTeam.players[0];

  const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
    SaveStore: require('../src/engine/storage.js'),
    EconomyEngine: Economy,
    ContractsEngine: Contracts,
    window: { innerWidth: 1280, innerHeight: 720, addEventListener() {} },
    console,
    CareerEngine: Career,
    BoardEngine: Career.BoardEngine,
    MatchEngine: Match,
    SquadEngine: Squad,
    FinanceEngine: Finance,
    MarketEngine: Market,
    PerformanceEngine: require('../src/engine/performance.js'),
    TacticsEngine: require('../src/engine/tactics.js'),
    document,
    localStorage: { setItem() {}, getItem() { return null; } }
  });

  app.gameState = state;
  app.allTeams = clone(database);

  app.openPlayerContextMenu(player, state.userTeam, 100, 100);
  const menu = getOrCreate('player-context-menu');
  assert.equal(menu.style.display, 'block');

  app.closePlayerContextMenu();
  assert.equal(menu.style.display, 'none');
});

console.log(`PASS: Todos os ${testCases} testes do menu de contexto e opções de transferência foram validados com sucesso!`);
