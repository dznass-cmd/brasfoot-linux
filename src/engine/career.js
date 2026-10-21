// Persistent seasons. The current division keeps the original save format.
const CareerLeague = typeof module !== 'undefined' && module.exports ? require('./league.js') : window.LeagueEngine;
const CareerSquad = typeof module !== 'undefined' && module.exports ? require('./squad.js') : window.SquadEngine;
const CareerMatch = typeof module !== 'undefined' && module.exports ? require('./match.js') : window.MatchEngine;
const CareerMarket = typeof module !== 'undefined' && module.exports ? require('./market.js') : window.MarketEngine;
const CareerPerformance = typeof module !== 'undefined' && module.exports ? require('./performance.js') : window.PerformanceEngine;
const CareerFinance = typeof module !== 'undefined' && module.exports ? require('./finance.js') : window.FinanceEngine;
const CareerEconomy = typeof module !== 'undefined' && module.exports ? require('./economy.js') : window.EconomyEngine;
const CareerContracts = typeof module !== 'undefined' && module.exports ? require('./contracts.js') : window.ContractsEngine;

class CareerEngine {
  static VERSION = 1;
  static calendarCache = new WeakMap();
  static clone(value) { return JSON.parse(JSON.stringify(value)); }

  static teams(state) { return [...(state.divisionTeams || []), ...(state.reserveTeams || [])]; }

  static isSeasonComplete(state) {
    return Boolean(state && state.rounds?.length && (!state.activeMatch || state.activeMatch.finished)
      && state.rounds.every(round => round.isFinished && round.matches.every(match => match.isPlayed)));
  }

  static ensureState(state, config, database) {
    CareerMarket.ensureState(state);
    if (state.careerVersion === this.VERSION) { this.ensureProfile(state); return state; }
    const configured = config?.BRA?.divisions || [];
    if (!configured.some(division => division.id === state.divisionId)) throw new Error('A divisão desta carreira não foi encontrada.');
    const currentIds = state.divisionTeams.map(team => team.id);
    const occupied = new Set(currentIds);
    const divisions = configured.map(division => ({
      id: division.id, name: division.name, promoted: division.promoted || 0, relegated: division.relegated || 0,
      teams: division.id === state.divisionId ? currentIds : division.teams.filter(id => !occupied.has(id))
    }));
    const knownPlayers = new Set(state.divisionTeams.flatMap(team => team.players.map(player => player.id)));
    const reserveTeams = [];
    for (const division of divisions) {
      if (division.id === state.divisionId) continue;
      for (const id of division.teams) {
        const original = database.find(team => team.id === id);
        if (!original) throw new Error(`Clube ${id} não encontrado na base local.`);
        const team = this.clone(original);
        // A player already owned in the saved league must not reappear at his original club.
        team.players = team.players.filter(player => !knownPlayers.has(player.id));
        team.players.forEach(player => knownPlayers.add(player.id));
        reserveTeams.push(team);
      }
    }
    state.careerDivisions = divisions;
    state.reserveTeams = reserveTeams;
    state.seasonHistory ||= [];
    state.backgroundSeasons = {};
    state.careerVersion = this.VERSION;
    this.initializeBackground(state);
    this.ensureProfile(state);
    return state;
  }

  // Manager data is independent of club finances and follows the coach between jobs.
  static ensureProfile(state) {
    if (!state.managerProfile) {
      const profile = { version: 1, name: state.userTeam.manager || 'Técnico', tenures: [], offers: [], offersForYear: null };
      const addTenure = (team, year) => {
        const previous = profile.tenures.at(-1);
        if (previous) previous.toYear = year;
        const tenure = { id: `tenure_${profile.tenures.length + 1}`, teamId: team.id, teamName: team.name,
          shield: team.shield, fromYear: year, toYear: null };
        profile.tenures.push(tenure);
        return tenure;
      };
      for (const record of state.seasonHistory || []) {
        const team = record.user;
        let tenure = profile.tenures.at(-1);
        if (!tenure || tenure.teamId !== team.id) tenure = addTenure(team, record.year);
        record.user.managerTenureId = tenure.id;
      }
      if (profile.tenures.at(-1)?.teamId !== state.userTeam.id) addTenure(state.userTeam, state.seasonYear);
      state.managerProfile = profile;
    }
    const currentTenure = state.managerProfile.tenures.at(-1);
    currentTenure.teamName = state.userTeam.name; currentTenure.shield = state.userTeam.shield;
    this.expireJobOffers(state);
    const lastSeason = state.seasonHistory?.at(-1);
    if (state.managerProfile.offersForYear === null && this.canChangeClub(state) && Number(lastSeason?.year) === Number(state.seasonYear) - 1) this.generateJobOffers(state, lastSeason);
    return state.managerProfile;
  }

  static canChangeClub(state) {
    return state.currentRound === 1 && !state.activeMatch
      && state.rounds.every(round => !round.isFinished && round.matches.every(match => !match.isPlayed));
  }

  static expireJobOffers(state) {
    for (const offer of state.managerProfile?.offers || []) {
      if (offer.status === 'pending' && (offer.seasonYear !== state.seasonYear || !this.canChangeClub(state))) offer.status = 'expired';
    }
  }

  static profileOverview(state) {
    const profile = this.ensureProfile(state);
    const current = profile.tenures.at(-1);
    const records = (state.seasonHistory || []).map(record => ({ year: record.year, ...record.user }));
    // The manager earns the title as soon as the final round is played.
    const row = CareerLeague.calculateStandings(state.divisionTeams, state.rounds).find(team => team.id === state.userTeam.id);
    if (row && !records.some(record => record.year === state.seasonYear && record.id === row.id)) {
      records.push({ ...row, year: state.seasonYear, divisionId: state.divisionId, divisionName: state.divisionName,
        managerTenureId: current.id, champion: this.isSeasonComplete(state) && row.position === 1,
        completed: this.isSeasonComplete(state) });
    }
    const emptyStats = () => ({ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, titles: 0, promotions: 0, seasons: 0 });
    const tenures = profile.tenures.map(tenure => ({ ...tenure, stats: emptyStats(), seasons: [] }));
    const trophies = [], total = emptyStats();
    for (const record of records) {
      const tenure = tenures.find(entry => entry.id === record.managerTenureId)
        || [...tenures].reverse().find(entry => entry.teamId === record.id && entry.fromYear <= record.year);
      if (!tenure) continue;
      for (const key of ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst']) {
        tenure.stats[key] += record[key] || 0; total[key] += record[key] || 0;
      }
      if (record.played > 0) { tenure.stats.seasons++; total.seasons++; tenure.seasons.push(record); }
      if (record.movement === 'promotion') { tenure.stats.promotions++; total.promotions++; }
      if (record.champion) {
        tenure.stats.titles++; total.titles++;
        trophies.push({ year: record.year, competition: record.divisionName, teamId: record.id,
          teamName: record.name || tenure.teamName, shield: record.shield || tenure.shield });
      }
    }
    return { name: profile.name, tenures, trophies, total,
      pendingOffers: profile.offers.filter(offer => offer.status === 'pending'),
      pastOffers: profile.offers.filter(offer => offer.status !== 'pending') };
  }

  static generateJobOffers(state, lastSeason) {
    const profile = state.managerProfile || this.ensureProfile(state);
    if (profile.offersForYear === state.seasonYear) return;
    for (const offer of profile.offers) if (offer.status === 'pending') offer.status = 'expired';
    const currentIndex = state.careerDivisions.findIndex(division => division.id === state.divisionId);
    const successful = lastSeason.user.champion || lastSeason.user.movement === 'promotion' || lastSeason.user.position <= 6;
    const lowestIndex = Math.min(state.careerDivisions.length - 1, currentIndex + 1);
    const highestIndex = successful ? Math.max(0, currentIndex - 1) : currentIndex;
    const byId = new Map(this.teams(state).map(team => [team.id, team]));
    const candidates = state.careerDivisions.flatMap((division, index) => index < highestIndex || index > lowestIndex ? []
      : division.teams.filter(id => id !== state.userTeam.id).map(id => ({ team: byId.get(id), division })));
    // Stable ordering keeps the same invitations when a save is reloaded.
    const rank = id => {
      let hash = 2166136261;
      for (const ch of `${state.seasonYear}:${state.userTeam.id}:${id}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
      return hash;
    };
    candidates.sort((a, b) => rank(a.team.id) - rank(b.team.id));
    // Include a different division whenever one is eligible.
    const otherDivision = candidates.find(candidate => candidate.division.id !== state.divisionId);
    const sameDivision = candidates.find(candidate => candidate.division.id === state.divisionId);
    const chosen = [...new Set([otherDivision, sameDivision, ...candidates].filter(Boolean))].slice(0, 3);
    const reason = lastSeason.user.champion ? 'Seu título na última temporada chamou a atenção da diretoria.'
      : lastSeason.user.movement === 'promotion' ? 'O acesso conquistado despertou o interesse da diretoria.'
      : lastSeason.user.position <= 10 ? 'A campanha na última temporada agradou à diretoria.'
      : 'A diretoria procura um técnico para iniciar um novo projeto.';
    for (const { team, division } of chosen) profile.offers.push({ id: `job_${state.seasonYear}_${team.id}`, teamId: team.id,
      teamName: team.name, shield: team.shield, divisionId: division.id, divisionName: division.name,
      seasonYear: state.seasonYear, reason, status: 'pending' });
    profile.offers = profile.offers.slice(-30);
    profile.offersForYear = state.seasonYear;
  }

  static acceptJobOffer(state, offerId) {
    const offer = state.managerProfile?.offers.find(entry => entry.id === offerId);
    if (!offer || offer.status !== 'pending' || offer.seasonYear !== state.seasonYear) throw new Error('Esta proposta não está mais disponível.');
    if (!this.canChangeClub(state)) throw new Error('A troca de clube só pode acontecer antes da primeira partida da temporada.');
    const next = this.clone(state), teams = this.teams(next), profile = next.managerProfile;
    const destination = teams.find(team => team.id === offer.teamId);
    const division = next.careerDivisions.find(entry => entry.teams.includes(offer.teamId));
    if (!destination || !division || destination.id === next.userTeam.id) throw new Error('Clube indisponível para esta proposta.');
    const previous = teams.find(team => team.id === next.userTeam.id);
    if (previous.manager === profile.name) previous.manager = 'Comissão técnica';
    profile.tenures.at(-1).toYear = next.seasonYear;
    profile.tenures.push({ id: `tenure_${profile.tenures.length + 1}`, teamId: destination.id, teamName: destination.name,
      shield: destination.shield, fromYear: next.seasonYear, toYear: null });
    for (const entry of profile.offers) if (entry.status === 'pending') entry.status = entry.id === offerId ? 'accepted' : 'withdrawn';
    next.userTeamId = destination.id; next.userTeam = destination;
    destination.manager = profile.name;
    next.divisionId = division.id; next.divisionName = division.name;
    next.divisionTeams = division.teams.map(id => teams.find(team => team.id === id));
    next.reserveTeams = teams.filter(team => !division.teams.includes(team.id));
    next.rounds = CareerLeague.generateSchedule(division.teams);
    next.currentRound = 1; next.totalRounds = next.rounds.length;
    delete next.lastSeasonTransition;
    this.initializeBackground(next);
    CareerMarket.expireOffers(next);
    return next;
  }

  static declineJobOffer(state, offerId) {
    const offer = state.managerProfile?.offers.find(entry => entry.id === offerId);
    if (!offer || offer.status !== 'pending' || offer.seasonYear !== state.seasonYear || !this.canChangeClub(state)) throw new Error('Esta proposta não está mais disponível.');
    const next = this.clone(state);
    next.managerProfile.offers.find(entry => entry.id === offerId).status = 'declined';
    next.userTeam = next.divisionTeams.find(team => team.id === next.userTeamId);
    return next;
  }

  static initializeBackground(state) {
    const teams = this.teams(state);
    state.backgroundSeasons = Object.fromEntries(state.careerDivisions.filter(d => d.id !== state.divisionId).map(division => [division.id, {
      completedRounds: 0, results: [],
      table: CareerLeague.calculateStandings(teams.filter(team => division.teams.includes(team.id)), [])
    }]));
  }

  static backgroundCalendar(division) {
    let cached = this.calendarCache.get(division);
    if (!cached || cached.ids.length !== division.teams.length || cached.ids.some((id, index) => id !== division.teams[index])) {
      const schedule = CareerLeague.generateSchedule(division.teams), prefix = [0];
      for (const round of schedule) prefix.push(prefix.at(-1) + round.matches.length);
      cached = { ids: [...division.teams], schedule, prefix };
      this.calendarCache.set(division, cached);
    }
    return cached;
  }

  static preparationProgress(state) {
    let done = 0, total = 0, matchesDone = 0, matchesTotal = 0;
    for (const division of state.careerDivisions) {
      if (division.id === state.divisionId) continue;
      const calendar = this.backgroundCalendar(division), progress = state.backgroundSeasons[division.id];
      total += calendar.schedule.length;
      done += progress.completedRounds;
      matchesTotal += calendar.prefix.at(-1);
      matchesDone += calendar.prefix[progress.completedRounds] + (progress.nextMatch || 0);
    }
    return { done, total, matchesDone, matchesTotal };
  }

  // The round API remains available to headless callers and older integrations.
  static simulateBackgroundRound(state, random = Math.random) {
    return this.simulateBackgroundStep(state, random, Infinity);
  }

  // The UI yields after each fixture. A partial round is saved with nextMatch;
  // recovery happens once, only after all its fixtures have been completed.
  static simulateBackgroundStep(state, random = Math.random, maxMatches = 1) {
    if (!this.isSeasonComplete(state)) throw new Error('Conclua o campeonato antes de encerrar a temporada.');
    const teams = new Map(this.teams(state).map(team => [team.id, team]));
    for (const division of state.careerDivisions) {
      if (division.id === state.divisionId) continue;
      const progress = state.backgroundSeasons[division.id];
      const schedule = this.backgroundCalendar(division).schedule;
      if (progress.completedRounds >= schedule.length) continue;
      const round = schedule[progress.completedRounds];
      const rows = new Map(progress.table.map(row => [row.id, row]));
      const first = progress.nextMatch || 0;
      const end = Math.min(round.matches.length, first + Math.max(1, maxMatches));
      for (let index = first; index < end; index++) {
        const fixture = round.matches[index];
        const home = teams.get(fixture.homeId), away = teams.get(fixture.awayId);
        const result = CareerMatch.simulateMatch(home, away, { random });
        const h = rows.get(home.id), a = rows.get(away.id);
        const hs = result.homeTeam.score, awayScore = result.awayTeam.score;
        h.played++; a.played++;
        h.goalsFor += hs; h.goalsAgainst += awayScore; a.goalsFor += awayScore; a.goalsAgainst += hs;
        if (hs > awayScore) { h.won++; h.points += 3; a.lost++; }
        else if (hs < awayScore) { a.won++; a.points += 3; h.lost++; }
        else { h.drawn++; a.drawn++; h.points++; a.points++; }
        progress.results.push([progress.completedRounds + 1, home.id, away.id, hs, awayScore]);
        progress.nextMatch = index + 1;
      }
      const roundCompleted = end === round.matches.length;
      if (roundCompleted) {
        const played = new Set(round.matches.flatMap(fixture => [fixture.homeId, fixture.awayId]));
        for (const id of division.teams) CareerSquad.recoverEnergy(teams.get(id), { played: played.has(id) });
        progress.completedRounds++;
        delete progress.nextMatch;
        progress.table = CareerLeague.sortStandings(progress.table);
      }
      return { divisionName: division.name, round: round.roundNumber, roundCompleted, ...this.preparationProgress(state) };
    }
    return null;
  }

  static standingsFor(state, divisionId) {
    if (divisionId === state.divisionId) return CareerLeague.calculateStandings(state.divisionTeams, state.rounds);
    const progress = state.backgroundSeasons?.[divisionId];
    if (!progress) return [];
    const teams = new Map(this.teams(state).map(team => [team.id, team]));
    return CareerLeague.sortStandings(progress.table.map(row => ({ ...row,
      name: teams.get(row.id)?.name || row.name, shortName: teams.get(row.id)?.shortName || row.shortName,
      shield: teams.get(row.id)?.shield || row.shield
    })));
  }

  static seasonPrize(divisionIndex, position, teamCount) {
    const firstPrize = [20000000, 6000000, 2000000, 800000][divisionIndex] || 800000;
    return Math.round(firstPrize * (.25 + .75 * (teamCount - position) / Math.max(1, teamCount - 1)));
  }

  static buildSummary(state) {
    if (!this.isSeasonComplete(state)) throw new Error('Ainda há partidas por disputar.');
    const progress = this.preparationProgress(state);
    if (progress.done !== progress.total) throw new Error('Aguarde o encerramento das outras divisões.');
    const teams = this.teams(state);
    const divisions = state.careerDivisions.map(division => {
      const members = teams.filter(team => division.teams.includes(team.id));
      const standings = this.standingsFor(state, division.id);
      const results = division.id === state.divisionId
        ? state.rounds.flatMap((round, index) => round.matches.map(match => [index + 1, match.homeId, match.awayId, match.homeScore, match.awayScore]))
        : this.clone(state.backgroundSeasons[division.id].results);
      return { id: division.id, name: division.name, standings, results, champion: standings[0], topScorers: CareerLeague.getTopScorers(members).slice(0, 10) };
    });
    const moves = [];
    // Decide all movements from the old tables before moving any club.
    for (let index = 0; index < divisions.length - 1; index++) {
      const upper = divisions[index], lower = divisions[index + 1];
      const count = Math.min(state.careerDivisions[index].relegated, state.careerDivisions[index + 1].promoted,
        Math.floor(upper.standings.length / 2), Math.floor(lower.standings.length / 2));
      if (!count) continue;
      for (const row of upper.standings.slice(-count)) moves.push({ teamId: row.id, name: row.name, fromId: upper.id, toId: lower.id, type: 'relegation' });
      for (const row of lower.standings.slice(0, count)) moves.push({ teamId: row.id, name: row.name, fromId: lower.id, toId: upper.id, type: 'promotion' });
    }
    const ownDivision = divisions.find(division => division.id === state.divisionId);
    const user = ownDivision.standings.find(row => row.id === state.userTeam.id);
    const movement = moves.find(move => move.teamId === state.userTeam.id);
    const nextDivision = divisions.find(division => division.id === (movement?.toId || ownDivision.id));
    return {
      year: state.seasonYear, divisions, moves,
      user: { ...user, divisionId: ownDivision.id, divisionName: ownDivision.name,
        managerTenureId: this.ensureProfile(state).tenures.at(-1).id,
        nextDivisionId: nextDivision.id, nextDivisionName: nextDivision.name,
        movement: movement?.type || 'stayed', champion: ownDivision.champion.id === user.id,
        prize: this.seasonPrize(divisions.indexOf(ownDivision), user.position, ownDivision.standings.length) }
    };
  }

  static createYouth(team, year, index, position, random) {
    const first = ['André', 'Bruno', 'Caio', 'Daniel', 'Eduardo', 'Felipe', 'Gabriel', 'Henrique', 'Igor', 'João', 'Lucas', 'Matheus', 'Pedro', 'Rafael', 'Thiago', 'Vinícius'];
    const last = ['Almeida', 'Andrade', 'Barbosa', 'Cardoso', 'Carvalho', 'Costa', 'Dias', 'Ferreira', 'Lima', 'Martins', 'Mendes', 'Oliveira', 'Pereira', 'Ribeiro', 'Santos', 'Silva'];
    const pick = list => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
    const strengthAverage = team.players.reduce((sum, player) => sum + (player.strength || 30), 0) / Math.max(1, team.players.length);
    const strength = Math.max(18, Math.min(42, Math.round(strengthAverage * (.55 + random() * .20) + random() * 5)));
    const traits = { G: ['Reflexo', 'Elasticidade'], Z: ['Marcação', 'Cabeceio'], L: ['Velocidade', 'Cruzamento'], M: ['Passe', 'Armação'], A: ['Finalização', 'Drible'] };
    return {
      id: `youth_${team.id}_${year}_${index}`, name: `${pick(first)} ${pick(last)}`, position,
      age: 17 + Math.floor(random() * 4), ageEstimated: false, side: position === 'L' ? (index % 2 ? 'E' : 'D') : 'C',
      strength, energy: 100, morale: 100, cr1: traits[position][0], cr2: traits[position][1],
      wage: Math.round(strength * strength * 2), value: Math.round(strength * strength * 600),
      goals: 0, assists: 0, matchesPlayed: 0, yellowCards: 0, redCards: 0, yellowCardCycle: 0,
      injuredWeeks: 0, suspendedWeeks: 0, isStarter: false, isYouth: true, generated: true
    };
  }

  static updateSquadForYear(team, year, random, state = null, freeAgentPool = false) {
    const report = { retired: [], arrivals: [], improved: [], declined: [], released: [] };
    const retained = [];
    for (const player of team.players) {
      const games = player.matchesPlayed || 0;
      player.careerStats ||= { goals: 0, assists: 0, matchesPlayed: 0, yellowCards: 0, redCards: 0 };
      for (const key of Object.keys(player.careerStats)) player.careerStats[key] += player[key] || 0;
      const previousAge = Number(player.simulationAge ?? player.age ?? 26);
      player.simulationAge = (Number.isFinite(previousAge) ? previousAge : 26) + 1;
      if (!player.ageEstimated) player.age = player.simulationAge;
      const retirementAge = player.position === 'G' ? 42 : 39;
      if (player.simulationAge >= retirementAge && (player.simulationAge >= retirementAge + 4 || random() < .25 + (player.simulationAge - retirementAge) * .15)) {
        report.retired.push({ id: player.id, name: player.name, age: player.ageEstimated ? null : player.age });
        continue;
      }
      let change = 0;
      if (player.simulationAge <= 22) change = 1 + Math.floor(random() * 3);
      else if (player.simulationAge <= 28 && games >= 10 && random() < .45) change = 1;
      else if (player.simulationAge >= (player.position === 'G' ? 35 : 32) && random() < .65) change = -1 - Math.floor(random() * 2);
      const previous = Number(player.strength) || 30;
      player.strength = Math.max(15, Math.min(Math.max(75, previous), previous + change));
      if (player.strength !== previous) report[player.strength > previous ? 'improved' : 'declined'].push({ id: player.id, name: player.name, from: previous, to: player.strength });
      player.energy = 100;
      delete player.performance;
      player.morale = Math.max(40, Math.min(110, Math.round(((player.morale ?? 100) + 100) / 2)));
      player.injuredWeeks = Math.max(0, Math.max(player.injuredWeeks || 0, player.pendingInjuryWeeks || 0) - 4);
      player.suspendedWeeks = Math.max(player.suspendedWeeks || 0, player.pendingSuspensionWeeks || 0);
      delete player.pendingInjuryWeeks; delete player.pendingSuspensionWeeks;
      for (const key of ['goals', 'assists', 'matchesPlayed', 'yellowCards', 'redCards', 'yellowCardCycle', 'lastMatchMinutes']) player[key] = 0;
      retained.push(player);
    }
    team.players = retained;
    if (freeAgentPool) return report;
    if (state) report.released = CareerContracts.expireTeam(state, team, year);
    const minimum = { G: 2, Z: 3, L: 2, M: 5, A: 3 };
    let youthIndex = 0;
    const addYouth = position => {
      const player = this.createYouth(team, year, youthIndex++, position, random);
      team.players.push(player); report.arrivals.push({ id: player.id, name: player.name, position, age: player.age });
    };
    for (const [position, count] of Object.entries(minimum)) {
      while (team.players.filter(player => player.position === position).length < count) addYouth(position);
    }
    while (team.players.length < 18) addYouth(['M', 'A', 'Z'][youthIndex % 3]);
    CareerContracts.ensureTeam(team, year);
    CareerSquad.autoSelectStarters(team, team.formation || '4-4-2');
    return report;
  }

  // Build the next state separately so a failed disk write leaves the current career intact.
  static startNextSeason(state, random = Math.random) {
    if (!this.isSeasonComplete(state)) throw new Error('A temporada ainda não terminou.');
    if (!state.seasonSummary || state.seasonSummary.year !== state.seasonYear) throw new Error('Prepare o encerramento da temporada antes de continuar.');
    const next = this.clone(state), summary = next.seasonSummary;
    next.userTeam = next.divisionTeams.find(team => team.id === next.userTeamId);
    CareerContracts.ensureState(next);
    CareerPerformance.archiveSeason(next);
    const returnedLoans = CareerMarket.returnLoans(next);
    this.ensureProfile(next);
    summary.user.managerTenureId ||= next.managerProfile.tenures.at(-1).id;
    if (next.seasonHistory.some(record => record.year === summary.year)) throw new Error('Esta temporada já foi encerrada.');
    const teams = this.teams(next);
    const byId = new Map(teams.map(team => [team.id, team]));
    const nextDivisions = next.careerDivisions.map(division => ({ ...division,
      teams: division.teams.filter(id => !summary.moves.some(move => move.teamId === id && move.fromId === division.id))
        .concat(summary.moves.filter(move => move.toId === division.id).map(move => move.teamId))
    }));
    const ids = nextDivisions.flatMap(division => division.teams);
    if (new Set(ids).size !== ids.length || ids.length !== teams.length || ids.some(id => !byId.has(id))) throw new Error('A composição das divisões ficou inconsistente. A temporada atual foi preservada.');
    summary.user.sponsorBonus = CareerEconomy.closeSeason(next, summary);
    next.seasonHistory.push(summary);
    next.seasonYear = Number(next.seasonYear) + 1;
    const pool = { id: 'free-agents', players: next.freeAgents };
    this.updateSquadForYear(pool, next.seasonYear, random, next, true);
    next.freeAgents = pool.players;
    const userReport = { retired: [], arrivals: [], improved: [], declined: [], released: [] };
    for (const team of [...teams, ...(next.marketClubs || [])]) {
      const report = this.updateSquadForYear(team, next.seasonYear, random, next);
      if (team.id === next.userTeam.id) Object.assign(userReport, report);
    }
    summary.squadChanges = userReport;
    const division = nextDivisions.find(division => division.teams.includes(next.userTeam.id));
    next.careerDivisions = nextDivisions;
    next.divisionId = division.id; next.divisionName = division.name;
    next.divisionTeams = division.teams.map(id => byId.get(id));
    next.reserveTeams = teams.filter(team => !division.teams.includes(team.id));
    next.userTeam = byId.get(next.userTeam.id);
    CareerFinance.post(next.userTeam, { year: summary.year, round: state.totalRounds + 1 }, {
      kind: 'prize', source: `prize:${summary.year}`,
      description: `Premiação: ${summary.user.divisionName} · ${summary.user.position}º lugar`,
      lines: [{ category: 'prize', amount: summary.user.prize }] });
    next.rounds = CareerLeague.generateSchedule(division.teams);
    next.currentRound = 1; next.totalRounds = next.rounds.length;
    next.lastSeasonTransition = { year: next.seasonYear, fromDivision: summary.user.divisionName, toDivision: division.name,
      prize: summary.user.prize, sponsorBonus: summary.user.sponsorBonus, returnedLoans, ...userReport };
    delete next.activeMatch; delete next.seasonSummary;
    this.initializeBackground(next);
    this.generateJobOffers(next, summary);
    CareerMarket.expireOffers(next);
    return next;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = CareerEngine;
else window.CareerEngine = CareerEngine;
