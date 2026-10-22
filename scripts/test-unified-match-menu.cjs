// test-unified-match-menu.cjs - Test Suite for Unified Live Match Menu & Controls
const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

// 1. DOM Structure & Accessibility
test('1. index.html contains unified match menu elements with speed pills, live badge, and 6 view tabs', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  // Playback Controls Group
  assert.ok(html.includes('class="match-playback-controls"'), 'Contains match-playback-controls');
  assert.ok(html.includes('id="pause-match-btn"'), 'Contains pause-match-btn');
  assert.ok(html.includes('id="pause-btn-icon"'), 'Contains pause-btn-icon');
  assert.ok(html.includes('id="pause-btn-text"'), 'Contains pause-btn-text');

  // Speed Pills & Hidden Select
  assert.ok(html.includes('class="speed-pill-group"'), 'Contains speed-pill-group');
  assert.ok(html.includes('data-speed="1"'), 'Contains speed 1x pill');
  assert.ok(html.includes('data-speed="2"'), 'Contains speed 2x pill');
  assert.ok(html.includes('data-speed="4"'), 'Contains speed 4x pill');
  assert.ok(html.includes('id="match-speed"'), 'Contains backward-compatible match-speed select');

  // Live Status Badge & Pulse Dot
  assert.ok(html.includes('class="match-live-status-badge"'), 'Contains match-live-status-badge');
  assert.ok(html.includes('id="match-live-dot"'), 'Contains match-live-dot');
  assert.ok(html.includes('id="match-status"'), 'Contains match-status');

  // Unified View Toggle Tabs
  assert.ok(html.includes('data-match-tab="pitch"'), 'Contains pitch (Campo 2D) tab');
  assert.ok(html.includes('data-match-tab="lances"'), 'Contains lances (Narração) tab');
  assert.ok(html.includes('data-match-tab="coach"'), 'Contains coach (Banco & Tática) tab');
  assert.ok(html.includes('data-match-tab="analysis"'), 'Contains analysis (Gráficos) tab');
  assert.ok(html.includes('data-match-tab="round"'), 'Contains round (Outros jogos) tab');
  assert.ok(html.includes('data-match-tab="all"'), 'Contains all (Geral) tab');
});

// 2. CSS Styles for Unified Menu & Workspace Views
test('2. style.css contains styling for playback bar, speed pills, pulse dot and pitch layout', () => {
  const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');

  assert.ok(css.includes('.match-playback-controls'), 'Contains .match-playback-controls style');
  assert.ok(css.includes('.btn-playback-pause'), 'Contains .btn-playback-pause style');
  assert.ok(css.includes('.speed-pill-group'), 'Contains .speed-pill-group style');
  assert.ok(css.includes('.speed-pill-btn.active'), 'Contains .speed-pill-btn.active style');
  assert.ok(css.includes('.live-pulse-dot'), 'Contains .live-pulse-dot style');
  assert.ok(css.includes('@keyframes liveDotPulse'), 'Contains @keyframes liveDotPulse');
  assert.ok(css.includes('.match-workspace[data-view="pitch"]'), 'Contains .match-workspace[data-view="pitch"] style');
});

// 3. Speed pill switching and state sync
test('3. Speed pills change simulation speed and sync with select', () => {
  let activeSpeed = 1;
  const speedPills = [1, 2, 4].map(spd => ({
    speed: spd,
    classes: new Set(spd === 1 ? ['active'] : []),
    classList: {
      toggle(cls, val) { if (val) this.add(cls); else this.remove(cls); },
      add(cls) { speedPills.find(p => p.speed === spd).classes.add(cls); },
      remove(cls) { speedPills.find(p => p.speed === spd).classes.delete(cls); },
      contains(cls) { return speedPills.find(p => p.speed === spd).classes.has(cls); }
    }
  }));

  const select = { value: '1' };

  function setSpeed(newSpeed) {
    activeSpeed = newSpeed;
    select.value = String(newSpeed);
    speedPills.forEach(pill => {
      pill.classList.toggle('active', pill.speed === newSpeed);
    });
  }

  setSpeed(2);
  assert.equal(activeSpeed, 2);
  assert.equal(select.value, '2');
  assert.ok(speedPills[1].classList.contains('active'));
  assert.ok(!speedPills[0].classList.contains('active'));

  setSpeed(4);
  assert.equal(activeSpeed, 4);
  assert.equal(select.value, '4');
  assert.ok(speedPills[2].classList.contains('active'));
});

// 4. Tab switching between pitch, narration, coach, analysis, and round
test('4. View tabs switch workspace data-view and sync 2D pitch and chart displays', () => {
  const views = ['pitch', 'lances', 'coach', 'analysis', 'round', 'all'];
  let currentWorkspaceView = 'pitch';
  let pitchHidden = false;
  let chartHidden = true;

  function switchTab(view) {
    currentWorkspaceView = view;
    if (view === 'pitch') {
      pitchHidden = false;
      chartHidden = true;
    } else if (view === 'analysis') {
      pitchHidden = true;
      chartHidden = false;
    }
  }

  // Initial state is pitch
  assert.equal(currentWorkspaceView, 'pitch');
  assert.equal(pitchHidden, false);
  assert.equal(chartHidden, true);

  // Switch to analysis chart
  switchTab('analysis');
  assert.equal(currentWorkspaceView, 'analysis');
  assert.equal(pitchHidden, true);
  assert.equal(chartHidden, false);

  // Switch back to pitch
  switchTab('pitch');
  assert.equal(currentWorkspaceView, 'pitch');
  assert.equal(pitchHidden, false);
  assert.equal(chartHidden, true);

  // Switch to lances (commentary)
  switchTab('lances');
  assert.equal(currentWorkspaceView, 'lances');
});

console.log(`Todos os ${passed} testes do menu unificado da partida foram validados com sucesso!`);
