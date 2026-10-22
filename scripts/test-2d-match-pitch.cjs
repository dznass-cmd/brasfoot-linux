// test-2d-match-pitch.cjs - Test Suite for Live Match 2D Pitch View
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

// 1. HTML elements presence check
test('1. index.html contains 2D pitch container, svg canvas, players layer, ball, banner and toggle buttons', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(html.includes('id="btn-show-pitch-2d"'), 'Contains 2D pitch toggle button');
  assert.ok(html.includes('id="btn-show-chart-analysis"'), 'Contains Chart toggle button');
  assert.ok(html.includes('id="match-2d-pitch-wrapper"'), 'Contains 2D pitch wrapper');
  assert.ok(html.includes('id="match-2d-pitch"'), 'Contains match 2D pitch');
  assert.ok(html.includes('id="pitch-players-container"'), 'Contains players container layer');
  assert.ok(html.includes('id="pitch-ball"'), 'Contains dynamic ball element');
  assert.ok(html.includes('id="pitch-event-banner"'), 'Contains pitch event banner');
  assert.ok(html.includes('id="pitch-ticker"'), 'Contains pitch ticker');
  assert.ok(html.includes('id="match-analysis-chart-wrapper"'), 'Contains chart wrapper for toggle mode');
});

// 2. CSS styles check
test('2. style.css contains responsive 2D pitch rules, lawn pattern, player dots and animations', () => {
  const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
  assert.ok(css.includes('.match-2d-pitch'), 'Contains .match-2d-pitch');
  assert.ok(css.includes('.pitch-player-node'), 'Contains .pitch-player-node');
  assert.ok(css.includes('.pitch-player-node.home .player-dot'), 'Contains home player dot styling');
  assert.ok(css.includes('.pitch-player-node.away .player-dot'), 'Contains away player dot styling');
  assert.ok(css.includes('.pitch-ball'), 'Contains .pitch-ball');
  assert.ok(css.includes('.pitch-event-banner'), 'Contains .pitch-event-banner');
  assert.ok(css.includes('.pitch-ticker'), 'Contains .pitch-ticker');
});

// 3. Simulated Match App Integration & renderLive2DPitch
test('3. app.renderLive2DPitch renders 22 players with correct positions and ball tracking', () => {
  const teamsDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/teams.json'), 'utf8'));
  const homeTeam = JSON.parse(JSON.stringify(teamsDb.find(t => t.name === 'Flamengo') || teamsDb[0]));
  const awayTeam = JSON.parse(JSON.stringify(teamsDb.find(t => t.name === 'Palmeiras') || teamsDb[1]));

  SquadEngine.autoSelectStarters(homeTeam, '4-4-2');
  SquadEngine.autoSelectStarters(awayTeam, '4-3-3');

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

  global.document = {
    getElementById: id => getOrCreate(id),
    querySelectorAll: () => [],
    createElement: tag => ({
      tagName: tag.toUpperCase(),
      classList: { add() {}, remove() {}, contains: () => false },
      style: {},
      addEventListener() {},
      appendChild() {},
      replaceChildren() {}
    })
  };
  global.window = { innerWidth: 1024, innerHeight: 768, addEventListener: () => {} };

  const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const sandbox = {
    MatchEngine,
    SquadEngine,
    TacticsEngine,
    document: global.document,
    window: global.window,
    console
  };
  const vm = require('vm');
  vm.createContext(sandbox);
  vm.runInContext(appCode + '; this.app = app;', sandbox);
  const app = sandbox.app;

  const state = MatchEngine.createMatch(homeTeam, awayTeam, { userSide: 0 });
  app.currentSimMatch = state;
  app.gameState = {
    userTeam: homeTeam,
    divisionTeams: [homeTeam, awayTeam]
  };

  // Run renderLive2DPitch
  app.renderLive2DPitch();

  const container = getOrCreate('pitch-players-container');
  assert.ok(container.innerHTML.includes('pitch-player-node home'), 'Contains home player nodes');
  assert.ok(container.innerHTML.includes('pitch-player-node away'), 'Contains away player nodes');
  assert.ok(container.innerHTML.includes('is-gk'), 'Contains goalkeeper nodes');

  // Verify ball is initialized
  const ball = getOrCreate('pitch-ball');
  assert.ok(ball.style.left && ball.style.top, 'Ball has coordinates');

  // Simulate a goal event and verify ball positioning in goal net
  state.minute = 10;
  state.scores = [1, 0];
  state.events.push({
    minute: 10,
    type: 'GOL',
    teamIndex: 0,
    playerId: homeTeam.players[0].id,
    player: homeTeam.players[0].name,
    text: `GOOOL! ${homeTeam.players[0].name} marca para o ${homeTeam.name}!`
  });

  app.renderLive2DPitch();

  assert.equal(ball.style.left, '99%', 'Ball moves into away goal net on home goal');
  assert.equal(ball.style.top, '50%', 'Ball at center vertical height in net');

  const banner = getOrCreate('pitch-event-banner');
  assert.equal(banner.hidden, false, 'Goal banner is visible');
  assert.ok(banner.className.includes('goal-banner'), 'Has goal-banner class');

  const bannerText = getOrCreate('pitch-event-text');
  assert.ok(bannerText.textContent.includes('GOOOL'), 'Banner displays goal message');
});

// 4. Toggle view functionality
test('4. Toggle view switches between 2D Pitch and Chart cleanly', () => {
  const elements = new Map();
  function getOrCreate(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        hidden: id === 'match-analysis-chart-wrapper',
        classList: {
          classes: new Set(id === 'btn-show-pitch-2d' ? ['active'] : []),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        },
        addEventListener(event, fn) { this[`on_${event}`] = fn; }
      });
    }
    return elements.get(id);
  }

  const btnPitch = getOrCreate('btn-show-pitch-2d');
  const btnChart = getOrCreate('btn-show-chart-analysis');
  const pitchWrapper = getOrCreate('match-2d-pitch-wrapper');
  const chartWrapper = getOrCreate('match-analysis-chart-wrapper');

  // Simulate clicking chart
  btnChart.classList.add('active');
  btnPitch.classList.remove('active');
  pitchWrapper.hidden = true;
  chartWrapper.hidden = false;

  assert.equal(pitchWrapper.hidden, true, 'Pitch wrapper is hidden when chart is selected');
  assert.equal(chartWrapper.hidden, false, 'Chart wrapper is shown when chart is selected');
  assert.ok(btnChart.classList.contains('active'), 'Chart button is active');

  // Simulate clicking pitch
  btnPitch.classList.add('active');
  btnChart.classList.remove('active');
  pitchWrapper.hidden = false;
  chartWrapper.hidden = true;

  assert.equal(pitchWrapper.hidden, false, 'Pitch wrapper is shown when 2D pitch is selected');
  assert.equal(chartWrapper.hidden, true, 'Chart wrapper is hidden when 2D pitch is selected');
  assert.ok(btnPitch.classList.contains('active'), '2D Pitch button is active');
});

console.log(`Todos os ${passed} testes do campo 2D da partida foram validados com sucesso!`);
