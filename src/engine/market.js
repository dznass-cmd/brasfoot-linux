// market.js - Transfer Market & Player Contracts
const MarketSquad = typeof module !== 'undefined' && module.exports ? require('./squad.js') : window.SquadEngine;
const MarketPerformance = typeof module !== 'undefined' && module.exports ? require('./performance.js') : window.PerformanceEngine;
const MarketFinance = typeof module !== 'undefined' && module.exports ? require('./finance.js') : window.FinanceEngine;
const MarketEconomy = typeof module !== 'undefined' && module.exports ? require('./economy.js') : window.EconomyEngine;
const MarketContracts = typeof module !== 'undefined' && module.exports ? require('./contracts.js') : window.ContractsEngine;

class MarketEngine {
  static worldTeams(state) { return [...(state.divisionTeams || []), ...(state.reserveTeams || []), ...(state.marketClubs || [])]; }
  static ensureState(state) {
    state.marketClubs ||= [];
    state.marketState ||= { version: 1, offers: [], history: [], lastCheck: null, lastGenerated: null, nextId: 1 };
    this.expireOffers(state);
    return state.marketState;
  }
  static expireOffers(state) {
    for (const offer of state.marketState?.offers || []) {
      const player = state.userTeam.players.find(entry => entry.id === offer.playerId);
      if (offer.status === 'pending' && (offer.seasonYear !== state.seasonYear || offer.forTeamId !== state.userTeamId
        || state.currentRound > offer.expiresRound || !player || player.loan)) offer.status = 'expired';
    }
  }
  static clubRandom(clubId, year) {
    let seed = 2166136261;
    const str = `external:${clubId}:${year}`;
    for (let i = 0; i < str.length; i++) seed = Math.imul(seed ^ str.charCodeAt(i), 16777619) >>> 0;
    return function() {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  static advanceClubToYear(team, targetYear, state = null) {
    const baseYear = Number(team.simulatedYear || team.rosterData?.seasonYear || 2026);
    targetYear = Number(targetYear);
    if (!targetYear || baseYear >= targetYear) {
      team.simulatedYear = targetYear || baseYear;
      return team;
    }
    const Career = typeof module !== 'undefined' && module.exports ? require('./career.js') : window.CareerEngine;
    for (let y = baseYear + 1; y <= targetYear; y++) {
      const rng = this.clubRandom(team.id, y);
      Career.updateSquadForYear(team, y, rng, state);
    }
    team.simulatedYear = targetYear;
    MarketContracts.ensureTeam(team, targetYear);
    return team;
  }

  static prepareExternalClub(state, originalTeam) {
    if (!originalTeam) return null;
    const existing = this.worldTeams(state).find(t => t.id === originalTeam.id);
    if (existing) return existing;
    const targetYear = Number(state?.seasonYear || 2026);
    const team = JSON.parse(JSON.stringify(originalTeam));
    const owned = new Set(this.worldTeams(state).flatMap(entry => entry.players.map(player => player.id)));
    for (const player of state?.freeAgents || []) owned.add(player.id);
    team.players = team.players.filter(player => !owned.has(player.id));
    if (targetYear > Number(team.simulatedYear || team.rosterData?.seasonYear || 2026)) {
      this.advanceClubToYear(team, targetYear, state);
    }
    return team;
  }

  static ensureClub(state, clubId, database) {
    let team = this.worldTeams(state).find(entry => entry.id === Number(clubId));
    if (team) {
      if (state.seasonYear && Number(team.simulatedYear || team.rosterData?.seasonYear || 2026) < Number(state.seasonYear)) {
        this.advanceClubToYear(team, state.seasonYear, state);
      }
      return team;
    }
    const original = database.find(entry => entry.id === Number(clubId));
    if (!original) throw new Error('Clube não encontrado.');
    team = JSON.parse(JSON.stringify(original));
    const owned = new Set(this.worldTeams(state).flatMap(entry => entry.players.map(player => player.id)));
    for (const player of state.freeAgents || []) owned.add(player.id);
    team.players = team.players.filter(player => !owned.has(player.id));
    if (state.seasonYear) {
      this.advanceClubToYear(team, state.seasonYear, state);
    }
    state.marketClubs.push(team);
    return team;
  }
  static calculateValue(player) {
    const strength = Number(player.strength) || 30;
    const age = Number(player.simulationAge ?? player.age ?? 26);
    const isStar = Boolean(player.isStar);
    const isTopWorld = Boolean(player.isTopWorld);
    const ageFactor = age < 23 ? 1.3 : age > 32 ? 0.6 : 1.0;
    const starFactor = isStar ? 1.4 : 1.0;
    const topFactor = isTopWorld ? 1.8 : 1.0;
    const calculated = Math.round((Math.pow(strength, 2.5) * 180 * starFactor * topFactor * ageFactor) / 1000) * 1000;
    return Math.max(10000, calculated);
  }
  static quote(player, loan = false, state = null) {
    const baseValue = Number(player.value) || this.calculateValue(player);
    if (!loan) return Math.max(1000, Math.round(baseValue));
    let ratio = 1;
    if (state && Number.isFinite(state.totalRounds) && Number.isFinite(state.currentRound)) {
      const remaining = Math.max(0, state.totalRounds - state.currentRound + 1);
      ratio = state.totalRounds > 0 ? remaining / state.totalRounds : 0;
    }
    return Math.max(1000, Math.round(baseValue * 0.08 * ratio));
  }
  static formScore(player) {
    const games = Math.max(1, player.matchesPlayed || 0);
    return (MarketPerformance.recentAverage(player) ?? MarketPerformance.average(player) ?? 6)
      + Math.min(2, ((player.goals || 0) + (player.assists || 0) * .7) / games) + Math.min(.5, (player.performance?.motm || 0) * .15);
  }
  static canRelease(team, player) {
    if (team.players.length <= 15) throw new Error('O clube de origem precisa manter pelo menos 15 jogadores.');
    if (player.position === 'G' && team.players.filter(entry => entry.position === 'G').length <= 1) throw new Error('O clube precisa manter pelo menos um goleiro.');
    if (player.loan) throw new Error('Jogadores emprestados só podem retornar ao clube de origem ao fim da temporada.');
  }
  static recordDeal(state, data) {
    const record = { id: `deal_${state.marketState.nextId++}`, year: state.seasonYear, round: state.currentRound, ...data };
    state.marketState.history.push(record);
    state.marketState.history = state.marketState.history.slice(-100);
    return record;
  }
  // Every deal builds a new save so failed persistence cannot remove a player or money.
  static transact(state, action, database = []) {
    if (state.activeMatch) throw new Error('Feche a partida antes de negociar jogadores.');
    const next = JSON.parse(JSON.stringify(state));
    next.userTeam = next.divisionTeams.find(team => team.id === next.userTeamId);
    const market = this.ensureState(next);
    let type = action.type, clubId = action.clubId, playerId = action.playerId, amount = Number(action.amount), acceptedOffer = null;
    if (['accept', 'decline'].includes(type)) {
      acceptedOffer = market.offers.find(offer => offer.id === action.offerId && offer.status === 'pending');
      if (!acceptedOffer) throw new Error('Esta proposta não está mais disponível.');
      if (type === 'decline') {
        acceptedOffer.status = 'declined';
        return { state: next, message: 'Proposta recusada.' };
      }
      type = acceptedOffer.type === 'loan' ? 'loan-out' : 'sell';
      clubId = acceptedOffer.clubId; playerId = acceptedOffer.playerId; amount = acceptedOffer.amount;
    }
    if (!['buy', 'sell', 'loan-in', 'loan-out'].includes(type)) throw new Error('Negociação inválida.');
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amount)) throw new Error('Informe um valor inteiro positivo para a negociação.');
    if (Number(clubId) === next.userTeamId) throw new Error('Escolha outro clube para negociar.');
    const loan = type.startsWith('loan');
    if (loan && next.totalRounds && next.currentRound > next.totalRounds) {
      throw new Error('Não é possível realizar empréstimos após o término dos jogos da temporada.');
    }
    const other = this.ensureClub(next, clubId, database);
    MarketContracts.ensureState(next);
    MarketEconomy.ensure(next, other);
    MarketEconomy.ensure(next, next.userTeam);
    const outgoing = ['sell', 'loan-out'].includes(type);
    const seller = outgoing ? next.userTeam : other, buyer = outgoing ? other : next.userTeam;
    const player = seller.players.find(entry => String(entry.id) === String(playerId));
    if (!player) throw new Error('O jogador não está mais no clube de origem.');
    this.canRelease(seller, player);

    const quote = this.quote(player, loan, next);
    const recentDeal = market.history.slice().reverse().find(entry => entry.playerId === player.id && entry.year === next.seasonYear);

    if (!outgoing) {
      if (recentDeal && recentDeal.round === next.currentRound && recentDeal.toId === seller.id && recentDeal.fromId === buyer.id) {
        throw new Error('O jogador acabou de ser transferido nesta rodada e o clube não aceita negociá-lo de imediato.');
      }
      const minFromRecent = recentDeal && recentDeal.toId === seller.id ? Math.round(recentDeal.amount * (loan ? 1.0 : 1.05)) : 0;
      const minAcceptable = Math.max(quote, minFromRecent);
      if (amount < minAcceptable) {
        if (amount < Math.round(minAcceptable * 0.75)) {
          throw new Error(`O ${seller.name} recusou a proposta por considerar o valor de R$ ${amount.toLocaleString('pt-BR')} muito distante da avaliação de ${player.name}.`);
        }
        throw new Error(`O ${seller.name} fez uma contraproposta: aceita negociar ${player.name} por R$ ${minAcceptable.toLocaleString('pt-BR')}.`);
      }
    } else {
      if (!acceptedOffer) {
        const maxCounts = { G: 6, L: 8, Z: 12, M: 16, A: 12 };
        const currentCount = buyer.players.filter(entry => entry.position === player.position).length;
        if (currentCount >= (maxCounts[player.position] || 10)) {
          throw new Error(`O ${buyer.name} já conta com excesso de opções (${currentCount} atletas) para a posição de ${player.position} e não busca reforços.`);
        }
        const squadStrength = buyer.players.reduce((sum, p) => sum + (p.strength || 30), 0) / Math.max(1, buyer.players.length);
        if (player.strength < squadStrength - 8 && currentCount >= 3) {
          throw new Error(`O ${buyer.name} avalia que o nível técnico de ${player.name} (força ${player.strength}) não atende ao padrão do elenco (média ${Math.round(squadStrength)}).`);
        }
        const maximum = quote;
        if (amount > maximum) {
          if (amount > Math.round(maximum * 1.30)) {
            throw new Error(`O ${buyer.name} recusou a proposta: a pedida de R$ ${amount.toLocaleString('pt-BR')} está muito acima da avaliação do atleta para o elenco.`);
          }
          throw new Error(`O ${buyer.name} fez uma contraproposta: aceita pagar até R$ ${maximum.toLocaleString('pt-BR')} por ${player.name}.`);
        }
      }
    }

    const terms = loan ? null : MarketContracts.terms(player, outgoing ? {} : action.terms || {}, 'buy');
    const bonus = terms?.bonus || 0;
    if ((Number(buyer.balance) || 0) < amount + bonus) {
      throw new Error(outgoing ? `O ${buyer.name} não possui saldo suficiente em caixa para cobrir o valor da negociação.` : 'O clube comprador não tem saldo suficiente para o passe e as luvas.');
    }
    MarketEconomy.checkSpending(next, amount + bonus, loan ? MarketFinance.wage(player) : terms.wage, buyer);

    const context = { year: next.seasonYear, round: next.currentRound }, source = `deal_${market.nextId}`;
    MarketFinance.post(buyer, context, { kind: 'market', source,
      description: `${loan ? 'Empréstimo recebido' : 'Compra'}: ${player.name} (${seller.name})`,
      lines: [{ category: loan ? 'loanFee' : 'playerPurchase', amount: -amount },
        ...(bonus ? [{ category: 'signingBonus', amount: -bonus }] : [])] });
    MarketFinance.post(seller, context, { kind: 'market', source,
      description: `${loan ? 'Empréstimo cedido' : 'Venda'}: ${player.name} (${buyer.name})`,
      lines: [{ category: loan ? 'loanIncome' : 'playerSale', amount }] });

    const deal = this.recordDeal(next, { type: loan ? 'loan' : 'transfer', playerId: player.id, playerName: player.name,
      fromId: seller.id, fromName: seller.name, toId: buyer.id, toName: buyer.name, amount });
    if (loan) player.loan = { id: deal.id, ownerTeamId: seller.id, borrowerTeamId: buyer.id, startYear: next.seasonYear, endYear: next.seasonYear, fee: amount, wage: MarketFinance.wage(player) };
    else MarketContracts.assign(player, buyer, next.seasonYear, terms);
    if (acceptedOffer) acceptedOffer.status = 'accepted';
    for (const offer of market.offers) if (offer.status === 'pending' && offer.playerId === player.id) offer.status = 'withdrawn';

    if (seller.id === next.userTeamId) {
      MarketSquad.preserveUserLineupAfterChange(seller, player, null);
    } else {
      seller.players.splice(seller.players.indexOf(player), 1);
      MarketSquad.autoSelectStarters(seller, seller.formation);
    }

    if (buyer.id === next.userTeamId) {
      MarketSquad.preserveUserLineupAfterChange(buyer, null, player);
    } else {
      player.isStarter = false;
      buyer.players.push(player);
      MarketSquad.autoSelectStarters(buyer, buyer.formation);
    }

    return { state: next, message: loan ? `${player.name} emprestado ao ${buyer.name} até o fim de ${next.seasonYear}.`
      : `${player.name} transferido para o ${buyer.name} por R$ ${amount.toLocaleString('pt-BR')}.` };
  }
  static returnLoans(state) {
    this.ensureState(state);
    const teams = this.worldTeams(state), returned = [];
    for (const borrower of teams) for (const player of [...borrower.players]) {
      if (!player.loan || player.loan.endYear > state.seasonYear) continue;
      const owner = teams.find(team => team.id === player.loan.ownerTeamId);
      if (!owner || owner === borrower) throw new Error('Não foi possível localizar o clube de origem de um empréstimo.');
      borrower.players.splice(borrower.players.indexOf(player), 1);
      owner.players.push(player); delete player.loan; player.isStarter = false;
      if (player.contract) player.wage = player.contract.wage;
      const deal = this.recordDeal(state, { type: 'return', playerId: player.id, playerName: player.name,
        fromId: borrower.id, fromName: borrower.name, toId: owner.id, toName: owner.name, amount: 0 });
      returned.push(deal);
    }
    return returned;
  }
  static hash(value) {
    let hash = 2166136261;
    for (const ch of String(value)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
    return hash / 4294967296;
  }
  static generateOffers(state, database = []) {
    const market = this.ensureState(state), round = state.currentRound - 1;
    const key = `${state.seasonYear}:${state.userTeamId}:${round}`;
    if (market.lastCheck === key) return null;
    market.lastCheck = key;
    if (round < 3 || market.offers.filter(offer => offer.status === 'pending').length >= 3 || state.userTeam.players.length <= 15) return null;
    if (market.lastGenerated?.year === state.seasonYear && market.lastGenerated.teamId === state.userTeamId && round - market.lastGenerated.round < 3) return null;
    if (this.hash(`${key}:chance`) > .65) return null;
    let loan = this.hash(`${key}:type`) < .3;
    const eligible = state.userTeam.players.filter(player => !player.loan && (player.position !== 'G' || state.userTeam.players.filter(p => p.position === 'G').length > 1)
      && !market.offers.some(offer => offer.status === 'pending' && offer.playerId === player.id));
    let players = loan ? eligible.filter(player => (player.age || 26) <= 25 && (player.matchesPlayed || 0) < round * .6)
      : eligible.filter(player => (player.matchesPlayed || 0) >= 2);
    if (!players.length && loan) { loan = false; players = eligible.filter(player => (player.matchesPlayed || 0) >= 2); }
    players.sort((a, b) => loan ? (a.matchesPlayed || 0) - (b.matchesPlayed || 0) || b.strength - a.strength : this.formScore(b) - this.formScore(a) || b.strength - a.strength);
    const player = players[0]; if (!player) return null;
    const premium = loan ? 1 : 1 + Math.max(0, this.formScore(player) - 6) * .1;
    const amount = Math.round(this.quote(player, loan) * Math.min(1.5, premium));
    const clubs = new Map(database.map(team => [team.id, team]));
    for (const team of this.worldTeams(state)) clubs.set(team.id, team);
    const needs = team => Math.max(0, ({ G: 2, L: 3, Z: 4, M: 6, A: 4 }[player.position] || 3) - team.players.filter(p => p.position === player.position).length);
    const candidates = [...clubs.values()].filter(team => team.id !== state.userTeamId && (Number(team.balance) || 0) >= amount
      && !team.players.some(p => p.id === player.id));
    const ranked = candidates.map(team => ({ team, need: needs(team), rank: this.hash(`${key}:${team.id}`) }));
    ranked.sort((a, b) => b.need - a.need || a.rank - b.rank);
    const club = ranked[0]?.team; if (!club) return null;
    const average = MarketPerformance.recentAverage(player);
    const reason = loan ? 'O clube busca reforço por empréstimo e oferece espaço para um jogador com poucos minutos.'
      : `Interesse pela campanha: ${player.matchesPlayed || 0} jogos, ${player.goals || 0} gols e ${player.assists || 0} assistências${average === null ? '' : `; nota recente ${average.toFixed(1)}`}.`;
    const offer = { id: `offer_${market.nextId++}`, type: loan ? 'loan' : 'transfer', status: 'pending', playerId: player.id,
      playerName: player.name, forTeamId: state.userTeamId, clubId: club.id, clubName: club.name, shield: club.shield,
      amount, seasonYear: state.seasonYear, round: state.currentRound, expiresRound: Math.min(state.totalRounds + 1, state.currentRound + 3), reason };
    market.offers.push(offer); market.offers = market.offers.slice(-40);
    market.lastGenerated = { year: state.seasonYear, teamId: state.userTeamId, round };
    return offer;
  }

  static getClubDivisionName(club, state) {
    if (club?.divisionName) return club.divisionName;
    if (state?.divisionTeams?.some(t => t.id === club.id)) return state.divisionName || 'Série A';
    if (state?.careerDivisions) {
      const div = state.careerDivisions.find(d => d.teams?.includes(club.id));
      if (div?.name) return div.name;
    }
    const tier = Number(club?.tier) || 1;
    if (tier >= 17) return 'Série A';
    if (tier >= 13) return 'Série B';
    if (tier >= 8) return 'Série C';
    return 'Série D';
  }

  /**
   * Calculates dynamic transfer and loan offers from interested clubs based on
   * buyer budget, vacancy/urgency at the player's position, squad quality, and player form.
   * @param {Object} player - The player to receive transfer offers for
   * @param {Object} state - Current game state
   * @param {Array} database - Full club database
   * @returns {Array} List of calculated pending offers
   */
  static calculateTransferOffers(player, state, database = []) {
    if (!player || !state?.userTeam) return [];
    const market = this.ensureState(state);
    this.expireOffers(state);

    if (player.loan) return [];
    if (state.userTeam.players.length <= 15) return [];
    if (player.position === 'G' && state.userTeam.players.filter(p => p.position === 'G').length <= 1) return [];

    const existingPending = market.offers.filter(o => o.playerId === player.id && o.status === 'pending');

    const world = this.worldTeams(state);
    const clubsMap = new Map();
    for (const c of database || []) clubsMap.set(c.id, c);
    for (const c of world) clubsMap.set(c.id, c);

    const candidates = [...clubsMap.values()].filter(c => c.id !== state.userTeamId && !(c.players || []).some(p => p.id === player.id));
    const baseQuote = this.quote(player, false, state);
    const loanQuote = this.quote(player, true, state);
    const remainingRounds = Math.max(0, (state.totalRounds || 38) - (state.currentRound || 1) + 1);
    const formScore = this.formScore(player);
    const recentAvg = MarketPerformance.recentAverage(player);

    const maxPositions = { G: 6, L: 8, Z: 12, M: 16, A: 12 };
    const idealCounts = { G: 2, L: 4, Z: 5, M: 6, A: 5 };

    const evaluated = [];

    for (const club of candidates) {
      if (existingPending.some(o => o.clubId === club.id)) continue;

      MarketContracts.ensureTeam(club, state.seasonYear);
      MarketEconomy.ensure(state, club);
      const budget = MarketEconomy.budget(state, club);
      const balance = Number(club.balance) || 0;

      const posPlayers = (club.players || []).filter(p => p.position === player.position);
      const count = posPlayers.length;
      if (count >= (maxPositions[player.position] || 10)) continue;

      const squadAvg = (club.players || []).reduce((sum, p) => sum + (p.strength || 30), 0) / Math.max(1, (club.players || []).length);
      const posAvg = posPlayers.length ? posPlayers.reduce((sum, p) => sum + (p.strength || 30), 0) / posPlayers.length : squadAvg;

      if (player.strength < squadAvg - 7 && count >= 3) continue;

      const urgency = Math.max(0, (idealCounts[player.position] || 4) - count);
      const delta = player.strength - posAvg;

      const terms = MarketContracts.terms(player, {}, 'buy');
      const wageDelta = Number(terms.wage) || Number(player.wage) || 5000;
      const loanWage = MarketFinance.wage(player);

      const canAffordWage = budget.committedWages + wageDelta <= budget.wageLimit;
      const canAffordLoanWage = budget.committedWages + loanWage <= budget.wageLimit;

      const canBuy = balance >= baseQuote * 0.88 && budget.available >= baseQuote * 0.85 && canAffordWage;
      const canLoan = remainingRounds > 0 && balance >= loanQuote && budget.available >= loanQuote && canAffordLoanWage;

      if (!canBuy && !canLoan) continue;

      let score = (player.strength * 1.5) + (delta * 3.2) + (urgency * 6.5) + (player.isTopWorld ? 10 : player.isStar ? 5 : 0) + Math.max(0, formScore - 6) * 3;
      const hashJitter = this.hash(`${state.seasonYear}:${state.currentRound}:${club.id}:${player.id}`);
      score += hashJitter * 8;

      const divisionName = this.getClubDivisionName(club, state);

      let offerType = 'transfer';
      let offerAmount = 0;
      let reason = '';

      if (canBuy && (delta >= -1 || urgency >= 1 || balance >= baseQuote * 1.4)) {
        offerType = 'transfer';
        score += 20; // Prioritize purchase offers when club is able to buy
        let mult = 1.0;
        if (delta >= 3) mult += 0.08;
        else if (delta >= 1) mult += 0.04;
        if (urgency >= 2) mult += 0.06;
        else if (urgency === 1) mult += 0.03;
        if (recentAvg != null && recentAvg >= 7.0) mult += 0.05;
        if (player.age <= 23) mult += 0.04;
        if (player.age >= 32) mult -= 0.08;
        if (balance >= 50_000_000) mult += 0.04;
        mult = Math.max(0.92, Math.min(1.20, mult));

        offerAmount = Math.round((baseQuote * mult) / 50000) * 50000;
        if (offerAmount <= 0) offerAmount = Math.max(10000, baseQuote);
        const maxSpend = Math.min(budget.available, Math.floor(balance * 0.85));
        offerAmount = Math.min(offerAmount, maxSpend);

        if (offerAmount < baseQuote * 0.80 && canLoan) {
          offerType = 'loan';
          score -= 15;
        } else {
          if (delta >= 3) {
            reason = `O ${club.name} busca um titular absoluto para a posição (força ${player.strength} supera a média do setor) e formalizou proposta de compra definitiva.`;
          } else if (urgency >= 1) {
            reason = `O ${club.name} detectou carência urgente de opções no elenco para ${player.position} (${count} atletas no setor) e busca reforço imediato.`;
          } else if (recentAvg != null && recentAvg >= 7.0) {
            reason = `O ${club.name} acompanha o ótimo momento recente do atleta (nota média ${recentAvg.toFixed(1)}) e fez proposta oficial de compra.`;
          } else if (player.age <= 23) {
            reason = `O departamento de futebol do ${club.name} vê ${player.name} (${player.age} anos) como aposta de alto potencial de evolução no elenco.`;
          } else {
            reason = `O ${club.name} formalizou proposta de compra definitiva de R$ ${offerAmount.toLocaleString('pt-BR')} para reforçar o plantel nesta temporada.`;
          }
        }
      } else if (canLoan) {
        offerType = 'loan';
      }

      if (offerType === 'loan') {
        const loanMult = 1.0 + Math.min(0.25, urgency * 0.08);
        offerAmount = Math.round((loanQuote * loanMult) / 10000) * 10000;
        if (offerAmount <= 0) offerAmount = Math.max(5000, loanQuote);
        const maxSpend = Math.min(budget.available, Math.floor(balance * 0.5));
        offerAmount = Math.min(offerAmount, maxSpend);
        reason = `O ${club.name} propõe empréstimo até o fim de ${state.seasonYear} (${remainingRounds} jogos restantes), cobrindo 100% dos salários do jogador.`;
      }

      evaluated.push({
        club,
        divisionName,
        balance,
        score,
        offerType,
        offerAmount,
        reason
      });
    }

    const transfers = evaluated.filter(e => e.offerType === 'transfer');
    const loans = evaluated.filter(e => e.offerType === 'loan');

    transfers.sort((a, b) => (b.offerAmount - a.offerAmount) || (b.score - a.score));
    loans.sort((a, b) => (b.offerAmount - a.offerAmount) || (b.score - a.score));

    const needed = Math.max(0, 3 - existingPending.length);
    const selected = [];
    if (transfers.length > 0) {
      selected.push(...transfers.slice(0, Math.min(2, needed)));
      if (loans.length > 0 && selected.length < needed) selected.push(loans[0]);
      if (transfers.length > 2 && selected.length < needed) selected.push(transfers[2]);
    } else {
      selected.push(...loans.slice(0, needed));
    }

    for (const item of selected) {
      const offer = {
        id: `calc_offer_${market.nextId++}`,
        type: item.offerType,
        status: 'pending',
        playerId: player.id,
        playerName: player.name,
        forTeamId: state.userTeamId,
        clubId: item.club.id,
        clubName: item.club.name,
        shield: item.club.shield,
        division: item.divisionName,
        clubBalance: item.balance,
        amount: item.offerAmount,
        seasonYear: state.seasonYear,
        round: state.currentRound,
        expiresRound: Math.min(state.totalRounds + 1, state.currentRound + 3),
        reason: item.reason,
        isCalculated: true
      };
      market.offers.push(offer);
      existingPending.push(offer);
    }

    return existingPending;
  }
  static normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Searches players across all teams based on filter criteria
   * @param {Array} allTeams - List of all teams
   * @param {Object} filters - Query filters (name, position, minStrength, maxStrength, maxPrice, maxWage, maxAge, contractStatus)
   * @param {number} userTeamId - Team ID of player (to exclude from buy or mark as own)
   */
  static searchPlayers(allTeams, filters = {}, userTeamId = null) {
    const results = [];
    const nameQuery = this.normalizeText(filters.name);
    const posFilter = (filters.position || '').toUpperCase();
    const minStr = parseInt(filters.minStrength, 10) || 0;
    const maxStr = parseInt(filters.maxStrength, 10) || 100;
    const maxPrice = parseInt(filters.maxPrice, 10) || Infinity;
    const maxWage = parseInt(filters.maxWage, 10) || Infinity;
    const maxAge = parseInt(filters.maxAge, 10) || Infinity;
    const contractStatus = filters.contractStatus || 'all';

    for (const team of allTeams) {
      for (const p of team.players || []) {
        if (userTeamId && team.id === userTeamId && !filters.includeOwn) continue;
        if (nameQuery && !this.normalizeText(p.name).includes(nameQuery)) continue;
        if (posFilter && posFilter !== 'TODOS' && p.position !== posFilter) continue;
        if (p.strength < minStr || p.strength > maxStr) continue;
        if (p.value > maxPrice) continue;
        if (p.wage > maxWage) continue;
        const playerAge = Number(p.simulationAge ?? p.age ?? 26);
        if (Number.isFinite(maxAge) && playerAge > maxAge) continue;
        if (contractStatus === 'available' && p.loan) continue;
        if (contractStatus === 'loanable' && (p.loan || playerAge > 25)) continue;
        if (contractStatus === 'expiring' && p.contract && p.contract.endYear > Number(filters.currentYear || 2026)) continue;

        // Keep only the best 100 references. Equal strengths retain database
        // order, matching the original stable sort without copying every player.
        const strength = Number(p.strength);
        if (results.length === 100 && strength <= results[99].strength) continue;
        let low = 0, high = results.length;
        while (low < high) {
          const mid = (low + high) >>> 1;
          if (results[mid].strength >= strength) low = mid + 1;
          else high = mid;
        }
        results.splice(low, 0, { player: p, team, strength });
        if (results.length > 100) results.pop();
      }
    }

    return results.map(({ player, team }) => ({ ...player, teamId: team.id, teamName: team.name, teamShield: team.shield }));
  }

  /**
   * Buys a player from another team
   * @param {Object} buyerTeam - User team
   * @param {Object} sellerTeam - Target team
   * @param {string} playerId - ID of player to buy
   * @param {number} offerPrice - Bid amount
   */
  static buyPlayer(buyerTeam, sellerTeam, playerId, offerPrice) {
    if (!Number.isFinite(offerPrice) || offerPrice <= 0) return { success: false, message: 'Valor inválido.' };
    const pIdx = (sellerTeam.players || []).findIndex(p => p.id === playerId);
    if (pIdx === -1) return { success: false, message: 'Jogador não encontrado no time adversário.' };

    const player = sellerTeam.players[pIdx];
    try { this.canRelease(sellerTeam, player); } catch (error) { return { success: false, message: error.message }; }
    const minAcceptable = Math.max(1000, Math.round(player.value));

    if (offerPrice < minAcceptable) {
      return {
        success: false,
        message: `Proposta recusada! O ${sellerTeam.name} exige no mínimo R$ ${minAcceptable.toLocaleString('pt-BR')} por ${player.name}.`
      };
    }

    if (buyerTeam.balance < offerPrice) {
      return { success: false, message: 'Saldo insuficiente em caixa para concluir a negociação!' };
    }

    // Deduct and transfer
    buyerTeam.balance -= offerPrice;
    sellerTeam.balance += offerPrice;
    
    // Remove from seller and add to buyer reserves
    sellerTeam.players.splice(pIdx, 1);
    player.isStarter = false;
    buyerTeam.players.push(player);

    return {
      success: true,
      message: `Contratação realizada! ${player.name} é o novo reforço do ${buyerTeam.name}!`,
      player
    };
  }

  /**
   * Sells a user player to an AI club or free market
   * @param {Object} userTeam - User team
   * @param {string} playerId - Player ID
   * @param {number} salePrice - Target selling price
   */
  static sellPlayer(userTeam, playerId, salePrice = null, buyerTeam = null) {
    if (!buyerTeam) return { success: false, message: 'Escolha um clube comprador para concluir a transferência.' };
    return this.buyPlayer(buyerTeam, userTeam, playerId, salePrice);
  }

}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MarketEngine;
} else {
  window.MarketEngine = MarketEngine;
}
