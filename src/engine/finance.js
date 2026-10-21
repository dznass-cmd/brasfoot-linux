// Club-owned accounts. Viewing estimates never spends money or draws randomness.
class FinanceEngine {
  static CATEGORIES = {
    tickets: 'Bilheteria', wages: 'Salários', maintenance: 'Manutenção do estádio',
    playerSale: 'Venda de jogadores', playerPurchase: 'Compra de jogadores',
    loanIncome: 'Empréstimos cedidos', loanFee: 'Empréstimos recebidos',
    prize: 'Premiação', stadium: 'Ampliação do estádio', tv: 'Cotas de TV', sponsor: 'Patrocínio',
    sponsorBonus: 'Bônus de patrocínio', signingBonus: 'Luvas', termination: 'Rescisões'
  };
  static HISTORY_SEASONS = 5;

  static wage(player) { return Number(player.loan?.wage) || Number(player.wage) || 5000; }

  static recurringIncome(team, context) {
    const economy = team.economy, sponsor = economy?.sponsor;
    if (!context || economy?.year !== Number(context.year) || Number(context.round) < economy.startsRound) return { tv: 0, sponsor: 0, sponsorBonus: 0 };
    const eligible = sponsor && Number(context.round) >= sponsor.signedRound;
    return { tv: economy.tvPerRound, sponsor: eligible ? sponsor.perRound : 0,
      sponsorBonus: eligible && context.won ? sponsor.winBonus : 0 };
  }

  static estimateRound(team, isHomeMatch = false, ticketPrice = null, variance = 1) {
    const price = Number(ticketPrice || team.ticketPrice) || 30;
    const capacity = Number(team.capacity) || 20000;
    const repRatio = (Number(team.reputation) || 3) / 5;
    const priceFactor = Math.max(.4, 1.2 - price / 80);
    const attendance = isHomeMatch ? Math.min(capacity, Math.round(capacity * repRatio * priceFactor * variance)) : 0;
    const matchIncome = attendance * price;
    const wageBill = (team.players || []).reduce((sum, player) => sum + this.wage(player), 0);
    const maintenance = Math.round(capacity * .5);
    return { isHomeMatch, attendance, ticketPrice: price, matchIncome, wageBill, maintenance,
      netWeekly: matchIncome - wageBill - maintenance };
  }

  static ensureLedger(team, context) {
    const year = Number(context.year), round = Math.max(1, Number(context.round) || 1);
    if (!Number.isInteger(year)) throw new Error('Temporada inválida para registrar as finanças.');
    team.finances ||= { version: 1, nextId: 1, seasons: [] };
    const ledger = team.finances;
    if (ledger.version !== 1 || !Array.isArray(ledger.seasons)) throw new Error('Histórico financeiro incompatível.');
    let season = ledger.seasons.find(entry => entry.year === year);
    if (!season) {
      season = { year, startedRound: round, openingBalance: Number(team.balance) || 0, entries: [] };
      ledger.seasons.push(season);
      ledger.seasons.sort((a, b) => a.year - b.year);
      ledger.seasons = ledger.seasons.slice(-this.HISTORY_SEASONS);
      if (!ledger.seasons.includes(season)) throw new Error('A temporada está fora do histórico financeiro disponível.');
    }
    return season;
  }

  static post(team, context, entry) {
    if (!entry.lines?.length || entry.lines.some(line => !Object.hasOwn(this.CATEGORIES, line.category)
      || !Number.isFinite(line.amount))) throw new Error('Movimentação financeira inválida.');
    const lines = entry.lines.map(line => ({ category: line.category, amount: line.amount }));
    const amount = lines.reduce((sum, line) => sum + line.amount, 0);
    const balance = (Number(team.balance) || 0) + amount;
    if (!Number.isFinite(balance)) throw new Error('Saldo financeiro inválido.');
    const season = this.ensureLedger(team, context);
    const previous = entry.source && season.entries.find(row => row.source === entry.source);
    if (previous) return previous;
    const record = { id: team.finances.nextId++, round: Math.max(1, Number(context.round) || 1),
      kind: entry.kind, description: entry.description, source: entry.source, lines, amount, balance,
      ...(entry.details ? { details: { ...entry.details } } : {}) };
    team.balance = balance;
    season.entries.push(record);
    return record;
  }

  static processRoundFinances(team, isHomeMatch = false, ticketPrice = null, context = null) {
    const source = context ? `round:${context.year}:${context.round}` : null;
    const previous = context && team.finances?.seasons.find(season => season.year === Number(context.year))
      ?.entries.find(entry => entry.source === source);
    if (previous) return { ...previous.details, newBalance: previous.balance, alreadyProcessed: true };
    // Keep the original economy and its one random draw for a home match.
    const report = this.estimateRound(team, isHomeMatch, ticketPrice, isHomeMatch ? .85 + Math.random() * .3 : 1);
    if (context) {
      const funding = this.recurringIncome(team, context);
      Object.assign(report, funding);
      report.netWeekly += funding.tv + funding.sponsor + funding.sponsorBonus;
      this.post(team, context, { kind: 'round', source,
        description: isHomeMatch ? 'Rodada em casa' : 'Rodada fora / sem bilheteria', details: report,
        lines: [{ category: 'tickets', amount: report.matchIncome }, { category: 'wages', amount: -report.wageBill },
          { category: 'maintenance', amount: -report.maintenance },
          ...Object.entries(funding).map(([category, amount]) => ({ category, amount }))] });
    } else team.balance = (Number(team.balance) || 0) + report.netWeekly;
    return { ...report, newBalance: team.balance };
  }

  static upgradeStadium(team, additionalSeats = 5000, context = null) {
    if (!Number.isSafeInteger(additionalSeats) || additionalSeats <= 0) return { success: false, message: 'Informe uma quantidade válida de lugares.' };
    const cost = additionalSeats * 400;
    if (!Number.isSafeInteger(cost)) return { success: false, message: 'Ampliação fora do limite permitido.' };
    if ((team.balance || 0) < cost) return { success: false,
      message: `Saldo insuficiente! A ampliação de ${additionalSeats.toLocaleString('pt-BR')} lugares custa R$ ${cost.toLocaleString('pt-BR')}.` };
    if (context) this.post(team, context, { kind: 'stadium', description: `Ampliação de ${additionalSeats.toLocaleString('pt-BR')} lugares`,
      lines: [{ category: 'stadium', amount: -cost }] });
    else team.balance -= cost;
    team.capacity = (Number(team.capacity) || 20000) + additionalSeats;
    return { success: true,
      message: `Obras concluídas! O estádio ${team.stadium} foi ampliado em ${additionalSeats.toLocaleString('pt-BR')} lugares! Nova capacidade: ${team.capacity.toLocaleString('pt-BR')} torcedores.`,
      newCapacity: team.capacity, cost };
  }

  static overview(team, year) {
    const season = team.finances?.seasons.find(entry => entry.year === Number(year)) || null;
    const categories = Object.fromEntries(Object.keys(this.CATEGORIES).map(key => [key, 0]));
    let income = 0, expenses = 0;
    for (const entry of season?.entries || []) for (const line of entry.lines) {
      categories[line.category] = (categories[line.category] || 0) + line.amount;
      if (line.amount >= 0) income += line.amount; else expenses -= line.amount;
    }
    return { season, categories, income, expenses, net: income - expenses,
      closingBalance: season?.entries.at(-1)?.balance ?? season?.openingBalance ?? (Number(team.balance) || 0) };
  }

  static project(state, ticketPrice = null) {
    const team = state.userTeam, home = this.estimateRound(team, true, ticketPrice), away = this.estimateRound(team, false, ticketPrice);
    const funding = this.recurringIncome(team, { year: state.seasonYear, round: state.currentRound });
    const fixedPerRound = funding.tv + funding.sponsor;
    home.netWeekly += fixedPerRound; away.netWeekly += fixedPerRound;
    const remaining = state.rounds.filter(round => !round.isFinished);
    const homeGames = remaining.filter(round => round.matches.some(fixture => fixture.homeId === team.id)).length;
    const income = homeGames * home.matchIncome + remaining.length * fixedPerRound, costs = remaining.length * (home.wageBill + home.maintenance);
    return { home, away, remainingRounds: remaining.length, homeGames, awayRounds: remaining.length - homeGames,
      funding, fixedPerRound, income, costs, net: income - costs, projectedBalance: (Number(team.balance) || 0) + income - costs };
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = FinanceEngine;
else window.FinanceEngine = FinanceEngine;
