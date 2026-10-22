const EconomyFinance = typeof module !== 'undefined' && module.exports ? require('./finance.js') : window.FinanceEngine;

class EconomyEngine {
  static TERMS = {
    BRA_A: { tv: 500000, sponsor: 300000, minWages: 700000 },
    BRA_B: { tv: 350000, sponsor: 250000, minWages: 450000 },
    BRA_C: { tv: 250000, sponsor: 160000, minWages: 280000 },
    BRA_D: { tv: 200000, sponsor: 130000, minWages: 200000 }
  };
  static teams(state) { return [...(state.divisionTeams || []), ...(state.reserveTeams || []), ...(state.marketClubs || [])]; }

  static committedWages(state, team) {
    const current = (team.players || []).reduce((sum, player) => sum + EconomyFinance.wage(player), 0);
    const loaned = this.teams(state).flatMap(club => club.players).filter(player => player.loan?.ownerTeamId === team.id);
    return current + loaned.reduce((sum, player) => sum + (Number(player.contract?.wage) || Number(player.wage) || 5000), 0);
  }

  static ensure(state, team = state.userTeam) {
    if (team.economy?.version === 1 && team.economy.year === Number(state.seasonYear)) return team.economy;
    const division = state.careerDivisions?.find(division => division.teams.includes(team.id));
    const divisionId = division?.id || state.divisionId || 'BRA_D';
    const terms = this.TERMS[divisionId] || this.TERMS.BRA_D;
    const factor = .88 + Math.min(5, Math.max(1, Number(team.reputation) || 1)) * .12;
    EconomyFinance.ensureLedger(team, { year: state.seasonYear, round: state.currentRound });
    const wages = this.committedWages(state, team), highest = Math.max(0, ...team.players.map(player => EconomyFinance.wage(player)));
    team.economy = { version: 1, year: Number(state.seasonYear), divisionId,
      startsRound: state.currentRound, tvPerRound: Math.round(terms.tv * factor), sponsorBase: Math.round(terms.sponsor * factor),
      sponsor: null, board: { wageLimit: Math.ceil(Math.max(terms.minWages, wages * 1.15, wages + highest) / 1000) * 1000,
        transferLimit: Math.floor(Math.max(0, Number(team.balance) || 0) * .5), startEntryId: team.finances.nextId,
        lastReviewRound: state.currentRound } };
    return team.economy;
  }

  static sponsorOffers(state) {
    const economy = this.ensure(state), base = economy.sponsorBase;
    return [
      { id: 'stable', name: 'Horizonte Esportes', perRound: base, winBonus: 0, targetPosition: null, targetBonus: 0 },
      { id: 'wins', name: 'Rede Arquibancada', perRound: Math.round(base * .85), winBonus: Math.round(base * .55), targetPosition: null, targetBonus: 0 },
      { id: 'target', name: 'Impulso Brasil', perRound: Math.round(base * .7), winBonus: 0, targetPosition: 4, targetBonus: base * 12 }
    ];
  }

  static budget(state, team = state.userTeam) {
    const economy = this.ensure(state, team), season = team.finances.seasons.find(season => season.year === economy.year);
    let spent = 0, sales = 0;
    for (const entry of season.entries) if (entry.id >= economy.board.startEntryId) for (const line of entry.lines) {
      if (['playerPurchase', 'loanFee', 'signingBonus', 'termination'].includes(line.category)) spent += Math.max(0, -line.amount);
      if (['playerSale', 'loanIncome'].includes(line.category)) sales += Math.max(0, line.amount);
    }
    const committedWages = this.committedWages(state, team);
    return { ...economy.board, spent, sales, committedWages,
      available: Math.max(0, economy.board.transferLimit + sales - spent),
      wageRoom: Math.max(0, economy.board.wageLimit - committedWages) };
  }

  static checkSpending(state, amount, wageDelta = 0, team = state.userTeam) {
    const budget = this.budget(state, team);
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(wageDelta)) throw new Error('Valores do orçamento inválidos.');
    if (amount > budget.available) {
      if (team.id === state.userTeamId) {
        throw new Error('O negócio ultrapassa o orçamento de contratações da diretoria. Venda jogadores ou solicite uma revisão em Finanças.');
      } else {
        throw new Error(`O ${team.name} não possui orçamento de transferências suficiente (disponível: R$ ${Math.max(0, budget.available).toLocaleString('pt-BR')}).`);
      }
    }
    if (budget.committedWages + wageDelta > budget.wageLimit && wageDelta > 0) {
      if (team.id === state.userTeamId) {
        throw new Error('O salário ultrapassa o limite da folha definido pela diretoria.');
      } else {
        throw new Error(`O ${team.name} atingiu o limite de folha salarial da diretoria para novas contratações.`);
      }
    }
  }

  static transact(state, action) {
    if (state.activeMatch) throw new Error('Feche a partida antes de alterar contratos de receita ou orçamento.');
    const next = JSON.parse(JSON.stringify(state)); next.userTeam = next.divisionTeams.find(team => team.id === next.userTeamId);
    const economy = this.ensure(next);
    if (action.type === 'sponsor') {
      if (economy.sponsor) throw new Error('O patrocínio desta temporada já foi contratado.');
      if (!next.rounds.some(round => !round.isFinished)) throw new Error('O campeonato já terminou. Escolha um patrocínio no próximo ano.');
      const offer = this.sponsorOffers(next).find(offer => offer.id === action.offerId);
      if (!offer) throw new Error('Proposta de patrocínio inválida.');
      economy.sponsor = { ...offer, signedRound: next.currentRound };
      return { state: next, message: `Patrocínio contratado com ${offer.name} até o fim de ${next.seasonYear}.` };
    }
    if (action.type === 'review-budget') {
      if (next.currentRound - economy.board.lastReviewRound < 4) throw new Error('A diretoria reavalia o orçamento a cada quatro rodadas.');
      const before = this.budget(next), wages = this.committedWages(next, next.userTeam);
      economy.board.transferLimit = Math.max(economy.board.transferLimit,
        Math.floor(Math.max(0, Number(next.userTeam.balance) || 0) * .5) + before.spent - before.sales);
      economy.board.wageLimit = Math.max(economy.board.wageLimit, Math.ceil(wages * 1.15 / 1000) * 1000);
      economy.board.lastReviewRound = next.currentRound;
      return { state: next, message: 'A diretoria revisou os limites com base no caixa e nos compromissos atuais.' };
    }
    throw new Error('Operação financeira inválida.');
  }

  static closeSeason(state, summary) {
    const team = state.userTeam, economy = team.economy, sponsor = economy?.sponsor;
    if (!sponsor || economy.year !== Number(summary.year) || !sponsor.targetPosition || summary.user.position > sponsor.targetPosition) return 0;
    const eligible = Math.max(0, state.totalRounds - sponsor.signedRound + 1);
    const amount = Math.round(sponsor.targetBonus * eligible / Math.max(1, state.totalRounds));
    EconomyFinance.post(team, { year: summary.year, round: state.totalRounds + 1 }, {
      kind: 'sponsor', source: `sponsor-target:${summary.year}:${team.id}`, description: `${sponsor.name}: meta de ${sponsor.targetPosition}º lugar ou melhor`,
      lines: [{ category: 'sponsorBonus', amount }] });
    return amount;
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = EconomyEngine;
else window.EconomyEngine = EconomyEngine;
