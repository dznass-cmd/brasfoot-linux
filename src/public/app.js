// app.js - Brasfoot Linux Frontend Client

const app = {
  gameState: null,
  leaguesConfig: null,
  allTeams: [],
  selectedPlayerIdx: null,
  soundEnabled: true,
  matchSimulationInterval: null,

  async init() {
    this.bindEvents();
    await this.loadInitialData();
    await this.checkActiveGame();
  },

  bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.tab;
        document.getElementById(target).classList.add('active');
        if (target === 'tactics-tab') this.renderTacticalPitch();
      });
    });

    // Sub Navigation (inside Standings tab)
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sub-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.sub).classList.add('active');
      });
    });

    // Division Filter in New Game modal
    document.getElementById('division-filter').addEventListener('change', (e) => {
      this.renderTeamSelectionGrid(e.target.value);
    });

    // Play Round Button
    document.getElementById('play-round-btn').addEventListener('click', () => {
      this.playRound();
    });

    // Save Game Button
    document.getElementById('save-game-btn').addEventListener('click', () => {
      this.saveGame();
    });

    // Load Game Button
    document.getElementById('load-saved-game-btn').addEventListener('click', () => {
      this.loadGame();
    });

    // Sound Toggle
    document.getElementById('sound-toggle-btn').addEventListener('click', () => {
      this.soundEnabled = !this.soundEnabled;
      document.getElementById('sound-toggle-btn').textContent = this.soundEnabled ? '🔊' : '🔇';
      this.showToast(this.soundEnabled ? 'Sons ativados' : 'Sons desativados');
    });

    // Auto Select Squad
    document.getElementById('auto-select-squad-btn').addEventListener('click', async () => {
      const res = await fetch('/api/game/tactics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formation: this.gameState.userTeam.formation || '4-4-2' })
      });
      const data = await res.json();
      if (data.success) {
        this.gameState.userTeam = data.team;
        this.renderSquad();
        this.renderTacticalPitch();
        this.showToast('Melhores jogadores escalados!');
      }
    });

    // Tactics Changes
    document.getElementById('formation-select').addEventListener('change', async (e) => {
      const formation = e.target.value;
      const res = await fetch('/api/game/tactics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formation })
      });
      const data = await res.json();
      if (data.success) {
        this.gameState.userTeam = data.team;
        this.renderSquad();
        this.renderTacticalPitch();
      }
    });

    document.getElementById('style-select').addEventListener('change', async (e) => {
      const tacticStyle = e.target.value;
      await fetch('/api/game/tactics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tacticStyle })
      });
      this.gameState.userTeam.tacticStyle = tacticStyle;
      this.updateTacticsPower();
    });

    // Ticket Price Slider
    const ticketSlider = document.getElementById('ticket-price-slider');
    ticketSlider.addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('ticket-price-val').textContent = `R$ ${val}`;
    });
    ticketSlider.addEventListener('change', async (e) => {
      const price = Number(e.target.value);
      await fetch('/api/game/ticket-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price })
      });
      this.gameState.userTeam.ticketPrice = price;
      this.updateFinanceSummary();
      this.showToast(`Preço do ingresso atualizado para R$ ${price}`);
    });

    // Market Search
    document.getElementById('market-search-btn').addEventListener('click', () => {
      this.searchMarket();
    });

    // Skip Match Simulation
    document.getElementById('skip-match-btn').addEventListener('click', () => {
      this.skipMatchSimulation();
    });

    // Close Match Modal
    document.getElementById('close-match-btn').addEventListener('click', () => {
      document.getElementById('match-modal').style.display = 'none';
      this.refreshUI();
    });
  },

  async loadInitialData() {
    try {
      const [teamsRes, leaguesRes] = await Promise.all([
        fetch('/api/teams?countryId=29'),
        fetch('/api/leagues')
      ]);
      this.allTeams = await teamsRes.json();
      this.leaguesConfig = await leaguesRes.json();
      this.renderTeamSelectionGrid('BRA_A');
    } catch (e) {
      console.error('Erro ao carregar dados iniciais:', e);
    }
  },

  renderTeamSelectionGrid(divisionId) {
    const grid = document.getElementById('teams-selection-grid');
    grid.innerHTML = '';
    const division = this.leaguesConfig.BRA.divisions.find(d => d.id === divisionId);
    if (!division) return;

    const divTeamIds = division.teams;
    const teams = this.allTeams.filter(t => divTeamIds.includes(t.id));
    teams.sort((a, b) => b.tier - a.tier);

    teams.forEach(t => {
      const card = document.createElement('div');
      card.className = 'team-card';
      card.innerHTML = `
        <img src="/assets/escudos/${t.shield}" alt="${t.name}" onerror="this.src='/assets/icons/escudo.png'">
        <div class="team-name">${t.name}</div>
        <div class="team-tier">Nível ${t.tier} • ${t.stadium}</div>
      `;
      card.addEventListener('click', () => this.startNewGame(t.id));
      grid.appendChild(card);
    });
  },

  async checkActiveGame() {
    try {
      const res = await fetch('/api/game/state');
      if (res.ok) {
        this.gameState = await res.json();
        this.onGameLoaded();
      }
    } catch (e) {}
  },

  async startNewGame(teamId) {
    try {
      const res = await fetch('/api/game/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId })
      });
      const data = await res.json();
      if (data.success) {
        this.gameState = data.gameState;
        this.onGameLoaded();
        this.showToast(`Temporada iniciada com o ${this.gameState.userTeam.name}!`);
      }
    } catch (e) {
      alert('Erro ao iniciar novo jogo: ' + e.message);
    }
  },

  onGameLoaded() {
    document.getElementById('new-game-modal').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    this.refreshUI();
  },

  refreshUI() {
    if (!this.gameState) return;
    const team = this.gameState.userTeam;

    // Header info
    document.getElementById('user-club-name').textContent = team.name;
    document.getElementById('user-club-stadium').textContent = `${team.stadium} (${team.capacity.toLocaleString('pt-BR')} lug.)`;
    document.getElementById('user-club-shield').src = `/assets/escudos/${team.shield}`;
    document.getElementById('user-club-shield').onerror = () => {
      document.getElementById('user-club-shield').src = '/assets/icons/escudo.png';
    };
    document.getElementById('user-division').textContent = this.gameState.divisionName;
    document.getElementById('current-round-text').textContent = `${this.gameState.currentRound} / ${this.gameState.totalRounds}`;
    document.getElementById('user-balance').textContent = `R$ ${team.balance.toLocaleString('pt-BR')}`;

    // Controls
    document.getElementById('formation-select').value = team.formation || '4-4-2';
    document.getElementById('style-select').value = team.tacticStyle || 'Equilibrado';
    document.getElementById('ticket-price-slider').value = team.ticketPrice || 30;
    document.getElementById('ticket-price-val').textContent = `R$ ${team.ticketPrice || 30}`;

    // Renders
    this.renderSquad();
    this.renderTacticalPitch();
    this.renderStandings();
    this.renderTopScorers();
    this.renderRoundFixtures();
    this.renderStadiumTab();
    this.updateTacticsPower();
    this.updateFinanceSummary();
  },

  renderSquad() {
    const tbody = document.getElementById('squad-tbody');
    tbody.innerHTML = '';
    const players = this.gameState.userTeam.players || [];

    players.forEach((p, idx) => {
      const tr = document.createElement('tr');
      const isStarter = idx < 11;
      tr.className = isStarter ? 'squad-starter' : 'squad-bench';
      if (this.selectedPlayerIdx === idx) tr.classList.add('squad-selected');

      const starIcon = p.isStar ? '⭐' : (p.isTopWorld ? '🌍' : '');
      const energyColor = p.energy > 80 ? '#22c55e' : (p.energy > 55 ? '#f59e0b' : '#ef4444');

      tr.innerHTML = `
        <td><strong>${idx + 1}</strong></td>
        <td><span class="pos-badge pos-${p.position}">${p.position}</span></td>
        <td><strong>${p.name}</strong> ${starIcon}</td>
        <td>${p.age}</td>
        <td><strong>${p.strength}</strong></td>
        <td>${p.cr1 || '-'}</td>
        <td>${p.cr2 || '-'}</td>
        <td>${p.side || 'C'}</td>
        <td>
          <div class="energy-bar-wrap">
            <div class="energy-bar-fill" style="width: ${p.energy}%; background-color: ${energyColor};"></div>
          </div>
          <span>${p.energy}%</span>
        </td>
        <td>${p.goals || 0}</td>
        <td>R$ ${(p.wage || 5000).toLocaleString('pt-BR')}</td>
        <td>R$ ${(p.value || 100000).toLocaleString('pt-BR')}</td>
      `;

      tr.addEventListener('click', () => this.handleSquadRowClick(idx));
      tbody.appendChild(tr);
    });
  },

  async handleSquadRowClick(idx) {
    if (this.selectedPlayerIdx === null) {
      this.selectedPlayerIdx = idx;
      this.renderSquad();
    } else if (this.selectedPlayerIdx === idx) {
      this.selectedPlayerIdx = null;
      this.renderSquad();
    } else {
      // Swap players
      const idx1 = this.selectedPlayerIdx;
      const idx2 = idx;
      this.selectedPlayerIdx = null;

      const res = await fetch('/api/game/swap-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idx1, idx2 })
      });
      const data = await res.json();
      if (data.success) {
        this.gameState.userTeam.players = data.players;
        this.renderSquad();
        this.renderTacticalPitch();
      }
    }
  },

  renderTacticalPitch() {
    const pitch = document.getElementById('tactical-pitch');
    pitch.innerHTML = '';
    const starters = (this.gameState.userTeam.players || []).slice(0, 11);
    const formation = this.gameState.userTeam.formation || '4-4-2';

    // Formation coordinates on the pitch (x%, y% from top)
    const positionsMap = {
      '4-4-2': [
        { x: 50, y: 88, pos: 'G' }, // GK
        { x: 16, y: 70, pos: 'LE' }, { x: 38, y: 72, pos: 'Z' }, { x: 62, y: 72, pos: 'Z' }, { x: 84, y: 70, pos: 'LD' },
        { x: 18, y: 44, pos: 'M' }, { x: 38, y: 46, pos: 'M' }, { x: 62, y: 46, pos: 'M' }, { x: 82, y: 44, pos: 'M' },
        { x: 36, y: 18, pos: 'A' }, { x: 64, y: 18, pos: 'A' }
      ],
      '4-3-3': [
        { x: 50, y: 88, pos: 'G' },
        { x: 16, y: 70, pos: 'LE' }, { x: 38, y: 72, pos: 'Z' }, { x: 62, y: 72, pos: 'Z' }, { x: 84, y: 70, pos: 'LD' },
        { x: 30, y: 46, pos: 'M' }, { x: 50, y: 48, pos: 'M' }, { x: 70, y: 46, pos: 'M' },
        { x: 20, y: 18, pos: 'PE' }, { x: 50, y: 16, pos: 'CA' }, { x: 80, y: 18, pos: 'PD' }
      ],
      '3-5-2': [
        { x: 50, y: 88, pos: 'G' },
        { x: 28, y: 72, pos: 'Z' }, { x: 50, y: 74, pos: 'Z' }, { x: 72, y: 72, pos: 'Z' },
        { x: 14, y: 48, pos: 'ALE' }, { x: 36, y: 48, pos: 'M' }, { x: 50, y: 52, pos: 'V' }, { x: 64, y: 48, pos: 'M' }, { x: 86, y: 48, pos: 'ALD' },
        { x: 38, y: 18, pos: 'A' }, { x: 62, y: 18, pos: 'A' }
      ],
      '4-5-1': [
        { x: 50, y: 88, pos: 'G' },
        { x: 16, y: 70, pos: 'LE' }, { x: 38, y: 72, pos: 'Z' }, { x: 62, y: 72, pos: 'Z' }, { x: 84, y: 70, pos: 'LD' },
        { x: 16, y: 42, pos: 'M' }, { x: 32, y: 48, pos: 'M' }, { x: 50, y: 52, pos: 'V' }, { x: 68, y: 48, pos: 'M' }, { x: 84, y: 42, pos: 'M' },
        { x: 50, y: 18, pos: 'A' }
      ]
    };

    const coords = positionsMap[formation] || positionsMap['4-4-2'];

    starters.forEach((p, idx) => {
      const coord = coords[idx] || { x: 50, y: 50 };
      const el = document.createElement('div');
      el.className = 'pitch-player';
      el.style.left = `${coord.x}%`;
      el.style.top = `${coord.y}%`;

      el.innerHTML = `
        <div class="player-circle">${p.strength}</div>
        <div class="player-name-tag">${p.name.split(' ')[0]}</div>
      `;
      el.addEventListener('click', () => {
        document.querySelector('.tab-btn[data-tab="squad-tab"]').click();
      });
      pitch.appendChild(el);
    });
  },

  updateTacticsPower() {
    const starters = (this.gameState.userTeam.players || []).slice(0, 11);
    let gk = 0, def = 0, mid = 0, att = 0;
    let gkC = 0, defC = 0, midC = 0, attC = 0;

    starters.forEach(p => {
      const s = p.strength || 30;
      if (p.position === 'G') { gk += s; gkC++; }
      else if (['Z', 'L'].includes(p.position)) { def += s; defC++; }
      else if (p.position === 'M') { mid += s; midC++; }
      else if (p.position === 'A') { att += s; attC++; }
    });

    document.getElementById('tactics-power-gk').textContent = gkC ? Math.round(gk / gkC) : '-';
    document.getElementById('tactics-power-def').textContent = defC ? Math.round(def / defC) : '-';
    document.getElementById('tactics-power-mid').textContent = midC ? Math.round(mid / midC) : '-';
    document.getElementById('tactics-power-att').textContent = attC ? Math.round(att / attC) : '-';
  },

  renderStandings() {
    const tbody = document.getElementById('standings-tbody');
    tbody.innerHTML = '';
    const standings = this.gameState.standings || [];
    const totalTeams = standings.length;

    standings.forEach(row => {
      const tr = document.createElement('tr');
      if (row.position <= 4) tr.classList.add('g4');
      else if (row.position <= 12) tr.classList.add('sula');
      else if (row.position > totalTeams - 4) tr.classList.add('z4');

      if (row.id === this.gameState.userTeam.id) tr.classList.add('user-team');

      tr.innerHTML = `
        <td><strong>${row.position}</strong></td>
        <td>
          <img src="/assets/escudos/${row.shield}" width="20" height="20" style="vertical-align: middle; margin-right: 6px;" onerror="this.src='/assets/icons/escudo.png'">
          ${row.name}
        </td>
        <td><strong>${row.points}</strong></td>
        <td>${row.played}</td>
        <td>${row.won}</td>
        <td>${row.drawn}</td>
        <td>${row.lost}</td>
        <td>${row.goalsFor}</td>
        <td>${row.goalsAgainst}</td>
        <td><strong>${row.goalDiff > 0 ? '+' + row.goalDiff : row.goalDiff}</strong></td>
      `;
      tbody.appendChild(tr);
    });
  },

  renderTopScorers() {
    const tbody = document.getElementById('scorers-tbody');
    tbody.innerHTML = '';
    const scorers = this.gameState.topScorers || [];

    if (scorers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Nenhum gol marcado ainda na temporada.</td></tr>';
      return;
    }

    scorers.forEach((s, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${idx + 1}</strong></td>
        <td><strong>${s.name}</strong> <span class="pos-badge pos-${s.position}">${s.position}</span></td>
        <td>
          <img src="/assets/escudos/${s.teamShield}" width="18" height="18" style="vertical-align: middle; margin-right: 4px;" onerror="this.src='/assets/icons/escudo.png'">
          ${s.teamName}
        </td>
        <td><strong>${s.goals}</strong></td>
      `;
      tbody.appendChild(tr);
    });
  },

  renderRoundFixtures() {
    const grid = document.getElementById('round-fixtures-grid');
    grid.innerHTML = '';
    const matches = this.gameState.currentRoundMatches || [];

    matches.forEach(m => {
      const card = document.createElement('div');
      card.className = 'fixture-card' + (m.isUserMatch ? ' user-match' : '');
      const scoreText = m.isPlayed ? `${m.homeScore} x ${m.awayScore}` : 'vs';

      card.innerHTML = `
        <div class="fixture-team home">
          <img src="/assets/escudos/${m.homeShield}" onerror="this.src='/assets/icons/escudo.png'">
          <span>${m.homeName}</span>
        </div>
        <div class="fixture-score">${scoreText}</div>
        <div class="fixture-team away">
          <span>${m.awayName}</span>
          <img src="/assets/escudos/${m.awayShield}" onerror="this.src='/assets/icons/escudo.png'">
        </div>
      `;
      grid.appendChild(card);
    });
  },

  renderStadiumTab() {
    const team = this.gameState.userTeam;
    document.getElementById('stadium-name').textContent = team.stadium;
    document.getElementById('stadium-capacity').textContent = team.capacity.toLocaleString('pt-BR');
  },

  updateFinanceSummary() {
    const team = this.gameState.userTeam;
    const price = team.ticketPrice || 30;
    const capacity = team.capacity || 20000;
    const repRatio = (team.reputation || 3) / 5;
    const estAttendance = Math.round(capacity * repRatio * 0.85);
    const estIncome = estAttendance * price;

    let wageBill = 0;
    for (const p of team.players || []) wageBill += (p.wage || 5000);
    const maintenance = Math.round(capacity * 0.5);

    document.getElementById('fin-match-income').textContent = `+ R$ ${estIncome.toLocaleString('pt-BR')}`;
    document.getElementById('fin-wage-bill').textContent = `- R$ ${wageBill.toLocaleString('pt-BR')}`;
    document.getElementById('fin-maintenance').textContent = `- R$ ${maintenance.toLocaleString('pt-BR')}`;
  },

  async upgradeStadium(seats) {
    const res = await fetch('/api/game/stadium-upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seats })
    });
    const data = await res.json();
    if (data.success) {
      this.gameState.userTeam.capacity = data.newCapacity;
      this.gameState.userTeam.balance -= data.cost;
      this.refreshUI();
      this.showToast(data.message);
    } else {
      alert(data.message);
    }
  },

  async searchMarket() {
    const name = document.getElementById('market-search-name').value;
    const position = document.getElementById('market-pos-filter').value;
    const minStrength = document.getElementById('market-min-str').value;

    const query = new URLSearchParams({
      name,
      position,
      minStrength: minStrength || 20
    });

    const res = await fetch(`/api/game/market/search?${query.toString()}`);
    const players = await res.json();

    const tbody = document.getElementById('market-tbody');
    tbody.innerHTML = '';

    if (players.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px;">Nenhum jogador encontrado com os filtros selecionados.</td></tr>';
      return;
    }

    players.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="pos-badge pos-${p.position}">${p.position}</span></td>
        <td><strong>${p.name}</strong> ${p.isStar ? '⭐' : ''}</td>
        <td>${p.age}</td>
        <td><strong>${p.strength}</strong></td>
        <td>${p.cr1 || '-'}</td>
        <td>${p.cr2 || '-'}</td>
        <td>
          <img src="/assets/escudos/${p.teamShield}" width="16" height="16" style="vertical-align: middle;" onerror="this.src='/assets/icons/escudo.png'">
          ${p.teamName}
        </td>
        <td>R$ ${(p.value || 100000).toLocaleString('pt-BR')}</td>
        <td>
          <button class="btn btn-small btn-primary" onclick="app.buyPlayer('${p.id}', '${p.teamId}', ${p.value}, '${p.name.replace("'", "\\'")}')">Comprar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  async buyPlayer(playerId, teamId, value, playerName) {
    const offer = prompt(`Deseja contratar ${playerName}? Digite sua proposta de compra (R$):`, value);
    if (!offer) return;
    const offerPrice = Number(offer);
    if (isNaN(offerPrice) || offerPrice <= 0) return alert('Valor inválido!');

    const res = await fetch('/api/game/market/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, teamId, offerPrice })
    });
    const data = await res.json();
    if (data.success) {
      this.gameState.userTeam.players.push(data.player);
      this.gameState.userTeam.balance -= offerPrice;
      this.refreshUI();
      this.showToast(data.message);
      this.searchMarket();
    } else {
      alert(data.message);
    }
  },

  async playRound() {
    try {
      const res = await fetch('/api/game/simulate-round', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Erro ao simular rodada.');
        return;
      }

      // Check if user match exists
      if (data.userMatch) {
        this.startMatchLiveSimulation(data.userMatch, data.gameState);
      } else {
        this.gameState = data.gameState;
        this.refreshUI();
        this.showToast('Rodada finalizada com sucesso!');
      }
    } catch (e) {
      alert('Erro ao simular rodada: ' + e.message);
    }
  },

  startMatchLiveSimulation(match, nextGameState) {
    this.currentSimMatch = match;
    this.nextGameState = nextGameState;
    const modal = document.getElementById('match-modal');
    modal.style.display = 'flex';

    // Populate header
    document.getElementById('match-home-name').textContent = match.homeTeam.name;
    document.getElementById('match-away-name').textContent = match.awayTeam.name;
    document.getElementById('match-home-shield').src = `/assets/escudos/${match.homeTeam.shield}`;
    document.getElementById('match-away-shield').src = `/assets/escudos/${match.awayTeam.shield}`;
    document.getElementById('match-home-score').textContent = '0';
    document.getElementById('match-away-score').textContent = '0';
    document.getElementById('match-timer').textContent = "0'";

    document.getElementById('match-events-feed').innerHTML = '';
    document.getElementById('skip-match-btn').style.display = 'inline-block';
    document.getElementById('close-match-btn').style.display = 'none';

    // Stats
    const stats = match.stats || { possession: [50, 50], shots: [0, 0], shotsOnTarget: [0, 0], fouls: [0, 0] };
    document.getElementById('stat-possession-home').style.width = `${stats.possession[0]}%`;
    document.getElementById('stat-possession-home').textContent = `${stats.possession[0]}%`;
    document.getElementById('stat-possession-away').style.width = `${stats.possession[1]}%`;
    document.getElementById('stat-possession-away').textContent = `${stats.possession[1]}%`;
    document.getElementById('stat-shots-home').textContent = stats.shots[0];
    document.getElementById('stat-shots-away').textContent = stats.shots[1];
    document.getElementById('stat-ontarget-home').textContent = stats.shotsOnTarget[0];
    document.getElementById('stat-ontarget-away').textContent = stats.shotsOnTarget[1];
    document.getElementById('stat-fouls-home').textContent = stats.fouls[0];
    document.getElementById('stat-fouls-away').textContent = stats.fouls[1];

    let currentMinute = 1;
    const events = match.events || [];
    let eventIdx = 0;

    clearInterval(this.matchSimulationInterval);
    this.matchSimulationInterval = setInterval(() => {
      if (currentMinute > 90) {
        this.finishMatchSimulation();
        return;
      }

      document.getElementById('match-timer').textContent = `${currentMinute}'`;

      // Check events for this minute
      while (eventIdx < events.length && events[eventIdx].minute <= currentMinute) {
        const ev = events[eventIdx];
        this.renderMatchEvent(ev);
        eventIdx++;
      }

      currentMinute++;
    }, 120); // ~10 seconds for whole match
  },

  renderMatchEvent(ev) {
    document.getElementById('match-home-score').textContent = ev.homeScore;
    document.getElementById('match-away-score').textContent = ev.awayScore;

    const feed = document.getElementById('match-events-feed');
    const item = document.createElement('div');
    item.className = 'event-item';
    if (ev.type.includes('GOL')) item.classList.add('gol');
    if (ev.type.includes('VERMELHO')) item.classList.add('expulsao');

    const iconSrc = ev.icon ? `/assets/icons/${ev.icon}` : '/assets/icons/ball.png';
    item.innerHTML = `
      <span class="event-minute">${ev.minute}'</span>
      <img src="${iconSrc}" class="event-icon" onerror="this.style.display='none'">
      <span>${ev.text}</span>
    `;
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;

    // Play sounds
    if (this.soundEnabled && ev.sound) {
      this.playSound(ev.sound);
    }
  },

  playSound(soundName) {
    const idMap = {
      'gol1.wav': 'audio-gol',
      'fimjogo.wav': 'audio-fimjogo',
      'intervalo.wav': 'audio-intervalo',
      'expulsao.wav': 'audio-expulsao',
      'penalty.wav': 'audio-penalty',
      'contusao.wav': 'audio-contusao'
    };
    const audioId = idMap[soundName];
    if (audioId) {
      const audio = document.getElementById(audioId);
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    }
  },

  skipMatchSimulation() {
    clearInterval(this.matchSimulationInterval);
    const events = this.currentSimMatch.events || [];
    const feed = document.getElementById('match-events-feed');
    feed.innerHTML = '';
    events.forEach(ev => this.renderMatchEvent(ev));
    this.finishMatchSimulation();
  },

  finishMatchSimulation() {
    clearInterval(this.matchSimulationInterval);
    document.getElementById('match-timer').textContent = "90'";
    document.getElementById('match-home-score').textContent = this.currentSimMatch.homeTeam.score;
    document.getElementById('match-away-score').textContent = this.currentSimMatch.awayTeam.score;
    document.getElementById('skip-match-btn').style.display = 'none';
    document.getElementById('close-match-btn').style.display = 'inline-block';
    if (this.soundEnabled) this.playSound('fimjogo.wav');
    this.gameState = this.nextGameState;
  },

  async saveGame() {
    try {
      const res = await fetch('/api/game/save', { method: 'POST' });
      const data = await res.json();
      this.showToast(data.message || 'Jogo salvo!');
    } catch (e) {
      alert('Erro ao salvar jogo: ' + e.message);
    }
  },

  async loadGame() {
    try {
      const res = await fetch('/api/game/load', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.gameState = data.gameState;
        this.onGameLoaded();
        this.showToast('Jogo carregado com sucesso!');
      } else {
        alert(data.error || 'Nenhum save encontrado.');
      }
    } catch (e) {
      alert('Erro ao carregar jogo: ' + e.message);
    }
  },

  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  app.init();
});
