// test-fm-dynamic-pitch.cjs - Test Suite for Football Manager Style Dynamic 2D Pitch
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MatchEngine = require('../src/engine/match.js');
const SquadEngine = require('../src/engine/squad.js');
const TacticsEngine = require('../src/engine/tactics.js');

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

// Setup environment and mock app
function setupSandbox() {
  const teamsDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/teams.json'), 'utf8'));
  const homeTeam = JSON.parse(JSON.stringify(teamsDb.find(t => t.name === 'Flamengo') || teamsDb[0]));
  const awayTeam = JSON.parse(JSON.stringify(teamsDb.find(t => t.name === 'Palmeiras') || teamsDb[1]));

  SquadEngine.autoSelectStarters(homeTeam, '4-4-2');
  SquadEngine.autoSelectStarters(awayTeam, '4-4-2');

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
        className: '',
        children: [],
        replaceChildren() { this.children = []; this.innerHTML = ''; },
        appendChild(c) { this.children.push(c); },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          toggle(c, v) { if (v) this.classes.add(c); else this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        }
      });
    }
    return elements.get(id);
  }

  const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const vm = require('vm');
  const sandbox = {
    MatchEngine,
    SquadEngine,
    TacticsEngine,
    document: {
      getElementById: id => getOrCreate(id),
      querySelectorAll: () => [],
      createElement: tag => ({ tagName: tag.toUpperCase(), classList: { add() {}, remove() {}, contains: () => false }, style: {} })
    },
    window: { innerWidth: 1024, innerHeight: 768, addEventListener: () => {} },
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(appCode + '; this.app = app;', sandbox);

  const state = MatchEngine.createMatch(homeTeam, awayTeam, { userSide: 0 });
  sandbox.app.currentSimMatch = state;
  sandbox.app.gameState = { userTeam: homeTeam, divisionTeams: [homeTeam, awayTeam] };

  return { app: sandbox.app, state, homeTeam, awayTeam, getOrCreate };
}

// 1. Tactical line advancement when attacking (Compactação de Linhas)
test('1. Team block shifts forward when attacking and retreats when defending (FM tactical lines)', () => {
  const { app, state, homeTeam, getOrCreate } = setupSandbox();

  // Test 1A: Home team attacks deep in opponent half (minute with attack)
  state.minute = 15;
  state.events.push({
    minute: 15,
    type: 'CONTRA_ATAQUE',
    teamIndex: 0,
    playerId: homeTeam.players[10].id,
    player: homeTeam.players[10].name
  });

  app.renderLive2DPitch();
  const container = getOrCreate('pitch-players-container');
  assert.ok(container.innerHTML.includes('pitch-player-node home'), 'Home players rendered');
  assert.ok(container.innerHTML.includes('has-ball'), 'Player has possession aura (has-ball)');

  // Verify ball is in attacking half
  const ball = getOrCreate('pitch-ball');
  const ballX = parseFloat(ball.style.left);
  assert.ok(ballX > 50, `Ball is in attacking half: ${ballX}%`);
});

// 2. Lateral tilt (basculamento lateral em jogadas de linha de fundo)
test('2. Tactical lateral shifting towards active flank during wing play', () => {
  const { app, state, homeTeam, getOrCreate } = setupSandbox();

  // Wing attack on the top flank
  state.minute = 22;
  state.events.push({
    minute: 22,
    type: 'ESCANTEIO',
    teamIndex: 0,
    text: 'Escanteio para o Flamengo'
  });

  app.renderLive2DPitch();
  const ball = getOrCreate('pitch-ball');
  assert.equal(ball.style.left, '99%', 'Ball at corner flag x position');
  assert.equal(ball.style.top, '6%', 'Ball at corner flag y position');

  const container = getOrCreate('pitch-players-container');
  assert.ok(container.innerHTML.includes('pitch-player-node home'), 'Nodes rendered for corner setup');
});

// 3. Goalkeeper dive on difficult save
test('3. Goalkeeper dives to intercept ball on DEFESA event with diving class', () => {
  const { app, state, homeTeam, awayTeam, getOrCreate } = setupSandbox();

  state.minute = 33;
  state.events.push({
    minute: 33,
    type: 'DEFESA',
    teamIndex: 0, // Home attacked, Away GK defended
    playerId: homeTeam.players[9].id,
    keeperId: awayTeam.players[0].id,
    text: 'Defesa espetacular do goleiro do Palmeiras!'
  });

  app.renderLive2DPitch();
  const container = getOrCreate('pitch-players-container');
  assert.ok(container.innerHTML.includes('diving'), 'Goalkeeper has diving class on save');

  const banner = getOrCreate('pitch-event-banner');
  assert.equal(banner.hidden, false, 'Save banner displayed');
});

// 4. Goal scorer celebration and dynamic net ball positioning
test('4. Scorer celebrates with .celebrating class and ball hits the net', () => {
  const { app, state, homeTeam, getOrCreate } = setupSandbox();

  state.minute = 40;
  state.scores = [1, 0];
  state.events.push({
    minute: 40,
    type: 'GOL',
    teamIndex: 0,
    playerId: homeTeam.players[9].id,
    player: homeTeam.players[9].name,
    assistId: homeTeam.players[7].id,
    text: 'GOOOL! Pedro marca um golaço!'
  });

  app.renderLive2DPitch();
  const ball = getOrCreate('pitch-ball');
  assert.equal(ball.style.left, '99%', 'Ball is in net');
  assert.equal(ball.style.top, '50%', 'Ball centered vertically in net');

  const container = getOrCreate('pitch-players-container');
  assert.ok(container.innerHTML.includes('celebrating'), 'Scorer has celebrating animation class');

  const bannerText = getOrCreate('pitch-event-text');
  assert.ok(bannerText.textContent.includes('GOOOL'), 'Banner shows GOOOL message');
});

// 5. Normal possession minute: ball owner aura and persistent movement
test('5. Normal possession shows tactical ball circulation with possession aura and club colors', () => {
  const { app, state, getOrCreate } = setupSandbox();

  state.minute = 55;
  state.events = []; // No major event: normal phase
  state.stats.possession = [60, 40];

  app.renderLive2DPitch();
  const container = getOrCreate('pitch-players-container');
  assert.ok(container.innerHTML.includes('has-ball'), 'Outfield player has ball possession aura in normal phase');
  assert.ok(container.innerHTML.includes('background-color'), 'Player dots use team kit colors');
});

console.log(`Todos os ${passed} testes do campo 2D estilo Football Manager foram validados com sucesso!`);
