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
  static ensureClub(state, clubId, database) {
    let team = this.worldTeams(state).find(entry => entry.id === Number(clubId));
    if (team) return team;
    const original = database.find(entry => entry.id === Number(clubId));
    if (!original) throw new Error('Clube não encontrado.');
    team = JSON.parse(JSON.stringify(original));
    const owned = new Set(this.worldTeams(state).flatMap(entry => entry.players.map(player => player.id)));
    for (const player of state.freeAgents || []) owned.add(player.id);
    team.players = team.players.filter(player => !owned.has(player.id));
    state.marketClubs.push(team);
    return team;
  }
  static quote(player, loan = false) { return Math.max(1000, Math.round((Number(player.value) || 100000) * (loan ? .08 : 1))); }
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
    const other = this.ensureClub(next, clubId, database);
    MarketContracts.ensureState(next); MarketEconomy.ensure(next);
    const outgoing = ['sell', 'loan-out'].includes(type), loan = type.startsWith('loan');
    const seller = outgoing ? next.userTeam : other, buyer = outgoing ? other : next.userTeam;
    const player = seller.players.find(entry => String(entry.id) === String(playerId));
    if (!player) throw new Error('O jogador não está mais no clube de origem.');
    this.canRelease(seller, player);
    const quote = this.quote(player, loan);
    if (!outgoing && amount < Math.round(quote * (loan ? 1 : .95))) throw new Error(`O clube exige pelo menos R$ ${Math.round(quote * (loan ? 1 : .95)).toLocaleString('pt-BR')}.`);
    const maximum = Math.round(quote * (loan ? 1.5 : 1.15 + Math.max(0, this.formScore(player) - 6) * .1));
    if (outgoing && !acceptedOffer && amount > maximum) throw new Error(`O clube aceita pagar até R$ ${maximum.toLocaleString('pt-BR')} por este negócio.`);
    const terms = loan ? null : MarketContracts.terms(player, outgoing ? {} : action.terms || {}, 'buy');
    const bonus = terms?.bonus || 0;
    if ((Number(buyer.balance) || 0) < amount + bonus) throw new Error('O clube comprador não tem saldo suficiente para o passe e as luvas.');
    if (!outgoing) MarketEconomy.checkSpending(next, amount + bonus, loan ? MarketFinance.wage(player) : terms.wage);
    const context = { year: next.seasonYear, round: next.currentRound }, source = `deal_${market.nextId}`;
    MarketFinance.post(buyer, context, { kind: 'market', source,
      description: `${loan ? 'Empréstimo recebido' : 'Compra'}: ${player.name} (${seller.name})`,
      lines: [{ category: loan ? 'loanFee' : 'playerPurchase', amount: -amount },
        ...(bonus ? [{ category: 'signingBonus', amount: -bonus }] : [])] });
    MarketFinance.post(seller, context, { kind: 'market', source,
      description: `${loan ? 'Empréstimo cedido' : 'Venda'}: ${player.name} (${buyer.name})`,
      lines: [{ category: loan ? 'loanIncome' : 'playerSale', amount }] });
    seller.players.splice(seller.players.indexOf(player), 1);
    player.isStarter = false; buyer.players.push(player);
    const deal = this.recordDeal(next, { type: loan ? 'loan' : 'transfer', playerId: player.id, playerName: player.name,
      fromId: seller.id, fromName: seller.name, toId: buyer.id, toName: buyer.name, amount });
    if (loan) player.loan = { id: deal.id, ownerTeamId: seller.id, borrowerTeamId: buyer.id, startYear: next.seasonYear, endYear: next.seasonYear, fee: amount, wage: MarketFinance.wage(player) };
    else MarketContracts.assign(player, buyer, next.seasonYear, terms);
    if (acceptedOffer) acceptedOffer.status = 'accepted';
    for (const offer of market.offers) if (offer.status === 'pending' && offer.playerId === player.id) offer.status = 'withdrawn';
    MarketSquad.autoSelectStarters(seller, seller.formation); MarketSquad.autoSelectStarters(buyer, buyer.formation);
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
  /**
   * Searches players across all teams based on filter criteria
   * @param {Array} allTeams - List of all teams
   * @param {Object} filters - Query filters (name, position, minStrength, maxStrength, maxPrice)
   * @param {number} userTeamId - Team ID of player (to exclude from buy or mark as own)
   */
  static searchPlayers(allTeams, filters = {}, userTeamId = null) {
    const results = [];
    const nameQuery = (filters.name || '').toLowerCase().trim();
    const posFilter = (filters.position || '').toUpperCase();
    const minStr = parseInt(filters.minStrength, 10) || 0;
    const maxStr = parseInt(filters.maxStrength, 10) || 100;
    const maxPrice = parseInt(filters.maxPrice, 10) || Infinity;

    for (const team of allTeams) {
      for (const p of team.players || []) {
        if (userTeamId && team.id === userTeamId && !filters.includeOwn) continue;
        if (nameQuery && !p.name.toLowerCase().includes(nameQuery)) continue;
        if (posFilter && posFilter !== 'TODOS' && p.position !== posFilter) continue;
        if (p.strength < minStr || p.strength > maxStr) continue;
        if (p.value > maxPrice) continue;

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
    const minAcceptable = Math.round(player.value * 0.95);

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
