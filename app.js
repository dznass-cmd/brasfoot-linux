// app.js - Brasfoot Linux Client Engine (100% Serverless & Offline)

const app = {
  gameState: null,
  leaguesConfig: null,
  databaseInfo: {},
  allTeams: [],
  teamDirectory: null,
  countries: {},
  clubBrowser: null,
  assetFiles: {},
  selectedPlayerIdx: null,
  inspectedPlayerIdx: 0,
  currentView: 'squad-tab',
  standingsView: 'standings-view',
  dirtyViews: null,
  soundEnabled: true,
  matchSimulationInterval: null,
  matchSpeed: 1,
  matchPaused: false,
  matchSelection: { outId: null, inId: null },
  matchTacticsDirty: false,
  matchMessage: '',
  seasonJob: null,
  pendingJobOfferId: null,
  marketView: 'search',
  performanceView: 'players',
  transferRequest: null,
  contractRequest: null,
  financeYear: null,
  SAVE_KEY: 'brasfoot_linux_saved_game',
  saveStore: null,
  saveFailed: false,

  init() {
    this.assetFiles = Object.fromEntries(Object.entries(window.BRASFOOT_ASSETS || {}).map(([folder, files]) => [folder, new Set(files)]));
    this.databaseInfo = window.BRASFOOT_DATABASE || {};
    this.loadTeamDatabase();
    this.leaguesConfig = window.BRASFOOT_LEAGUES || {};
    this.countries = window.BRASFOOT_COUNTRIES || {};
    const year = this.databaseInfo.seasonYear || 2023;
    document.getElementById('new-game-subtitle').textContent = `Selecione o seu clube para iniciar a temporada ${year}:`;
    document.getElementById('season-label').textContent = `Temporada ${year}`;
    const databaseSummary = document.getElementById('new-game-database-summary');
    databaseSummary.hidden = !this.databaseInfo.asOf;
    if (this.databaseInfo.asOf) databaseSummary.textContent = `Base de ${this.formatDatabaseDate(this.databaseInfo.asOf)} · ${this.databaseInfo.updatedClubs} elencos atualizados · ${this.databaseInfo.legacyClubs} com base antiga identificada.`;

    this.initializeTacticalControls();
    this.bindEvents();
    this.renderTeamSelectionGrid('BRA_A');
  },

  loadTeamDatabase() {
    this.teamDirectory = null;
    this.allTeams = (window.BRASFOOT_TEAMS || []).map(t => ({ ...t, players: (t.players || []).map(p => ({ ...p })) }));
    try {
      const overrides = JSON.parse(localStorage.getItem('brasfoot_club_overrides') || '{}');
      this.allTeams.forEach(t => {
        if (overrides[t.id]) {
          for (const key of ['name', 'stadium', 'manager']) {
            if (typeof overrides[t.id][key] === 'string') t[key] = overrides[t.id][key];
          }
        }
      });
    } catch (e) { console.warn('Não foi possível ler o editor de clubes:', e); }

  },

  showView(target, subView) {
    const section = document.getElementById(target);
    if (!section || !section.classList.contains('tab-content')) return;
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c === section));
    document.querySelectorAll('.toolbar-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === target));
    document.getElementById('game-container').dataset.currentView = target;
    this.currentView = target;
    if (subView && target === 'market-tab') { this.marketView = subView; this.dirtyViews?.add(target); }
    else if (subView) document.querySelector(`.sub-tab-btn[data-sub="${subView}"]`)?.click();
    this.renderCurrentView();
  },

  showNewGame() {
    document.getElementById('options-modal').style.display = 'none';
    const dismissalModal = document.getElementById('dismissal-modal');
    if (dismissalModal) dismissalModal.style.display = 'none';
    document.getElementById('new-game-modal').style.display = 'flex';
  },

  bindEvents() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showView(btn.dataset.view, btn.dataset.subView);
      });
    });
    document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.close === 'season-modal') this.cancelSeasonPreparation();
      if (btn.dataset.close === 'transfer-modal') this.transferRequest = null;
      if (btn.dataset.close === 'contract-modal') this.contractRequest = null;
      document.getElementById(btn.dataset.close).style.display = 'none';
    }));
    document.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.action === 'options') document.getElementById('options-modal').style.display = 'flex';
      if (btn.dataset.action === 'save') this.saveGame();
      if (btn.dataset.action === 'import') document.getElementById('import-save-input').click();
      if (btn.dataset.action === 'new-game') this.showNewGame();
    }));
    document.getElementById('main-new-game-btn').addEventListener('click', () => this.showNewGame());
    document.getElementById('main-continue-btn').addEventListener('click', () => this.loadGame());
    document.getElementById('main-editor-btn').addEventListener('click', () => this.openEditor());
    document.getElementById('editor-team-select').addEventListener('change', () => this.fillEditor());
    document.getElementById('club-editor-form').addEventListener('submit', e => { e.preventDefault(); this.saveEditor(); });
    document.getElementById('browser-country').addEventListener('change', e => {
      Object.assign(this.clubBrowser, { countryId: e.target.value, divisionId: 'all', teamId: null, playerId: null });
      this.renderClubBrowser();
    });
    document.getElementById('browser-division').addEventListener('change', e => {
      Object.assign(this.clubBrowser, { divisionId: e.target.value, teamId: null, playerId: null });
      this.renderClubBrowser();
    });
    document.getElementById('browser-search').addEventListener('input', e => {
      this.clubBrowser.query = e.target.value;
      this.renderClubBrowser();
    });
    document.getElementById('browser-own-team').addEventListener('click', () => this.openClubBrowser(this.gameState.userTeam.id));
    document.getElementById('browser-opponent').addEventListener('click', () => {
      const opponent = this.nextOpponent();
      if (opponent) this.openClubBrowser(opponent.id);
    });
    document.getElementById('browser-team-list').addEventListener('keydown', e => {
      const buttons = [...e.currentTarget.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      if (index < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)));
      buttons[next].click();
    });
    document.querySelectorAll('input[name="club-kit"]').forEach(input => input.addEventListener('change', () => {
      this.gameState.userTeam.selectedKit = Number(input.value);
      this.persistState();
      this.renderTacticalPitch();
    }));

    // Sub Navigation (inside Standings tab)
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sub-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.sub).classList.add('active');
        this.standingsView = btn.dataset.sub;
        this.renderCurrentView();
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
    document.getElementById('next-season-btn').addEventListener('click', () => this.openSeasonEnd());
    document.getElementById('advance-season-btn').addEventListener('click', () => this.startNextSeason());
    document.getElementById('manager-name-form').addEventListener('submit', e => { e.preventDefault(); this.saveManagerName(); });
    document.getElementById('profile-confirm-offer-btn').addEventListener('click', () => this.acceptJobOffer());
    document.getElementById('profile-cancel-offer-btn').addEventListener('click', () => {
      this.pendingJobOfferId = null;
      document.getElementById('profile-offer-confirmation').hidden = true;
      document.querySelector('#manager-job-offers button')?.focus();
    });
    document.getElementById('dismissal-restart-btn')?.addEventListener('click', () => {
      const modal = document.getElementById('dismissal-modal');
      if (modal) modal.style.display = 'none';
      this.showNewGame();
    });

    // Save Game Button
    document.getElementById('save-game-btn').addEventListener('click', () => {
      this.saveGame();
    });

    // Load Game Button
    document.getElementById('load-saved-game-btn').addEventListener('click', () => {
      this.loadGame();
    });

    // Export Save Button
    document.getElementById('export-save-btn').addEventListener('click', () => {
      this.exportSaveFile();
    });

    // Import Save Button & File Input
    const importInput = document.getElementById('import-save-input');
    document.getElementById('import-save-btn').addEventListener('click', () => {
      importInput.click();
    });
    importInput.addEventListener('change', (e) => {
      this.importSaveFile(e);
    });

    // Sound Toggle
    document.getElementById('sound-toggle-btn').addEventListener('click', () => {
      this.soundEnabled = !this.soundEnabled;
      document.getElementById('sound-toggle-btn').textContent = this.soundEnabled ? 'Som: ligado' : 'Som: desligado';
      document.getElementById('sound-toggle-btn').setAttribute('aria-pressed', String(this.soundEnabled));
      this.showToast(this.soundEnabled ? 'Sons ativados' : 'Sons desativados');
    });

    // Auto Select Squad
    document.getElementById('auto-select-squad-btn').addEventListener('click', () => {
      const userTeam = this.gameState.userTeam;
      SquadEngine.autoSelectStarters(userTeam, userTeam.formation || '4-4-2');
      this.persistState();
      this.renderSquad();
      this.renderTacticalPitch();
      this.updateTacticsPower();
      this.showToast('Melhores jogadores escalados!');
    });

    // Tactics Changes
    document.getElementById('formation-select').addEventListener('change', (e) => {
      const formation = e.target.value;
      const userTeam = this.gameState.userTeam;
      userTeam.formation = formation;
      SquadEngine.autoSelectStarters(userTeam, formation);
      this.persistState();
      this.renderSquad();
      this.renderTacticalPitch();
      this.updateTacticsPower();
    });

    document.getElementById('style-select').addEventListener('change', (e) => {
      const tacticStyle = e.target.value;
      this.gameState.userTeam.tacticStyle = tacticStyle;
      this.persistState();
      this.updateTacticsPower();
    });
    document.querySelectorAll('#tactics-instructions select, #tactics-set-pieces select').forEach(select => select.addEventListener('change', () => this.saveTeamInstructions()));
    document.getElementById('tactics-preset-select').addEventListener('change', () => {
      document.getElementById('tactics-preset-help').textContent = TacticsEngine.PRESETS[document.getElementById('tactics-preset-select').value].help;
    });
    document.getElementById('tactics-preset-btn').addEventListener('click', () => {
      const plan = TacticsEngine.preset(document.getElementById('tactics-preset-select').value);
      this.writeTacticalControls('tactics', plan.instructions, this.gameState.userTeam.setPieces, this.gameState.userTeam.players);
      this.saveTeamInstructions(plan.style);
    });
    document.getElementById('match-preset-btn').addEventListener('click', () => {
      if (!this.currentSimMatch || this.currentSimMatch.finished) return;
      this.pauseLiveMatch('Escolhendo plano de jogo');
      const plan = TacticsEngine.preset(document.getElementById('match-preset-select').value);
      this.writeTacticalControls('match', plan.instructions, this.currentSimMatch.setPieces[this.currentSimMatch.userSide], this.gameState.userTeam.players);
      document.getElementById('match-style').value = plan.style; this.matchTacticsDirty = true;
    });

    // Ticket Price Slider
    const ticketSlider = document.getElementById('ticket-price-slider');
    ticketSlider.addEventListener('input', (e) => {
      this.updateFinanceSummary(Number(e.target.value));
      document.getElementById('finance-ticket-status').textContent = 'Simulação do ingresso. Solte o controle para salvar o preço.';
    });
    ticketSlider.addEventListener('change', (e) => {
      this.saveTicketPrice(Number(e.target.value));
    });
    document.getElementById('finance-season-filter').addEventListener('change', event => {
      this.financeYear = Number(event.target.value); this.renderFinances();
    });
    document.getElementById('finance-entry-filter').addEventListener('change', () => this.renderFinanceStatement());
    document.getElementById('finance-budget-review').addEventListener('click', () => this.commitEconomyAction({ type: 'review-budget' }));

    // Market Search
    document.getElementById('market-search-btn').addEventListener('click', () => {
      this.searchMarket();
    });
    ['market-search-name', 'market-pos-filter', 'market-min-str', 'market-max-price', 'market-max-wage', 'market-max-age', 'market-contract-filter'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => this.searchMarket());
        el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.searchMarket(); } });
      }
    });
    document.querySelectorAll('[data-market-view]').forEach(button => button.addEventListener('click', () => {
      this.marketView = button.dataset.marketView; this.renderMarket();
    }));
    document.getElementById('transfer-form').addEventListener('submit', event => { event.preventDefault(); this.submitTransfer(); });
    document.getElementById('transfer-club').addEventListener('change', () => this.updateTransferTerms());
    ['transfer-amount', 'transfer-contract-years', 'transfer-contract-wage', 'transfer-contract-bonus'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this.updateTransferTerms());
    });
    document.getElementById('contract-form').addEventListener('submit', event => { event.preventDefault(); this.submitContract(); });
    ['contract-years', 'contract-wage', 'contract-bonus'].forEach(id => document.getElementById(id).addEventListener('input', () => this.updateContractTerms()));
    document.querySelectorAll('[data-performance-view]').forEach(button => button.addEventListener('click', () => {
      this.performanceView = button.dataset.performanceView; this.renderPerformance();
    }));
    ['performance-position', 'performance-sort', 'performance-season-select', 'performance-match-select'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => this.renderPerformance());
    });

    // Skip Match Simulation
    document.getElementById('skip-match-btn').addEventListener('click', () => {
      this.skipMatchSimulation();
    });
    document.getElementById('pause-match-btn').addEventListener('click', () => {
      if (this.matchPaused) this.resumeLiveMatch(); else this.pauseLiveMatch('Pausa do treinador');
    });
    document.getElementById('match-speed').addEventListener('change', e => {
      this.matchSpeed = Number(e.target.value);
      if (this.currentSimMatch) this.currentSimMatch.speed = this.matchSpeed;
      if (!this.matchPaused) this.scheduleLiveMatch();
      this.persistMatchProgress();
    });
    ['match-formation', 'match-style', ...Object.keys(TacticsEngine.OPTIONS).map(key => `match-${key}`), ...Object.keys(TacticsEngine.SET_PIECES).map(key => `match-taker-${key}`)].forEach(id => {
      document.getElementById(id).addEventListener('focus', () => this.pauseLiveMatch('Ajustes táticos'));
      document.getElementById(id).addEventListener('change', () => { this.matchTacticsDirty = true; });
    });
    document.getElementById('match-tactics-form').addEventListener('submit', e => { e.preventDefault(); this.applyLiveTactics(); });
    document.getElementById('confirm-match-sub-btn').addEventListener('click', () => this.confirmLiveSubstitution());
    for (const id of ['match-analysis-metric', 'match-analysis-change']) {
      document.getElementById(id).addEventListener('change', () => this.renderLiveTacticalAnalysis());
    }
    window.addEventListener('resize', () => { if (this.currentSimMatch) this.renderLiveTacticalAnalysis(); });

    document.querySelectorAll('.match-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.match-tab-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        const view = btn.dataset.matchTab;
        const workspace = document.querySelector('.match-workspace');
        if (workspace) workspace.dataset.view = view;
        this.renderLiveTacticalAnalysis();
      });
    });

    // Close Match Modal
    document.getElementById('close-match-btn').addEventListener('click', () => {
      if (this.currentSimMatch && !this.currentSimMatch.finished) return;
      clearInterval(this.matchSimulationInterval);
      document.getElementById('match-modal').style.display = 'none';
      delete this.gameState.activeMatch;
      this.currentSimMatch = null;
      this.persistState();
      this.currentView = 'squad-tab';
      this.refreshUI();
      this.showView('squad-tab');
      this.checkManagerDismissal();
    });
  },

  renderTeamSelectionGrid(divisionId) {
    const grid = document.getElementById('teams-selection-grid');
    grid.innerHTML = '';
    const division = (this.leaguesConfig.BRA?.divisions || []).find(d => d.id === divisionId);
    if (!division) return;

    const divTeamIds = division.teams;
    const teams = this.allTeams.filter(t => divTeamIds.includes(t.id));
    teams.sort((a, b) => b.tier - a.tier);

    teams.forEach(t => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'team-card';
      card.innerHTML = `
        <img src="${this.assetPath("escudos", t.shield)}" alt="" onerror="this.onerror=null;this.src='assets/icons/escudo.png'">
        <span class="team-name">${this.escapeHTML(t.name)}</span>
        <span class="team-tier">${this.escapeHTML(t.stadium)}</span>
        <span class="team-roster-tag ${t.rosterData?.status === 'updated' ? '' : 'legacy'}">${t.rosterData?.status === 'updated' ? `Elenco ${t.rosterData.seasonYear}` : 'Base antiga · 22/23'}</span>
      `;
      card.addEventListener('click', () => this.startNewGame(t.id));
      grid.appendChild(card);
    });
  },

  checkSavedGame() {
    try {
      const saved = this.getSaveStore().load();
      if (saved) {
        this.gameState = saved;
        this.onGameLoaded();
        return true;
      }
    } catch (e) {
      console.warn('Nenhum save prévio válido:', e);
    }
    return false;
  },

  startNewGame(teamId) {
    this.cancelSeasonPreparation();
    this.loadTeamDatabase();
    const team = this.allTeams.find(t => t.id === Number(teamId));
    if (!team) return alert('Time não encontrado!');

    // Determine division
    let division = this.leaguesConfig.BRA.divisions[0];
    for (const div of this.leaguesConfig.BRA.divisions) {
      if (div.teams.includes(team.id)) {
        division = div;
        break;
      }
    }

    // Clone division teams
    const divisionTeams = division.teams.map(tid => {
      const original = this.allTeams.find(t => t.id === tid);
      const clone = JSON.parse(JSON.stringify(original));
      SquadEngine.autoSelectStarters(clone, clone.formation || '4-4-2');
      return clone;
    });

    const rounds = LeagueEngine.generateSchedule(division.teams);

    const next = {
      userTeamId: team.id,
      userTeam: divisionTeams.find(t => t.id === team.id),
      divisionId: division.id,
      divisionName: division.name,
      currentRound: 1,
      totalRounds: rounds.length,
      rounds,
      divisionTeams,
      seasonYear: this.databaseInfo.seasonYear || 2023,
      databaseVersion: this.databaseInfo.version || 'brasfoot-22-23'
    };
    CareerEngine.ensureState(next, this.leaguesConfig, this.allTeams);
    FinanceEngine.ensureLedger(next.userTeam, { year: next.seasonYear, round: next.currentRound });
    ContractsEngine.ensureState(next); EconomyEngine.ensure(next);

    if (!this.persistState(next)) return;
    this.gameState = next;
    this.onGameLoaded();
    this.showToast(`Temporada iniciada com o ${this.gameState.userTeam.name}!`);
  },

  onGameLoaded() {
    this.cancelSeasonPreparation();
    clearInterval(this.matchSimulationInterval);
    const divisionTeam = this.gameState.divisionTeams.find(t => t.id === this.gameState.userTeam.id);
    if (divisionTeam) {
      Object.assign(divisionTeam, this.gameState.userTeam);
      this.gameState.userTeam = divisionTeam;
    }
    CareerEngine.ensureState(this.gameState, this.leaguesConfig, this.allTeams);
    FinanceEngine.ensureLedger(this.gameState.userTeam, { year: this.gameState.seasonYear, round: this.gameState.currentRound });
    ContractsEngine.ensureState(this.gameState); EconomyEngine.ensure(this.gameState);
    this.financeYear = null;
    this.currentSimMatch = null;
    this.pendingJobOfferId = null;
    document.getElementById('season-modal').style.display = 'none';
    document.getElementById('match-modal').style.display = 'none';
    document.getElementById('transfer-modal').style.display = 'none';
    document.getElementById('contract-modal').style.display = 'none';
    const dismissalModal = document.getElementById('dismissal-modal');
    if (dismissalModal) dismissalModal.style.display = 'none';
    this.transferRequest = null;
    this.contractRequest = null;
    this.selectedPlayerIdx = null;
    this.inspectedPlayerIdx = 0;
    this.clubBrowser = null;
    this.teamDirectory = null;
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('new-game-modal').style.display = 'none';
    document.getElementById('options-modal').style.display = 'none';
    document.getElementById('game-container').style.display = 'grid';
    this.currentView = 'squad-tab';
    this.refreshUI();
    this.showView('squad-tab');
    if (this.gameState.activeMatch) this.startMatchLiveSimulation(this.gameState.activeMatch, true);
  },

  getSaveStore() {
    if (!this.saveStore) this.saveStore = new SaveStore(localStorage, this.SAVE_KEY);
    return this.saveStore;
  },

  persistState(state = this.gameState, checkpoint = false) {
    try {
      const store = this.getSaveStore();
      const saved = checkpoint ? store.checkpoint(state) : store.save(state);
      this.saveFailed = false;
      if (!checkpoint) { this.invalidateViews(); this.teamDirectory = null; }
      return saved;
    } catch (e) {
      this.saveFailed = true;
      console.error('Erro ao gravar no localStorage:', e);
      this.showToast('Não foi possível gravar a carreira. O último save permanece disponível; exporte seu progresso.');
      return false;
    }
  },

  persistMatchProgress() {
    const saved = this.persistState(this.gameState, true);
    if (!saved && this.currentSimMatch && !this.currentSimMatch.finished) {
      clearInterval(this.matchSimulationInterval);
      this.matchPaused = this.currentSimMatch.paused = true;
      this.matchPauseReason = 'Falha ao salvar';
      this.updateLiveMatchControls();
    }
    return saved;
  },

  invalidateViews() {
    this.dirtyViews = new Set(['squad-tab', 'tactics-tab', 'standings-view', 'scorers-view', 'fixtures-view',
      'history-view', 'stadium-tab', 'finance-tab', 'manager-profile-tab', 'market-tab', 'performance-tab', 'teams-tab']);
  },

  renderCurrentView() {
    if (!this.gameState) return;
    if (!this.dirtyViews) this.invalidateViews();
    const key = this.currentView === 'standings-tab' ? this.standingsView : this.currentView;
    if (!this.dirtyViews.has(key)) return;
    const team = this.gameState.userTeam;
    switch (key) {
      case 'squad-tab': this.renderSquad(); break;
      case 'tactics-tab':
        document.getElementById('formation-select').value = team.formation || '4-4-2';
        document.getElementById('style-select').value = team.tacticStyle || 'Equilibrado';
        this.renderSquad(); this.renderTacticalPitch(); this.renderTeamTactics(); this.updateTacticsPower(); break;
      case 'standings-view': this.renderStandings(); break;
      case 'scorers-view': this.renderTopScorers(); break;
      case 'fixtures-view': this.renderRoundFixtures(); break;
      case 'history-view': this.renderSeasonHistory(); break;
      case 'stadium-tab': this.renderStadiumTab(); break;
      case 'finance-tab': this.renderFinances(); break;
      case 'manager-profile-tab': this.renderManagerProfile(); break;
      case 'market-tab': this.renderMarket(); break;
      case 'performance-tab': this.renderPerformance(); break;
      case 'teams-tab': this.renderClubBrowser(); break;
    }
    this.dirtyViews.delete(key);
  },

  refreshUI() {
    if (!this.gameState) return;
    const team = this.gameState.userTeam;

    // Header info
    document.getElementById('user-club-name').textContent = team.name;
    document.getElementById('user-club-stadium').textContent = `${team.stadium} (${team.capacity.toLocaleString('pt-BR')} lug.)`;
    const shieldEl = document.getElementById('user-club-shield');
    shieldEl.src = this.assetPath('escudos', team.shield);
    shieldEl.onerror = () => { shieldEl.src = 'assets/icons/escudo.png'; };
    
    document.getElementById('user-division').textContent = this.gameState.divisionName;
    document.getElementById('current-round-text').textContent = `${Math.min(this.gameState.currentRound, this.gameState.totalRounds)} / ${this.gameState.totalRounds}`;
    document.getElementById('user-balance').textContent = `R$ ${team.balance.toLocaleString('pt-BR')}`;

    // Shared chrome stays current; closed tabs render on demand.
    this.invalidateViews();
    this.renderClubSidebar();
    this.renderPlayerProfile();
    this.renderSeasonControls();
    this.renderManagerIndicators();
    this.renderMarketIndicators();
    this.renderCurrentView();
  },

  escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  },

  assetPath(folder, filename, fallback = 'escudo.png') {
    const name = String(filename || '');
    return this.assetFiles[folder]?.has(name) ? `assets/${folder}/${encodeURIComponent(name)}` : `assets/icons/${fallback}`;
  },

  shortMoney(value) {
    const amount = Number(value) || 0;
    return amount >= 1000000 ? `${(amount / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : `${(amount / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  },

  energyMarkup(p) {
    const energy = Math.round(Math.max(0, Math.min(100, Number(p.energy ?? 100))));
    return `<div class="energy-bar-wrap"><div class="energy-bar-fill" style="width:${energy}%"></div><span class="energy-label">${energy}%</span></div>`;
  },

  normalizeSearch(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  },

  formatDatabaseDate(value) {
    const date = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : '—';
  },

  playerAgeLabel(player, withUnit = false) {
    return player.ageEstimated || player.age == null ? '—' : `${player.age}${withUnit ? ' anos' : ''}`;
  },

  playerPositionCode(player) {
    return player.positionDetailEstimated ? 'D' : player.position;
  },

  playerHumor(player) {
    const morale = Math.max(40, Math.min(110, Math.round(player?.morale ?? 100)));
    if (morale >= 105) {
      return { level: 'radiant', label: 'Radiante', emoji: '😄', value: morale, color: '#16a34a', desc: 'Em excelente fase e com moral nas alturas' };
    }
    if (morale >= 95) {
      return { level: 'happy', label: 'Feliz', emoji: '😊', value: morale, color: '#22c55e', desc: 'Confiante e satisfeito com o momento' };
    }
    if (morale >= 80) {
      return { level: 'neutral', label: 'Normal', emoji: '😐', value: morale, color: '#eab308', desc: 'Tranquilo e focado nos treinamentos' };
    }
    if (morale >= 65) {
      return { level: 'unhappy', label: 'Descontente', emoji: '🙁', value: morale, color: '#f97316', desc: 'Insatisfeito com resultados ou poucos minutos' };
    }
    return { level: 'furious', label: 'Abatido', emoji: '😡', value: morale, color: '#ef4444', desc: 'Muito insatisfeito e com moral em baixa' };
  },

  currentTeams() {
    const cached = this.teamDirectory;
    if (cached && cached.state === this.gameState && cached.source === this.allTeams) return cached.teams;
    // The running season owns its clubs; the database supplies all other clubs.
    const teams = new Map(this.allTeams.map(t => [t.id, t]));
    for (const team of this.gameState?.marketClubs || []) teams.set(team.id, team);
    for (const team of this.gameState?.reserveTeams || []) teams.set(team.id, team);
    for (const team of this.gameState?.divisionTeams || []) teams.set(team.id, team);
    if (this.gameState?.userTeam) teams.set(this.gameState.userTeam.id, this.gameState.userTeam);
    const careerTeams = this.gameState ? MarketEngine.worldTeams(this.gameState) : [];
    const careerIds = new Set(careerTeams.map(team => team.id));
    const ownedPlayers = new Set(careerTeams.flatMap(team => team.players.map(player => player.id)));
    for (const player of this.gameState?.freeAgents || []) ownedPlayers.add(player.id);
    const directory = [...teams.values()].map(team => careerIds.has(team.id) ? team
      : MarketEngine.prepareExternalClub(this.gameState, team));
    this.teamDirectory = { state: this.gameState, source: this.allTeams, teams: directory,
      byId: new Map(directory.map(team => [team.id, team])) };
    return directory;
  },

  findTeam(teamId) {
    this.currentTeams();
    return this.teamDirectory.byId.get(Number(teamId));
  },

  nextOpponent() {
    const state = this.gameState;
    if (!state) return null;
    const match = state.rounds[state.currentRound - 1]?.matches.find(m => m.homeId === state.userTeam.id || m.awayId === state.userTeam.id);
    return match ? state.divisionTeams.find(t => t.id === (match.homeId === state.userTeam.id ? match.awayId : match.homeId)) : null;
  },

  countryDivisions(countryId) {
    const country = this.normalizeSearch(this.countries[countryId]);
    return Object.entries(this.leaguesConfig).filter(([, league]) => country && this.normalizeSearch(league.country) === country)
      .flatMap(([code, league]) => code === 'BRA' && this.gameState?.careerDivisions ? this.gameState.careerDivisions : league.divisions || []);
  },

  teamDivision(team) {
    if (this.gameState?.divisionTeams.some(t => t.id === team.id)) return { id: this.gameState.divisionId, name: this.gameState.divisionName };
    return this.countryDivisions(team.countryId).find(division => division.teams.includes(team.id)) || null;
  },

  openClubBrowser(teamId) {
    const team = this.findTeam(teamId);
    if (!team) return;
    this.clubBrowser = { countryId: String(team.countryId), divisionId: this.teamDivision(team)?.id || 'all', teamId: team.id, playerId: null, query: '' };
    this.dirtyViews?.add('teams-tab');
    this.showView('teams-tab');
    document.querySelector('#browser-team-list [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  },

  renderClubBrowser() {
    if (!this.gameState) return;
    if (!this.clubBrowser) {
      const team = this.nextOpponent() || this.gameState.userTeam;
      this.clubBrowser = { countryId: String(team.countryId), divisionId: this.teamDivision(team)?.id || 'all', teamId: team.id, playerId: null, query: '' };
    }
    const browser = this.clubBrowser;
    const teams = this.currentTeams();
    const countries = [...new Set(teams.map(t => t.countryId))].sort((a, b) => (this.countries[a] || '').localeCompare(this.countries[b] || '', 'pt-BR'));
    const countrySelect = document.getElementById('browser-country');
    countrySelect.replaceChildren(new Option('Todos os países', 'all'), ...countries.map(id => new Option(this.countries[id] || `País ${id}`, String(id))));
    countrySelect.value = browser.countryId;
    const divisions = this.countryDivisions(browser.countryId);
    if (browser.divisionId !== 'all' && browser.divisionId !== 'other' && !divisions.some(d => d.id === browser.divisionId)) browser.divisionId = 'all';
    const divisionSelect = document.getElementById('browser-division');
    divisionSelect.replaceChildren(new Option('Todos os clubes', 'all'), ...divisions.map(d => new Option(d.name, d.id)));
    if (divisions.length) divisionSelect.add(new Option('Outros clubes do país', 'other'));
    divisionSelect.value = browser.divisionId;
    divisionSelect.disabled = !divisions.length;
    const search = document.getElementById('browser-search');
    if (search.value !== browser.query) search.value = browser.query;
    document.getElementById('browser-opponent').disabled = !this.nextOpponent();

    const divisionIds = browser.divisionId === this.gameState.divisionId ? this.gameState.divisionTeams.map(t => t.id) : divisions.find(d => d.id === browser.divisionId)?.teams;
    const registered = new Set(divisions.flatMap(d => d.id === this.gameState.divisionId ? this.gameState.divisionTeams.map(t => t.id) : d.teams));
    const query = this.normalizeSearch(browser.query);
    const inLeague = teams.filter(team => (browser.countryId === 'all' || String(team.countryId) === browser.countryId) && (divisionIds ? divisionIds.includes(team.id) : browser.divisionId !== 'other' || !registered.has(team.id)));
    const filtered = inLeague.filter(team => !query || this.normalizeSearch(team.name).includes(query)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!filtered.some(t => t.id === browser.teamId)) { browser.teamId = filtered[0]?.id ?? null; browser.playerId = null; }

    const list = document.getElementById('browser-team-list');
    const scrollTop = list.scrollTop;
    const fragment = document.createDocumentFragment();
    for (const team of filtered) {
      const players = team.players || [];
      const strength = players.length ? Math.round(players.reduce((sum, p) => sum + (Number(p.strength) || 0), 0) / players.length) : 0;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'browser-team'; button.dataset.teamId = team.id;
      button.setAttribute('aria-pressed', String(team.id === browser.teamId));
      const oldRoster = team.rosterData?.status !== 'updated';
      button.title = oldRoster ? `${team.name} · Base 22/23` : `${team.name} · Elenco ${team.rosterData.seasonYear} · ${this.formatDatabaseDate(team.rosterData.fetchedAt)}`;
      button.innerHTML = `<img src="${this.assetPath('escudos', team.shield)}" alt=""><span>${this.escapeHTML(team.name)}${team.id === this.gameState.userTeam.id ? '<small>Seu time</small>' : oldRoster ? '<small class="browser-old-roster">Base 22/23</small>' : ''}</span><span class="browser-team-strength">${strength}</span>`;
      button.addEventListener('click', () => {
        browser.teamId = team.id; browser.playerId = null;
        list.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.teamId) === team.id)));
        this.renderBrowserClub(team);
        button.focus({ preventScroll: true }); button.scrollIntoView({ block: 'nearest' });
      });
      fragment.appendChild(button);
    }
    list.replaceChildren(fragment); list.scrollTop = scrollTop;
    document.getElementById('browser-team-count').textContent = query ? `${filtered.length} de ${inLeague.length} clubes` : `${filtered.length} clubes`;
    const team = filtered.find(t => t.id === browser.teamId);
    document.getElementById('browser-empty').hidden = Boolean(team);
    document.getElementById('browser-club-detail').hidden = !team;
    if (team) this.renderBrowserClub(team);
  },

  renderBrowserClub(team) {
    const players = team.players || [];
    const country = this.countries[team.countryId] || '—';
    const division = this.teamDivision(team);
    const live = this.gameState.divisionTeams.some(t => t.id === team.id);
    const money = value => `R$ ${(Number(value) || 0).toLocaleString('pt-BR')}`;
    this.setImage('browser-club-shield', this.assetPath('escudos', team.shield), 'assets/icons/escudo.png');
    this.setImage('browser-country-flag', this.assetPath('flags', `${team.countryId}.png`, 'paisVazio.png'), 'assets/icons/paisVazio.png');
    this.setImage('browser-kit-1', this.assetPath('camisas', team.shirt, 'camisat40.png'), 'assets/icons/camisat40.png');
    this.setImage('browser-kit-2', this.assetPath('camisas2', team.shirt, 'camisar40.png'), 'assets/icons/camisar40.png');
    document.getElementById('browser-club-name').textContent = team.name;
    document.getElementById('browser-club-country').textContent = country;
    document.getElementById('browser-club-league').textContent = division?.name || `Clubes de ${country}`;
    document.getElementById('browser-own-label').hidden = team.id !== this.gameState.userTeam.id;
    const facts = [
      ['Técnico', team.manager || '—'], ['Estádio', team.stadium || '—'], ['Capacidade', `${(Number(team.capacity) || 0).toLocaleString('pt-BR')} lugares`],
      ['Formação', team.formation || '4-4-2'], ['Estilo', team.tacticStyle || 'Equilibrado'], ['Folha salarial', money(players.reduce((sum, p) => sum + (Number(p.wage) || 0), 0))]
    ];
    document.getElementById('browser-club-facts').innerHTML = facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${this.escapeHTML(value)}</dd></div>`).join('');
    const record = document.getElementById('browser-season-record');
    record.hidden = !live;
    if (live) {
      const standing = LeagueEngine.calculateStandings(this.gameState.divisionTeams, this.gameState.rounds).find(t => t.id === team.id);
      record.innerHTML = `<strong>${standing.position}º na liga</strong><span>${standing.points} pontos</span><span>${standing.played} jogos</span><span>${standing.won} V · ${standing.drawn} E · ${standing.lost} D</span><span>Gols: ${standing.goalsFor} a favor · ${standing.goalsAgainst} contra</span>`;
    }
    const strength = players.length ? Math.round(players.reduce((sum, p) => sum + (Number(p.strength) || 0), 0) / players.length) : 0;
    document.getElementById('browser-roster-summary').textContent = `${players.length} jogadores · Força média ${strength}`;
    const origin = team.rosterData?.status === 'updated' ? `Elenco ${team.rosterData.seasonYear} · ${team.rosterData.provider} · Coleta ${this.formatDatabaseDate(team.rosterData.fetchedAt)}` : 'Elenco da base Brasfoot 22/23';
    document.getElementById('browser-data-source').textContent = live ? `${origin} · Temporada ${this.gameState.seasonYear}, rodada ${Math.min(this.gameState.currentRound, this.gameState.totalRounds)}` : origin;

    const rank = { G: 0, L: 1, Z: 2, M: 3, A: 4 };
    const sorted = players.map((player, index) => ({ player, index })).sort((a, b) => (rank[a.player.position] ?? 5) - (rank[b.player.position] ?? 5));
    if (!players.some(p => p.id === this.clubBrowser.playerId)) this.clubBrowser.playerId = sorted[0]?.player.id ?? null;
    const tbody = document.getElementById('browser-roster-tbody');
    const fragment = document.createDocumentFragment();
    for (const { player: p, index } of sorted) {
      const row = document.createElement('tr');
      row.dataset.playerId = p.id; row.tabIndex = 0;
      row.className = p.id === this.clubBrowser.playerId ? 'profile-selected' : '';
      row.setAttribute('aria-selected', String(p.id === this.clubBrowser.playerId));
      const status = SquadEngine.availabilityLabel(p);
      const traits = `${(p.cr1 || '—').slice(0, 3)}/${(p.cr2 || '—').slice(0, 3)}`;
      const starBadge = p.isTopWorld ? ' ⭐' : p.isStar ? ' ★' : '';
      const posBadge = `<span class="pos-badge pos-${p.position}">${this.escapeHTML(this.playerPositionCode(p))}</span>`;
      const humor = this.playerHumor(p);
      const humorBadge = `<span class="player-humor-badge" title="Humor: ${humor.label} (${humor.value}) — ${humor.desc}">${humor.emoji}</span>`;
      row.title = `${p.name} (${this.playerPositionCode(p)}) · Humor: ${humor.emoji} ${humor.label} (${humor.value}) — ${humor.desc}`;
      row.innerHTML = `<td><img class="roster-shirt" src="assets/icons/player_shirt_${index < (team.starterCount ?? 11) ? 'green' : 'gray'}small.png" alt="${index < (team.starterCount ?? 11) ? 'Titular' : 'Reserva'}"></td><td>${posBadge}</td><td>${this.escapeHTML(p.name)}${starBadge} ${humorBadge}${status ? `<span class="browser-player-warning" title="${this.escapeHTML(status)}">!</span>` : ''}</td><td>${p.sideEstimated ? '—' : this.escapeHTML(p.side || 'C')}</td><td>${Number(p.strength) || 0}</td><td>${this.energyMarkup(p)}</td><td>${this.shortMoney(p.wage)}</td><td>${this.shortMoney(p.value)}</td><td>${Number(p.goals) || 0}</td><td title="${this.escapeHTML(`${p.cr1 || '—'} / ${p.cr2 || '—'}`)}">${this.escapeHTML(traits)}</td><td>${this.playerAgeLabel(p)}</td><td>${Number(p.yellowCards) || 0}</td><td>${Number(p.redCards) || 0}</td>`;
      const inspect = () => {
        this.clubBrowser.playerId = p.id;
        tbody.querySelectorAll('tr').forEach(tr => {
          const selected = tr.dataset.playerId === p.id;
          tr.classList.toggle('profile-selected', selected); tr.setAttribute('aria-selected', String(selected));
        });
        this.renderBrowserPlayer(team, p);
      };
      row.addEventListener('click', inspect);
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); const next = e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling;
          if (next) { next.focus(); next.click(); }
        }
      });
      fragment.appendChild(row);
    }
    if (!players.length) {
      const row = document.createElement('tr'); row.innerHTML = '<td colspan="13" class="browser-no-players">Este clube não possui jogadores cadastrados.</td>'; fragment.appendChild(row);
    }
    tbody.replaceChildren(fragment);
    this.renderBrowserPlayer(team, players.find(p => p.id === this.clubBrowser.playerId));
  },

  renderBrowserPlayer(team, player) {
    const detail = document.getElementById('browser-player-detail');
    detail.hidden = !player;
    if (!player) { detail.replaceChildren(); return; }
    const positions = { G: 'Goleiro', L: 'Lateral', Z: 'Zagueiro', M: 'Meio-campista', A: 'Atacante' };
    const sides = { E: 'Esquerdo', D: 'Direito', C: 'Ambos' };
    const status = SquadEngine.availabilityLabel(player);
    const humor = this.playerHumor(player);
    const posCode = this.playerPositionCode(player);
    const posBadge = `<span class="pos-badge pos-${player.position}">${this.escapeHTML(posCode)}</span>`;
    const stats = [['Idade', this.playerAgeLabel(player, true)], ['Lado', player.sideEstimated ? 'Não informado' : sides[player.side] || player.side || 'Ambos'], ['Passe', `R$ ${(Number(player.value) || 0).toLocaleString('pt-BR')}`], ['Salário', `R$ ${(Number(player.wage) || 0).toLocaleString('pt-BR')}`], ['Jogos', player.matchesPlayed || 0], ['Gols', player.goals || 0], ['Assistências', player.assists || 0]];
    stats.push(['Humor', `${humor.emoji} ${humor.label} (${humor.value})`], ['Amarelos no ciclo', `${player.yellowCardCycle ?? (player.yellowCards || 0) % 3}/3`]);
    if (player.sourceProvider) stats.push(['Camisa', player.jerseyNumber || '—'], ['Nacionalidade', player.nationality || '—']);
    if (player.generated) stats.push(['Origem', 'Atleta fictício formado na base do clube']);
    const starBadge = player.isTopWorld ? ' ⭐' : player.isStar ? ' ★' : '';
    detail.innerHTML = `<div class="browser-player-title"><strong>${this.escapeHTML(player.name)}${starBadge}</strong><span>${posBadge} ${this.escapeHTML(player.positionDetailEstimated ? 'Defensor' : positions[player.position] || player.position)} · ${SquadEngine.starters(team).includes(player) ? 'Titular' : 'Reserva'}</span><strong>Força ${Number(player.strength) || 0}</strong></div><p class="browser-player-traits">${this.escapeHTML(player.cr1 || '—')} / ${this.escapeHTML(player.cr2 || '—')}${status ? `<span class="browser-player-health">${this.escapeHTML(status)}</span>` : ''}</p><dl>${stats.map(([label, value]) => `<div><dt>${label}</dt><dd>${this.escapeHTML(value)}</dd></div>`).join('')}</dl>`;
  },

  renderClubSidebar() {
    const team = this.gameState.userTeam;
    const players = team.players || [];
    const color = /^#[0-9a-f]{6}$/i.test(team.color1) ? team.color1 : '#183c26';
    const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    const brightness = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114;
    document.documentElement.style.setProperty('--club-color', brightness > 200 ? '#1b2621' : color);
    document.getElementById('user-manager-name').textContent = team.manager || 'Técnico';
    document.getElementById('season-label').textContent = `Temporada ${this.gameState.seasonYear}`;
    document.getElementById('squad-fitness').textContent = `${players.length ? Math.round(players.reduce((s, p) => s + (p.energy ?? 100), 0) / players.length) : 0}%`;
    document.getElementById('squad-strength').textContent = players.length ? Math.round(players.reduce((s, p) => s + (p.strength || 0), 0) / players.length) : 0;
    document.getElementById('squad-count').textContent = `${players.length} jogadores`;
    const round = this.gameState.rounds[this.gameState.currentRound - 1];
    const match = round?.matches.find(m => m.homeId === team.id || m.awayId === team.id);
    const opponent = match && this.gameState.divisionTeams.find(t => t.id === (match.homeId === team.id ? match.awayId : match.homeId));
    document.getElementById('next-match-label').textContent = match ? `Próximo jogo · ${match.homeId === team.id ? 'Casa' : 'Fora'}` : 'Temporada encerrada';
    document.getElementById('next-opponent-name').textContent = opponent?.name || 'Sem próximo jogo';
    document.getElementById('next-match-competition').textContent = match ? this.gameState.divisionName : '';
    document.getElementById('lineup-opponent-name').textContent = opponent?.name || '—';
    this.setImage('next-opponent-shield', opponent ? this.assetPath('escudos', opponent.shield) : 'assets/icons/escudo.png', 'assets/icons/escudo.png');
    this.setImage('lineup-opponent-shirt', opponent ? this.assetPath('camisas', opponent.shirt, 'camisaVazia.png') : 'assets/icons/camisaVazia.png', 'assets/icons/camisaVazia.png');
    this.setImage('club-kit-1', this.assetPath('camisas', team.shirt, 'camisat40.png'), 'assets/icons/camisat40.png');
    this.setImage('club-kit-2', this.assetPath('camisas2', team.shirt, 'camisar40.png'), 'assets/icons/camisar40.png');
    document.querySelector(`input[name="club-kit"][value="${team.selectedKit === 2 ? 2 : 1}"]`).checked = true;

    const boardEval = typeof BoardEngine !== 'undefined' ? BoardEngine.evaluate(this.gameState) : (CareerEngine?.boardConfidence ? CareerEngine.boardConfidence(this.gameState) : null);
    if (boardEval) {
      const panel = document.getElementById('board-confidence-panel');
      const statusEl = document.getElementById('board-confidence-status');
      const fillEl = document.getElementById('board-confidence-fill');
      const targetEl = document.getElementById('board-target-label');
      const pctEl = document.getElementById('board-confidence-pct');

      if (panel) panel.classList.toggle('threatened', Boolean(boardEval.threatened));
      if (statusEl) {
        statusEl.textContent = boardEval.label;
        statusEl.style.color = boardEval.color;
      }
      if (fillEl) {
        fillEl.style.width = `${boardEval.score}%`;
        fillEl.style.backgroundColor = boardEval.color;
      }
      if (targetEl) {
        targetEl.textContent = `Meta: ${boardEval.target?.label || 'A definir'}`;
      }
      if (pctEl) {
        pctEl.textContent = `${boardEval.score}%`;
      }
    }
  },

  setImage(id, src, fallback) {
    const image = document.getElementById(id);
    image.onerror = () => { image.onerror = null; image.src = fallback; };
    image.src = src;
  },

  renderPlayerProfile() {
    const p = this.gameState.userTeam.players[this.inspectedPlayerIdx] || this.gameState.userTeam.players[0];
    if (!p) return;
    const positions = { G: 'Goleiro', Z: 'Zagueiro', L: 'Lateral', M: 'Meio-campista', A: 'Atacante' };
    const side = { E: 'Esquerdo', D: 'Direito', C: 'Ambos' };
    const starBadge = p.isTopWorld ? ' ⭐' : p.isStar ? ' ★' : '';
    const humor = this.playerHumor(p);
    const posCode = this.playerPositionCode(p);
    const posName = p.positionDetailEstimated ? 'Defensor' : positions[p.position] || p.position;
    const isStarter = SquadEngine.starters(this.gameState.userTeam).includes(p);
    const values = {
      'profile-name': `${p.name}${starBadge}`, 'profile-strength': `F: ${p.strength}`,
      'profile-characteristics': `${p.cr1 || '—'} / ${p.cr2 || '—'}`,
      'profile-value': `R$ ${(p.value || 0).toLocaleString('pt-BR')}`, 'profile-wage': `R$ ${(p.wage || 0).toLocaleString('pt-BR')}`,
      'profile-age': this.playerAgeLabel(p, true), 'profile-side': p.sideEstimated ? 'Não informado' : side[p.side] || p.side || '—',
      'profile-matches': p.matchesPlayed || 0, 'profile-goals': p.goals || 0, 'profile-assists': p.assists || 0,
      'profile-availability': `${SquadEngine.availabilityLabel(p) || 'Disponível'} · Amarelos no ciclo: ${p.yellowCardCycle ?? (p.yellowCards || 0) % 3}/3`,
      'profile-humor-title': `Humor: ${humor.label}`,
      'profile-humor-desc': humor.desc,
      'profile-humor-val': `${humor.value}`,
      'profile-morale-detail': `${humor.emoji} ${humor.label} (${humor.value})`,
      'roster-selection-status': `${p.name} · ${posName} · Humor: ${humor.emoji} ${humor.label} (${humor.value}) · ${this.playerAgeLabel(p, true)}`
    };
    Object.entries(values).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });

    const posEl = document.getElementById('profile-position');
    if (posEl) {
      posEl.innerHTML = `<span class="pos-badge pos-${p.position}">${posCode}</span> ${posName} · ${isStarter ? 'Titular' : 'Reserva'}${p.generated ? ' · Atleta da base' : ''}`;
    }

    const emojiEl = document.getElementById('profile-humor-emoji');
    if (emojiEl) emojiEl.textContent = humor.emoji;

    const fillEl = document.getElementById('profile-humor-fill');
    if (fillEl) {
      fillEl.style.width = `${Math.max(5, Math.min(100, Math.round(((humor.value - 40) / 70) * 100)))}%`;
      fillEl.style.background = humor.color;
    }

    const cardEl = document.getElementById('profile-humor-card');
    if (cardEl) {
      cardEl.className = `profile-humor-card humor-${humor.level}`;
      cardEl.classList.remove('pulse-highlight');
      void cardEl.offsetWidth;
      cardEl.classList.add('pulse-highlight');
    }

    const availEl = document.getElementById('profile-availability');
    if (availEl) availEl.classList.toggle('unavailable', !SquadEngine.isAvailable(p));
  },

  openEditor() {
    const select = document.getElementById('editor-team-select');
    select.innerHTML = '';
    [...this.allTeams].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).forEach(t => {
      const option = document.createElement('option'); option.value = t.id; option.textContent = t.name; select.appendChild(option);
    });
    if (this.gameState) select.value = this.gameState.userTeam.id;
    this.fillEditor();
    document.getElementById('editor-modal').style.display = 'flex';
  },

  fillEditor() {
    const team = this.allTeams.find(t => t.id === Number(document.getElementById('editor-team-select').value));
    if (!team) return;
    document.getElementById('editor-team-name').value = team.name;
    document.getElementById('editor-stadium').value = team.stadium;
    document.getElementById('editor-manager').value = team.manager || '';
  },

  saveEditor() {
    const team = this.allTeams.find(t => t.id === Number(document.getElementById('editor-team-select').value));
    if (!team) return;
    const changes = { name: document.getElementById('editor-team-name').value.trim(), stadium: document.getElementById('editor-stadium').value.trim(), manager: document.getElementById('editor-manager').value.trim() };
    if (Object.values(changes).some(v => !v)) return;
    try {
      const overrides = JSON.parse(localStorage.getItem('brasfoot_club_overrides') || '{}');
      overrides[team.id] = changes;
      localStorage.setItem('brasfoot_club_overrides', JSON.stringify(overrides));
    } catch (e) { return this.showToast('Não foi possível salvar as alterações do clube.'); }
    Object.assign(team, changes);
    this.teamDirectory = null;
    const liveTeam = this.gameState && CareerEngine.teams(this.gameState).find(t => t.id === team.id);
    if (liveTeam) Object.assign(liveTeam, changes);
    if (this.gameState?.userTeam.id === team.id) this.gameState.managerProfile.name = changes.manager;
    if (this.gameState) { this.persistState(); this.refreshUI(); }
    this.renderTeamSelectionGrid(document.getElementById('division-filter').value);
    document.getElementById('editor-modal').style.display = 'none';
    this.showToast('Clube atualizado.');
  },

  renderSquad() {
    const tbody = this.currentView === 'squad-tab' ? document.getElementById('squad-tbody') : null;
    const lineupBody = this.currentView === 'tactics-tab' ? document.getElementById('lineup-tbody') : null;
    if (!tbody && !lineupBody) return;
    if (tbody) tbody.innerHTML = '';
    if (lineupBody) lineupBody.innerHTML = '';
    const rank = { G: 0, L: 1, Z: 2, M: 3, A: 4 };
    const starterCount = this.gameState.userTeam.starterCount ?? 11;
    const players = (this.gameState.userTeam.players || []).map((p, idx) => ({ p, idx }));
    players.sort((a, b) => {
      const isStarterA = a.idx < starterCount ? 0 : 1;
      const isStarterB = b.idx < starterCount ? 0 : 1;
      if (isStarterA !== isStarterB) return isStarterA - isStarterB;
      const posA = rank[a.p.position] ?? 5;
      const posB = rank[b.p.position] ?? 5;
      if (posA !== posB) return posA - posB;
      return (b.p.strength ?? 0) - (a.p.strength ?? 0);
    });
    let renderedReservesHeaderTbody = false;
    let renderedReservesHeaderLineup = false;
    for (const { p, idx } of players) {
      const isReserva = idx >= starterCount;
      const shirt = `<img class="roster-shirt" src="assets/icons/player_shirt_${idx < starterCount ? 'green' : 'gray'}small.png" alt="${idx < starterCount ? 'Titular' : 'Reserva'}">`;
      const traits = `${(p.cr1 || '-').slice(0, 3)}/${(p.cr2 || '-').slice(0, 3)}`;
      const fullTraits = this.escapeHTML(`${p.cr1 || '-'} / ${p.cr2 || '-'}`);
      const availability = SquadEngine.availabilityLabel(p);
      const name = this.escapeHTML(p.name) + (availability ? `<span class="availability-badge" title="${this.escapeHTML(availability)}">${p.injuredWeeks > 0 || p.pendingInjuryWeeks > 0 ? 'Lesão' : 'Suspenso'}</span>` : '');
      const starBadge = p.isTopWorld ? ' ⭐' : p.isStar ? ' ★' : '';
      const humor = this.playerHumor(p);
      const humorBadge = `<span class="player-humor-badge" title="Humor: ${humor.label} (${humor.value}) — ${humor.desc}">${humor.emoji}</span>`;
      const posBadge = `<span class="pos-badge pos-${p.position}">${this.playerPositionCode(p)}</span>`;
      const rowTitle = `${p.name} (${this.playerPositionCode(p)}) · Humor: ${humor.emoji} ${humor.label} (${humor.value}) — ${humor.desc}`;

      if (tbody) {
        if (isReserva && !renderedReservesHeaderTbody) {
          renderedReservesHeaderTbody = true;
          const sepTr = document.createElement('tr');
          sepTr.className = 'roster-separator-row';
          sepTr.innerHTML = '<td colspan="13"><span class="roster-separator-label"><img class="roster-shirt" src="assets/icons/player_shirt_graysmall.png" alt=""> RESERVAS</span></td>';
          tbody.appendChild(sepTr);
        }
        const tr = document.createElement('tr');
        tr.className = this.inspectedPlayerIdx === idx ? 'profile-selected' : '';
        tr.classList.toggle('roster-unavailable', Boolean(availability));
        tr.tabIndex = 0;
        tr.title = rowTitle;
        tr.setAttribute('aria-selected', String(this.inspectedPlayerIdx === idx));
        tr.innerHTML = `<td>${shirt}</td><td>${posBadge}</td><td>${name}${starBadge} ${humorBadge}</td><td>${p.sideEstimated ? '—' : p.side || 'C'}</td><td>${p.strength}</td><td>${this.energyMarkup(p)}</td><td>${this.shortMoney(p.wage)}</td><td>${this.shortMoney(p.value)}</td><td>${p.goals || 0}</td><td title="${fullTraits}">${this.escapeHTML(traits)}</td><td class="player-age">${this.playerAgeLabel(p)}</td><td>${p.yellowCards || 0}</td><td>${p.redCards || 0}</td>`;
        const inspect = () => { this.inspectedPlayerIdx = idx; this.renderSquad(); };
        tr.addEventListener('click', inspect);
        tr.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inspect(); } });
        tbody.appendChild(tr);
      }
      if (lineupBody) {
        if (isReserva && !renderedReservesHeaderLineup) {
          renderedReservesHeaderLineup = true;
          const sepLineup = document.createElement('tr');
          sepLineup.className = 'roster-separator-row';
          sepLineup.innerHTML = '<td colspan="7"><span class="roster-separator-label"><img class="roster-shirt" src="assets/icons/player_shirt_graysmall.png" alt=""> RESERVAS</span></td>';
          lineupBody.appendChild(sepLineup);
        }
        const lineupRow = document.createElement('tr');
        lineupRow.className = this.selectedPlayerIdx === idx ? 'squad-selected' : '';
        lineupRow.classList.toggle('roster-unavailable', Boolean(availability));
        lineupRow.tabIndex = 0;
        lineupRow.title = rowTitle;
        lineupRow.setAttribute('aria-selected', String(this.selectedPlayerIdx === idx));
        lineupRow.innerHTML = `<td>${shirt}</td><td>${posBadge}</td><td>${name}${starBadge} ${humorBadge}</td><td>${p.strength}</td><td>${this.energyMarkup(p)}</td><td>${p.sideEstimated ? '—' : p.side || 'C'}</td><td title="${fullTraits}">${this.escapeHTML(traits)}</td>`;
        lineupRow.addEventListener('click', () => this.handleSquadRowClick(idx));
        lineupRow.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.handleSquadRowClick(idx); } });
        lineupBody.appendChild(lineupRow);
      }
    }
    this.renderPlayerProfile();
    const selected = this.gameState.userTeam.players[this.selectedPlayerIdx];
    const unavailable = SquadEngine.starters(this.gameState.userTeam).filter(p => !SquadEngine.isAvailable(p));
    const selHumor = selected ? this.playerHumor(selected) : null;
    document.getElementById('lineup-help').textContent = selected ? `${selected.name} (${selHumor.emoji} Humor: ${selHumor.label} · ${selHumor.value}) selecionado. ${SquadEngine.availabilityLabel(selected) || 'Escolha outro jogador para trocar.'}`
      : unavailable.length ? `${unavailable.length} titular(es) indisponível(is). Troque-os ou use Escalar melhores.`
      : 'Selecione dois jogadores para trocar. Jogadores improvisados perdem rendimento.';
  },

  handleSquadRowClick(idx) {
    this.inspectedPlayerIdx = idx;
    if (this.selectedPlayerIdx === null) {
      this.selectedPlayerIdx = idx;
      this.renderSquad();
      this.renderTacticalPitch();
    } else if (this.selectedPlayerIdx === idx) {
      this.selectedPlayerIdx = null;
      this.renderSquad();
      this.renderTacticalPitch();
    } else {
      // Swap players
      const idx1 = this.selectedPlayerIdx;
      const idx2 = idx;
      this.selectedPlayerIdx = null;

      if (!SquadEngine.swapPlayers(this.gameState.userTeam, idx1, idx2)) this.showToast('Lesionados e suspensos não podem entrar entre os titulares.');
      this.persistState();
      this.renderSquad();
      this.renderTacticalPitch();
      this.updateTacticsPower();
    }
  },

  initializeTacticalControls() {
    for (const id of ['formation-select', 'match-formation']) {
      const select = document.getElementById(id); select.replaceChildren();
      for (const formation of Object.keys(SquadEngine.FORMATIONS)) { const option = document.createElement('option'); option.value = option.textContent = formation; select.appendChild(option); }
    }
    for (const prefix of ['tactics', 'match']) {
      const container = document.getElementById(`${prefix}-instructions`); container.replaceChildren();
      for (const [key, definition] of Object.entries(TacticsEngine.OPTIONS)) {
        const label = document.createElement('label'); label.textContent = definition.label;
        const select = document.createElement('select'); select.id = `${prefix}-${key}`; label.htmlFor = select.id;
        for (const [value, name] of Object.entries(definition.values)) { const option = document.createElement('option'); option.value = value; option.textContent = name; select.appendChild(option); }
        label.appendChild(select); container.appendChild(label);
      }
      const setPieces = document.getElementById(`${prefix}-set-pieces`); setPieces.replaceChildren();
      for (const [key, name] of Object.entries(TacticsEngine.SET_PIECES)) {
        const label = document.createElement('label'); label.textContent = name;
        const select = document.createElement('select'); select.id = `${prefix}-taker-${key}`; label.htmlFor = select.id;
        label.appendChild(select); setPieces.appendChild(label);
      }
      const presets = document.getElementById(`${prefix}-preset-select`); presets.replaceChildren();
      for (const [value, plan] of Object.entries(TacticsEngine.PRESETS)) { const option = document.createElement('option'); option.value = value; option.textContent = plan.label; presets.appendChild(option); }
    }
    document.getElementById('tactics-preset-help').textContent = TacticsEngine.PRESETS.balanced.help;
  },

  readTacticalControls(prefix) {
    return Object.fromEntries(Object.keys(TacticsEngine.OPTIONS).map(key => [key, document.getElementById(`${prefix}-${key}`).value]));
  },

  readSetPieceControls(prefix) {
    return Object.fromEntries(Object.keys(TacticsEngine.SET_PIECES).map(key => [key, document.getElementById(`${prefix}-taker-${key}`).value || null]));
  },

  writeTacticalControls(prefix, instructions, setPieces, players) {
    const normalized = TacticsEngine.normalize(instructions), takers = TacticsEngine.takers(setPieces, players);
    for (const [key, value] of Object.entries(normalized)) document.getElementById(`${prefix}-${key}`).value = value;
    for (const [key, selected] of Object.entries(takers)) {
      const select = document.getElementById(`${prefix}-taker-${key}`);
      const rosterKey = players.map(player => player.id).join('|');
      if (select.dataset.roster !== rosterKey) {
        select.replaceChildren();
        const auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Automático'; select.appendChild(auto);
        for (const player of players) { const option = document.createElement('option'); option.value = player.id; option.textContent = `${player.name} (${this.playerPositionCode(player)})`; select.appendChild(option); }
        select.dataset.roster = rosterKey;
      }
      select.value = selected ?? '';
    }
  },

  renderTeamTactics() {
    const team = this.gameState.userTeam;
    this.writeTacticalControls('tactics', team.tactics, team.setPieces, team.players);
    const effects = TacticsEngine.effects(team.tactics);
    document.getElementById('tactics-effects-summary').textContent = `${TacticsEngine.summary(team.tactics)}. Desgaste das instruções: ${Math.round(effects.energy * 100)}% do normal. Pressão, ritmo e entradas também alteram passes, disputas e faltas.`;
  },

  saveTeamInstructions(style = null) {
    if (this.gameState.activeMatch) return this.showToast('Use o painel da partida para alterar as instruções durante o jogo.');
    const next = CareerEngine.clone(this.gameState);
    next.userTeam = next.divisionTeams.find(team => team.id === next.userTeamId);
    next.userTeam.tactics = TacticsEngine.normalize(this.readTacticalControls('tactics'));
    next.userTeam.setPieces = TacticsEngine.takers(this.readSetPieceControls('tactics'), next.userTeam.players);
    if (style) next.userTeam.tacticStyle = style;
    if (!this.persistState(next)) { this.renderTeamTactics(); return; }
    this.gameState = next;
    document.getElementById('style-select').value = next.userTeam.tacticStyle || 'Equilibrado';
    this.renderTeamTactics(); this.updateTacticsPower();
    this.showToast('Instruções táticas salvas.');
  },

  renderTacticalPitch() {
    const pitch = document.getElementById('tactical-pitch');
    pitch.innerHTML = '';
    const starters = SquadEngine.starters(this.gameState.userTeam);
    const formation = this.gameState.userTeam.formation || '4-4-2';

    const positionsMap = {
      '4-4-2': [
        { x: 50, y: 88, pos: 'G' },
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
      ],
      '4-2-3-1': [
        { x: 50, y: 88, pos: 'G' },
        { x: 16, y: 70, pos: 'LE' }, { x: 38, y: 72, pos: 'Z' }, { x: 62, y: 72, pos: 'Z' }, { x: 84, y: 70, pos: 'LD' },
        { x: 36, y: 52, pos: 'V' }, { x: 64, y: 52, pos: 'V' },
        { x: 20, y: 34, pos: 'ME' }, { x: 50, y: 32, pos: 'MC' }, { x: 80, y: 34, pos: 'MD' },
        { x: 50, y: 16, pos: 'CA' }
      ],
      '3-4-3': [
        { x: 50, y: 88, pos: 'G' },
        { x: 28, y: 72, pos: 'Z' }, { x: 50, y: 74, pos: 'Z' }, { x: 72, y: 72, pos: 'Z' },
        { x: 18, y: 46, pos: 'M' }, { x: 38, y: 48, pos: 'M' }, { x: 62, y: 48, pos: 'M' }, { x: 82, y: 46, pos: 'M' },
        { x: 22, y: 18, pos: 'PE' }, { x: 50, y: 16, pos: 'CA' }, { x: 78, y: 18, pos: 'PD' }
      ],
      '5-3-2': [
        { x: 50, y: 88, pos: 'G' }, { x: 10, y: 64, pos: 'LE' }, { x: 30, y: 73, pos: 'Z' }, { x: 50, y: 74, pos: 'Z' }, { x: 70, y: 73, pos: 'Z' }, { x: 90, y: 64, pos: 'LD' },
        { x: 28, y: 45, pos: 'M' }, { x: 50, y: 48, pos: 'M' }, { x: 72, y: 45, pos: 'M' }, { x: 36, y: 18, pos: 'A' }, { x: 64, y: 18, pos: 'A' }
      ],
      '5-4-1': [
        { x: 50, y: 88, pos: 'G' }, { x: 10, y: 64, pos: 'LE' }, { x: 30, y: 73, pos: 'Z' }, { x: 50, y: 74, pos: 'Z' }, { x: 70, y: 73, pos: 'Z' }, { x: 90, y: 64, pos: 'LD' },
        { x: 18, y: 42, pos: 'M' }, { x: 38, y: 46, pos: 'M' }, { x: 62, y: 46, pos: 'M' }, { x: 82, y: 42, pos: 'M' }, { x: 50, y: 18, pos: 'A' }
      ],
      '4-1-4-1': [
        { x: 50, y: 88, pos: 'G' }, { x: 16, y: 70, pos: 'LE' }, { x: 38, y: 73, pos: 'Z' }, { x: 62, y: 73, pos: 'Z' }, { x: 84, y: 70, pos: 'LD' },
        { x: 50, y: 57, pos: 'V' }, { x: 16, y: 36, pos: 'ME' }, { x: 36, y: 38, pos: 'M' }, { x: 64, y: 38, pos: 'M' }, { x: 84, y: 36, pos: 'MD' }, { x: 50, y: 16, pos: 'A' }
      ],
      '4-4-2 diamante': [
        { x: 50, y: 88, pos: 'G' }, { x: 16, y: 70, pos: 'LE' }, { x: 38, y: 73, pos: 'Z' }, { x: 62, y: 73, pos: 'Z' }, { x: 84, y: 70, pos: 'LD' },
        { x: 50, y: 57, pos: 'V' }, { x: 26, y: 43, pos: 'ME' }, { x: 74, y: 43, pos: 'MD' }, { x: 50, y: 30, pos: 'MA' }, { x: 32, y: 16, pos: 'A' }, { x: 68, y: 16, pos: 'A' }
      ],
      '4-3-2-1': [
        { x: 50, y: 88, pos: 'G' }, { x: 16, y: 70, pos: 'LE' }, { x: 38, y: 73, pos: 'Z' }, { x: 62, y: 73, pos: 'Z' }, { x: 84, y: 70, pos: 'LD' },
        { x: 27, y: 52, pos: 'M' }, { x: 50, y: 55, pos: 'V' }, { x: 73, y: 52, pos: 'M' }, { x: 34, y: 32, pos: 'MA' }, { x: 66, y: 32, pos: 'MA' }, { x: 50, y: 15, pos: 'A' }
      ]
    };

    const coords = positionsMap[formation] || positionsMap['4-4-2'];

    const team = this.gameState.userTeam;
    const assignments = SquadEngine.assignPositions(starters, formation);
    const available = starters.map((p, idx) => ({ p, idx }));
    const kit = team.selectedKit === 2 ? 'camisas2' : 'camisas';
    coords.forEach((coord, slotIndex) => {
      const found = available.findIndex(item => assignments[item.p.id]?.index === slotIndex);
      if (found < 0) return;
      const entry = available.splice(found, 1)[0];
      if (!entry) return;
      const { p, idx } = entry;
      const slot = assignments[p.id];
      const fit = SquadEngine.positionFit(p, slot);
      const humor = this.playerHumor(p);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pitch-player' + (this.selectedPlayerIdx === idx ? ' squad-selected' : '');
      el.classList.toggle('improvised', fit < .90);
      el.title = `${p.name} · ${coord.pos} · Humor: ${humor.emoji} ${humor.label} (${humor.value}) · Adaptação ${Math.round(fit * 100)}%${SquadEngine.availabilityLabel(p) ? ' · ' + SquadEngine.availabilityLabel(p) : ''}`;
      el.style.left = `${coord.x}%`;
      el.style.top = `${coord.y}%`;
      el.setAttribute('aria-label', `${p.name}, ${p.position}, energia ${Math.round(p.energy ?? 100)}%`);
      el.setAttribute('aria-pressed', String(this.selectedPlayerIdx === idx));
      const shirt = p.position === 'G' ? 'assets/icons/camisag40.png' : this.assetPath(kit, team.shirt, 'camisat40.png');
      el.innerHTML = `<img class="player-shirt" src="${shirt}" alt="" onerror="this.onerror=null;this.src='assets/icons/camisat40.png'"><span class="player-name-tag">${this.escapeHTML(p.name.length > 16 ? p.name.slice(0, 14) + '…' : p.name)}<span><span class="pos-badge pos-${p.position}">${this.escapeHTML(coord.pos)}</span>${fit < .90 ? ' !' : ''} (${Math.round(p.energy ?? 100)}%)</span></span>`;
      el.addEventListener('click', () => this.handleSquadRowClick(idx));
      pitch.appendChild(el);
    });
    const bench = document.getElementById('lineup-bench');
    bench.innerHTML = '';
    const starterCount = team.starterCount ?? 11;
    (team.players || []).slice(starterCount, starterCount + 7).forEach((p, offset) => {
      const idx = offset + starterCount;
      const humor = this.playerHumor(p);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reserve-player' + (this.selectedPlayerIdx === idx ? ' squad-selected' : '');
      button.setAttribute('aria-pressed', String(this.selectedPlayerIdx === idx));
      button.title = `${p.name} (${p.position}) · Humor: ${humor.emoji} ${humor.label} (${humor.value}) — ${humor.desc}`;
      button.innerHTML = `<img src="assets/icons/camisar40.png" alt=""><span>${this.escapeHTML(p.name.length > 14 ? p.name.slice(0, 12) + '…' : p.name)}</span><span><span class="pos-badge pos-${p.position}">${p.position}</span> (${Math.round(p.energy ?? 100)}%)</span>`;
      button.addEventListener('click', () => this.handleSquadRowClick(idx));
      bench.appendChild(button);
    });
  },

  updateTacticsPower() {
    const power = MatchEngine.calculateTeamPower(this.gameState.userTeam, false);
    for (const [id, sector] of [['gk', 'gk'], ['def', 'defense'], ['mid', 'midfield'], ['att', 'attack']]) {
      const element = document.getElementById(`tactics-power-${id}`);
      element.textContent = Math.round(power[sector]);
      element.title = 'Força efetiva: características, energia, moral, posição, formação, estilo e instruções táticas. Sem bônus de mando.';
    }
  },

  renderStandings() {
    const tbody = document.getElementById('standings-tbody');
    tbody.innerHTML = '';
    const standings = LeagueEngine.calculateStandings(this.gameState.divisionTeams, this.gameState.rounds);
    const totalTeams = standings.length;
    const divisions = this.gameState.careerDivisions || this.leaguesConfig.BRA.divisions;
    const divisionIndex = divisions.findIndex(division => division.id === this.gameState.divisionId);
    const division = divisions[divisionIndex];
    document.getElementById('legend-top-label').textContent = divisionIndex === 0 ? 'G4 / Libertadores' : 'Acesso';
    document.getElementById('legend-top').hidden = divisionIndex !== 0 && !division?.promoted;
    document.getElementById('legend-middle').hidden = divisionIndex !== 0;
    document.getElementById('legend-bottom').hidden = !division?.relegated;

    standings.forEach(row => {
      const tr = document.createElement('tr');
      if (row.position <= (divisionIndex === 0 ? 4 : division?.promoted || 0)) tr.classList.add('g4');
      else if (division?.relegated && row.position > totalTeams - division.relegated) tr.classList.add('z4');
      else if (divisionIndex === 0 && row.position <= 12) tr.classList.add('sula');

      if (row.id === this.gameState.userTeam.id) tr.classList.add('user-team');

      tr.innerHTML = `
        <td><strong>${row.position}</strong></td>
        <td>
          <button type="button" class="club-name-link" title="Consultar elenco do ${this.escapeHTML(row.name)}"><img src="${this.assetPath('escudos', row.shield)}" alt="">${this.escapeHTML(row.name)}</button>
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
      tr.querySelector('.club-name-link').addEventListener('click', () => this.openClubBrowser(row.id));
      tbody.appendChild(tr);
    });
  },

  renderTopScorers() {
    const tbody = document.getElementById('scorers-tbody');
    tbody.innerHTML = '';
    const scorers = LeagueEngine.getTopScorers(this.gameState.divisionTeams);

    if (scorers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum gol marcado ainda na temporada.</td></tr>';
      return;
    }

    scorers.forEach((s, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${idx + 1}</strong></td>
        <td><strong>${this.escapeHTML(s.name)}</strong> <span class="pos-badge pos-${s.position}">${s.position}</span></td>
        <td>
          <img src="${this.assetPath("escudos", s.teamShield)}" width="18" height="18" style="vertical-align: middle; margin-right: 4px;" onerror="this.src='assets/icons/escudo.png'">
          ${this.escapeHTML(s.teamName)}
        </td>
        <td><strong>${s.goals}</strong></td>
      `;
      tbody.appendChild(tr);
    });
  },

  renderRoundFixtures() {
    const grid = document.getElementById('round-fixtures-grid');
    grid.innerHTML = '';
    const roundIdx = Math.min(this.gameState.currentRound - 1, this.gameState.totalRounds - 1);
    const round = this.gameState.rounds[roundIdx];
    if (!round) return;

    const teamMap = {};
    this.gameState.divisionTeams.forEach(t => (teamMap[t.id] = t));

    round.matches.forEach(m => {
      const h = teamMap[m.homeId] || { name: 'Time A', shield: '' };
      const a = teamMap[m.awayId] || { name: 'Time B', shield: '' };
      const isUserMatch = (m.homeId === this.gameState.userTeam.id || m.awayId === this.gameState.userTeam.id);

      const card = document.createElement('div');
      card.className = 'fixture-card' + (isUserMatch ? ' user-match' : '');
      const scoreText = m.isPlayed ? `${m.homeScore} x ${m.awayScore}` : 'vs';

      card.innerHTML = `
        <div class="fixture-team home">
          <img src="${this.assetPath("escudos", h.shield)}" onerror="this.src='assets/icons/escudo.png'">
          <span>${this.escapeHTML(h.name)}</span>
        </div>
        <div class="fixture-score">${scoreText}</div>
        <div class="fixture-team away">
          <span>${this.escapeHTML(a.name)}</span>
          <img src="${this.assetPath("escudos", a.shield)}" onerror="this.src='assets/icons/escudo.png'">
        </div>
      `;
      grid.appendChild(card);
    });
  },

  renderStadiumTab() {
    const team = this.gameState.userTeam;
    document.getElementById('stadium-name').textContent = team.stadium;
    document.getElementById('stadium-capacity').textContent = team.capacity.toLocaleString('pt-BR');
    document.getElementById('stadium-budget').textContent = this.financeMoney(team.balance);
  },

  financeMoney(value) {
    return `R$ ${(Number(value) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
  },

  setFinanceMoney(id, value) {
    const node = document.getElementById(id);
    node.textContent = this.financeMoney(value);
    node.classList.toggle('negative', value < 0); node.classList.toggle('positive', value > 0);
  },

  renderFinances() {
    const state = this.gameState, team = state.userTeam, escape = value => this.escapeHTML(value);
    FinanceEngine.ensureLedger(team, { year: state.seasonYear, round: state.currentRound });
    const seasons = team.finances.seasons, select = document.getElementById('finance-season-filter');
    if (!seasons.some(season => season.year === this.financeYear)) this.financeYear = state.seasonYear;
    select.replaceChildren();
    [...seasons].reverse().forEach(season => {
      const option = document.createElement('option'); option.value = season.year; option.textContent = season.year;
      select.appendChild(option);
    });
    select.value = String(this.financeYear);
    const model = FinanceEngine.overview(team, this.financeYear), season = model.season;
    document.getElementById('finance-club-name').textContent = `${team.name} · ${state.divisionName} · Temporada atual ${state.seasonYear}`;
    this.setFinanceMoney('finance-cash', team.balance);
    this.setFinanceMoney('finance-income', model.income); this.setFinanceMoney('finance-expenses', -model.expenses);
    this.setFinanceMoney('finance-net', model.net);
    document.getElementById('finance-income-label').textContent = `Entradas registradas em ${this.financeYear}`;
    document.getElementById('finance-expense-label').textContent = `Saídas registradas em ${this.financeYear}`;
    document.getElementById('finance-coverage').textContent = `Saldo anterior preservado. Extrato detalhado desde a rodada ${season.startedRound} de ${season.year}; movimentações anteriores a esse início não foram reconstruídas. Histórico de até cinco temporadas por clube.`;
    document.getElementById('finance-categories').innerHTML = Object.entries(model.categories).filter(([, value]) => value !== 0)
      .map(([category, value]) => `<div><dt>${escape(FinanceEngine.CATEGORIES[category])}</dt><dd class="${value < 0 ? 'negative' : 'positive'}">${escape(this.financeMoney(value))}</dd></div>`).join('')
      || '<div><dt>Nenhuma movimentação registrada neste período.</dt><dd>—</dd></div>';
    this.renderFinanceChart(season); this.renderFinanceStatement();
    const wageBill = FinanceEngine.estimateRound(team).wageBill;
    const players = [...team.players].sort((a, b) => FinanceEngine.wage(b) - FinanceEngine.wage(a));
    document.getElementById('finance-wages-summary').textContent = `${players.length} jogadores · ${this.financeMoney(wageBill)} por rodada. O clube que recebe o atleta por empréstimo paga o salário.`;
    document.getElementById('finance-wages-tbody').innerHTML = players.map(player => `<tr><td>${escape(player.name)}${player.loan ? ' · Emprestado' : ''}</td><td>${escape(this.financeMoney(FinanceEngine.wage(player)))}</td><td>${wageBill ? (FinanceEngine.wage(player) / wageBill * 100).toFixed(1).replace('.', ',') : '0'}%</td></tr>`).join('');
    document.getElementById('ticket-price-slider').value = team.ticketPrice || 30;
    document.getElementById('ticket-price-slider').disabled = Boolean(state.activeMatch);
    document.getElementById('finance-ticket-status').textContent = state.activeMatch ? 'Feche a partida para alterar o ingresso.' : `Preço salvo: ${this.financeMoney(team.ticketPrice || 30)}.`;
    this.renderFunding(); this.updateFinanceSummary();
  },

  renderFunding() {
    const state = this.gameState, economy = EconomyEngine.ensure(state), budget = EconomyEngine.budget(state);
    const escape = value => this.escapeHTML(value), sponsor = economy.sponsor;
    document.getElementById('finance-tv-summary').textContent = `Cota de TV: ${this.financeMoney(economy.tvPerRound)} por rodada · ${state.divisionName}. Valores definidos na abertura do ano conforme divisão e reputação.`;
    const offers = sponsor ? [sponsor] : EconomyEngine.sponsorOffers(state);
    document.getElementById('finance-sponsor-offers').innerHTML = offers.map(offer => `<article class="sponsor-offer"><h4>${escape(offer.name)}${sponsor ? ' · Contratado' : ''}</h4><p>${escape(this.financeMoney(offer.perRound))} por rodada${offer.winBonus ? ` + ${escape(this.financeMoney(offer.winBonus))} por vitória` : ''}.${offer.targetPosition ? ` Bônus de ${escape(this.financeMoney(offer.targetBonus))} por terminar em ${offer.targetPosition}º ou melhor, proporcional às rodadas contratadas.` : ''}${sponsor ? ` Vigência: rodada ${sponsor.signedRound} até o fim de ${economy.year}.` : ''}</p>${sponsor ? '' : `<button class="btn btn-small" data-sponsor="${escape(offer.id)}" ${state.activeMatch || !state.rounds.some(round => !round.isFinished) ? 'disabled' : ''}>Contratar ${escape(offer.name)}</button>`}</article>`).join('');
    document.getElementById('finance-sponsor-offers').querySelectorAll('[data-sponsor]').forEach(button => button.addEventListener('click', () => this.commitEconomyAction({ type: 'sponsor', offerId: button.dataset.sponsor })));
    this.setFinanceMoney('finance-transfer-room', budget.available); this.setFinanceMoney('finance-transfer-limit', budget.transferLimit);
    this.setFinanceMoney('finance-sales-budget', budget.sales); this.setFinanceMoney('finance-budget-spent', -budget.spent);
    this.setFinanceMoney('finance-wage-committed', -budget.committedWages); this.setFinanceMoney('finance-wage-limit', budget.wageLimit);
    const wait = Math.max(0, 4 - (state.currentRound - budget.lastReviewRound));
    document.getElementById('finance-budget-review').disabled = Boolean(state.activeMatch) || wait > 0;
    document.getElementById('finance-budget-review-status').textContent = wait ? `Nova revisão após ${wait} rodada(s). Os limites são renovados no próximo ano.` : 'Revisão disponível. A diretoria pode liberar verba conforme o caixa e a folha atuais.';
  },

  commitEconomyAction(action) {
    try {
      const result = EconomyEngine.transact(this.gameState, action);
      if (!this.persistState(result.state)) return false;
      this.gameState = result.state; this.refreshUI(); this.showToast(result.message); return true;
    } catch (error) { this.showToast(error.message); return false; }
  },

  renderFinanceStatement() {
    const model = FinanceEngine.overview(this.gameState.userTeam, this.financeYear), escape = value => this.escapeHTML(value);
    const filter = document.getElementById('finance-entry-filter').value || 'all';
    const entries = [...(model.season?.entries || [])].reverse().filter(entry => filter === 'all' || entry.kind === filter);
    document.getElementById('finance-opening').textContent = `Saldo no início do registro: ${this.financeMoney(model.season?.openingBalance)} · Saldo ao fim do período: ${this.financeMoney(model.closingBalance)}.`;
    document.getElementById('finance-statement-tbody').innerHTML = entries.map(entry => {
      const income = entry.lines.reduce((sum, line) => sum + Math.max(0, line.amount), 0);
      const expenses = entry.lines.reduce((sum, line) => sum + Math.max(0, -line.amount), 0);
      const details = entry.lines.filter(line => line.amount !== 0).map(line => `${FinanceEngine.CATEGORIES[line.category]}: ${this.financeMoney(line.amount)}`).join(' · ');
      const attendance = entry.details?.isHomeMatch ? ` · Público: ${Number(entry.details.attendance).toLocaleString('pt-BR')}` : '';
      return `<tr><td>R${Number(entry.round)}</td><td>${escape(entry.description)}<small>${escape(details + attendance)}</small></td><td class="positive">${income ? escape(this.financeMoney(income)) : '—'}</td><td class="negative">${expenses ? escape(this.financeMoney(expenses)) : '—'}</td><td class="${entry.balance < 0 ? 'negative' : ''}">${escape(this.financeMoney(entry.balance))}</td></tr>`;
    }).join('') || '<tr><td colspan="5">Nenhuma movimentação neste filtro. As próximas rodadas, negociações, obras e premiações aparecerão aqui.</td></tr>';
  },

  renderFinanceChart(season) {
    const escape = value => this.escapeHTML(value), entries = season.entries, offset = Math.max(0, entries.length - 12);
    const points = [{ balance: offset ? entries[offset - 1].balance : season.openingBalance, description: offset ? 'Saldo anterior' : 'Saldo inicial' }, ...entries.slice(offset)];
    const values = points.map(point => point.balance), low = Math.min(...values), high = Math.max(...values), span = Math.max(1, high - low);
    const coords = points.map((point, index) => ({ x: 15 + index / Math.max(1, points.length - 1) * 610, y: 145 - (point.balance - low) / span * 130 }));
    const color = values.at(-1) < values[0] ? '#99372e' : '#327345';
    const zeroY = 145 - (0 - low) / span * 130;
    document.getElementById('finance-chart').innerHTML = `<svg viewBox="0 0 640 160" role="img" aria-label="Evolução do caixa em ${Number(season.year)}"><title>${escape(`Caixa de ${this.financeMoney(values[0])} para ${this.financeMoney(values.at(-1))}`)}</title>
      ${low < 0 && high > 0 ? `<line x1="15" x2="625" y1="${zeroY}" y2="${zeroY}" stroke="#9ca68f" stroke-dasharray="5 4"/>` : ''}
      <polyline fill="none" stroke="${color}" stroke-width="3" points="${coords.map(point => `${point.x},${point.y}`).join(' ')}"/>
      ${points.map((point, index) => `<circle cx="${coords[index].x}" cy="${coords[index].y}" r="4" fill="${color}"><title>${escape(`${point.round ? `R${point.round} · ` : ''}${point.description}: ${this.financeMoney(point.balance)}`)}</title></circle>`).join('')}</svg>
      <div class="finance-chart-range"><span>Menor: ${escape(this.financeMoney(low))}</span><span>Maior: ${escape(this.financeMoney(high))}</span><span>Último: ${escape(this.financeMoney(values.at(-1)))}</span></div>`;
  },

  updateFinanceSummary(price = null) {
    if (!this.gameState) return;
    const projection = FinanceEngine.project(this.gameState, price), report = projection.home;
    document.getElementById('ticket-price-val').textContent = this.financeMoney(report.ticketPrice);
    document.getElementById('finance-attendance').textContent = `${report.attendance.toLocaleString('pt-BR')} torcedores`;
    this.setFinanceMoney('fin-match-income', report.matchIncome); this.setFinanceMoney('fin-wage-bill', -report.wageBill);
    this.setFinanceMoney('finance-fixed-income', projection.fixedPerRound);
    this.setFinanceMoney('fin-maintenance', -report.maintenance); this.setFinanceMoney('finance-home-net', report.netWeekly);
    this.setFinanceMoney('finance-away-net', projection.away.netWeekly); this.setFinanceMoney('finance-projected-cash', projection.projectedBalance);
    document.getElementById('finance-remaining').textContent = `${projection.remainingRounds} rodadas restantes · ${projection.homeGames} jogos em casa`;
    const advice = [];
    if (this.gameState.userTeam.balance < 0) advice.push('O caixa está negativo. Considere vender ou emprestar atletas para recuperar saldo e reduzir a folha.');
    else if (projection.projectedBalance < 0) advice.push(`O cenário atual termina com déficit de ${this.financeMoney(-projection.projectedBalance)}. Planeje negociações antes de assumir novas despesas.`);
    if (report.netWeekly < 0) advice.push('A receita estimada em casa, incluindo TV e patrocínio fixo, não cobre salários e manutenção da rodada. Compare os salários com as atuações na aba Desempenho.');
    if (!this.gameState.userTeam.economy?.sponsor && projection.remainingRounds) advice.push('Escolha um patrocinador para receber a receita a partir da próxima rodada concluída.');
    if (projection.homeGames) advice.push('Experimente o preço do ingresso e acompanhe a previsão de público e caixa antes de salvar o valor.');
    if (!advice.length) advice.push('O cenário atual mantém o caixa positivo. Reserve recursos para salários, manutenção e reforços.');
    document.getElementById('finance-advice-list').innerHTML = advice.map(text => `<li>${this.escapeHTML(text)}</li>`).join('');
  },

  saveTicketPrice(value) {
    if (!this.gameState || this.gameState.activeMatch) return this.showToast('Feche a partida antes de alterar o ingresso.');
    if (!Number.isFinite(value)) return this.showToast('Informe um preço de ingresso válido.');
    const next = CareerEngine.clone(this.gameState); next.userTeam = next.divisionTeams.find(team => team.id === next.userTeamId);
    next.userTeam.ticketPrice = Math.max(10, Math.min(150, Math.round(value)));
    if (!this.persistState(next)) {
      document.getElementById('ticket-price-slider').value = this.gameState.userTeam.ticketPrice || 30;
      document.getElementById('finance-ticket-status').textContent = 'Não foi possível salvar. O preço anterior foi mantido.';
      this.updateFinanceSummary(); return false;
    }
    this.gameState = next; this.refreshUI();
    this.showToast(`Preço do ingresso atualizado para ${this.financeMoney(next.userTeam.ticketPrice)}.`);
    return true;
  },

  upgradeStadium(seats) {
    if (!this.gameState || this.gameState.activeMatch) return this.showToast('Feche a partida antes de ampliar o estádio.');
    const next = CareerEngine.clone(this.gameState); next.userTeam = next.divisionTeams.find(team => team.id === next.userTeamId);
    const res = FinanceEngine.upgradeStadium(next.userTeam, seats, { year: next.seasonYear, round: next.currentRound });
    if (!res.success) { this.showToast(res.message); return false; }
    if (!this.persistState(next)) return false;
    this.gameState = next; this.refreshUI(); this.showToast(res.message); return true;
  },

  searchMarket() {
    const name = document.getElementById('market-search-name')?.value || '';
    const position = document.getElementById('market-pos-filter')?.value || 'TODOS';
    const minStrength = Number(document.getElementById('market-min-str')?.value) || 0;
    const maxPrice = Number(document.getElementById('market-max-price')?.value) || Infinity;
    const maxWage = Number(document.getElementById('market-max-wage')?.value) || Infinity;
    const maxAge = Number(document.getElementById('market-max-age')?.value) || Infinity;
    const contractStatus = document.getElementById('market-contract-filter')?.value || 'all';

    const results = MarketEngine.searchPlayers(this.currentTeams(), {
      name,
      position,
      minStrength,
      maxPrice,
      maxWage,
      maxAge,
      contractStatus,
      currentYear: this.gameState.seasonYear
    }, this.gameState.userTeam.id);

    const tbody = document.getElementById('market-tbody');
    tbody.innerHTML = '';

    if (results.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px;">Nenhum jogador encontrado.</td></tr>';
      return;
    }

    results.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="pos-badge pos-${p.position}">${this.playerPositionCode(p)}</span></td>
        <td><strong>${this.escapeHTML(p.name)}</strong> ${p.isTopWorld ? '⭐' : p.isStar ? '★' : ''}</td>
        <td>${this.playerAgeLabel(p)}</td>
        <td><strong>${p.strength}</strong></td>
        <td>${this.escapeHTML(p.cr1 || '-')}</td>
        <td>${this.escapeHTML(p.cr2 || '-')}</td>
        <td>
          <img src="${this.assetPath("escudos", p.teamShield)}" width="16" height="16" style="vertical-align: middle;" onerror="this.src='assets/icons/escudo.png'">
          ${this.escapeHTML(p.teamName)}
        </td>
        <td>R$ ${(p.value || 100000).toLocaleString('pt-BR')}</td>
        <td>
          ${p.loan ? '<span class="market-help">Emprestado</span>' : '<button class="btn btn-small btn-primary" data-contract="buy">Comprar</button> <button class="btn btn-small" data-contract="loan-in">Empréstimo</button>'}
        </td>
      `;
      tr.querySelectorAll('[data-contract]').forEach(button => button.addEventListener('click', () => this.openTransfer(button.dataset.contract, p.id, p.teamId)));
      tbody.appendChild(tr);
    });
  },

  renderMarketIndicators() {
    const market = MarketEngine.ensureState(this.gameState);
    const count = market.offers.filter(offer => offer.status === 'pending').length;
    const badge = document.getElementById('market-offer-count');
    badge.hidden = !count; badge.textContent = count;
    document.getElementById('market-nav-btn').setAttribute('aria-label', `Mercado${count ? `, ${count} propostas por jogadores` : ''}`);
  },

  renderMarket() {
    const state = this.gameState, market = MarketEngine.ensureState(state), escape = value => this.escapeHTML(value);
    this.renderMarketIndicators();
    document.querySelectorAll('[data-market-panel]').forEach(panel => { panel.hidden = panel.dataset.marketPanel !== this.marketView; });
    document.querySelectorAll('[data-market-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.marketView === this.marketView)));
    const pending = market.offers.filter(offer => offer.status === 'pending');
    document.getElementById('market-pending-label').textContent = pending.length ? `(${pending.length})` : '';
    document.getElementById('market-balance-label').textContent = `Caixa: R$ ${Number(state.userTeam.balance || 0).toLocaleString('pt-BR')}`;
    document.getElementById('market-status').textContent = state.activeMatch ? 'Conclua e feche a partida para negociar.'
      : pending.length ? `${pending.length} proposta(s) por jogadores aguardando sua decisão.` : 'O interesse dos clubes é avaliado a partir da terceira rodada, conforme a forma recente e as necessidades dos elencos.';
    if (['contracts', 'freeAgents'].includes(this.marketView)) { this.renderContracts(); return; }
    if (this.marketView === 'search') this.searchMarket();
    const squad = document.getElementById('market-squad-tbody');
    squad.innerHTML = state.userTeam.players.map(player => `<tr><td>${escape(player.name)}${player.loan ? ' · Emprestado' : ''}</td><td><span class="pos-badge pos-${player.position}">${escape(this.playerPositionCode(player))}</span></td><td>${player.matchesPlayed || 0}</td><td>${player.goals || 0}</td><td>${player.assists || 0}</td><td>${this.ratingLabel(PerformanceEngine.average(player))}</td><td>${this.shortMoney(player.value)}</td><td>${player.loan ? `Retorno em ${player.loan.endYear}` : `<button class="btn btn-small" data-sell-player="${escape(player.id)}">Vender</button> <button class="btn btn-small" data-loan-player="${escape(player.id)}">Emprestar</button>`}</td></tr>`).join('');
    squad.querySelectorAll('[data-sell-player]').forEach(button => button.addEventListener('click', () => this.openTransfer('sell', button.dataset.sellPlayer)));
    squad.querySelectorAll('[data-loan-player]').forEach(button => button.addEventListener('click', () => this.openTransfer('loan-out', button.dataset.loanPlayer)));
    const offers = document.getElementById('market-incoming-offers');
    offers.innerHTML = pending.length ? pending.map(offer => `<article class="market-offer"><div class="manager-tenure-heading"><img src="${this.assetPath('escudos', offer.shield)}" alt=""><div><h3>${escape(offer.clubName)}</h3><span>${offer.type === 'loan' ? 'Empréstimo' : 'Compra definitiva'} · ${escape(offer.playerName)}</span></div><strong>R$ ${offer.amount.toLocaleString('pt-BR')}</strong></div><p>${escape(offer.reason)}</p><p class="market-help">Válida até ${offer.expiresRound > state.totalRounds ? 'o encerramento' : `a rodada ${offer.expiresRound}`} de ${offer.seasonYear}${offer.type === 'loan' ? ' · Retorno ao fim da temporada' : ''}.</p><div class="manager-offer-actions"><button class="btn btn-small btn-primary" data-player-offer="${escape(offer.id)}">Analisar proposta</button><button class="btn btn-small" data-decline-player-offer="${escape(offer.id)}">Recusar</button></div></article>`).join('')
      : '<p class="manager-profile-empty">Nenhuma proposta pendente. Continue jogando: boas atuações podem atrair compradores, e jogadores com poucos minutos podem receber convites de empréstimo.</p>';
    const previous = market.offers.filter(offer => offer.status !== 'pending').slice(-12).reverse();
    const labels = { accepted: 'Aceita', declined: 'Recusada', expired: 'Expirada', withdrawn: 'Encerrada após negociação' };
    if (previous.length) offers.insertAdjacentHTML('beforeend', `<details class="market-past-offers"><summary>Propostas anteriores</summary><ul>${previous.map(offer => `<li>${escape(offer.playerName)} · ${escape(offer.clubName)} · ${labels[offer.status] || 'Encerrada'}</li>`).join('')}</ul></details>`);
    offers.querySelectorAll('[data-player-offer]').forEach(button => button.addEventListener('click', () => this.openTransfer('accept', null, null, button.dataset.playerOffer)));
    offers.querySelectorAll('[data-decline-player-offer]').forEach(button => button.addEventListener('click', () => this.commitMarketAction({ type: 'decline', offerId: button.dataset.declinePlayerOffer })));
    const world = MarketEngine.worldTeams(state), byId = new Map(world.map(team => [team.id, team]));
    const loans = world.flatMap(team => team.players.filter(player => player.loan && [player.loan.ownerTeamId, player.loan.borrowerTeamId].includes(state.userTeamId)).map(player => ({ player, team })));
    document.getElementById('market-active-loans').innerHTML = loans.length ? loans.map(({ player, team }) => `<article class="market-offer"><h3>${escape(player.name)}</h3><p>${player.loan.ownerTeamId === state.userTeamId ? 'Emprestado para' : 'Recebido de'} ${escape(player.loan.ownerTeamId === state.userTeamId ? team.name : byId.get(player.loan.ownerTeamId)?.name)}</p><p class="market-help">Até o fim de ${player.loan.endYear} · Salário pago por ${escape(team.name)} · Taxa: R$ ${player.loan.fee.toLocaleString('pt-BR')}</p></article>`).join('') : '<p class="manager-profile-empty">Nenhum empréstimo ativo neste clube.</p>';
    document.getElementById('market-history-tbody').innerHTML = market.history.filter(deal => [deal.fromId, deal.toId].includes(state.userTeamId)).reverse().map(deal => `<tr><td>${deal.year} · R${Math.min(deal.round, state.totalRounds)}</td><td>${({ transfer: 'Transferência', loan: 'Empréstimo', return: 'Retorno' })[deal.type]}</td><td>${escape(deal.playerName)}</td><td>${escape(deal.fromName)}</td><td>${escape(deal.toName)}</td><td>R$ ${deal.amount.toLocaleString('pt-BR')}</td></tr>`).join('') || '<tr><td colspan="6">As negociações concluídas aparecerão aqui.</td></tr>';
  },

  renderContracts() {
    const state = this.gameState, escape = value => this.escapeHTML(value);
    ContractsEngine.ensureState(state);
    const owned = ContractsEngine.ownedPlayers(state).sort((a, b) => a.player.contract.endYear - b.player.contract.endYear || a.player.name.localeCompare(b.player.name, 'pt-BR'));
    const expiring = owned.filter(({ player }) => player.contract.endYear <= Number(state.seasonYear));
    document.getElementById('market-contract-summary').textContent = `${owned.length} contratos do clube · ${expiring.length} vencem ao fim de ${state.seasonYear}. Atletas recebidos por empréstimo têm contrato com o clube de origem.`;
    document.getElementById('market-contracts-tbody').innerHTML = owned.map(({ player, club }) => {
      const signed = player.contract.renewedYear === Number(state.seasonYear), expires = player.contract.endYear <= Number(state.seasonYear);
      return `<tr${expires ? ' class="contract-expiring"' : ''}><td>${escape(player.name)}</td><td><span class="pos-badge pos-${player.position}">${escape(this.playerPositionCode(player))}</span></td><td>${Number(player.contract.endYear)}</td><td>${escape(this.financeMoney(player.contract.wage))}</td><td>${player.loan ? `Cedido ao ${escape(club.name)}` : expires ? 'Vence nesta temporada' : signed ? 'Assinado neste ano' : 'Em vigor'}</td><td><button class="btn btn-small" data-renew-contract="${escape(player.id)}" ${signed || state.activeMatch ? 'disabled' : ''}>Renovar</button> <button class="btn btn-small" data-release-contract="${escape(player.id)}" ${player.loan || state.activeMatch ? 'disabled' : ''}>Rescindir</button></td></tr>`;
    }).join('') || '<tr><td colspan="6">Nenhum contrato próprio.</td></tr>';
    document.getElementById('market-contracts-tbody').querySelectorAll('[data-renew-contract]').forEach(button => button.addEventListener('click', () => this.openContract('renew', button.dataset.renewContract)));
    document.getElementById('market-contracts-tbody').querySelectorAll('[data-release-contract]').forEach(button => button.addEventListener('click', () => this.openContract('release', button.dataset.releaseContract)));
    const agents = [...state.freeAgents].sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name, 'pt-BR'));
    document.getElementById('market-free-agents-tbody').innerHTML = agents.map(player => `<tr><td>${escape(player.name)}</td><td><span class="pos-badge pos-${player.position}">${escape(this.playerPositionCode(player))}</span></td><td>${this.playerAgeLabel(player)}</td><td>${Number(player.strength)}</td><td>${escape(player.lastClubName || '—')}</td><td>${escape(this.financeMoney(ContractsEngine.quote(player, 'sign').wage))}</td><td><button class="btn btn-small" data-sign-contract="${escape(player.id)}" ${state.activeMatch ? 'disabled' : ''}>Negociar</button></td></tr>`).join('') || '<tr><td colspan="7">Nenhum atleta sem clube. A lista recebe jogadores liberados durante a carreira.</td></tr>';
    document.getElementById('market-free-agents-tbody').querySelectorAll('[data-sign-contract]').forEach(button => button.addEventListener('click', () => this.openContract('sign', button.dataset.signContract)));
  },

  openContract(type, playerId) {
    if (this.gameState.activeMatch) return this.showToast('Feche a partida antes de negociar contratos.');
    const state = this.gameState;
    const player = type === 'sign' ? state.freeAgents.find(entry => String(entry.id) === String(playerId))
      : ContractsEngine.ownedPlayers(state).find(entry => String(entry.player.id) === String(playerId))?.player;
    if (!player || !['sign', 'renew', 'release'].includes(type)) return this.showToast('Jogador indisponível.');
    if (type === 'release' && player.loan) return this.showToast('Aguarde o retorno do empréstimo para rescindir.');
    if (type === 'renew' && player.contract.renewedYear === Number(state.seasonYear)) return this.showToast('Contrato já assinado ou renovado neste ano.');
    this.contractRequest = { type, playerId: player.id };
    document.getElementById('contract-title').textContent = ({ renew: 'Renovar contrato', sign: 'Contratar atleta sem clube', release: 'Rescindir contrato' })[type];
    document.getElementById('contract-player-summary').textContent = `${player.name} · ${this.playerPositionCode(player)} · Força ${player.strength}${player.contract ? ` · Vínculo atual até ${player.contract.endYear}` : ''}`;
    const fields = document.getElementById('contract-terms-fields'); fields.hidden = type === 'release'; fields.disabled = type === 'release';
    if (type !== 'release') {
      const quote = ContractsEngine.quote(player, type);
      if (type === 'renew') quote.years = Math.max(quote.years, player.contract.endYear - Number(state.seasonYear) + 1);
      for (const [key, value] of Object.entries(quote)) document.getElementById(`contract-${key}`).value = value;
      document.getElementById('contract-wage').min = quote.wage; document.getElementById('contract-bonus').min = quote.bonus;
      document.getElementById('contract-years').min = type === 'renew' ? Math.max(1, player.contract.endYear - Number(state.seasonYear) + 1) : 1;
      document.getElementById('contract-conditions').textContent = `Exigência mínima: ${this.financeMoney(quote.wage)} de salário por rodada e ${this.financeMoney(quote.bonus)} de luvas à vista.${player.loan ? ' O salário renovado passa a valer para o dono do passe após o retorno; o acordo de salário do empréstimo será cumprido.' : ''}`;
    } else document.getElementById('contract-conditions').textContent = 'O jogador ficará sem clube após o pagamento. O elenco precisa manter 15 atletas e pelo menos um goleiro.';
    document.getElementById('contract-submit').textContent = type === 'release' ? 'Pagar e rescindir' : 'Assinar contrato';
    document.getElementById('contract-error').textContent = '';
    this.updateContractTerms(); document.getElementById('contract-modal').style.display = 'flex'; document.getElementById('contract-submit').focus();
  },

  updateContractTerms() {
    const request = this.contractRequest; if (!request) return;
    const budget = EconomyEngine.budget(this.gameState);
    if (request.type === 'release') {
      const player = ContractsEngine.ownedPlayers(this.gameState).find(entry => entry.player.id === request.playerId)?.player;
      document.getElementById('contract-total').textContent = `Rescisão à vista: ${this.financeMoney(ContractsEngine.terminationCost(this.gameState, player))}. Orçamento disponível: ${this.financeMoney(budget.available)}.`;
    } else {
      const year = Number(this.gameState.seasonYear) + Number(document.getElementById('contract-years').value) - 1;
      document.getElementById('contract-total').textContent = `Vínculo até o fim de ${year}. Luvas agora: ${this.financeMoney(Number(document.getElementById('contract-bonus').value))}. Salário: ${this.financeMoney(Number(document.getElementById('contract-wage').value))} por rodada. Espaço na folha: ${this.financeMoney(budget.wageRoom)}; verba disponível: ${this.financeMoney(budget.available)}.`;
    }
  },

  submitContract() {
    if (!this.contractRequest) return;
    const action = { ...this.contractRequest };
    if (action.type !== 'release') action.terms = Object.fromEntries(['years', 'wage', 'bonus'].map(key => [key, Number(document.getElementById(`contract-${key}`).value)]));
    if (this.commitContractAction(action)) { this.contractRequest = null; document.getElementById('contract-modal').style.display = 'none'; }
  },

  commitContractAction(action) {
    try {
      const result = ContractsEngine.transact(this.gameState, action);
      if (!this.persistState(result.state)) { document.getElementById('contract-error').textContent = 'Não foi possível salvar. A negociação não foi concluída.'; return false; }
      this.gameState = result.state; this.selectedPlayerIdx = null; this.inspectedPlayerIdx = 0; this.clubBrowser = null;
      this.refreshUI(); this.showToast(result.message); return true;
    } catch (error) { document.getElementById('contract-error').textContent = error.message; this.showToast(error.message); return false; }
  },

  openTransfer(type, playerId, clubId = null, offerId = null) {
    if (this.gameState.activeMatch) return this.showToast('Conclua e feche a partida antes de negociar.');
    const offer = type === 'accept' ? MarketEngine.ensureState(this.gameState).offers.find(entry => entry.id === offerId && entry.status === 'pending') : null;
    if (type === 'accept' && !offer) return this.showToast('Esta proposta não está mais disponível.');
    const outgoing = ['sell', 'loan-out', 'accept'].includes(type), loan = offer ? offer.type === 'loan' : type.startsWith('loan');
    const remainingRounds = Math.max(0, (this.gameState.totalRounds || 38) - (this.gameState.currentRound || 1) + 1);
    if (loan && remainingRounds === 0) return this.showToast('Não é possível realizar empréstimos após o término dos jogos da temporada.');
    const source = outgoing ? this.gameState.userTeam : this.findTeam(clubId);
    const player = source?.players.find(entry => String(entry.id) === String(offer?.playerId ?? playerId));
    if (!player) return this.showToast('Jogador não encontrado.');
    if (player.loan) return this.showToast('Este jogador já está emprestado.');
    this.transferRequest = { type, playerId: player.id, clubId: offer?.clubId ?? clubId, offerId, loan, outgoing };
    document.getElementById('transfer-title').textContent = offer ? 'Proposta recebida' : ({ buy: 'Comprar jogador', sell: 'Vender jogador', 'loan-in': 'Receber por empréstimo', 'loan-out': 'Emprestar jogador' })[type];
    document.getElementById('transfer-player-summary').textContent = `${player.name} · ${this.playerPositionCode(player)} · Força ${player.strength} · ${source.name}`;
    const select = document.getElementById('transfer-club');
    select.replaceChildren();
    if (outgoing) this.currentTeams().filter(team => team.id !== this.gameState.userTeamId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).forEach(team => {
      const option = document.createElement('option'); option.value = team.id; option.textContent = `${team.name} · Caixa R$ ${this.shortMoney(team.balance)}`; select.appendChild(option);
    });
    if (offer) select.value = offer.clubId;
    document.getElementById('transfer-club-label').hidden = !outgoing || Boolean(offer);
    const amount = document.getElementById('transfer-amount');
    amount.value = offer ? offer.amount : MarketEngine.quote(player, loan, this.gameState); amount.readOnly = Boolean(offer);
    const contractFields = document.getElementById('transfer-contract-fields');
    contractFields.hidden = outgoing || loan; contractFields.disabled = outgoing || loan;
    if (!outgoing && !loan) {
      const quote = ContractsEngine.quote(player, 'buy');
      for (const [key, value] of Object.entries(quote)) document.getElementById(`transfer-contract-${key}`).value = value;
      document.getElementById('transfer-contract-wage').min = quote.wage;
    }
    document.getElementById('transfer-error').textContent = '';
    this.updateTransferTerms();
    document.getElementById('transfer-modal').style.display = 'flex'; amount.focus();
  },

  updateTransferTerms() {
    const request = this.transferRequest; if (!request) return;
    const clubId = request.type === 'accept' || !request.outgoing ? request.clubId : Number(document.getElementById('transfer-club').value);
    const club = this.findTeam(clubId);
    const source = request.outgoing ? this.gameState.userTeam : club;
    const player = source?.players.find(entry => String(entry.id) === String(request.playerId));
    const fee = Number(document.getElementById('transfer-amount').value) || 0;
    const bonus = request.outgoing || request.loan ? 0 : (Number(document.getElementById('transfer-contract-bonus')?.value) || 0);
    const years = request.outgoing || request.loan ? 1 : (Number(document.getElementById('transfer-contract-years')?.value) || 3);
    const wage = request.outgoing ? 0 : (request.loan ? (Number(player?.wage) || 5000) : (Number(document.getElementById('transfer-contract-wage')?.value) || 5000));
    const remainingRounds = Math.max(0, (this.gameState.totalRounds || 38) - (this.gameState.currentRound || 1) + 1);
    const endYear = request.loan ? this.gameState.seasonYear : Number(this.gameState.seasonYear) + years - 1;

    // Financial positions
    const userBalance = Number(this.gameState.userTeam.balance) || 0;
    const budget = EconomyEngine.budget(this.gameState, this.gameState.userTeam);
    const immediateCashChange = request.outgoing ? fee : -(fee + bonus);
    const projectedBalance = userBalance + immediateCashChange;
    const wageDelta = request.outgoing ? (request.loan ? -(player?.wage || 0) : -(player?.contract?.wage || player?.wage || 0)) : (request.loan ? (player?.wage || 5000) : wage);
    const projectedWages = Math.max(0, budget.committedWages + wageDelta);
    const projectedAvailable = request.outgoing ? budget.available + fee : Math.max(0, budget.available - (fee + bonus));

    // Description text
    const termsEl = document.getElementById('transfer-terms');
    if (termsEl) {
      termsEl.textContent = `${request.outgoing ? 'Destino' : 'Origem'}: ${club?.name || 'Escolha um clube'}. ` +
        (request.loan
          ? `Empréstimo até o fim de ${this.gameState.seasonYear} (${remainingRounds} jogos restantes). Quem recebe o atleta arca com o salário integral.`
          : `Transferência definitiva do passe com vínculo até ${endYear}. ${request.outgoing ? 'O valor acordado será creditado em seu caixa.' : 'O valor do passe será debitado do caixa.'}`);
    }

    // Comprehensive financial summary
    const summaryEl = document.getElementById('transfer-summary-box');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <h4>Resumo Financeiro da Operação</h4>
        <div class="transfer-summary-grid">
          <div class="transfer-summary-item">
            <span>${request.loan ? 'Taxa de empréstimo:' : 'Valor do passe:'}</span>
            <strong>${this.financeMoney(fee)}</strong>
          </div>
          ${!request.outgoing && !request.loan ? `
          <div class="transfer-summary-item">
            <span>Luvas à vista:</span>
            <strong>${this.financeMoney(bonus)}</strong>
          </div>` : ''}
          <div class="transfer-summary-item">
            <span>${request.outgoing ? 'Recebimento imediato:' : 'Desembolso à vista:'}</span>
            <strong>${this.financeMoney(Math.abs(immediateCashChange))}</strong>
          </div>
          <div class="transfer-summary-item">
            <span>Salário do atleta:</span>
            <strong>${request.outgoing ? 'Assumido pelo comprador' : `${this.financeMoney(wage)} / rodada`}</strong>
          </div>
          <div class="transfer-summary-item">
            <span>Vigência do acordo:</span>
            <strong>${request.loan ? `${remainingRounds} jogos (até dez/${this.gameState.seasonYear})` : `${years} temporada(s) (até ${endYear})`}</strong>
          </div>
          <div class="transfer-summary-item">
            <span>Caixa projetado:</span>
            <strong class="${projectedBalance < 0 ? 'text-danger' : ''}">${this.financeMoney(projectedBalance)}</strong>
          </div>
          <div class="transfer-summary-item">
            <span>Folha salarial / Teto:</span>
            <strong class="${projectedWages > budget.wageLimit ? 'text-danger' : ''}">${this.financeMoney(projectedWages)} / ${this.financeMoney(budget.wageLimit)}</strong>
          </div>
          <div class="transfer-summary-item">
            <span>Verba diretoria restante:</span>
            <strong class="${!request.outgoing && fee + bonus > budget.available ? 'text-danger' : ''}">${this.financeMoney(projectedAvailable)}</strong>
          </div>
        </div>
      `;
    }

    // Impediments / Pre-flight warnings
    const impedimentEl = document.getElementById('transfer-impediment');
    if (impedimentEl) {
      let impediment = null;
      if (request.loan && remainingRounds === 0) {
        impediment = 'Temporada encerrada: não há partidas restantes para empréstimo nesta temporada.';
      } else if (!request.outgoing && userBalance < fee + bonus) {
        impediment = `Saldo insuficiente: seu caixa atual é de ${this.financeMoney(userBalance)}, mas a operação exige ${this.financeMoney(fee + bonus)} à vista.`;
      } else if (!request.outgoing && fee + bonus > budget.available) {
        impediment = `Orçamento excedido: a diretoria autoriza até ${this.financeMoney(budget.available)} para contratações. Venda jogadores ou solicite revisão em Finanças.`;
      } else if (!request.outgoing && projectedWages > budget.wageLimit) {
        impediment = `Teto salarial atingido: a nova folha (${this.financeMoney(projectedWages)}) ultrapassará o limite de ${this.financeMoney(budget.wageLimit)} por rodada.`;
      } else if (request.outgoing && this.gameState.userTeam.players.length <= 15) {
        impediment = 'Limite de elenco: seu clube precisa manter pelo menos 15 atletas contratados.';
      } else if (request.outgoing && player?.position === 'G' && this.gameState.userTeam.players.filter(p => p.position === 'G').length <= 1) {
        impediment = 'Goleiro indispensável: o clube precisa manter pelo menos um goleiro no elenco.';
      }
      if (impediment) {
        impedimentEl.hidden = false;
        impedimentEl.className = 'transfer-impediment danger';
        impedimentEl.textContent = `Aviso: ${impediment}`;
      } else {
        impedimentEl.hidden = true;
        impedimentEl.textContent = '';
      }
    }
  },

  submitTransfer() {
    if (!this.transferRequest) return;
    const request = { ...this.transferRequest, amount: Number(document.getElementById('transfer-amount').value) };
    if (request.outgoing && request.type !== 'accept') request.clubId = Number(document.getElementById('transfer-club').value);
    if (!request.outgoing && !request.loan) request.terms = Object.fromEntries(['years', 'wage', 'bonus'].map(key => [key, Number(document.getElementById(`transfer-contract-${key}`).value)]));
    if (this.commitMarketAction(request)) { document.getElementById('transfer-modal').style.display = 'none'; this.transferRequest = null; }
  },

  commitMarketAction(action) {
    try {
      const result = MarketEngine.transact(this.gameState, action, this.allTeams);
      if (!this.persistState(result.state)) return false;
      this.gameState = result.state; this.selectedPlayerIdx = null; this.inspectedPlayerIdx = 0; this.clubBrowser = null;
      this.refreshUI(); this.showToast(result.message); return true;
    } catch (error) {
      if (this.transferRequest) {
        const errorEl = document.getElementById('transfer-error');
        if (errorEl) {
          errorEl.textContent = error.message;
          const match = error.message.match(/contraproposta:\s*aceita (?:negociar [^por]+ por|pagar até) R\$\s*([\d.,]+)/i);
          if (match) {
            const cleanNumber = parseInt(match[1].replace(/\./g, '').replace(/,/g, ''), 10);
            if (Number.isFinite(cleanNumber) && cleanNumber > 0) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'transfer-counter-btn';
              btn.textContent = `Aplicar contraproposta (R$ ${cleanNumber.toLocaleString('pt-BR')})`;
              btn.addEventListener('click', () => {
                document.getElementById('transfer-amount').value = cleanNumber;
                this.updateTransferTerms();
                errorEl.textContent = '';
                document.getElementById('transfer-form').querySelector('button[type="submit"]')?.focus();
              });
              errorEl.appendChild(document.createElement('br'));
              errorEl.appendChild(btn);
            }
          }
        }
      }
      this.showToast(error.message); return false;
    }
  },

  ratingLabel(value) { return value == null ? '—' : Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); },

  renderPerformance() {
    const state = this.gameState, escape = value => this.escapeHTML(value);
    document.getElementById('performance-season-label').textContent = `${state.userTeam.name} · ${state.seasonYear}`;
    document.querySelectorAll('[data-performance-panel]').forEach(panel => { panel.hidden = panel.dataset.performancePanel !== this.performanceView; });
    document.querySelectorAll('[data-performance-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.performanceView === this.performanceView)));
    const all = state.userTeam.players;
    const bestAverage = all.filter(player => (player.performance?.games || 0) >= 2).sort((a, b) => PerformanceEngine.average(b) - PerformanceEngine.average(a))[0];
    const scorer = [...all].filter(player => player.goals > 0).sort((a, b) => b.goals - a.goals)[0];
    const star = [...all].filter(player => player.performance?.motm > 0).sort((a, b) => b.performance.motm - a.performance.motm)[0];
    document.getElementById('performance-highlights').innerHTML = [
      ['Melhor média · 2+ jogos', bestAverage, bestAverage ? `Nota ${this.ratingLabel(PerformanceEngine.average(bestAverage))}` : 'Aguardando atuações'],
      ['Artilheiro do elenco', scorer, scorer ? `${scorer.goals} gol(s)` : 'Nenhum gol ainda'],
      ['Craque do jogo', star, star ? `${star.performance.motm} destaque(s)` : 'Aguardando o primeiro jogo']
    ].map(([label, player, detail]) => `<article><span>${label}</span><strong>${player ? escape(player.name) : '—'}</strong><small>${detail}</small></article>`).join('');
    const position = document.getElementById('performance-position').value;
    const sort = document.getElementById('performance-sort').value;
    const value = player => ({ rating: PerformanceEngine.average(player) ?? -1, form: PerformanceEngine.recentAverage(player) ?? -1,
      goals: player.goals || 0, assists: player.assists || 0, minutes: player.performance?.minutes || 0, motm: player.performance?.motm || 0 })[sort] ?? 0;
    const players = all.filter(player => position === 'all' || player.position === position).sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name, 'pt-BR'));
    const tbody = document.getElementById('performance-players-tbody');
    tbody.innerHTML = players.map(player => `<tr><td><button class="club-name-link" data-performance-player="${escape(player.id)}">${escape(player.name)}</button></td><td>${escape(this.playerPositionCode(player))}</td><td>${player.matchesPlayed || 0}</td><td>${player.performance?.minutes || 0}</td><td>${player.goals || 0}</td><td>${player.assists || 0}</td><td><strong class="rating-value${PerformanceEngine.average(player) >= 7.5 ? ' high' : ''}">${this.ratingLabel(PerformanceEngine.average(player))}</strong></td><td>${(player.performance?.recent || []).map(row => `<span class="rating-chip${row[0] >= 7.5 ? ' high' : row[0] < 6 ? ' low' : ''}" title="${row[1]} minutos, ${row[2]} gols, ${row[3]} assistências">${this.ratingLabel(row[0])}</span>`).join('') || '—'}</td><td>${player.performance?.motm || 0}</td></tr>`).join('') || '<tr><td colspan="9">Nenhum jogador nesta posição.</td></tr>';
    tbody.querySelectorAll('[data-performance-player]').forEach(button => button.addEventListener('click', () => this.showPerformancePlayer(button.dataset.performancePlayer)));
    this.showPerformancePlayer(this.performancePlayerId);
    const seasons = [{ year: state.seasonYear, teamId: state.userTeamId, teamName: state.userTeam.name, matches: PerformanceEngine.reports(state) }, ...(state.performanceArchive || []).slice().reverse()];
    const seasonSelect = document.getElementById('performance-season-select'), previousSeason = seasonSelect.value;
    seasonSelect.replaceChildren();
    seasons.forEach(season => { const option = document.createElement('option'); option.value = `${season.year}:${season.teamId}`; option.textContent = `${season.year} · ${season.teamName}`; seasonSelect.appendChild(option); });
    if (seasons.some(season => `${season.year}:${season.teamId}` === previousSeason)) seasonSelect.value = previousSeason;
    const selected = seasons.find(season => `${season.year}:${season.teamId}` === seasonSelect.value) || seasons[0];
    const matchSelect = document.getElementById('performance-match-select');
    const previousMatch = this.performanceReportKey === seasonSelect.value ? matchSelect.value : null;
    this.performanceReportKey = seasonSelect.value;
    matchSelect.replaceChildren();
    selected.matches.map((match, index) => ({ match, index })).reverse().forEach(({ match, index }) => {
      const option = document.createElement('option'); option.value = index;
      option.textContent = `R${match.round} · ${match.homeName} ${match.homeScore} × ${match.awayScore} ${match.awayName}`;
      matchSelect.appendChild(option);
    });
    if (previousMatch !== null && selected.matches[Number(previousMatch)]) matchSelect.value = previousMatch;
    const match = selected.matches[Number(matchSelect.value)];
    const rows = match ? PerformanceEngine.unpack(match.playerRatings, [match.homeId, match.awayId]).sort((a, b) => b.rating - a.rating || b.motm - a.motm) : [];
    const best = rows.find(row => row.motm) || rows[0];
    document.getElementById('performance-match-highlight').innerHTML = best ? `<img src="assets/icons/icontrophy.png" alt=""><div><strong>${best.motm ? 'Craque do jogo' : 'Maior nota'}: ${escape(best.name)} · ${this.ratingLabel(best.rating)}</strong><p>${escape(match.homeName)} ${match.homeScore} × ${match.awayScore} ${escape(match.awayName)} · Rodada ${match.round}</p></div>`
      : `<p>${match ? 'Esta partida foi salva antes do sistema de notas. As próximas atuações terão avaliação.' : 'Dispute uma partida para consultar os destaques e as notas dos jogadores.'}</p>`;
    document.getElementById('performance-match-tbody').innerHTML = rows.map(row => `<tr${row.teamId === selected.teamId ? ' class="user-team"' : ''}><td>${row.motm ? '★ ' : ''}${escape(row.name)}</td><td>${escape(row.teamId === match.homeId ? match.homeName : match.awayName)}</td><td>${row.minutes}</td><td>${row.goals}</td><td>${row.assists}</td><td>${row.saves}</td><td>${row.tackles}</td><td><strong class="rating-value${row.rating >= 7.5 ? ' high' : ''}">${this.ratingLabel(row.rating)}</strong></td></tr>`).join('') || '<tr><td colspan="8">Nenhuma avaliação disponível para esta partida.</td></tr>';
  },

  showPerformancePlayer(playerId) {
    this.performancePlayerId = playerId;
    const player = this.gameState.userTeam.players.find(entry => String(entry.id) === String(playerId));
    const panel = document.getElementById('performance-player-detail'); panel.hidden = !player;
    if (!player) return;
    const escape = value => this.escapeHTML(value), teams = new Map(this.currentTeams().map(team => [team.id, team.name]));
    panel.innerHTML = `<h3>${escape(player.name)} · ${escape(this.playerPositionCode(player))}</h3><p>Nota média ${this.ratingLabel(PerformanceEngine.average(player))} em ${player.performance?.games || 0} partida(s) com avaliação · Forma recente ${this.ratingLabel(PerformanceEngine.recentAverage(player))} · ${player.performance?.cleanSheets || 0} jogo(s) sem sofrer gols na defesa.</p><h4>Últimas atuações</h4><ul>${[...(player.performance?.recent || [])].reverse().map(row => `<li>Contra ${escape(teams.get(row[4]) || 'adversário')} · ${row[5]} × ${row[6]} · ${row[1]}' · ${row[2]} G / ${row[3]} A · <strong>Nota ${this.ratingLabel(row[0])}</strong></li>`).join('') || '<li>As avaliações começam nas próximas partidas.</li>'}</ul>`;
  },

  renderSeasonControls() {
    const state = this.gameState;
    const complete = CareerEngine.isSeasonComplete(state);
    const button = document.getElementById('next-season-btn');
    button.hidden = !complete;
    button.textContent = `Encerrar temporada ${state.seasonYear}`;
    document.getElementById('play-round-btn').textContent = complete ? 'Encerrar temporada >>' : 'Jogar >>';
    const notice = document.getElementById('preseason-notice');
    const news = state.lastSeasonTransition;
    notice.hidden = !news || state.currentRound > 1;
    if (news) notice.textContent = `${news.year} · ${news.toDivision}. ${news.arrivals.length} jovem(ns) promovido(s), ${news.retired.length} aposentadoria(s), ${news.released?.length || 0} saída(s) por fim de contrato. ${news.improved.length} jogador(es) evoluíram e ${news.declined.length} perderam força. ${(news.returnedLoans || []).filter(deal => [deal.fromId, deal.toId].includes(state.userTeamId)).length} empréstimo(s) encerrado(s). Premiação recebida: R$ ${news.prize.toLocaleString('pt-BR')}.${news.sponsorBonus ? ` Bônus do patrocinador: ${this.financeMoney(news.sponsorBonus)}.` : ''}`;
  },

  renderManagerIndicators() {
    const profile = CareerEngine.ensureProfile(this.gameState);
    const count = profile.offers.filter(offer => offer.status === 'pending').length;
    const badge = document.getElementById('profile-offer-count');
    badge.hidden = !count; badge.textContent = count;
    document.getElementById('profile-nav-btn').setAttribute('aria-label', `Meu perfil${count ? `, ${count} propostas disponíveis` : ''}`);
  },

  renderManagerProfile() {
    const state = this.gameState;
    const overview = CareerEngine.profileOverview(state), total = overview.total;
    const escape = value => this.escapeHTML(value);
    const shield = (filename, className = '') => `<img class="${className}" src="${this.assetPath('escudos', filename)}" alt="">`;
    document.getElementById('manager-profile-name').value = overview.name;
    document.getElementById('manager-profile-club').textContent = `${overview.name} · ${state.userTeam.name} · ${state.divisionName}`;
    this.renderManagerIndicators();
    const percentage = total.played ? `${Math.round((total.won * 3 + total.drawn) / (total.played * 3) * 100)}%` : '—';
    document.getElementById('manager-profile-stats').innerHTML = [
      ['Clubes', new Set(overview.tenures.map(tenure => tenure.teamId)).size], ['Jogos', total.played],
      ['Vitórias', total.won], ['Aproveitamento', percentage], ['Títulos', total.titles], ['Acessos', total.promotions]
    ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');

    const boardEval = typeof BoardEngine !== 'undefined' ? BoardEngine.evaluate(state) : (CareerEngine?.boardConfidence ? CareerEngine.boardConfidence(state) : null);
    if (boardEval) {
      const targetEl = document.getElementById('manager-board-target');
      const posEl = document.getElementById('manager-board-position');
      const effEl = document.getElementById('manager-board-efficiency');
      const finEl = document.getElementById('manager-board-finance');
      const secEl = document.getElementById('manager-board-security');
      const ratEl = document.getElementById('manager-board-rating');
      const feedEl = document.getElementById('manager-board-feedback');

      if (targetEl) targetEl.textContent = boardEval.target?.label || '—';
      if (posEl) posEl.textContent = `${boardEval.position}º lugar (${boardEval.played} j, ${boardEval.points} pts)`;
      if (effEl) effEl.textContent = `${boardEval.efficiency}%`;
      if (finEl) finEl.textContent = `R$ ${Number(state.userTeam.balance || 0).toLocaleString('pt-BR')}`;
      if (secEl) {
        secEl.textContent = boardEval.label;
        secEl.style.color = boardEval.color;
      }
      if (ratEl) ratEl.textContent = `${boardEval.score} / 100`;
      if (feedEl) feedEl.textContent = boardEval.feedback || '';
    }
    document.getElementById('manager-club-history').innerHTML = [...overview.tenures].reverse().map(tenure => {
      const stats = tenure.stats, current = tenure.toYear === null;
      const period = current ? `${tenure.fromYear} → atual` : `${tenure.fromYear} → ${tenure.toYear}`;
      return `<article class="manager-tenure${current ? ' current' : ''}">
        <div class="manager-tenure-heading">${shield(tenure.shield)}<div><h4>${escape(tenure.teamName)}</h4><span>${period}${current ? ' · Clube atual' : ''}</span></div></div>
        <p class="manager-tenure-stats">${stats.played} jogos · ${stats.won} V / ${stats.drawn} E / ${stats.lost} D · ${stats.goalsFor} gols marcados · ${stats.titles} título(s)</p>
        ${tenure.seasons.length ? `<ul class="manager-season-list">${[...tenure.seasons].reverse().map(record => `<li><strong>${record.year}</strong> · ${escape(record.divisionName)} · ${record.position}º lugar${record.champion ? ' · Campeão' : ''}${record.movement === 'promotion' ? ' · Acesso' : record.movement === 'relegation' ? ' · Rebaixamento' : ''}${record.completed === false ? ' · Em andamento' : ''}</li>`).join('')}</ul>` : '<p class="manager-profile-help">A passagem começa agora. Dispute a primeira partida para registrar sua campanha.</p>'}
      </article>`;
    }).join('');
    document.getElementById('manager-trophies').innerHTML = overview.trophies.length ? [...overview.trophies].reverse().map(trophy => `
      <article class="manager-trophy"><img src="assets/icons/icontrophy.png" alt="Troféu"><div><strong>${escape(trophy.competition)}</strong><span>${trophy.year} · ${escape(trophy.teamName)}</span></div>${shield(trophy.shield)}</article>`).join('')
      : '<p class="manager-profile-empty">Sua sala de troféus está pronta para a primeira conquista. Os títulos das Séries A–D aparecem aqui ao concluir o campeonato.</p>';
    const offers = document.getElementById('manager-job-offers');
    offers.innerHTML = overview.pendingOffers.length ? overview.pendingOffers.map(offer => {
      const team = CareerEngine.teams(state).find(club => club.id === offer.teamId);
      return `<article class="manager-job-offer"><div class="manager-tenure-heading">${shield(offer.shield)}<div><h4>${escape(team?.name || offer.teamName)}</h4><span>${escape(offer.divisionName)} · ${offer.seasonYear}</span></div></div>
        <p>${escape(offer.reason)}</p><p class="manager-profile-help">Caixa do clube: R$ ${Number(team?.balance || 0).toLocaleString('pt-BR')} · Elenco: ${team?.players.length || 0} jogadores.</p>
        <p class="manager-offer-deadline">Válida até sua primeira partida de ${offer.seasonYear}.</p>
        <div class="manager-offer-actions"><button class="btn btn-small btn-primary" data-offer-accept="${escape(offer.id)}">Aceitar proposta</button><button class="btn btn-small" data-offer-decline="${escape(offer.id)}">Recusar</button></div></article>`;
    }).join('') : `<p class="manager-profile-empty">${CareerEngine.canChangeClub(state) && state.managerProfile.offersForYear === state.seasonYear ? 'Nenhuma proposta pendente. Você continua no seu clube.' : 'Nenhuma proposta disponível no momento. Conclua a temporada e inicie o próximo ano para receber convites.'}</p>`;
    offers.querySelectorAll('[data-offer-accept]').forEach(button => button.addEventListener('click', () => this.reviewJobOffer(button.dataset.offerAccept)));
    offers.querySelectorAll('[data-offer-decline]').forEach(button => button.addEventListener('click', () => this.declineJobOffer(button.dataset.offerDecline)));
    const status = { accepted: 'Aceita', declined: 'Recusada', expired: 'Expirada', withdrawn: 'Encerrada após sua mudança' };
    document.getElementById('manager-past-offers').hidden = !overview.pastOffers.length;
    document.getElementById('manager-past-offers-list').innerHTML = [...overview.pastOffers].reverse().slice(0, 12)
      .map(offer => `<li>${offer.seasonYear} · ${escape(offer.teamName)} — ${status[offer.status] || 'Encerrada'}</li>`).join('');
    this.pendingJobOfferId = null;
    document.getElementById('profile-offer-confirmation').hidden = true;
  },

  saveManagerName() {
    const name = document.getElementById('manager-profile-name').value.trim().slice(0, 60);
    if (!name) return this.showToast('Informe o nome do técnico.');
    const next = CareerEngine.clone(this.gameState);
    next.userTeam = next.divisionTeams.find(team => team.id === next.userTeamId);
    next.managerProfile.name = name; next.userTeam.manager = name;
    if (!this.persistState(next)) return;
    this.gameState = next; this.refreshUI(); this.showToast('Nome do técnico atualizado.');
  },

  reviewJobOffer(offerId) {
    const state = this.gameState;
    const offer = CareerEngine.profileOverview(state).pendingOffers.find(entry => entry.id === offerId);
    if (!offer) return this.showToast('Esta proposta não está mais disponível.');
    this.pendingJobOfferId = offerId;
    const team = CareerEngine.teams(state).find(club => club.id === offer.teamId);
    document.getElementById('profile-offer-confirm-text').textContent = `Você deixará o ${state.userTeam.name} e assumirá o ${team.name} na ${offer.divisionName}. Seu histórico e seus troféus acompanharão você. O elenco, o estádio e o caixa de R$ ${Number(team.balance || 0).toLocaleString('pt-BR')} pertencem ao novo clube. As demais propostas serão encerradas.`;
    const panel = document.getElementById('profile-offer-confirmation');
    panel.hidden = false; panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    document.getElementById('profile-confirm-offer-btn').focus();
  },

  acceptJobOffer() {
    try {
      const next = CareerEngine.acceptJobOffer(this.gameState, this.pendingJobOfferId);
      if (!this.persistState(next)) return;
      this.gameState = next; this.onGameLoaded(); this.showView('manager-profile-tab');
      this.showToast(`Agora você dirige o ${next.userTeam.name}. Boa temporada!`);
    } catch (error) { this.showToast(error.message); }
  },

  declineJobOffer(offerId) {
    try {
      const next = CareerEngine.declineJobOffer(this.gameState, offerId);
      if (!this.persistState(next)) return;
      this.gameState = next; this.refreshUI(); this.showToast('Proposta recusada.');
    } catch (error) { this.showToast(error.message); }
  },

  checkManagerDismissal() {
    if (!this.gameState) return false;
    const boardEval = typeof BoardEngine !== 'undefined' ? BoardEngine.evaluate(this.gameState) : (CareerEngine?.boardConfidence ? CareerEngine.boardConfidence(this.gameState) : null);
    if (boardEval && boardEval.canBeDismissed) {
      this.showDismissalModal(boardEval);
      return true;
    }
    return false;
  },

  showDismissalModal(boardEval) {
    const modal = document.getElementById('dismissal-modal');
    if (!modal) return;

    const team = this.gameState.userTeam;
    const profile = this.gameState.managerProfile;
    const shieldEl = document.getElementById('dismissal-club-shield');
    if (shieldEl) shieldEl.src = this.assetPath('escudos', team.shield);

    const statementEl = document.getElementById('dismissal-statement');
    if (statementEl) {
      statementEl.textContent = `A diretoria do ${team.name} comunica que, após avaliação do rendimento esportivo, encerrou o contrato do treinador ${profile?.name || 'da equipe'}. Desejamos sorte no seguimento da carreira.`;
    }

    const reasonsEl = document.getElementById('dismissal-reasons');
    if (reasonsEl) {
      reasonsEl.innerHTML = `
        <ul>
          <li><strong>Meta esportiva frustrada:</strong> O objetivo era ${this.escapeHTML(boardEval.target.label)}, mas o clube ocupa a ${boardEval.position}ª colocação.</li>
          <li><strong>Rendimento insuficiente:</strong> Aproveitamento de ${boardEval.efficiency}% em ${boardEval.played} rodadas disputadas.</li>
          <li><strong>Confiança da diretoria esgotada:</strong> Índice de satisfação caiu para ${boardEval.score}%.</li>
        </ul>
      `;
    }

    const playedEl = document.getElementById('dismissal-stat-played');
    const wonEl = document.getElementById('dismissal-stat-won');
    const drawnEl = document.getElementById('dismissal-stat-drawn');
    const lostEl = document.getElementById('dismissal-stat-lost');
    if (playedEl) playedEl.textContent = boardEval.played;
    if (wonEl) wonEl.textContent = boardEval.won;
    if (drawnEl) drawnEl.textContent = boardEval.drawn;
    if (lostEl) lostEl.textContent = boardEval.lost;

    const offersList = document.getElementById('dismissal-offers-list');
    if (offersList) {
      const offers = (typeof BoardEngine !== 'undefined' && BoardEngine.generateDismissalOffers)
        ? BoardEngine.generateDismissalOffers(this.gameState)
        : (CareerEngine?.generateDismissalOffers ? CareerEngine.generateDismissalOffers(this.gameState) : []);

      if (offers.length) {
        offersList.innerHTML = offers.map(offer => `
          <div class="dismissal-offer-item">
            <img src="${this.assetPath('escudos', offer.shield)}" alt="">
            <div class="dismissal-offer-info">
              <h4>${this.escapeHTML(offer.teamName)}</h4>
              <span>${this.escapeHTML(offer.divisionName)} · ${this.escapeHTML(offer.stadium)}</span>
              <p>${this.escapeHTML(offer.reason)}</p>
            </div>
            <button class="btn btn-small btn-primary" data-accept-dismissal="${offer.teamId}">Assumir Clube</button>
          </div>
        `).join('');

        offersList.querySelectorAll('[data-accept-dismissal]').forEach(btn => {
          btn.addEventListener('click', () => {
            const teamId = Number(btn.dataset.acceptDismissal);
            this.acceptDismissalOffer(teamId);
          });
        });
      } else {
        offersList.innerHTML = '<p class="dismissal-help-text">Nenhum clube fez proposta no momento. Escolha outro clube para reiniciar.</p>';
      }
    }

    modal.style.display = 'flex';
  },

  acceptDismissalOffer(newTeamId) {
    try {
      const next = (typeof BoardEngine !== 'undefined' && BoardEngine.applyDismissal)
        ? BoardEngine.applyDismissal(this.gameState, newTeamId)
        : CareerEngine.applyDismissal(this.gameState, newTeamId);

      if (typeof SquadEngine !== 'undefined' && next.userTeam) {
        SquadEngine.autoSelectStarters(next.userTeam, next.userTeam.formation || '4-4-2');
      }
      FinanceEngine.ensureLedger(next.userTeam, { year: next.seasonYear, round: next.currentRound });
      ContractsEngine.ensureState(next);
      EconomyEngine.ensure(next);

      if (!this.persistState(next)) return;
      this.gameState = next;
      document.getElementById('dismissal-modal').style.display = 'none';
      this.refreshUI();
      this.showView('squad-tab');
      this.showToast(`Você assumiu o comando do ${this.gameState.userTeam.name}! Boa sorte na recuperação.`);
    } catch (err) {
      console.error('Erro ao aceitar novo clube pós-demissão:', err);
      this.showToast('Erro ao assumir o novo clube.');
    }
  },

  renderSeasonHistory() {
    const history = this.gameState.seasonHistory || [];
    const container = document.getElementById('career-history');
    container.replaceChildren();
    if (!history.length) {
      const empty = document.createElement('p'); empty.className = 'season-empty';
      empty.textContent = 'As classificações, os campeões e os resultados serão guardados aqui ao iniciar a próxima temporada.';
      container.appendChild(empty); return;
    }
    for (const record of [...history].reverse()) {
      const user = record.user;
      const division = record.divisions.find(division => division.id === user.divisionId);
      const movement = user.movement === 'promotion' ? 'Acesso' : user.movement === 'relegation' ? 'Rebaixamento' : 'Permanência';
      const details = document.createElement('details'); details.className = 'season-history-entry';
      const title = document.createElement('summary');
      title.textContent = `${record.year} · ${user.divisionName} · ${user.position}º lugar${user.champion ? ' · Campeão' : ''} · ${movement}`;
      details.appendChild(title);
      const body = document.createElement('div'); body.className = 'season-history-body';
      const teamNames = new Map(division.standings.map(row => [row.id, row.name]));
      const games = division.results.filter(row => row[1] === user.id || row[2] === user.id);
      body.innerHTML = `<p><strong>${this.escapeHTML(user.name)}</strong> · ${user.points} pontos · ${user.won} V / ${user.drawn} E / ${user.lost} D · Próxima divisão: ${this.escapeHTML(user.nextDivisionName)} · Premiação: R$ ${user.prize.toLocaleString('pt-BR')}</p>
        <p class="season-champions">${record.divisions.map(league => `${this.escapeHTML(league.name)}: <strong>${this.escapeHTML(league.champion.name)}</strong>`).join(' · ')}</p>
        <div class="table-responsive"><table class="brasfoot-table"><thead><tr><th>Pos</th><th>Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th></tr></thead><tbody>${division.standings.map(row => `<tr${row.id === user.id ? ' class="user-team"' : ''}><td>${row.position}</td><td>${this.escapeHTML(row.name)}</td><td>${row.points}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.goalsFor}</td><td>${row.goalsAgainst}</td></tr>`).join('')}</tbody></table></div>
        <details class="season-results"><summary>Jogos do clube em ${record.year}</summary><ol>${games.map(row => `<li>Rodada ${row[0]} · ${this.escapeHTML(teamNames.get(row[1]))} <strong>${row[3]} × ${row[4]}</strong> ${this.escapeHTML(teamNames.get(row[2]))}</li>`).join('')}</ol></details>`;
      if (record.squadChanges) {
        const changes = record.squadChanges;
        const list = entries => entries.map(player => this.escapeHTML(player.name)).join(', ') || 'Nenhum';
        const evolution = entries => entries.map(player => `${this.escapeHTML(player.name)} (${player.from} → ${player.to})`).join(', ') || 'Nenhum';
        const report = document.createElement('details'); report.className = 'season-results';
        report.innerHTML = `<summary>Renovação do elenco para ${Number(record.year) + 1}</summary><p>Aposentados: ${list(changes.retired)}.</p><p>Fim de contrato: ${list(changes.released || [])}.</p><p>Jovens da base: ${list(changes.arrivals)}.</p><p>Evoluíram: ${evolution(changes.improved)}.</p><p>Perderam força: ${evolution(changes.declined)}.</p>`;
        body.appendChild(report);
      }
      details.appendChild(body); container.appendChild(details);
    }
  },

  cancelSeasonPreparation() {
    if (this.seasonJob) this.seasonJob.cancelled = true;
  },

  async openSeasonEnd() {
    const state = this.gameState;
    if (!CareerEngine.isSeasonComplete(state)) return this.showToast('Conclua todas as rodadas antes de encerrar a temporada.');
    document.getElementById('match-modal').style.display = 'none';
    document.getElementById('season-modal').style.display = 'flex';
    document.getElementById('season-title').textContent = `Encerramento · ${state.seasonYear}`;
    if (state.seasonSummary?.year === state.seasonYear) return this.renderSeasonSummary();
    if (this.seasonJob && !this.seasonJob.cancelled && this.seasonJob.state === state) return;
    const job = { state, cancelled: false }; this.seasonJob = job;
    const progress = document.getElementById('season-progress');
    const status = document.getElementById('season-status');
    document.getElementById('advance-season-btn').disabled = true;
    document.getElementById('season-overview').replaceChildren();
    document.getElementById('season-user-result').textContent = 'Encerrando os campeonatos para definir acessos e rebaixamentos…';
    progress.hidden = false;
    try {
      CareerEngine.ensureState(state, this.leaguesConfig, this.allTeams);
      await new Promise(resolve => setTimeout(resolve, 30));
      while (!job.cancelled && this.gameState === state) {
        const result = CareerEngine.simulateBackgroundStep(state);
        if (!result) break;
        progress.max = result.matchesTotal; progress.value = result.matchesDone;
        status.textContent = `${result.divisionName} · rodada ${result.round} · ${Math.round(result.matchesDone / Math.max(1, result.matchesTotal) * 100)}%`;
        if (result.roundCompleted && result.done % 4 === 0 && !this.persistState()) throw new Error('Não foi possível salvar o encerramento. Exporte a carreira antes de continuar.');
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (this.gameState !== state) return;
      if (job.cancelled) { this.persistState(); return; }
      state.seasonSummary = CareerEngine.buildSummary(state);
      if (!this.persistState()) throw new Error('Não foi possível salvar o encerramento. Exporte a carreira antes de continuar.');
      this.renderSeasonSummary();
    } catch (error) {
      if (this.gameState === state) status.textContent = error.message;
    } finally {
      if (this.seasonJob === job) this.seasonJob = null;
    }
  },

  renderSeasonSummary() {
    const state = this.gameState, summary = state.seasonSummary, user = summary.user;
    const movement = user.movement === 'promotion' ? 'Acesso conquistado' : user.movement === 'relegation' ? 'Clube rebaixado' : 'Divisão mantida';
    document.getElementById('season-progress').hidden = true;
    document.getElementById('season-status').textContent = 'Classificações finais definidas. A carreira continuará no mesmo save.';
    document.getElementById('season-user-result').textContent = `${user.champion ? 'Campeão! ' : ''}${state.userTeam.name}: ${user.position}º lugar, ${user.points} pontos. ${movement}: ${user.nextDivisionName}. Premiação: R$ ${user.prize.toLocaleString('pt-BR')}.`;
    document.getElementById('season-overview').innerHTML = `<table class="brasfoot-table season-summary-table"><thead><tr><th>Divisão</th><th>Campeão</th><th>Subiram</th><th>Caíram</th></tr></thead><tbody>${summary.divisions.map(division => {
      const names = type => summary.moves.filter(move => move.fromId === division.id && move.type === type).map(move => this.escapeHTML(move.name)).join(', ') || '—';
      return `<tr><td>${this.escapeHTML(division.name)}</td><td><strong>${this.escapeHTML(division.champion.name)}</strong></td><td>${names('promotion')}</td><td>${names('relegation')}</td></tr>`;
    }).join('')}</tbody></table><p class="season-help">O novo ano terá calendário e estatísticas próprios. O histórico guardará as classificações e os resultados desta temporada. Nas férias, os atletas envelhecem, recuperam energia e podem evoluir ou se aposentar; jovens fictícios completam os elencos.</p>`;
    const button = document.getElementById('advance-season-btn');
    button.disabled = false; button.textContent = `Iniciar temporada ${Number(state.seasonYear) + 1}`;
  },

  startNextSeason() {
    try {
      const next = CareerEngine.startNextSeason(this.gameState);
      if (!this.persistState(next)) return;
      this.gameState = next;
      this.onGameLoaded();
      const offers = next.managerProfile.offers.filter(offer => offer.status === 'pending').length;
      this.showToast(`Temporada ${next.seasonYear} iniciada · ${offers} propostas em Meu perfil.`);
    } catch (error) { this.showToast(error.message); }
  },

  ensureConcurrentMatches(state) {
    if (!this.gameState || !state) return [];
    if (state.otherMatches && Array.isArray(state.otherMatches) && state.otherMatches.length) {
      return state.otherMatches;
    }
    const roundIndex = state.roundIndex ?? (this.gameState.currentRound - 1);
    const round = this.gameState.rounds?.[roundIndex];
    if (!round || !round.matches) {
      state.otherMatches = [];
      return [];
    }

    const otherFixtures = round.matches.filter(m =>
      !(m.homeId === state.homeId && m.awayId === state.awayId) && !m.isPlayed
    );

    const teamMap = new Map((this.gameState.divisionTeams || []).map(t => [t.id, t]));
    (this.allTeams || []).forEach(t => { if (!teamMap.has(t.id)) teamMap.set(t.id, t); });

    const otherMatches = [];
    for (const fixture of otherFixtures) {
      const home = teamMap.get(fixture.homeId);
      const away = teamMap.get(fixture.awayId);
      if (!home || !away) continue;

      const sim = MatchEngine.simulateMatch(home, away);
      const goals = (sim.events || [])
        .filter(e => e.type && e.type.includes('GOL'))
        .map(e => ({
          minute: e.minute,
          side: e.teamIndex,
          player: e.player || (e.teamIndex === 0 ? home.name : away.name),
          penalty: e.type === 'GOL_PENALTI'
        }));

      const redCards = (sim.events || [])
        .filter(e => ['CARTAO_VERMELHO', 'SEGUNDO_AMARELO'].includes(e.type))
        .map(e => ({
          minute: e.minute,
          side: e.teamIndex,
          player: e.player || (e.teamIndex === 0 ? home.name : away.name),
          secondYellow: e.type === 'SEGUNDO_AMARELO'
        }));

      const decisiveEvents = (sim.events || []).filter(event =>
        !['DESARME', 'FINALIZACAO_FORA', 'DEFESA', 'ESCANTEIO', 'CONTRA_ATAQUE', 'SUBSTITUICAO', 'TATICA', 'INTERVALO', 'FIM_JOGO'].includes(event.type)
      );

      otherMatches.push({
        homeId: home.id,
        awayId: away.id,
        homeName: home.name,
        awayName: away.name,
        homeShield: home.shield,
        awayShield: away.shield,
        finalHomeScore: sim.homeTeam.score,
        finalAwayScore: sim.awayTeam.score,
        goals,
        redCards,
        events: decisiveEvents,
        stats: sim.stats
      });
    }

    state.otherMatches = otherMatches;
    state.announcedOtherGoals ||= [];
    return otherMatches;
  },

  renderConcurrentMatches(state) {
    if (!state) return;
    const badge = document.getElementById('match-round-badge');
    const totalRounds = this.gameState?.totalRounds || (this.gameState?.rounds?.length ?? 38);
    const roundNumber = (state.roundIndex ?? (this.gameState.currentRound - 1)) + 1;
    if (badge) badge.textContent = `Rodada ${roundNumber} / ${totalRounds}`;

    const countElem = document.getElementById('match-round-count');
    const container = document.getElementById('match-live-fixtures');
    if (!container) return;

    const matches = this.ensureConcurrentMatches(state);
    if (countElem) countElem.textContent = String(matches.length);

    if (!matches.length) {
      container.innerHTML = '<div class="match-fixture-empty">Nenhum outro jogo nesta rodada.</div>';
      return;
    }

    const minute = state.minute;
    const isFinished = Boolean(state.finished);
    const isHalftime = state.phase === 'halftime' && minute === 45 && !isFinished;

    let html = '';
    for (const m of matches) {
      const homeGoals = m.goals.filter(g => g.side === 0 && g.minute <= minute);
      const awayGoals = m.goals.filter(g => g.side === 1 && g.minute <= minute);
      const homeScore = isFinished || minute >= 90 ? m.finalHomeScore : homeGoals.length;
      const awayScore = isFinished || minute >= 90 ? m.finalAwayScore : awayGoals.length;

      const justScored = !isFinished && m.goals.some(g => g.minute === minute);
      const timeClass = isFinished || minute >= 90 ? 'finished' : isHalftime ? 'halftime' : 'live';
      const timeLabel = isFinished || minute >= 90 ? 'Fim' : isHalftime ? 'Int.' : minute === 0 ? '0\'' : `${minute}'`;

      const visibleGoals = m.goals.filter(g => g.minute <= minute);
      const visibleCards = m.redCards.filter(c => c.minute <= minute);

      let detailsHtml = '';
      if (visibleGoals.length || visibleCards.length) {
        const goalPills = visibleGoals.map(g =>
          `<span class="fixture-detail-goal" title="${this.escapeHTML(g.player)} (${g.minute}')">⚽ ${this.escapeHTML(g.player)} ${g.minute}'${g.penalty ? ' (p)' : ''}</span>`
        ).join(' ');
        const cardPills = visibleCards.map(c =>
          `<span class="fixture-detail-red" title="Expulsão: ${this.escapeHTML(c.player)} (${c.minute}')">🟥 ${this.escapeHTML(c.player)} ${c.minute}'</span>`
        ).join(' ');
        detailsHtml = `<div class="fixture-details-row">${goalPills} ${cardPills}</div>`;
      }

      const flashClass = justScored ? ' goal-flash' : '';
      const goalBadge = justScored ? '<span class="round-goal-tag">GOL!</span> ' : '';

      html += `
        <div class="match-live-fixture-card${flashClass}">
          <div class="fixture-main-row">
            <div class="fixture-team home" title="${this.escapeHTML(m.homeName)}">
              <img src="${this.assetPath('escudos', m.homeShield)}" alt="" class="fixture-shield" onerror="this.src='assets/icons/escudo.png'">
              <span class="fixture-name">${this.escapeHTML(m.homeName)}</span>
            </div>
            <div class="fixture-center">
              <div class="fixture-score-pill">${goalBadge}${homeScore} × ${awayScore}</div>
              <span class="fixture-time-badge ${timeClass}">${timeLabel}</span>
            </div>
            <div class="fixture-team away" title="${this.escapeHTML(m.awayName)}">
              <span class="fixture-name">${this.escapeHTML(m.awayName)}</span>
              <img src="${this.assetPath('escudos', m.awayShield)}" alt="" class="fixture-shield" onerror="this.src='assets/icons/escudo.png'">
            </div>
          </div>
          ${detailsHtml}
        </div>
      `;
    }
    container.innerHTML = html;
  },

  checkConcurrentMatchAlerts(state) {
    if (!state.otherMatches) return;
    state.announcedOtherGoals ||= [];
    for (const m of state.otherMatches) {
      const minuteGoals = m.goals.filter(g => g.minute === state.minute);
      for (const g of minuteGoals) {
        const key = `${m.homeId}-${m.awayId}-${g.minute}-${g.side}-${g.player}`;
        if (!state.announcedOtherGoals.includes(key)) {
          state.announcedOtherGoals.push(key);
          const scoringTeam = g.side === 0 ? m.homeName : m.awayName;
          const homeScore = m.goals.filter(item => item.side === 0 && item.minute <= state.minute).length;
          const awayScore = m.goals.filter(item => item.side === 1 && item.minute <= state.minute).length;
          this.renderOtherGoalAlert({
            minute: state.minute,
            scoringTeam,
            homeName: m.homeName,
            awayName: m.awayName,
            homeScore,
            awayScore,
            player: g.player,
            penalty: g.penalty
          });
        }
      }
    }
  },

  renderOtherGoalAlert(alert) {
    const feed = document.getElementById('match-events-feed');
    if (!feed) return;
    const follow = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 45;
    const item = document.createElement('div');
    item.className = 'event-item round-other-goal';
    const icon = this.assetPath('icons', 'ball.png', 'ball.png');
    item.innerHTML = `<span class="event-minute">${alert.minute}'</span><img src="${icon}" class="event-icon" alt="" onerror="this.hidden=true"><span><strong class="round-badge-tag">[Placar da Rodada]</strong> Gol do <strong>${this.escapeHTML(alert.scoringTeam)}</strong>! ${this.escapeHTML(alert.homeName)} ${alert.homeScore} × ${alert.awayScore} ${this.escapeHTML(alert.awayName)} <em>(${this.escapeHTML(alert.player)}${alert.penalty ? ' pen.' : ''})</em></span>`;
    feed.appendChild(item);
    if (follow) feed.scrollTop = feed.scrollHeight;
  },

  playRound() {
    if (!this.gameState) return;
    if (this.gameState.activeMatch) return this.startMatchLiveSimulation(this.gameState.activeMatch, true);
    if (this.gameState.currentRound > this.gameState.totalRounds) return this.openSeasonEnd();
    const roundIndex = this.gameState.currentRound - 1;
    const round = this.gameState.rounds[roundIndex];
    const fixture = round.matches.find(m => m.homeId === this.gameState.userTeam.id || m.awayId === this.gameState.userTeam.id);
    if (!fixture) {
      this.finalizeRound(null, roundIndex);
      this.persistState(); this.refreshUI();
      this.checkManagerDismissal();
      return;
    }
    const home = this.gameState.divisionTeams.find(t => t.id === fixture.homeId);
    const away = this.gameState.divisionTeams.find(t => t.id === fixture.awayId);
    const unavailable = SquadEngine.starters(this.gameState.userTeam).filter(p => !SquadEngine.isAvailable(p));
    if (unavailable.length || SquadEngine.starters(this.gameState.userTeam).length < 7) {
      this.showView('tactics-tab');
      this.refreshUI();
      return this.showToast(unavailable.length ? 'Há lesionados ou suspensos entre os titulares. Troque-os ou use Escalar melhores.' : 'São necessários pelo menos 7 titulares disponíveis. Ajuste a escalação.');
    }
    const userSide = home.id === this.gameState.userTeam.id ? 0 : 1;
    const state = MatchEngine.createMatch(home, away, { userSide });
    state.roundIndex = roundIndex;
    state.paused = false;
    state.speed = 1;
    MatchEngine.emit(state, { type: 'INICIO', icon: 'ball.png', text: `Bola rolando! ${home.name} enfrenta o ${away.name}.` });
    this.ensureConcurrentMatches(state);
    this.gameState.activeMatch = state;
    CareerEngine.expireJobOffers(this.gameState);
    this.startMatchLiveSimulation(state);
  },

  getLiveTeams() {
    const state = this.currentSimMatch;
    return [state.homeId, state.awayId].map(id => this.gameState.divisionTeams.find(t => t.id === id));
  },

  startMatchLiveSimulation(state, restored = false) {
    clearInterval(this.matchSimulationInterval);
    this.currentSimMatch = state;
    this.matchSpeed = [1, 2, 4].includes(state.speed) ? state.speed : 1;
    this.matchPaused = restored || Boolean(state.paused) || state.finished;
    this.matchPauseReason = restored ? 'Partida recuperada' : state.phase === 'halftime' ? 'Intervalo' : 'Jogo pausado';
    state.paused = this.matchPaused;
    this.matchSelection = { outId: null, inId: null };
    this.matchMessage = restored && !state.finished ? 'Partida recuperada. Retome quando estiver pronto.' : '';
    this.matchTacticsDirty = false;
    const [home, away] = this.getLiveTeams();
    MatchEngine.ensureState(state, home, away);
    document.getElementById('match-analysis-metric').value = 'possession';
    const analysisChange = document.getElementById('match-analysis-change');
    analysisChange.innerHTML = '<option value="latest">Última do meu time</option>';
    analysisChange.value = 'latest';
    this.renderedAnalysisChanges = -1;
    this.ensureConcurrentMatches(state);
    if (restored) {
      state.announcedOtherGoals = [];
      for (const m of (state.otherMatches || [])) {
        for (const g of (m.goals || [])) {
          if (g.minute <= state.minute) {
            state.announcedOtherGoals.push(`${m.homeId}-${m.awayId}-${g.minute}-${g.side}-${g.player}`);
          }
        }
      }
    }
    if (state.finished && !state.finalized) this.finalizeRound(state);
    if (!this.persistState()) this.matchPaused = state.paused = true;
    document.getElementById('match-home-name').textContent = home.name;
    document.getElementById('match-away-name').textContent = away.name;
    this.setImage('match-home-shield', this.assetPath('escudos', home.shield), 'assets/icons/escudo.png');
    this.setImage('match-away-shield', this.assetPath('escudos', away.shield), 'assets/icons/escudo.png');
    document.getElementById('match-coach-title').textContent = `Comando · ${this.gameState.userTeam.name}`;
    document.getElementById('match-formation').value = state.formations[state.userSide];
    document.getElementById('match-style').value = state.styles[state.userSide];
    document.getElementById('match-speed').value = String(this.matchSpeed);
    document.getElementById('match-events-feed').innerHTML = '';
    this.renderedMatchEventCount = 0;
    this.appendPendingMatchEvents(false);
    document.getElementById('match-modal').style.display = 'flex';
    this.updateLiveMatchUI();
    if (!this.matchPaused && !state.finished) this.scheduleLiveMatch();
  },

  scheduleLiveMatch() {
    clearInterval(this.matchSimulationInterval);
    if (!this.currentSimMatch || this.currentSimMatch.finished || this.matchPaused) return;
    const delays = { 1: 900, 2: 450, 4: 180 };
    this.matchSimulationInterval = setInterval(() => this.advanceLiveMinute(), delays[this.matchSpeed] || 900);
  },

  advanceLiveMinute() {
    const state = this.currentSimMatch;
    if (!state || state.finished || this.matchPaused) return;
    const [home, away] = this.getLiveTeams();
    const events = MatchEngine.stepMatch(state, home, away);
    this.appendPendingMatchEvents();
    if (state.finished) return this.finishMatchSimulation();
    this.updateLiveMatchUI();
    this.checkConcurrentMatchAlerts(state);
    if (state.phase === 'halftime') {
      this.matchMessage = 'Intervalo: ajuste o time e clique em Continuar jogo para o segundo tempo.';
      this.pauseLiveMatch('Intervalo', false);
      this.renderLiveCoach();
    } else if (events.some(e => e.teamIndex === state.userSide && ['CONTUSAO', 'CARTAO_VERMELHO', 'SEGUNDO_AMARELO'].includes(e.type))) {
      this.matchMessage = 'O jogo foi pausado após uma ocorrência com seu time. Confira os jogadores.';
      this.pauseLiveMatch('Confira seu time', false);
      this.renderLiveCoach();
    }
    this.persistMatchProgress();
  },

  pauseLiveMatch(reason = 'Jogo pausado', save = true) {
    const state = this.currentSimMatch;
    if (!state || state.finished) return;
    clearInterval(this.matchSimulationInterval);
    this.matchPaused = state.paused = true;
    this.matchPauseReason = reason;
    this.updateLiveMatchControls();
    if (save) this.persistMatchProgress();
  },

  resumeLiveMatch() {
    const state = this.currentSimMatch;
    if (!state || state.finished) return;
    if (this.matchTacticsDirty && !this.applyLiveTactics()) return;
    this.matchPaused = state.paused = false;
    if (state.phase === 'halftime') state.phase = 'second-half';
    this.matchSelection = { outId: null, inId: null };
    this.matchMessage = '';
    this.updateLiveMatchUI();
    this.persistMatchProgress();
    this.scheduleLiveMatch();
  },

  applyLiveTactics() {
    if (!this.currentSimMatch || this.currentSimMatch.finished) return false;
    this.pauseLiveMatch('Ajustes táticos', false);
    const [home, away] = this.getLiveTeams();
    const result = MatchEngine.changeTactics(this.currentSimMatch, home, away, this.currentSimMatch.userSide,
      document.getElementById('match-formation').value, document.getElementById('match-style').value, this.readTacticalControls('match'), this.readSetPieceControls('match'));
    this.matchMessage = result.message;
    if (result.success) this.matchTacticsDirty = false;
    this.appendPendingMatchEvents();
    this.updateLiveMatchUI();
    this.persistMatchProgress();
    return result.success;
  },

  selectLivePlayer(kind, id) {
    const state = this.currentSimMatch;
    if (!state || state.finished) return;
    this.pauseLiveMatch('Preparando substituição');
    this.matchSelection[kind] = this.matchSelection[kind] === id ? null : id;
    this.matchMessage = '';
    this.renderLiveCoach();
  },

  confirmLiveSubstitution() {
    const state = this.currentSimMatch;
    if (!state || state.finished || this.matchSelection.outId === null || this.matchSelection.inId === null) return;
    this.pauseLiveMatch('Substituição', false);
    const [home, away] = this.getLiveTeams();
    const result = MatchEngine.substitute(state, home, away, state.userSide, this.matchSelection.outId, this.matchSelection.inId);
    this.matchMessage = result.message;
    if (result.success) this.matchSelection = { outId: null, inId: null };
    this.appendPendingMatchEvents();
    this.updateLiveMatchUI();
    this.persistMatchProgress();
  },

  updateLiveMatchControls() {
    const state = this.currentSimMatch;
    if (!state) return;
    document.getElementById('match-home-score').textContent = state.scores[0];
    document.getElementById('match-away-score').textContent = state.scores[1];
    document.getElementById('match-timer').textContent = `${state.minute}'`;
    document.getElementById('match-phase').textContent = state.finished ? 'Encerrado' : state.phase === 'halftime' ? 'Intervalo' : state.phase === 'second-half' ? '2º tempo' : '1º tempo';
    const pauseButton = document.getElementById('pause-match-btn');
    pauseButton.disabled = state.finished;
    pauseButton.textContent = state.finished ? 'Jogo encerrado' : this.matchPaused ? 'Continuar jogo' : 'Pausar jogo';
    pauseButton.setAttribute('aria-pressed', String(this.matchPaused));
    const status = document.getElementById('match-status');
    status.textContent = state.finished ? 'Resultado final' : this.matchPaused ? `${this.matchPauseReason || 'Jogo pausado'} · pausado` : 'Bola rolando';
    status.classList.toggle('paused', this.matchPaused && !state.finished);
    document.getElementById('match-analysis-status').textContent = state.finished ? 'FINAL' : this.matchPaused ? 'PAUSADO' : 'AO VIVO';
    for (const id of ['match-speed', 'match-formation', 'match-style', 'apply-match-tactics-btn']) document.getElementById(id).disabled = state.finished;
    document.querySelectorAll('#match-instructions select, #match-set-pieces select, #match-preset-select, #match-preset-btn').forEach(control => { control.disabled = state.finished; });
    document.getElementById('skip-match-btn').style.display = state.finished ? 'none' : 'inline-flex';
    document.getElementById('close-match-btn').style.display = state.finished ? 'inline-flex' : 'none';
    document.getElementById('match-footer-note').textContent = state.finished
      ? this.saveFailed ? 'Rodada concluída. Falha ao salvar; exporte seu progresso.' : 'Rodada concluída e salva.'
      : 'Pausa automática no intervalo · até 5 substituições';
  },

  updateLiveMatchUI() {
    const state = this.currentSimMatch;
    const bestPlayer = state.playerRatings?.flat().find(player => player.motm);
    const highlight = document.getElementById('match-player-highlight');
    highlight.hidden = !state.finished || !bestPlayer;
    if (bestPlayer) highlight.textContent = `★ Craque do jogo: ${bestPlayer.name} · Nota ${this.ratingLabel(bestPlayer.rating)} · ${bestPlayer.goals} G / ${bestPlayer.assists} A. Confira as avaliações em Desempenho.`;
    this.updateLiveMatchControls();
    const stats = state.stats;
    for (const [side, index] of [['home', 0], ['away', 1]]) {
      document.getElementById(`stat-possession-${side}`).style.width = `${stats.possession[index]}%`;
      document.getElementById(`stat-possession-${side}`).textContent = `${stats.possession[index]}%`;
      document.getElementById(`stat-shots-${side}`).textContent = stats.shots[index];
      document.getElementById(`stat-ontarget-${side}`).textContent = stats.shotsOnTarget[index];
      document.getElementById(`stat-fouls-${side}`).textContent = stats.fouls[index];
      document.getElementById(`stat-xg-${side}`).textContent = stats.xG[index].toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      document.getElementById(`stat-corners-${side}`).textContent = stats.corners[index];
      document.getElementById(`stat-passes-${side}`).textContent = stats.passes[index] ? `${Math.round(stats.completedPasses[index] / stats.passes[index] * 100)}%` : '—';
    }
    document.getElementById('match-stats-note').textContent = state.statsSinceMinute ? `xG e passes contabilizados a partir dos ${state.statsSinceMinute}' (partida de save antigo).` : '';
    this.renderLiveCoach();
    this.renderConcurrentMatches(state);
    this.renderLiveTacticalAnalysis();
  },

  renderLiveTacticalAnalysis() {
    const state = this.currentSimMatch, analysis = MatchEngine.Analysis;
    if (!state?.tacticalAnalysis) return;
    const history = state.tacticalAnalysis, teams = this.getLiveTeams();
    const selectedMetric = document.getElementById('match-analysis-metric').value;
    const metric = Object.hasOwn(analysis.METRICS, selectedMetric) ? selectedMetric : 'possession';
    const definition = analysis.METRICS[metric];
    const format = value => value === null ? '—' : value.toLocaleString('pt-BR', {
      minimumFractionDigits: definition.decimals || 0, maximumFractionDigits: definition.decimals || 0
    }) + (definition.percent ? '%' : '');
    const changeSelect = document.getElementById('match-analysis-change');
    if (this.renderedAnalysisChanges !== history.changes.length) {
      const selected = changeSelect.value || 'latest';
      changeSelect.innerHTML = '<option value="latest">Última do meu time</option>' + history.changes.map((change, index) =>
        `<option value="${index}">${change.minute}' · ${this.escapeHTML(teams[change.side].name)} · ${change.formation} / ${change.style}</option>`).reverse().join('');
      changeSelect.value = selected;
      this.renderedAnalysisChanges = history.changes.length;
    }
    const points = analysis.series(state, metric), current = points.at(-1);
    const palette = ['#2d703a', '#245ca0'];
    document.getElementById('match-analysis-legend').innerHTML = teams.map((team, side) =>
      `<span class="analysis-team analysis-team-${side}"><i></i><span>${this.escapeHTML(team.name)}</span><strong>${format(current?.values[side] ?? null)}</strong></span>`).join('');
    const chart = document.getElementById('match-analysis-chart');
    const width = Math.max(280, chart.clientWidth || 320), height = 168;
    const left = 34, right = width - 12, top = 24, bottom = height - 24;
    const maximum = Math.max(...points.flatMap(point => point.values).filter(value => value !== null), 0);
    const ceiling = definition.percent ? 100 : metric === 'xG' ? Math.max(.5, Math.ceil(maximum * 1.1 * 4) / 4) : Math.max(2, Math.ceil(maximum * 1.1));
    const x = minute => left + minute / 90 * (right - left);
    const y = value => bottom - value / ceiling * (bottom - top);
    const number = value => Number(value.toFixed(2));
    const comparison = analysis.comparison(state, changeSelect.value || 'latest');
    const grid = [0, ceiling / 2, ceiling].map(value => `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" stroke="#d9e2d4"/><text x="${left - 5}" y="${y(value) + 3}" text-anchor="end">${Number(value.toFixed(2))}</text>`).join('');
    const ticks = [0, 15, 30, 45, 60, 75, 90].map(minute => `<text x="${x(minute)}" y="${height - 7}" text-anchor="middle">${minute}'</text>`).join('');
    const changes = history.changes.map(change => {
      const title = `${change.minute}' · ${teams[change.side].name}: ${change.formation}, ${change.style}. ${TacticsEngine.summary(change.instructions)}`;
      const selected = comparison?.change === change;
      return `<g fill="${palette[change.side]}"><title>${this.escapeHTML(title)}</title><line x1="${x(change.minute)}" x2="${x(change.minute)}" y1="${top}" y2="${bottom}" stroke="${palette[change.side]}" stroke-dasharray="3 3" opacity="${selected ? 1 : .4}"/><text x="${x(change.minute)}" y="${change.side === 0 ? 11 : 21}" text-anchor="middle" font-weight="bold">T</text></g>`;
    }).join('');
    const lines = [0, 1].map(side => {
      let penDown = false;
      const path = points.map(point => {
        if (point.values[side] === null) { penDown = false; return ''; }
        const command = penDown ? 'L' : 'M'; penDown = true;
        return `${command}${number(x(point.minute))},${number(y(point.values[side]))}`;
      }).join(' ');
      const value = current?.values[side];
      return `<path d="${path}" fill="none" stroke="${palette[side]}" stroke-width="2" ${side ? 'stroke-dasharray="5 3"' : ''}/>${value !== null && value !== undefined ? `<circle cx="${x(current.minute)}" cy="${y(value)}" r="3" fill="${palette[side]}"/>` : ''}`;
    }).join('');
    const tooltips = points.map(point => `<g><title>${point.minute}' · ${teams.map((team, side) => `${this.escapeHTML(team.name)}: ${format(point.values[side])}`).join(' · ')}</title>${point.values.map(value => value === null ? '' : `<circle cx="${x(point.minute)}" cy="${y(value)}" r="5" fill="transparent"/>`).join('')}</g>`).join('');
    const shade = history.startedAt ? `<rect x="${left}" y="${top}" width="${x(history.startedAt) - left}" height="${bottom - top}" fill="#e8ebe5"/><text x="${left + 4}" y="${top + 13}">Sem histórico</text>` : '';
    chart.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${definition.label} dos dois times ao longo da partida. T marca uma mudança tática."><title>${definition.label} · ${state.minute}'</title>${shade}${grid}${ticks}${changes}${lines}${tooltips}</svg>`;
    const minutes = Math.min(5, state.minute - history.startedAt);
    document.getElementById('match-analysis-window').textContent = metric === 'energy'
      ? 'Energia média dos atletas em campo · T = mudança tática'
      : `Janela móvel de ${minutes || 5} min · T = mudança tática`;
    const plan = document.getElementById('match-analysis-plan'), table = document.getElementById('match-analysis-comparison');
    if (comparison) {
      const change = comparison.change, side = change.side, values = comparison.metrics[metric];
      plan.textContent = `${change.minute}' · ${teams[side].name}: ${change.formation} · ${change.style} · ${TacticsEngine.summary(change.instructions)}`;
      if (comparison.minutes > 0) {
        const delta = index => {
          if (values.before[index] === null || values.after[index] === null) return '—';
          const value = Number((values.after[index] - values.before[index]).toFixed(definition.decimals || 0));
          return `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: definition.decimals || 0 })}${definition.percent ? ' p.p.' : ''}`;
        };
        table.innerHTML = `<table><caption>${definition.label} · períodos de ${comparison.minutes} min</caption><thead><tr><th>Time</th><th>Antes<br>${comparison.beforeRange.join('–')}'</th><th>Depois<br>${comparison.afterRange.join('–')}'</th><th title="Diferença entre depois e antes; p.p. significa pontos percentuais">Variação</th></tr></thead><tbody>${teams.map((team, index) => `<tr><th>${this.escapeHTML(team.name)}</th><td>${format(values.before[index])}</td><td>${format(values.after[index])}</td><td>${delta(index)}</td></tr>`).join('')}</tbody></table>`;
      } else {
        table.textContent = comparison.pendingReason === 'no-before'
          ? 'Sem período anterior com a mesma tática para esta comparação.' : comparison.pendingReason === 'replaced'
            ? 'Outra mudança ocorreu no mesmo minuto; esta tática não chegou a ser observada.'
            : 'Aguardando minutos com esta tática para comparar antes e depois.';
      }
    } else {
      plan.textContent = 'Compare o rendimento após mudar a formação ou as instruções.';
      table.textContent = 'As mudanças do adversário também ficam marcadas no gráfico.';
    }
    document.getElementById('match-analysis-note').textContent = `${history.startedAt ? `Registro iniciado aos ${history.startedAt}' neste save. ` : ''}Dados da simulação. Placar, adversário, trocas e expulsões também influenciam.`;
  },

  renderLiveCoach() {
    const state = this.currentSimMatch;
    if (!state) return;
    const side = state.userSide;
    const team = this.gameState.userTeam;
    const focusedRow = document.activeElement?.classList.contains('match-player-row') ? {
      list: document.activeElement.parentElement.id, playerId: document.activeElement.dataset.playerId
    } : null;
    const activeIds = state.activeIds[side];
    const [home, away] = this.getLiveTeams();
    const power = state.finalPower?.[side] || MatchEngine.powerFor(state, team, side);
    document.getElementById('match-effective-power').textContent = `Força em campo · Gol ${Math.round(power.gk)} · Def ${Math.round(power.defense)} · Meio ${Math.round(power.midfield)} · Ataque ${Math.round(power.attack)}`;
    document.getElementById('match-opponent-tactics').textContent = `${[home, away][1 - side].name}: ${state.formations[1 - side]} · ${state.styles[1 - side]} · ${TacticsEngine.summary(state.instructions[1 - side])} · ${state.substitutions[1 - side]}/${state.maxSubstitutions} trocas`;
    if (!this.matchTacticsDirty) {
      document.getElementById('match-formation').value = state.formations[side]; document.getElementById('match-style').value = state.styles[side];
      this.writeTacticalControls('match', state.instructions[side], state.setPieces[side], team.players);
    }
    if (!activeIds.includes(this.matchSelection.outId)) this.matchSelection.outId = null;
    document.getElementById('match-active-count').textContent = activeIds.length;
    document.getElementById('match-sub-count').textContent = `${state.substitutions[side]} / ${state.maxSubstitutions} substituições`;
    const updateRow = (button, player, kind, disabled, reason = '') => {
      if (!button._liveFields) {
        button.type = 'button'; button.className = 'match-player-row';
        const position = document.createElement('span'), name = document.createElement('span'), energy = document.createElement('span');
        position.className = 'match-player-position'; name.className = 'match-player-name';
        button.append(position, name, energy);
        button._liveFields = { position, name, energy };
        button.addEventListener('click', () => this.selectLivePlayer(kind, player.id));
      }
      button.disabled = disabled;
      button.dataset.playerId = String(player.id);
      button.setAttribute('aria-pressed', String(this.matchSelection[kind] === player.id));
      const energy = Math.round(state.finalEnergy?.[side]?.[player.id] ?? player.energy ?? 100);
      const slot = kind === 'outId' ? state.assignments[side][player.id] : state.assignments[side][this.matchSelection.outId];
      const fit = slot ? SquadEngine.positionFit(player, slot) : 1;
      const badges = `${state.yellows[player.id] ? '<span class="match-player-badge" title="Cartão amarelo">CA</span>' : ''}${state.injuredIds[side].includes(player.id) ? '<span class="match-player-badge injury">Lesão</span>' : ''}${fit < .90 ? '<span class="match-player-badge" title="Perda de rendimento fora da posição">Imp.</span>' : ''}${reason ? `<span class="match-player-badge">${reason}</span>` : ''}`;
      button.title = `${player.name}, posição natural ${this.playerPositionCode(player)}, força ${player.strength}, energia ${energy}%${slot ? `, função ${slot.role}, adaptação ${Math.round(fit * 100)}%` : ''}${reason ? ', ' + reason : ''}`;
      const fields = button._liveFields, position = kind === 'outId' && slot ? slot.role : this.playerPositionCode(player);
      if (fields.position.textContent !== position) fields.position.textContent = position;
      const starBadge = player.isTopWorld ? ' ⭐' : player.isStar ? ' ★' : '';
      const name = `${this.escapeHTML(player.name)}${starBadge}${badges}`;
      if (button._nameMarkup !== name) { fields.name.innerHTML = name; button._nameMarkup = name; }
      if (fields.energy.textContent !== `${energy}%`) fields.energy.textContent = `${energy}%`;
      fields.energy.className = `match-player-energy${energy < 75 ? ' low' : ''}`;
    };
    const syncList = (id, kind, players) => {
      const list = document.getElementById(id), existing = new Map([...list.children].map(button => [button.dataset.playerId, button]));
      const wanted = new Set(players.map(player => String(player.id)));
      for (const [key, button] of existing) if (!wanted.has(key)) button.remove();
      players.forEach((player, index) => {
        const button = existing.get(String(player.id)) || document.createElement('button');
        const reason = kind === 'outId' ? '' : state.exitedIds[side].includes(player.id) ? 'Saiu'
          : player.injuredWeeks > 0 || player.pendingInjuryWeeks > 0 || state.injuredIds[side].includes(player.id) ? 'Lesão'
          : player.suspendedWeeks > 0 || player.pendingSuspensionWeeks > 0 ? 'Suspenso' : '';
        updateRow(button, player, kind, state.finished || Boolean(reason) || state.substitutions[side] >= state.maxSubstitutions, reason);
        if (list.children[index] !== button) list.insertBefore(button, list.children[index] || null);
      });
    };
    const byId = new Map(team.players.map(player => [player.id, player]));
    syncList('match-on-field', 'outId', activeIds.map(id => byId.get(id)).filter(Boolean));
    syncList('match-reserves', 'inId', team.players.filter(player => !activeIds.includes(player.id) && !state.sentOffIds[side].includes(player.id)));
    document.getElementById('match-unavailable').textContent = state.sentOffIds[side].length ? `Expulsos: ${state.sentOffIds[side].map(id => team.players.find(p => p.id === id)?.name || '').join(', ')}. Não podem ser substituídos.` : '';
    const outgoing = team.players.find(p => p.id === this.matchSelection.outId);
    const incoming = team.players.find(p => p.id === this.matchSelection.inId);
    const ready = outgoing && incoming && !state.finished && state.substitutions[side] < state.maxSubstitutions;
    document.getElementById('confirm-match-sub-btn').disabled = !ready;
    document.getElementById('match-change-message').textContent = this.matchMessage || (ready ? `Sai ${outgoing.name} · entra ${incoming.name}.` : state.finished ? 'Partida encerrada. As alterações estão bloqueadas.' : state.substitutions[side] >= state.maxSubstitutions ? 'Limite de substituições atingido. Você ainda pode ajustar a tática.' : outgoing ? `${outgoing.name} vai sair. Escolha um reserva.` : incoming ? `${incoming.name} vai entrar. Escolha quem sai.` : 'Escolha quem sai e quem entra para fazer uma substituição.');
    if (focusedRow) {
      const row = [...document.getElementById(focusedRow.list).children].find(button => button.dataset.playerId === focusedRow.playerId);
      if (row && !row.disabled && document.activeElement !== row) row.focus({ preventScroll: true });
    }
  },

  appendPendingMatchEvents(playAudio = true) {
    const events = this.currentSimMatch.events;
    for (; this.renderedMatchEventCount < events.length; this.renderedMatchEventCount++) this.renderMatchEvent(events[this.renderedMatchEventCount], playAudio);
  },

  renderMatchEvent(ev, playAudio = true) {
    const feed = document.getElementById('match-events-feed');
    const follow = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 45;
    const item = document.createElement('div');
    item.className = 'event-item';
    if (ev.type.includes('GOL')) item.classList.add('gol');
    if (['CARTAO_VERMELHO', 'SEGUNDO_AMARELO'].includes(ev.type)) item.classList.add('expulsao');
    if (['SUBSTITUICAO', 'TATICA'].includes(ev.type)) item.classList.add('coach-change');
    const icon = this.assetPath('icons', ev.icon || 'ball.png', 'ball.png');
    item.innerHTML = `<span class="event-minute">${ev.minute}'</span><img src="${icon}" class="event-icon" alt="" onerror="this.hidden=true"><span>${this.escapeHTML(ev.text)}</span>`;
    feed.appendChild(item);
    if (follow) feed.scrollTop = feed.scrollHeight;
    if (playAudio && this.soundEnabled && ev.sound) this.playSound(ev.sound);
  },

  finalizeRound(state, roundIndex = state?.roundIndex ?? this.gameState.currentRound - 1) {
    const round = this.gameState.rounds[roundIndex];
    if (round.isFinished) { if (state) state.finalized = true; return; }
    for (const fixture of round.matches) {
      if (fixture.isPlayed) continue;
      const home = this.gameState.divisionTeams.find(t => t.id === fixture.homeId);
      const away = this.gameState.divisionTeams.find(t => t.id === fixture.awayId);
      if (state && fixture.homeId === state.homeId && fixture.awayId === state.awayId) {
        fixture.homeScore = state.scores[0]; fixture.awayScore = state.scores[1];
        fixture.events = state.events; fixture.stats = state.stats;
        fixture.playerRatings = PerformanceEngine.pack(state.playerRatings);
      } else {
        const preSim = state?.otherMatches?.find(m => m.homeId === fixture.homeId && m.awayId === fixture.awayId);
        if (preSim) {
          fixture.homeScore = preSim.finalHomeScore;
          fixture.awayScore = preSim.finalAwayScore;
          fixture.events = preSim.events;
          fixture.stats = preSim.stats;
        } else {
          const result = MatchEngine.simulateMatch(home, away);
          fixture.homeScore = result.homeTeam.score; fixture.awayScore = result.awayTeam.score;
          // Preserve decisive events; routine commentary from every AI game would inflate local saves.
          fixture.events = result.events.filter(event => !['DESARME', 'FINALIZACAO_FORA', 'DEFESA', 'ESCANTEIO', 'CONTRA_ATAQUE', 'SUBSTITUICAO', 'TATICA', 'INTERVALO', 'FIM_JOGO'].includes(event.type));
          fixture.stats = result.stats;
          if ([fixture.homeId, fixture.awayId].includes(this.gameState.userTeamId)) fixture.playerRatings = PerformanceEngine.pack(result.playerRatings);
        }
      }
      fixture.isPlayed = true;
    }
    round.isFinished = true;
    const userFixture = round.matches.find(fixture => [fixture.homeId, fixture.awayId].includes(this.gameState.userTeamId));
    const home = userFixture?.homeId === this.gameState.userTeamId;
    const won = userFixture && (home ? userFixture.homeScore > userFixture.awayScore : userFixture.awayScore > userFixture.homeScore);
    FinanceEngine.processRoundFinances(this.gameState.userTeam, home, this.gameState.userTeam.ticketPrice,
      { year: this.gameState.seasonYear, round: roundIndex + 1, won: Boolean(won) });
    const playedTeams = new Set(round.matches.flatMap(fixture => [fixture.homeId, fixture.awayId]));
    this.gameState.divisionTeams.forEach(t => SquadEngine.recoverEnergy(t, { played: playedTeams.has(t.id) }));
    this.gameState.currentRound = Math.max(this.gameState.currentRound, roundIndex + 2);
    MarketEngine.generateOffers(this.gameState, this.allTeams || []);
    if (state) state.finalized = true;
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
    const state = this.currentSimMatch;
    if (!state || state.finished) return;
    clearInterval(this.matchSimulationInterval);
    if (this.matchTacticsDirty && !this.applyLiveTactics()) return;
    const [home, away] = this.getLiveTeams();
    while (!state.finished) MatchEngine.stepMatch(state, home, away);
    this.appendPendingMatchEvents(false);
    this.finishMatchSimulation();
    if (this.soundEnabled) this.playSound('fimjogo.wav');
  },

  finishMatchSimulation() {
    const state = this.currentSimMatch;
    if (!state?.finished) return;
    clearInterval(this.matchSimulationInterval);
    this.matchPaused = state.paused = true;
    this.matchSelection = { outId: null, inId: null };
    this.matchMessage = '';
    this.finalizeRound(state);
    this.persistState();
    this.updateLiveMatchUI();
  },

  saveGame() {
    if (this.persistState()) this.showToast('Jogo salvo com sucesso no navegador!');
  },

  loadGame() {
    if (this.checkSavedGame()) {
      this.showToast('Jogo carregado com sucesso!');
    } else {
      alert('Nenhum jogo salvo encontrado no armazenamento local.');
    }
  },

  exportSaveFile() {
    if (!this.gameState) return alert('Nenhum jogo em andamento para exportar.');
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.gameState, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `brasfoot_save_${this.gameState.userTeam.shortName || 'save'}.json`);
    dlAnchor.click();
    this.showToast('Arquivo de save exportado!');
  },

  importSaveFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (imported && imported.userTeam) {
          if (!this.persistState(imported)) return;
          this.gameState = imported;
          this.onGameLoaded();
          this.showToast('Save importado com sucesso!');
        } else {
          alert('Arquivo de save inválido.');
        }
      } catch (err) {
        alert('Erro ao ler arquivo: ' + err.message);
      }
    };
    reader.readAsText(file);
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
