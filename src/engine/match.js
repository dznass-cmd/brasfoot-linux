// One offline engine for live matches, restored saves and other league fixtures.
const MatchSquad = typeof module !== 'undefined' && module.exports ? require('./squad.js') : window.SquadEngine;
const MatchPerformance = typeof module !== 'undefined' && module.exports ? require('./performance.js') : window.PerformanceEngine;
const MatchTactics = typeof module !== 'undefined' && module.exports ? require('./tactics.js') : window.TacticsEngine;
const MatchAnalysis = typeof module !== 'undefined' && module.exports ? require('./tactical-analysis.js') : window.TacticalAnalysis;

class MatchEngine {
  static Analysis = MatchAnalysis;
  static VERSION = 2;
  // Derived data stays out of saves and is released with the player/team objects.
  static traitCache = new WeakMap();
  static rosterCache = new WeakMap();
  static FORMATIONS = Object.keys(MatchSquad.FORMATIONS);
  static STYLES = ['Ofensivo', 'Equilibrado', 'Defensivo'];
  static SKILLS = {
    finishing: { positions: { G: .18, Z: .50, L: .60, M: .82, A: 1 }, traits: ['finalizacao', 'tecnica', 'forca'] },
    heading: { positions: { G: .30, Z: .95, L: .68, M: .72, A: .95 }, traits: ['cabeceio', 'forca'] },
    passing: { positions: { G: .65, Z: .72, L: .90, M: 1, A: .84 }, traits: ['passe', 'armacao', 'tecnica'] },
    creation: { positions: { G: .30, Z: .55, L: .85, M: 1, A: .90 }, traits: ['armacao', 'passe', 'cruzamento', 'tecnica'] },
    dribbling: { positions: { G: .25, Z: .50, L: .85, M: .90, A: 1 }, traits: ['drible', 'velocidade', 'tecnica'] },
    tackling: { positions: { G: .35, Z: 1, L: .92, M: .78, A: .45 }, traits: ['marcacao', 'desarme', 'forca'] },
    saving: { positions: { G: 1, Z: .22, L: .20, M: .18, A: .18 }, traits: ['reflexo', 'elasticidade', 'saida de gol'] }
  };

  static clamp(min, max, value) { return Math.max(min, Math.min(max, value)); }

  static traits(player) {
    let cached = this.traitCache.get(player);
    if (!cached || cached.cr1 !== player.cr1 || cached.cr2 !== player.cr2) {
      cached = { cr1: player.cr1, cr2: player.cr2, values: Object.freeze([player.cr1, player.cr2].filter(Boolean)
        .map(value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) };
      this.traitCache.set(player, cached);
    }
    return cached.values;
  }

  static attribute(player, skill, context = {}) {
    if (!player) return 0;
    const definition = this.SKILLS[skill] || this.SKILLS.passing;
    const bonus = this.traits(player).reduce((total, trait) => total + (definition.traits.includes(trait) ? .10 : 0), 1);
    return (Number(player.strength) || 30) * (definition.positions[player.position] ?? .7) * bonus
      * MatchSquad.condition(player, Boolean(context.injured))
      * MatchSquad.positionFit(player, context.slot || { role: player.position, side: 'C' });
  }

  static playerContext(state, side, player) {
    return { slot: state.assignments[side][player.id], injured: state.injuredIds[side].includes(player.id) };
  }

  static createMatch(homeTeam, awayTeam, options = {}) {
    const teams = [homeTeam, awayTeam];
    teams.forEach(team => this.rosterCache.delete(team));
    const aiControlled = options.aiControlled || teams.map((_, side) => Number.isInteger(options.userSide) && side !== options.userSide);
    teams.forEach((team, side) => {
      if (aiControlled[side] && options.prepareTeams !== false) {
        MatchSquad.autoSelectStarters(team, team.formation || '4-4-2');
        team.tacticStyle = 'Equilibrado';
        team.tactics = MatchTactics.normalize();
      }
    });
    const lineups = teams.map(team => MatchSquad.starters(team).filter(p => MatchSquad.isAvailable(p)));
    const state = {
      engineVersion: this.VERSION,
      homeId: homeTeam.id, awayId: awayTeam.id,
      minute: 0, scores: [0, 0], phase: 'first-half', finished: false,
      isNeutral: Boolean(options.isNeutral), isCup: Boolean(options.isCup),
      ...(Number.isInteger(options.userSide) ? { userSide: options.userSide } : {}),
      activeIds: lineups.map(players => players.map(p => p.id)),
      benchIds: teams.map((team, side) => team.players.filter(p => !lineups[side].includes(p)).map(p => p.id)),
      participatedIds: lineups.map(players => players.map(p => p.id)),
      exitedIds: [[], []], sentOffIds: [[], []], injuredIds: [[], []],
      injuryDurations: [{}, {}], pendingSuspensions: [{}, {}], minutesPlayed: [{}, {}],
      yellows: {}, substitutions: [0, 0], maxSubstitutions: 5,
      formations: teams.map(t => t.formation || '4-4-2'),
      styles: teams.map(t => t.tacticStyle || 'Equilibrado'),
      instructions: teams.map(team => MatchTactics.normalize(team.tactics)),
      setPieces: teams.map(team => MatchTactics.takers(team.setPieces, team.players)),
      assignments: teams.map((team, side) => MatchSquad.assignPositions(lineups[side], team.formation)),
      aiControlled, lastAiTacticsAt: [0, 0], lastAiSubAt: [0, 0],
      events: [], possessionTotal: 0,
      stats: { possession: [50, 50], shots: [0, 0], shotsOnTarget: [0, 0], fouls: [0, 0], yellowCards: [0, 0], redCards: [0, 0], tackles: [0, 0], corners: [0, 0], xG: [0, 0], passes: [0, 0], completedPasses: [0, 0] }
    };
    MatchAnalysis.ensure(state, teams);
    return state;
  }

  // Upgrade an in-progress old save once, without replaying events or changing its score.
  static ensureState(state, homeTeam, awayTeam) {
    const teams = [homeTeam, awayTeam];
    if (state.engineVersion === this.VERSION) {
      this.ensureInstructions(state, teams);
      MatchAnalysis.ensure(state, teams);
      return state;
    }
    state.assignments = teams.map((team, side) => MatchSquad.assignPositions(this.playersFor(state, team, side), state.formations[side]));
    state.aiControlled = teams.map((_, side) => Number.isInteger(state.userSide) && side !== state.userSide);
    state.lastAiTacticsAt = [state.minute, state.minute];
    state.lastAiSubAt = [state.minute, state.minute];
    state.injuryDurations = state.injuredIds.map(ids => Object.fromEntries(ids.map(id => [id, 1])));
    state.pendingSuspensions = state.sentOffIds.map(ids => Object.fromEntries(ids.map(id => [id, 1])));
    state.minutesPlayed = state.participatedIds.map((ids, side) => Object.fromEntries(ids.map((id, index) => {
      const start = index < 11 ? 0 : state.events.find(e => e.type === 'SUBSTITUICAO' && e.teamIndex === side && e.inId === id)?.minute ?? state.minute;
      const end = state.events.find(e => e.teamIndex === side && ((e.type === 'SUBSTITUICAO' && e.outId === id)
        || (['CARTAO_VERMELHO', 'SEGUNDO_AMARELO'].includes(e.type) && e.playerId === id)))?.minute ?? state.minute;
      return [id, Math.max(0, end - start)];
    })));
    for (const key of ['xG', 'passes', 'completedPasses']) state.stats[key] ||= [0, 0];
    state.statsSinceMinute = state.minute;
    state.engineVersion = this.VERSION;
    this.ensureInstructions(state, teams);
    MatchAnalysis.ensure(state, teams);
    return state;
  }

  static ensureInstructions(state, teams) {
    state.instructions ||= teams.map(team => MatchTactics.normalize(team.tactics));
    state.setPieces ||= teams.map(team => MatchTactics.takers(team.setPieces, team.players));
  }

  static playersFor(state, team, side) {
    let cached = this.rosterCache.get(team);
    if (!cached || cached.players !== team.players || cached.length !== team.players.length) {
      cached = { players: team.players, length: team.players.length, byId: new Map(team.players.map(player => [player.id, player])) };
      this.rosterCache.set(team, cached);
    }
    return state.activeIds[side].map(id => cached.byId.get(id)).filter(Boolean);
  }

  static emit(state, event) {
    const complete = { minute: state.minute, homeScore: state.scores[0], awayScore: state.scores[1], ...event };
    state.events.push(complete);
    return complete;
  }

  static weightedPlayer(players, weight, random) {
    if (!players.length) return null;
    const weights = players.map(p => Math.max(0, weight(p)));
    const total = weights.reduce((sum, value) => sum + value, 0);
    if (!total) return null;
    let roll = random() * total;
    for (let i = 0; i < players.length; i++) { roll -= weights[i]; if (roll < 0) return players[i]; }
    return players[players.length - 1];
  }

  static stepMatch(state, homeTeam, awayTeam, random = Math.random) {
    this.ensureState(state, homeTeam, awayTeam);
    if (state.finished) return [];
    const eventStart = state.events.length;
    const teams = [homeTeam, awayTeam];
    if (this.checkAbandonment(state, teams, random)) return state.events.slice(eventStart);
    state.minute++;
    if (state.minute > 45) state.phase = 'second-half';
    const active = teams.map((team, side) => this.playersFor(state, team, side));
    const effects = state.instructions.map(instructions => MatchTactics.effects(instructions));
    active.forEach((players, side) => players.forEach(player => {
      state.minutesPlayed[side][player.id] = (state.minutesPlayed[side][player.id] || 0) + 1;
      const role = state.assignments[side][player.id]?.role;
      const exertion = role === 'G' ? .065 : state.styles[side] === 'Ofensivo' ? .26 : state.styles[side] === 'Defensivo' ? .17 : .21;
      player.energy = Math.max(0, (player.energy ?? 100) - exertion * effects[side].energy * (1 + (100 - (player.energy ?? 100)) / 300));
    }));
    const power = teams.map((team, side) => this.powerFor(state, team, side));
    const midfield = power[0].midfield + power[1].midfield;
    const styleBias = (state.styles[0] === 'Ofensivo' ? 2 : state.styles[0] === 'Defensivo' ? -2 : 0)
      - (state.styles[1] === 'Ofensivo' ? 2 : state.styles[1] === 'Defensivo' ? -2 : 0);
    const possession = this.clamp(20, 80, power[0].midfield / Math.max(1, midfield) * 100 + styleBias + effects[0].possession - effects[1].possession);
    state.possessionTotal += possession;
    state.stats.possession[0] = Math.round(state.possessionTotal / state.minute);
    state.stats.possession[1] = 100 - state.stats.possession[0];
    const passes = 8 + Math.floor(random() * 5);
    const homePasses = Math.round(passes * possession / 100);
    for (let side = 0; side < 2; side++) {
      const count = Math.round((side === 0 ? homePasses : passes - homePasses) * effects[side].passes);
      const accuracy = this.clamp(.55, .96, .82 + (power[side].midfield - power[1 - side].defense) * .003 + effects[side].accuracy + effects[1 - side].opponentAccuracy);
      state.stats.passes[side] += count;
      for (let i = 0; i < count; i++) if (random() < accuracy) state.stats.completedPasses[side]++;
    }
    const hadFoul = random() < .25 * (effects[0].fouls + effects[1].fouls) / 2;
    if (hadFoul) this.simulateFoul(state, teams, power, possession, random);
    if (this.checkAbandonment(state, teams, random)) return state.events.slice(eventStart);
    // A foul can change the lineup or morale (including a missed penalty).
    // With no foul, none of the power inputs have changed in this minute.
    const currentPower = hadFoul ? teams.map((team, side) => this.powerFor(state, team, side)) : power;
    const tempo = (.34 + state.styles.filter(style => style === 'Ofensivo').length * .035
      - state.styles.filter(style => style === 'Defensivo').length * .02) * (effects[0].attacks + effects[1].attacks) / 2;
    if (random() < tempo) this.simulateAttack(state, teams, currentPower, possession, random);
    this.simulateInjury(state, teams, random);
    if (this.checkAbandonment(state, teams, random)) return state.events.slice(eventStart);
    MatchAnalysis.record(state, teams);
    if (state.minute < 90) teams.forEach((_, side) => { if (state.aiControlled[side]) this.manageOpponent(state, teams, side); });
    if (state.minute === 45) {
      state.phase = 'halftime';
      this.emit(state, { type: 'INTERVALO', sound: 'intervalo.wav', text: 'Fim do primeiro tempo. Intervalo!' });
    }
    if (state.minute === 90) this.finishMatch(state, homeTeam, awayTeam, random);
    return state.events.slice(eventStart);
  }

  static powerFor(state, team, side) {
    return this.calculateTeamPower(team, side === 0 && !state.isNeutral, {
      players: this.playersFor(state, team, side), formation: state.formations[side],
      tacticStyle: state.styles[side], instructions: state.instructions[side], injuredIds: state.injuredIds[side], assignments: state.assignments[side]
    });
  }

  static simulateFoul(state, teams, power, possession, random) {
    const foulEffects = state.instructions.map(instructions => MatchTactics.effects(instructions));
    const defendingHome = (1 - possession / 100) * foulEffects[0].fouls;
    const defendingAway = possession / 100 * foulEffects[1].fouls;
    const attackSide = random() < defendingAway / (defendingHome + defendingAway) ? 0 : 1, defenseSide = 1 - attackSide;
    const defenders = this.playersFor(state, teams[defenseSide], defenseSide);
    const fouler = this.weightedPlayer(defenders, p => {
      const role = state.assignments[defenseSide][p.id]?.role || p.position;
      return ({ G: .08, Z: 3, L: 2.5, M: 2, A: .7 }[role] || 1) * (1 + (100 - (p.energy ?? 100)) / 150);
    }, random);
    if (!fouler) return;
    state.stats.fouls[defenseSide]++;
    const cardRoll = random();
    if (cardRoll < .17 * foulEffects[defenseSide].cards) {
      fouler.yellowCardCycle ??= (fouler.yellowCards || 0) % 3;
      fouler.yellowCardCycle++;
      fouler.yellowCards = (fouler.yellowCards || 0) + 1;
      state.yellows[fouler.id] = (state.yellows[fouler.id] || 0) + 1;
      state.stats.yellowCards[defenseSide]++;
      const suspended = fouler.yellowCardCycle >= 3;
      if (suspended) { fouler.yellowCardCycle = 0; state.pendingSuspensions[defenseSide][fouler.id] = Math.max(1, state.pendingSuspensions[defenseSide][fouler.id] || 0); }
      if (state.yellows[fouler.id] >= 2) this.sendOff(state, teams[defenseSide], defenseSide, fouler, true);
      else this.emit(state, { type: 'CARTAO_AMARELO', teamIndex: defenseSide, playerId: fouler.id, player: fouler.name, icon: 'eca.png', text: `Cartão amarelo para ${fouler.name} (${teams[defenseSide].name}).${suspended ? ' Terceiro amarelo: suspensão no próximo jogo.' : ''}` });
    } else if (cardRoll > 1 - .006 * foulEffects[defenseSide].cards) this.sendOff(state, teams[defenseSide], defenseSide, fouler, false);
    if (state.activeIds[defenseSide].length < 7) return;
    if (random() < .025) this.takePenalty(state, teams, attackSide, random);
    else if (random() < .13) this.takeShot(state, teams, teams.map((team, side) => this.powerFor(state, team, side)), attackSide, null, 'free-kick', random, false);
  }

  static simulateAttack(state, teams, power, possession, random) {
    const side = random() < possession / 100 ? 0 : 1, other = 1 - side;
    const tactics = state.instructions[side], opponentTactics = state.instructions[other];
    const attackers = this.playersFor(state, teams[side], side);
    const creator = this.weightedPlayer(attackers, p => {
      const role = state.assignments[side][p.id]?.role || p.position;
      return ({ G: 0, Z: .5, L: 2.6, M: 4, A: 1.8 }[role] || 0) * Math.pow(this.attribute(p, 'creation', this.playerContext(state, side, p)), 1.4)
        * MatchTactics.laneWeight(p, state.assignments[side][p.id], tactics.focus);
    }, random);
    if (!creator) return;
    const marker = this.weightedPlayer(this.playersFor(state, teams[other], other), p => {
      const role = state.assignments[other][p.id]?.role || p.position;
      return (role === 'G' ? 0 : ['Z', 'L'].includes(role) ? 3 : 1) * this.attribute(p, 'tackling', this.playerContext(state, other, p));
    }, random);
    const traits = this.traits(creator);
    const counter = tactics.transition === 'counter' && random() < (state.styles[other] === 'Ofensivo' || opponentTactics.line === 'high' ? .6 : .35);
    if (counter) this.emit(state, { type: 'CONTRA_ATAQUE', teamIndex: side, playerId: creator.id, text: `${creator.name} acelera o contra-ataque do ${teams[side].name}!` });
    const headerChance = tactics.focus === 'wings' || ['left', 'right'].includes(tactics.focus) ? .55 : tactics.focus === 'center' ? .12 : traits.includes('cruzamento') || creator.position === 'L' ? .60 : .22;
    const playType = counter ? 'counter' : random() < headerChance ? 'header'
      : random() < (traits.includes('drible') ? .55 : .18) ? 'dribble' : 'pass';
    const creation = this.attribute(creator, playType === 'dribble' ? 'dribbling' : 'passing', this.playerContext(state, side, creator));
    const tackling = marker ? this.attribute(marker, 'tackling', this.playerContext(state, other, marker)) * MatchTactics.effects(opponentTactics).tackling : 0;
    const exposedLine = opponentTactics.line === 'high' && (counter || tactics.passing === 'direct');
    const breakthrough = this.clamp(.30, .90, .70 + (power[side].attack - power[other].defense) * .004 + (creation - tackling) * .003 + (counter ? .04 : 0) + (exposedLine ? .04 : 0));
    if (random() > breakthrough) {
      state.stats.tackles[other]++;
      this.emit(state, { type: 'DESARME', teamIndex: other, playerId: marker?.id, creatorId: creator.id, text: `${marker?.name || teams[other].name} corta a jogada de ${creator.name}.` });
      return;
    }
    this.takeShot(state, teams, power, side, creator, playType, random);
  }

  static takeShot(state, teams, power, side, creator, playType, random, allowCorner = true) {
    const other = 1 - side;
    const header = playType === 'header' || playType === 'corner';
    const skill = header ? 'heading' : 'finishing';
    const attackers = this.playersFor(state, teams[side], side);
    const designated = playType === 'free-kick' ? attackers.find(player => player.id === state.setPieces[side].freeKick) : null;
    const shooter = designated || (playType === 'dribble' ? creator : this.weightedPlayer(attackers.filter(player => !header || player !== creator), p => {
      const role = state.assignments[side][p.id]?.role || p.position;
      const weights = header ? { G: 0, Z: 2.4, L: .6, M: 1.2, A: 4 } : { G: 0, Z: .3, L: .6, M: 2, A: 5 };
      return (weights[role] || 0) * Math.pow(this.attribute(p, skill, this.playerContext(state, side, p)), 1.5);
    }, random));
    if (!shooter) return;
    const finishing = this.attribute(shooter, skill, this.playerContext(state, side, shooter));
    const targetChance = this.clamp(.24, .72, .43 + (finishing - 40) * .003 - (header ? .035 : 0));
    const cornerBonus = playType === 'corner' && creator ? this.clamp(-.04, .04, (this.attribute(creator, 'creation', this.playerContext(state, side, creator)) - 40) * .0015) : 0;
    const conversion = this.clamp(.08, .65, .29 + (finishing - power[other].gk) * .0055
      + (power[side].attack - power[other].defense) * .003 - (playType === 'free-kick' ? .07 : 0) + cornerBonus
      + (playType === 'counter' ? .035 : 0) + (state.instructions[other].line === 'high' && ['counter', 'pass'].includes(playType) && state.instructions[side].passing === 'direct' ? .025 : 0));
    state.stats.shots[side]++;
    state.stats.xG[side] += targetChance * conversion;
    const onTarget = random() < targetChance;
    if (onTarget) state.stats.shotsOnTarget[side]++;
    if (onTarget && random() < conversion) {
      const assister = creator && creator !== shooter && !['free-kick', 'dribble'].includes(playType) ? creator : null;
      this.scoreGoal(state, teams[side], side, shooter, assister, false, header ? ' De cabeça!' : '');
      return;
    }
    const keeper = this.goalkeeper(state, teams[other], other);
    const description = playType === 'free-kick' ? 'na cobrança de falta' : header ? 'na cabeçada' : 'no chute';
    this.emit(state, { type: onTarget ? 'DEFESA' : 'FINALIZACAO_FORA', teamIndex: side, playerId: shooter.id, keeperId: onTarget ? keeper?.id : null,
      text: onTarget ? `${keeper?.name || 'A defesa'} defende ${description} de ${shooter.name}!` : `${shooter.name} finaliza ${header ? 'de cabeça ' : ''}para fora!` });
    if (allowCorner && random() < (onTarget ? .30 : .12)) {
      state.stats.corners[side]++;
      this.emit(state, { type: 'ESCANTEIO', teamIndex: side, text: `Escanteio para o ${teams[side].name}.` });
      const cornerTaker = attackers.find(player => player.id === state.setPieces[side].corner) || creator
        || this.weightedPlayer(attackers.filter(player => player.position !== 'G'), player => this.attribute(player, 'creation', this.playerContext(state, side, player)), random);
      if (random() < .55) this.takeShot(state, teams, power, side, cornerTaker, 'corner', random, false);
    }
  }

  static goalkeeper(state, team, side) {
    return this.playersFor(state, team, side).find(p => state.assignments[side][p.id]?.role === 'G') || null;
  }

  static penaltyChance(taker, keeper, takerContext = {}, keeperContext = {}) {
    return this.clamp(.50, .90, .74 + (this.attribute(taker, 'finishing', takerContext) - this.attribute(keeper, 'saving', keeperContext)) * .003);
  }

  static takePenalty(state, teams, side, random) {
    const active = this.playersFor(state, teams[side], side);
    const taker = active.find(player => player.id === state.setPieces[side].penalty) || this.weightedPlayer(active, p => p.position === 'G' ? 0
      : Math.pow(this.attribute(p, 'finishing', this.playerContext(state, side, p)), 3), random);
    if (!taker) return;
    const keeper = this.goalkeeper(state, teams[1 - side], 1 - side);
    const chance = this.penaltyChance(taker, keeper, this.playerContext(state, side, taker), keeper ? this.playerContext(state, 1 - side, keeper) : {});
    state.stats.shots[side]++;
    state.stats.xG[side] += chance;
    if (random() < chance) {
      state.stats.shotsOnTarget[side]++;
      this.scoreGoal(state, teams[side], side, taker, null, true);
    } else {
      const saved = Boolean(keeper) && random() < .7;
      if (saved) state.stats.shotsOnTarget[side]++;
      this.adjustMorale(taker, -2);
      this.emit(state, { type: 'PENALTI_PERDIDO', teamIndex: side, playerId: taker.id, keeperId: saved ? keeper.id : null, saved, icon: 'arrowright.png', sound: 'penalty.wav', text: `Pênalti perdido por ${taker.name}!${saved ? ` Defesa de ${keeper.name}.` : ' A bola foi para fora.'}` });
    }
  }

  static adjustMorale(player, change) { player.morale = this.clamp(40, 110, (player.morale ?? 100) + change); }

  static scoreGoal(state, team, side, scorer, assister, penalty, detail = '') {
    state.scores[side]++;
    if (scorer) { scorer.goals = (scorer.goals || 0) + 1; this.adjustMorale(scorer, 2); }
    if (assister) { assister.assists = (assister.assists || 0) + 1; this.adjustMorale(assister, 1); }
    this.playersFor(state, team, side).forEach(p => this.adjustMorale(p, .5));
    this.emit(state, { type: penalty ? 'GOL_PENALTI' : 'GOL', teamIndex: side, playerId: scorer?.id ?? null, player: scorer?.name ?? null, assistId: assister?.id ?? null, assist: assister?.name ?? null, icon: 'egol.png', sound: 'gol1.wav', text: `${penalty ? 'PÊNALTI! ' : ''}GOOOL! ${scorer?.name || 'Jogador'} marca para o ${team.name}!${detail}${assister ? ` Assistência de ${assister.name}.` : ''}` });
  }

  static sendOff(state, team, side, player, secondYellow) {
    if (state.sentOffIds[side].includes(player.id)) return;
    state.activeIds[side] = state.activeIds[side].filter(id => id !== player.id);
    delete state.assignments[side][player.id];
    state.sentOffIds[side].push(player.id);
    state.stats.redCards[side]++;
    player.redCards = (player.redCards || 0) + 1;
    state.pendingSuspensions[side][player.id] = Math.max(state.pendingSuspensions[side][player.id] || 0, secondYellow ? 1 : 2);
    this.adjustMorale(player, -4);
    this.emit(state, { type: secondYellow ? 'SEGUNDO_AMARELO' : 'CARTAO_VERMELHO', teamIndex: side, playerId: player.id, player: player.name, icon: secondYellow ? 'ecacv.png' : 'ecv.png', sound: 'expulsao.wav', text: `${player.name} foi EXPULSO${secondYellow ? ' pelo segundo amarelo' : ' com cartão vermelho direto'}! Suspensão de ${secondYellow ? 1 : 2} jogo(s).` });
  }

  static simulateInjury(state, teams, random) {
    const candidates = teams.flatMap((team, side) => this.playersFor(state, team, side).filter(p => !state.injuredIds[side].includes(p.id)).map(player => ({ player, side })));
    const averageEnergy = candidates.reduce((sum, entry) => sum + (entry.player.energy ?? 100), 0) / Math.max(1, candidates.length);
    if (random() >= .003 + (100 - averageEnergy) * .00012) return;
    const chosen = this.weightedPlayer(candidates, entry => 1 + (100 - (entry.player.energy ?? 100)) / 40, random);
    if (!chosen) return;
    const { player, side } = chosen;
    const severity = random(), duration = severity < .65 ? 1 : severity < .92 ? 2 : 4;
    state.injuredIds[side].push(player.id);
    state.injuryDurations[side][player.id] = duration;
    this.adjustMorale(player, -2);
    this.emit(state, { type: 'CONTUSAO', teamIndex: side, playerId: player.id, player: player.name, icon: 'ect.png', sound: 'contusao.wav', text: `${player.name} sentiu uma lesão: rendimento reduzido e previsão de ${duration} rodada(s) de recuperação.` });
  }

  static substitute(state, homeTeam, awayTeam, side, outId, inId) {
    this.ensureState(state, homeTeam, awayTeam);
    if (state.finished || state.minute >= 90) return { success: false, message: 'A partida já terminou.' };
    if (side !== 0 && side !== 1) return { success: false, message: 'Time inválido.' };
    const team = side === 0 ? homeTeam : awayTeam;
    const outgoing = team.players.find(p => String(p.id) === String(outId));
    const incoming = team.players.find(p => String(p.id) === String(inId));
    if (!outgoing || !state.activeIds[side].includes(outgoing.id)) return { success: false, message: 'Escolha um jogador que esteja em campo. Expulsos não podem ser substituídos.' };
    if (!incoming || !state.benchIds[side].includes(incoming.id) || state.activeIds[side].includes(incoming.id) || state.exitedIds[side].includes(incoming.id) || state.sentOffIds[side].includes(incoming.id)) return { success: false, message: 'Esse jogador não está disponível no banco.' };
    if (!MatchSquad.isAvailable(incoming) || state.injuredIds[side].includes(incoming.id)) return { success: false, message: 'Jogador lesionado ou suspenso não pode entrar.' };
    if (state.substitutions[side] >= state.maxSubstitutions) return { success: false, message: `Limite de ${state.maxSubstitutions} substituições atingido.` };
    let slot = state.assignments[side][outgoing.id];
    const keeper = this.goalkeeper(state, team, side);
    if (incoming.position === 'G' && (!keeper || keeper.position !== 'G') && slot?.role !== 'G') {
      // A new keeper covers the vacant goal; an improvised keeper returns to the outgoing player's slot.
      if (keeper && slot) state.assignments[side][keeper.id] = slot;
      slot = { role: 'G', side: 'C', index: 0 };
    }
    state.activeIds[side][state.activeIds[side].indexOf(outgoing.id)] = incoming.id;
    delete state.assignments[side][outgoing.id];
    if (slot) state.assignments[side][incoming.id] = slot;
    state.exitedIds[side].push(outgoing.id);
    state.substitutions[side]++;
    state.participatedIds[side].push(incoming.id);
    const outIndex = team.players.indexOf(outgoing), inIndex = team.players.indexOf(incoming);
    [team.players[outIndex], team.players[inIndex]] = [team.players[inIndex], team.players[outIndex]];
    team.players.forEach((p, idx) => { p.isStarter = idx < (team.starterCount ?? 11); });
    this.emit(state, { type: 'SUBSTITUICAO', teamIndex: side, outId: outgoing.id, inId: incoming.id, icon: 'esubs.png', text: `Substituição no ${team.name}: sai ${outgoing.name}, entra ${incoming.name}.` });
    const improvised = slot && MatchSquad.positionFit(incoming, slot) < .90;
    return { success: true, message: `${incoming.name} entrou no lugar de ${outgoing.name}.${improvised ? ` Atuará improvisado como ${slot.role}; ajuste a formação se necessário.` : ''}` };
  }

  static changeTactics(state, homeTeam, awayTeam, side, formation, style, instructions = null, setPieces = null) {
    this.ensureState(state, homeTeam, awayTeam);
    if (state.finished) return { success: false, message: 'A partida já terminou.' };
    if ((side !== 0 && side !== 1) || !this.FORMATIONS.includes(formation) || !this.STYLES.includes(style)) return { success: false, message: 'Escolha uma formação e um estilo válidos.' };
    const team = side === 0 ? homeTeam : awayTeam;
    if (instructions !== null && !MatchTactics.valid(instructions)) return { success: false, message: 'As instruções táticas são inválidas.' };
    const nextInstructions = instructions === null ? state.instructions[side] : MatchTactics.normalize({ ...state.instructions[side], ...instructions });
    const nextSetPieces = setPieces === null ? state.setPieces[side] : MatchTactics.takers(setPieces, team.players);
    if (state.formations[side] === formation && state.styles[side] === style && JSON.stringify(nextInstructions) === JSON.stringify(state.instructions[side])
      && JSON.stringify(nextSetPieces) === JSON.stringify(state.setPieces[side])) return { success: true, message: 'A tática já está aplicada.' };
    if (state.formations[side] !== formation) state.assignments[side] = MatchSquad.assignPositions(this.playersFor(state, team, side), formation);
    state.formations[side] = team.formation = formation;
    state.styles[side] = team.tacticStyle = style;
    state.instructions[side] = nextInstructions; team.tactics = { ...nextInstructions };
    state.setPieces[side] = nextSetPieces; team.setPieces = { ...nextSetPieces };
    MatchAnalysis.change(state, side);
    this.emit(state, { type: 'TATICA', teamIndex: side, icon: 'tactics.png', text: `${team.name} mudou para ${formation}, estilo ${style.toLowerCase()}. ${MatchTactics.summary(nextInstructions)}.` });
    return { success: true, message: 'Tática aplicada aos próximos minutos.' };
  }

  static manageOpponent(state, teams, side) {
    const team = teams[side], active = this.playersFor(state, team, side);
    const keeper = this.goalkeeper(state, team, side);
    const missingKeeper = !keeper || keeper.position !== 'G';
    const injured = active.some(p => state.injuredIds[side].includes(p.id));
    const maySub = state.substitutions[side] < state.maxSubstitutions
      && (injured || missingKeeper || (state.minute >= 55 && state.minute - state.lastAiSubAt[side] >= 8));
    const reserves = maySub ? team.players.filter(p => state.benchIds[side].includes(p.id) && !state.activeIds[side].includes(p.id)
      && !state.exitedIds[side].includes(p.id) && !state.sentOffIds[side].includes(p.id) && MatchSquad.isAvailable(p)) : [];
    const urgent = injured || (missingKeeper && reserves.some(p => p.position === 'G'));
    const canSub = state.substitutions[side] < state.maxSubstitutions
      && (urgent || (state.minute >= 55 && state.minute - state.lastAiSubAt[side] >= 8))
      && (urgent || state.minute >= 70 || state.substitutions[side] < state.maxSubstitutions - 1);
    if (canSub) {
      let choice = null;
      for (const outgoing of active) {
        const slot = state.assignments[side][outgoing.id] || { role: outgoing.position };
        const injured = state.injuredIds[side].includes(outgoing.id);
        for (const incoming of reserves) {
          const keeperRepair = missingKeeper && incoming.position === 'G' && outgoing.position !== 'G';
          if (urgent && state.minute < 55 && !injured && !keeperRepair) continue;
          if (!keeperRepair && ((slot.role === 'G') !== (incoming.position === 'G'))) continue;
          const incomingSlot = keeperRepair ? { role: 'G', side: 'C' } : slot;
          const gain = MatchSquad.lineupRating(incoming, incomingSlot)
            - MatchSquad.lineupRating(outgoing, slot) * (injured ? .55 : 1)
            + (injured ? 35 : 0) + (keeperRepair ? 70 : 0)
            + (state.yellows[outgoing.id] && state.minute >= 65 ? 2 : 0);
          if (gain > 2.5 && (!choice || gain > choice.gain)) choice = { outgoing, incoming, gain, keeperRepair };
        }
      }
      if (choice) {
        const result = this.substitute(state, teams[0], teams[1], side, choice.outgoing.id, choice.incoming.id);
        if (result.success) {
          state.lastAiSubAt[side] = state.minute;
          if (choice.keeperRepair) state.assignments[side] = MatchSquad.assignPositions(this.playersFor(state, team, side), state.formations[side]);
        }
      }
    }
    if (state.minute < 55 || state.minute % 5 !== 0 || state.minute - state.lastAiTacticsAt[side] < 15) return;
    const difference = state.scores[side] - state.scores[1 - side];
    const style = difference < 0 ? 'Ofensivo' : difference > 0 && state.minute >= 70 ? 'Defensivo' : 'Equilibrado';
    const players = this.playersFor(state, team, side);
    const averageEnergy = players.reduce((sum, player) => sum + (player.energy ?? 100), 0) / Math.max(1, players.length);
    const plan = difference > 0 && state.minute >= 70 ? 'protect' : difference < 0 ? (averageEnergy >= 65 ? 'highPress' : 'wide') : 'balanced';
    const instructions = MatchTactics.preset(plan).instructions;
    let formation = state.formations[side], bestValue = -Infinity;
    for (const candidate of this.FORMATIONS) {
      const p = this.calculateTeamPower(team, side === 0 && !state.isNeutral, { players, formation: candidate, tacticStyle: style, instructions, injuredIds: state.injuredIds[side] });
      const value = style === 'Ofensivo' ? p.attack * .58 + p.midfield * .30 + p.defense * .12
        : style === 'Defensivo' ? p.defense * .58 + p.midfield * .32 + p.attack * .10
        : p.defense * .30 + p.midfield * .40 + p.attack * .30;
      const preference = candidate === state.formations[side] ? 1.02 : 1;
      if (value * preference > bestValue) { bestValue = value * preference; formation = candidate; }
    }
    const changed = this.changeTactics(state, teams[0], teams[1], side, formation, style, instructions);
    if (changed.success) state.lastAiTacticsAt[side] = state.minute;
  }

  static checkAbandonment(state, teams, random) {
    if (state.activeIds.every(ids => ids.length >= 7)) return false;
    const homeShort = state.activeIds[0].length < 7, awayShort = state.activeIds[1].length < 7;
    state.scores = homeShort && awayShort ? [0, 0] : homeShort ? [0, Math.max(3, state.scores[1])] : [Math.max(3, state.scores[0]), 0];
    state.abandoned = true;
    this.emit(state, { type: 'ABANDONO', text: homeShort && awayShort ? 'Partida encerrada: os dois times ficaram com menos de sete jogadores. Resultado administrativo: 0 × 0.'
      : `${teams[homeShort ? 0 : 1].name} ficou com menos de sete jogadores. Partida encerrada por insuficiência de atletas.` });
    this.finishMatch(state, teams[0], teams[1], random);
    return true;
  }

  static finishMatch(state, homeTeam, awayTeam, random = Math.random) {
    this.ensureState(state, homeTeam, awayTeam);
    if (state.finished) return;
    MatchAnalysis.record(state, [homeTeam, awayTeam]);
    state.finished = true;
    state.phase = 'finished';
    state.finalEnergy = [homeTeam, awayTeam].map(team => Object.fromEntries(team.players.map(player => [player.id, player.energy ?? 100])));
    state.finalPower = [homeTeam, awayTeam].map((team, side) => this.powerFor(state, team, side));
    [homeTeam, awayTeam].forEach((team, side) => {
      const resultMorale = state.scores[side] > state.scores[1 - side] ? 4 : state.scores[side] < state.scores[1 - side] ? -4 : 0;
      for (const player of team.players) {
        const minutes = state.minutesPlayed[side][player.id] || 0;
        player.lastMatchMinutes = minutes;
        if (minutes > 0) { player.matchesPlayed = (player.matchesPlayed || 0) + 1; this.adjustMorale(player, resultMorale); }
        player.pendingInjuryWeeks = Math.max(player.pendingInjuryWeeks || 0, state.injuryDurations[side][player.id] || 0);
        player.pendingSuspensionWeeks = Math.max(player.pendingSuspensionWeeks || 0, state.pendingSuspensions[side][player.id] || 0);
      }
    });
    if (state.isCup && !state.abandoned && state.scores[0] === state.scores[1]) state.penalties = this.simulatePenaltyShootout(homeTeam, awayTeam, random, state);
    MatchPerformance.recordMatch(state, [homeTeam, awayTeam]);
    this.emit(state, { type: 'FIM_JOGO', sound: 'fimjogo.wav', text: 'Apito final! Fim de jogo.' });
  }

  static simulateMatch(homeTeam, awayTeam, options = {}) {
    const aiControlled = Number.isInteger(options.userSide) ? [options.userSide !== 0, options.userSide !== 1] : [true, true];
    const state = this.createMatch(homeTeam, awayTeam, { aiControlled, ...options });
    while (!state.finished) this.stepMatch(state, homeTeam, awayTeam, options.random || Math.random);
    return {
      homeTeam: { id: homeTeam.id, name: homeTeam.name, fileRef: homeTeam.fileRef, score: state.scores[0], penalties: state.penalties?.home ?? null },
      awayTeam: { id: awayTeam.id, name: awayTeam.name, fileRef: awayTeam.fileRef, score: state.scores[1], penalties: state.penalties?.away ?? null },
      events: state.events, stats: state.stats, playerRatings: state.playerRatings
    };
  }

  static calculateTeamPower(team, isHome, context = {}) {
    const players = context.players || MatchSquad.starters(team).filter(p => MatchSquad.isAvailable(p));
    const formation = context.formation || team.formation || '4-4-2';
    const assignments = context.assignments || MatchSquad.assignPositions(players, formation);
    const expected = MatchSquad.FORMATIONS[formation] || MatchSquad.FORMATIONS['4-4-2'];
    const totals = { G: 0, D: 0, M: 0, A: 0 }, counts = { G: 0, D: 0, M: 0, A: 0 };
    for (const player of players) {
      const slot = assignments[player.id];
      if (!slot) continue;
      const role = ['Z', 'L'].includes(slot.role) ? 'D' : slot.role;
      const playerContext = { slot, injured: context.injuredIds?.includes(player.id) };
      const attribute = skill => this.attribute(player, skill, playerContext);
      totals[role] += role === 'G' ? attribute('saving') : role === 'D' ? attribute('tackling') * .8 + attribute('heading') * .2
        : role === 'M' ? attribute('passing') * .65 + attribute('creation') * .35 : attribute('finishing') * .65 + attribute('heading') * .35;
      counts[role]++;
    }
    const average = (role, target) => counts[role] ? totals[role] / counts[role] * Math.pow(counts[role] / target, .65) : 0;
    const tactics = context.tacticStyle || team.tacticStyle || 'Equilibrado';
    const instructions = MatchTactics.effects(context.instructions || team.tactics);
    const shape = MatchSquad.FORMATION_MODIFIERS[formation] || { defense: 1, midfield: 1, attack: 1 };
    const homeBonus = isHome ? 1.05 : 1;
    const modifier = homeBonus * Math.pow(players.length / 11, .35);
    return {
      gk: average('G', 1) * homeBonus,
      defense: average('D', expected.Z + expected.L) * (1 + (expected.Z + expected.L - 4) * .06) * (tactics === 'Ofensivo' ? .88 : tactics === 'Defensivo' ? 1.18 : 1) * modifier * instructions.defense * shape.defense,
      midfield: average('M', expected.M) * (1 + (expected.M - 4) * .08) * modifier * instructions.midfield * shape.midfield,
      attack: average('A', expected.A) * (1 + (expected.A - 2) * .12) * (tactics === 'Ofensivo' ? 1.15 : tactics === 'Defensivo' ? .85 : 1) * modifier * instructions.attack * shape.attack,
      tactics, assignments
    };
  }

  static selectRandomPlayer(players, positions = [], random = Math.random) {
    const preferred = players.filter(p => positions.includes(p.position));
    const pool = preferred.length ? preferred : players;
    return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] : null;
  }

  static simulatePenaltyShootout(homeTeam, awayTeam, random = Math.random, state = null) {
    const teams = [homeTeam, awayTeam];
    const players = teams.map((team, side) => state ? this.playersFor(state, team, side) : MatchSquad.starters(team));
    const keepers = teams.map((team, side) => state ? this.goalkeeper(state, team, side) : players[side].find(p => p.position === 'G'));
    const takers = players.map(list => [...list].sort((a, b) => this.attribute(b, 'finishing') - this.attribute(a, 'finishing')));
    const scores = [0, 0], taken = [0, 0];
    const kick = side => {
      const taker = takers[side][taken[side] % Math.max(1, takers[side].length)];
      const keeper = keepers[1 - side];
      const chance = this.penaltyChance(taker, keeper, state && taker ? this.playerContext(state, side, taker) : {}, state && keeper ? this.playerContext(state, 1 - side, keeper) : {});
      if (taker && random() < chance) scores[side]++;
      taken[side]++;
    };
    for (let i = 0; i < 5; i++) {
      for (let side = 0; side < 2; side++) {
        kick(side);
        if (scores[0] > scores[1] + 5 - taken[1] || scores[1] > scores[0] + 5 - taken[0]) return { home: scores[0], away: scores[1] };
      }
    }
    for (let i = 0; scores[0] === scores[1] && i < 100; i++) { kick(0); kick(1); }
    if (scores[0] === scores[1]) scores[random() < .5 ? 0 : 1]++;
    return { home: scores[0], away: scores[1] };
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = MatchEngine;
else window.MatchEngine = MatchEngine;
