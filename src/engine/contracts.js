const ContractFinance = typeof module !== 'undefined' && module.exports ? require('./finance.js') : window.FinanceEngine;
const ContractEconomy = typeof module !== 'undefined' && module.exports ? require('./economy.js') : window.EconomyEngine;
const ContractSquad = typeof module !== 'undefined' && module.exports ? require('./squad.js') : window.SquadEngine;

class ContractsEngine {
  static teams(state) { return [...(state.divisionTeams || []), ...(state.reserveTeams || []), ...(state.marketClubs || [])]; }
  static hash(id) { let hash = 0; for (const c of String(id)) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0; return hash; }
  static ensureTeam(team, year) {
    for (const player of team.players) {
      if (!player.contract) player.contract = { version: 1, clubId: player.loan?.ownerTeamId ?? team.id,
        startYear: Number(year), endYear: Number(year) + 1 + this.hash(player.id) % 3,
        wage: Number(player.wage) || 5000, migrated: true, renewedYear: null };
      if (player.loan && !Number.isFinite(player.loan.wage)) player.loan.wage = Number(player.wage) || 5000;
    }
  }
  static ensureState(state) {
    state.freeAgents ||= []; state.contractSequence ||= 0;
    for (const team of this.teams(state)) this.ensureTeam(team, state.seasonYear);
  }
  static ownedPlayers(state) {
    const team = state.userTeam;
    return this.teams(state).flatMap(club => club.players.map(player => ({ player, club })))
      .filter(({ player, club }) => player.loan ? player.loan.ownerTeamId === team.id : club.id === team.id);
  }
  static quote(player, mode = 'renew') {
    const current = Number(player.contract?.wage) || Number(player.wage) || 5000;
    const wage = mode === 'renew' ? Math.ceil(current * (player.performance?.games >= 5 && player.performance.ratingTotal / player.performance.games >= 7.5 ? 1.10 : 1.05) / 100) * 100 : current;
    return { years: 3, wage, bonus: mode === 'buy' ? 0 : wage * (mode === 'sign' ? 4 : 2) };
  }
  static terms(player, value, mode) {
    const minimum = this.quote(player, mode), terms = { ...minimum, ...value };
    if (!Number.isSafeInteger(terms.years) || terms.years < 1 || terms.years > 5
      || !Number.isSafeInteger(terms.wage) || terms.wage < minimum.wage || terms.wage > 100000000
      || !Number.isSafeInteger(terms.bonus) || terms.bonus < minimum.bonus || terms.bonus > 1000000000) {
      throw new Error(`Condições recusadas: prazo de 1 a 5 temporadas, salário mínimo de R$ ${minimum.wage.toLocaleString('pt-BR')} e luvas mínimas de R$ ${minimum.bonus.toLocaleString('pt-BR')}.`);
    }
    return terms;
  }
  static assign(player, team, year, terms) {
    player.wage = terms.wage;
    player.contract = { version: 1, clubId: team.id, startYear: Number(year), endYear: Number(year) + terms.years - 1,
      wage: terms.wage, migrated: false, renewedYear: Number(year) };
    delete player.freeAgentSince; delete player.lastClubId; delete player.lastClubName;
  }
  static terminationCost(state, player) {
    const rounds = Math.max(0, (player.contract.endYear - Number(state.seasonYear)) * state.totalRounds
      + state.totalRounds - state.currentRound + 1);
    return (Number(player.contract.wage) || Number(player.wage) || 5000) * Math.min(6, rounds);
  }
  static addFreeAgent(state, team, player, year) {
    if (state.freeAgents.some(entry => entry.id === player.id)) throw new Error('O jogador já consta na lista de atletas sem clube.');
    player.contract = null; player.freeAgentSince = Number(year); player.lastClubId = team.id; player.lastClubName = team.name;
    player.isStarter = false; state.freeAgents.push(player);
  }
  static expireTeam(state, team, year) {
    const released = [];
    team.players = team.players.filter(player => {
      if (!player.contract || player.contract.endYear >= Number(year)) return true;
      if (team.id !== state.userTeamId) {
        this.assign(player, team, year, { years: 3, wage: Number(player.contract.wage) || Number(player.wage) || 5000 });
        return true;
      }
      this.addFreeAgent(state, team, player, year); released.push({ id: player.id, name: player.name }); return false;
    });
    return released;
  }
  static transact(state, action) {
    if (state.activeMatch) throw new Error('Feche a partida antes de negociar contratos.');
    const next = JSON.parse(JSON.stringify(state)); next.userTeam = next.divisionTeams.find(team => team.id === next.userTeamId);
    this.ensureState(next); const team = next.userTeam;
    ContractEconomy.ensure(next);
    const player = action.type === 'sign' ? next.freeAgents.find(player => String(player.id) === String(action.playerId))
      : this.ownedPlayers(next).find(entry => String(entry.player.id) === String(action.playerId))?.player;
    if (!player) throw new Error('O jogador não está disponível para esta negociação.');
    const source = `contract:${next.seasonYear}:${++next.contractSequence}`;
    const context = { year: next.seasonYear, round: next.currentRound };
    if (action.type === 'release') {
      if (player.loan) throw new Error('Aguarde o retorno do empréstimo para rescindir o contrato.');
      if (team.players.length <= 15 || (player.position === 'G' && team.players.filter(player => player.position === 'G').length <= 1)) throw new Error('O clube precisa manter 15 atletas e pelo menos um goleiro.');
      const fee = this.terminationCost(next, player);
      if ((Number(team.balance) || 0) < fee) throw new Error('Caixa insuficiente para pagar a rescisão.');
      ContractEconomy.checkSpending(next, fee);
      ContractFinance.post(team, context, { kind: 'contract', source, description: `Rescisão: ${player.name}`, lines: [{ category: 'termination', amount: -fee }] });
      team.players.splice(team.players.indexOf(player), 1); this.addFreeAgent(next, team, player, next.seasonYear);
      ContractSquad.autoSelectStarters(team, team.formation || '4-4-2');
      return { state: next, message: `Contrato de ${player.name} rescindido. O atleta está sem clube.` };
    }
    if (!['renew', 'sign'].includes(action.type)) throw new Error('Operação de contrato inválida.');
    if (action.type === 'renew' && player.contract.renewedYear === Number(next.seasonYear)) throw new Error('Este contrato já foi assinado ou renovado nesta temporada.');
    const terms = this.terms(player, action.terms || {}, action.type);
    if (action.type === 'renew' && Number(next.seasonYear) + terms.years - 1 < player.contract.endYear) throw new Error('A renovação não pode encurtar o contrato atual.');
    if ((Number(team.balance) || 0) < terms.bonus) throw new Error('Caixa insuficiente para pagar as luvas.');
    const previousWage = action.type === 'renew' ? (Number(player.contract.wage) || ContractFinance.wage(player)) : 0;
    ContractEconomy.checkSpending(next, terms.bonus, terms.wage - previousWage);
    ContractFinance.post(team, context, { kind: 'contract', source,
      description: `${action.type === 'renew' ? 'Renovação' : 'Contratação sem passe'}: ${player.name}`,
      lines: [{ category: 'signingBonus', amount: -terms.bonus }] });
    const loan = player.loan;
    this.assign(player, team, next.seasonYear, terms);
    if (loan) player.wage = loan.wage; // Borrower keeps the salary agreed for the current loan.
    if (action.type === 'sign') { next.freeAgents.splice(next.freeAgents.indexOf(player), 1); player.isStarter = false; team.players.push(player); }
    return { state: next, message: `${player.name}: contrato até ${player.contract.endYear}, salário de R$ ${terms.wage.toLocaleString('pt-BR')} por rodada.` };
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = ContractsEngine;
else window.ContractsEngine = ContractsEngine;
