// Testes para as 5 falhas e 2 limitações documentadas em docs/REVISAO-NEGOCIACOES.md
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Market = require('../src/engine/market.js');
const Performance = require('../src/engine/performance.js');
const Career = require('../src/engine/career.js');
const Match = require('../src/engine/match.js');
const Squad = require('../src/engine/squad.js');
const League = require('../src/engine/league.js');
const Finance = require('../src/engine/finance.js');
const Economy = require('../src/engine/economy.js');
const Contracts = require('../src/engine/contracts.js');

const database = require('../data/teams.json');
const config = require('../data/leagues.json');

const clone = value => JSON.parse(JSON.stringify(value));
let cases = 0;
function test(name, fn) { fn(); cases++; console.log('PASS: ' + name); }

function newGame(userTeamName = 'Flamengo') {
  const division = config.BRA.divisions[0];
  const teams = division.teams.map(id => Squad.autoSelectStarters(clone(database.find(team => team.id === id))));
  const userTeam = teams.find(t => t.name.includes(userTeamName)) || teams[0];
  const state = {
    userTeamId: userTeam.id,
    userTeam,
    divisionTeams: teams,
    divisionId: division.id,
    divisionName: division.name,
    seasonYear: 2026,
    currentRound: 1,
    totalRounds: 38,
    rounds: League.generateSchedule(division.teams)
  };
  Career.ensureState(state, config, database);
  Economy.ensure(state, userTeam);
  userTeam.balance = 50000000;
  return state;
}

function externalClub(state) {
  return database.find(team => !Market.worldTeams(state).some(other => other.id === team.id) && team.players.length > 17);
}

// 1. FALHA 1: Anti-arbitragem e proteção contra venda e recompra com lucro imediato
test('1. venda e recompra imediata nao gera lucro nem explora diferenca de precos', () => {
  const state = newGame('Flamengo');
  const palmeiras = state.divisionTeams.find(t => t.name.includes('Palmeiras'));
  palmeiras.balance = 50000000;
  Economy.ensure(state, palmeiras);

  const pedro = state.userTeam.players.find(p => p.name.includes('Pedro')) || state.userTeam.players[0];
  const initialUserBalance = state.userTeam.balance;
  const initialPalmeirasBalance = palmeiras.balance;
  const baseQuote = Market.quote(pedro, false, state);

  // Tentativa de vender por 115% do valor base (R$ 4.857.600 quando base é 4.224.000)
  const inflatedPrice = Math.round(baseQuote * 1.15);
  assert.throws(
    () => Market.transact(state, { type: 'sell', playerId: pedro.id, clubId: palmeiras.id, amount: inflatedPrice }, database),
    /contraproposta|muito acima/i,
    'IA não deve aceitar pagar 115% em venda manual não solicitada'
  );

  // Vende pelo valor aceitável (baseQuote)
  const sellResult = Market.transact(state, { type: 'sell', playerId: pedro.id, clubId: palmeiras.id, amount: baseQuote }, database);
  const stateAfterSale = sellResult.state;

  assert.equal(stateAfterSale.userTeam.balance, initialUserBalance + baseQuote);
  assert.equal(stateAfterSale.divisionTeams.find(t => t.id === palmeiras.id).balance, initialPalmeirasBalance - baseQuote);
  assert.ok(!stateAfterSale.userTeam.players.some(p => p.id === pedro.id));
  assert.ok(stateAfterSale.divisionTeams.find(t => t.id === palmeiras.id).players.some(p => p.id === pedro.id));

  // Tentativa de recompra imediata na mesma rodada deve ser bloqueada
  assert.throws(
    () => Market.transact(stateAfterSale, { type: 'buy', playerId: pedro.id, clubId: palmeiras.id, amount: baseQuote }, database),
    /acabou de ser transferido nesta rodada/i,
    'Clube não deve aceitar revender imediatamente o atleta na mesma rodada'
  );

  // Mesmo com desconto de 95%, recompra é rejeitada
  const discountPrice = Math.round(baseQuote * 0.95);
  assert.throws(
    () => Market.transact(stateAfterSale, { type: 'buy', playerId: pedro.id, clubId: palmeiras.id, amount: discountPrice }, database),
    /acabou de ser transferido nesta rodada|contraproposta|recusou/i
  );

  // Simula avanço de rodada
  const stateNextRound = clone(stateAfterSale);
  stateNextRound.currentRound = 2;

  // Em rodada posterior, o preço de venda exigido pelo Palmeiras não pode ser inferior ao que ele pagou
  assert.throws(
    () => Market.transact(stateNextRound, { type: 'buy', playerId: pedro.id, clubId: palmeiras.id, amount: discountPrice }, database),
    /contraproposta|recusou/i,
    'Palmeiras não aceita vender por menos do que pagou'
  );

  // Ao recomprar pelo valor exigido (com margem de revenda), o usuário NÃO obtém lucro
  const buyBackPrice = Math.round(baseQuote * 1.05);
  const buyResult = Market.transact(stateNextRound, { type: 'buy', playerId: pedro.id, clubId: palmeiras.id, amount: buyBackPrice }, database);
  const stateFinal = buyResult.state;

  // Lucro líquido do ciclo = saldo final - saldo inicial <= 0
  const netProfit = stateFinal.userTeam.balance - initialUserBalance;
  assert.ok(netProfit <= 0, `Lucro líquido deve ser menor ou igual a zero (foi R$ ${netProfit})`);
  assert.equal(netProfit, baseQuote - buyBackPrice); // Perda de 5%
});

// 2. FALHA 2: Bloqueio de empréstimo com temporada encerrada e taxa proporcional à duração
test('2. emprestimo bloqueado apos fim do campeonato e taxa proporcional a duracao restante', () => {
  const state = newGame('Flamengo');
  const club = externalClub(state);
  const player = state.userTeam.players.find(p => p.position !== 'G');

  // Rodada 1: 38 jogos restantes -> taxa de 8% integral
  const fullFee = Market.quote(player, true, state);
  assert.equal(fullFee, Math.round(player.value * 0.08));

  // Rodada 20: 19 jogos restantes -> taxa proporcional (50%)
  const stateMidSeason = clone(state);
  stateMidSeason.currentRound = 20;
  const midFee = Market.quote(player, true, stateMidSeason);
  const expectedMidFee = Math.round(player.value * 0.08 * (19 / 38));
  assert.equal(midFee, expectedMidFee);

  // Temporada encerrada: currentRound = 39, totalRounds = 38
  const stateFinished = clone(state);
  stateFinished.currentRound = 39;

  // Quote retorna valor zero / mínimo quando sem jogos restantes
  const endFee = Market.quote(player, true, stateFinished);
  assert.equal(endFee, 1000);

  // Transact de empréstimo deve lançar erro explícito
  assert.throws(
    () => Market.transact(stateFinished, { type: 'loan-out', playerId: player.id, clubId: club.id, amount: fullFee }, database),
    /após o término dos jogos da temporada/i,
    'Empréstimo deve ser bloqueado com o campeonato encerrado'
  );

  assert.throws(
    () => Market.transact(stateFinished, { type: 'loan-in', playerId: club.players[0].id, clubId: club.id, amount: fullFee }, database),
    /após o término dos jogos da temporada/i,
    'Empréstimo recebido também deve ser bloqueado'
  );
});

// 3. FALHA 3: Preservação da escalação manual do técnico ao comprar, vender ou rescindir
test('3. contratacoes, vendas e rescisoes de reservas preservam titulares e ordem manual', () => {
  const state = newGame('Flamengo');
  const userTeam = state.userTeam;

  // Definir escalação manual: Plata no lugar de Pedro
  const pedroIdx = userTeam.players.findIndex(p => p.name.includes('Pedro'));
  const plataIdx = userTeam.players.findIndex(p => p.name.includes('Plata'));
  if (pedroIdx !== -1 && plataIdx !== -1 && pedroIdx < 11 && plataIdx >= 11) {
    Squad.swapPlayers(userTeam, pedroIdx, plataIdx);
  }
  const initialStarters = userTeam.players.slice(0, 11).map(p => p.id);
  assert.equal(userTeam.players.slice(0, 11).length, 11);

  // 1. Contratar jogador externo para o banco
  const club = externalClub(state);
  club.balance = 50000000;
  Economy.ensure(state, club);
  const targetPlayer = club.players.find(p => p.position === 'M' || p.position === 'A');
  const buyResult = Market.transact(state, {
    type: 'buy',
    playerId: targetPlayer.id,
    clubId: club.id,
    amount: Market.quote(targetPlayer)
  }, database);

  const stateAfterBuy = buyResult.state;
  const startersAfterBuy = stateAfterBuy.userTeam.players.slice(0, 11).map(p => p.id);
  assert.deepEqual(startersAfterBuy, initialStarters, 'Os 11 titulares originais devem permanecer inalterados após contratação');
  const newArrival = stateAfterBuy.userTeam.players.find(p => p.id === targetPlayer.id);
  assert.equal(newArrival.isStarter, false, 'O reforço contratado deve entrar como reserva');

  // 2. Vender um jogador reserva não mexe nos 11 titulares
  const reserveToSell = stateAfterBuy.userTeam.players[15];
  assert.equal(reserveToSell.isStarter, false);
  const sellReserveResult = Market.transact(stateAfterBuy, {
    type: 'sell',
    playerId: reserveToSell.id,
    clubId: club.id,
    amount: Market.quote(reserveToSell)
  }, database);

  const startersAfterSellReserve = sellReserveResult.state.userTeam.players.slice(0, 11).map(p => p.id);
  assert.deepEqual(startersAfterSellReserve, initialStarters, 'Vender reserva preserva os 11 titulares intactos');

  // 3. Rescindir contrato de um reserva não mexe nos 11 titulares
  const reserveToRelease = sellReserveResult.state.userTeam.players[14];
  assert.equal(reserveToRelease.isStarter, false);
  const releaseResult = Contracts.transact(sellReserveResult.state, {
    type: 'release',
    playerId: reserveToRelease.id
  });

  const startersAfterRelease = releaseResult.state.userTeam.players.slice(0, 11).map(p => p.id);
  assert.deepEqual(startersAfterRelease, initialStarters, 'Rescindir reserva preserva os 11 titulares intactos');

  // 4. Vender um titular específico: apenas a vaga dele é preenchida por um reserva, os outros 10 são mantidos
  const starterToSell = sellReserveResult.state.userTeam.players[5];
  const remaining9Starters = initialStarters.filter(id => id !== starterToSell.id);
  const sellStarterResult = Market.transact(sellReserveResult.state, {
    type: 'sell',
    playerId: starterToSell.id,
    clubId: club.id,
    amount: Market.quote(starterToSell)
  }, database);

  const newStarters = sellStarterResult.state.userTeam.players.slice(0, 11).map(p => p.id);
  assert.equal(newStarters.length, 11);
  assert.ok(!newStarters.includes(starterToSell.id));
  for (const keptId of remaining9Starters) {
    assert.ok(newStarters.includes(keptId), `Titular ${keptId} deveria continuar entre os titulares`);
  }
});

// 4. FALHA 4: Atualização determinística e envelhecimento dos clubes externos
test('4. clubes externos consultados no futuro sao atualizados deterministicamente sem duplicar idade no save', () => {
  const state = newGame('Flamengo');

  // Localiza 1º de Agosto na base (clube de Angola ou exterior)
  const augusto = database.find(t => t.name.includes('Agosto')) || database.find(t => t.id >= 400 && t.players.length >= 18);
  assert.ok(augusto, 'Clube externo encontrado');
  const originalPlayer = augusto.players[0];
  const originalAge = originalPlayer.age;

  // Avança o estado da carreira em 5 temporadas (2026 -> 2031)
  state.seasonYear = 2031;

  // Consulta do clube externo prepara versão de 2031
  const prepared = Market.prepareExternalClub(state, augusto);
  assert.equal(prepared.simulatedYear, 2031);
  const agedPlayer = prepared.players.find(p => p.id === originalPlayer.id);
  if (agedPlayer) {
    assert.equal(agedPlayer.age, originalAge + 5, 'Idade deve avançar 5 anos');
  }

  // Consulta determinística repetida deve produzir exatamente o mesmo resultado
  const preparedAgain = Market.prepareExternalClub(state, augusto);
  assert.deepEqual(prepared.players.map(p => p.id), preparedAgain.players.map(p => p.id));

  // Materializa no state através de ensureClub
  const materialized = Market.ensureClub(state, augusto.id, database);
  assert.equal(materialized.simulatedYear, 2031);
  assert.ok(state.marketClubs.some(t => t.id === augusto.id));

  // Re-chamar ensureClub com o mesmo ano NÃO envelhece os atletas novamente
  const agedPlayerId = materialized.players[0].id;
  const ageBefore = materialized.players[0].age;
  const materializedAgain = Market.ensureClub(state, augusto.id, database);
  assert.equal(materializedAgain.players.find(p => p.id === agedPlayerId).age, ageBefore);
});

// 5. FALHA 5: Busca insensível a acentos e maiúsculas
test('5. busca de jogadores funciona sem acentos, com acentos e combinando filtros', () => {
  // Encontrar jogador com acento na base, ex: José Manuel López ou João
  const josePlayer = database.flatMap(t => t.players).find(p => p.name.includes('José') || p.name.includes('López'));
  assert.ok(josePlayer, 'Jogador com acento encontrado na base');

  // Busca sem acento ("jose")
  const resultsNoAccent = Market.searchPlayers(database, { name: 'jose' });
  assert.ok(resultsNoAccent.length > 0, 'Busca por "jose" deve encontrar jogadores cadastrados como "José"');
  assert.ok(resultsNoAccent.some(p => p.id === josePlayer.id || p.name.includes('José')));

  // Busca com acento ("josé")
  const resultsWithAccent = Market.searchPlayers(database, { name: 'josé' });
  assert.ok(resultsWithAccent.length > 0);

  // Busca por "joao" encontra "João"
  const joaoResults = Market.searchPlayers(database, { name: 'joao' });
  assert.ok(joaoResults.length > 0, 'Busca por "joao" deve encontrar jogadores com "João"');
  assert.ok(joaoResults.some(p => p.name.includes('João')));

  // Filtros combinados: idade máxima, salário máximo, preço máximo
  const filtered = Market.searchPlayers(database, {
    name: 'a',
    maxPrice: 5000000,
    maxAge: 25,
    maxWage: 50000
  });
  for (const p of filtered) {
    assert.ok(p.value <= 5000000);
    assert.ok(p.wage <= 50000);
    assert.ok((p.age || 26) <= 25);
  }
});

// 6. LIMITAÇÃO 1: IA respeita orçamento da diretoria, limite salarial e quotas de elenco
test('6. comprador automatico respeita limites de orcamento, folha salarial e necessidade do elenco', () => {
  const state = newGame('Flamengo');
  const club = externalClub(state);
  const player = state.userTeam.players[0];

  // Configura orçamento zero para o clube comprador
  club.balance = 50000000;
  Economy.ensure(state, club);
  club.economy.board.transferLimit = 0; // Diretoria travou orçamento

  assert.throws(
    () => Market.transact(state, { type: 'sell', playerId: player.id, clubId: club.id, amount: 1000000 }, database),
    /não possui orçamento de transferências suficiente/i,
    'Clube com orçamento de transferências zerado deve recusar compra'
  );

  // Configura estouro de folha salarial
  club.economy.board.transferLimit = 50000000;
  club.economy.board.wageLimit = 1000; // Limite salarial irrisório
  assert.throws(
    () => Market.transact(state, { type: 'sell', playerId: player.id, clubId: club.id, amount: 1000000 }, database),
    /limite de folha salarial/i,
    'Clube com folha excedida deve recusar nova contratação'
  );
});

// 7. LIMITAÇÃO 2: Passe de referência acompanha a evolução anual de força e idade
test('7. passe de referencia recalcula e acompanha a evolucao anual de forca e idade', () => {
  const dummyPlayer = {
    id: 'test_dev',
    name: 'Jovem Promessa',
    age: 20,
    simulationAge: 20,
    strength: 56,
    isStar: false,
    isTopWorld: false,
    value: 4224000
  };

  const initialVal = Market.calculateValue(dummyPlayer);
  assert.ok(initialVal > 0);

  // Evolução de força de 56 para 58 aos 21 anos
  dummyPlayer.strength = 58;
  dummyPlayer.age = 21;
  dummyPlayer.simulationAge = 21;
  const evolvedVal = Market.calculateValue(dummyPlayer);
  assert.ok(evolvedVal > initialVal, `Valor deve crescer com aumento de força (foi de ${initialVal} para ${evolvedVal})`);

  // Envelhecimento para 34 anos (declínio de mercado)
  dummyPlayer.age = 34;
  dummyPlayer.simulationAge = 34;
  const veteranVal = Market.calculateValue(dummyPlayer);
  assert.ok(veteranVal < evolvedVal, `Valor de mercado deve diminuir para veteranos acima de 32 anos (${veteranVal} < ${evolvedVal})`);
});

// 8. CONTRA-PROPOSTAS E RESUMO FINANCEIRO
test('8. contrapropostas com explicacao fundamentada e resumo financeiro do modal', () => {
  const state = newGame('Flamengo');
  const club = externalClub(state);
  const player = state.userTeam.players.find(p => p.position !== 'G');
  const quote = Market.quote(player, false, state);

  // Pedida um pouco acima do valor aceitável gera contraproposta
  assert.throws(
    () => Market.transact(state, { type: 'sell', playerId: player.id, clubId: club.id, amount: Math.round(quote * 1.15) }, database),
    /contraproposta: aceita pagar até R\$/i
  );

  // Pedida exorbitante gera recusa direta fundamentada
  assert.throws(
    () => Market.transact(state, { type: 'sell', playerId: player.id, clubId: club.id, amount: Math.round(quote * 2.5) }, database),
    /recusou a proposta: a pedida de R\$.*muito acima da avaliação/i
  );

  // Verificação no app
  const store = new Map();
  const doc = {
    createElement(tag) {
      return {
        value: '', textContent: '', hidden: false, innerHTML: '', style: {},
        appendChild() {}, addEventListener() {}, setAttribute() {}, replaceChildren() {}, focus() {}
      };
    },
    getElementById(id) {
      if (!this.elements[id]) {
        this.elements[id] = this.createElement('div');
      }
      return this.elements[id];
    },
    querySelectorAll() { return []; },
    elements: {}
  };
  const app = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\napp;', {
    SaveStore: require('../src/engine/storage.js'),
    EconomyEngine: Economy, ContractsEngine: Contracts,
    window: { addEventListener() {} }, console, MarketEngine: Market, PerformanceEngine: Performance, CareerEngine: Career,
    MatchEngine: Match, SquadEngine: Squad, FinanceEngine: Finance,
    document: doc,
    localStorage: { setItem(key, value) { store.set(key, value); } }
  });
  app.showToast = () => {};
  app.refreshUI = () => {};
  app.allTeams = database;
  app.gameState = state;

  app.openTransfer('sell', player.id, club.id);
  assert.ok(app.transferRequest);
  app.updateTransferTerms();

  const summary = doc.getElementById('transfer-summary-box').innerHTML;
  assert.ok(summary.includes('Resumo Financeiro da Operação'));
  assert.ok(summary.includes('Valor do passe:'));
  assert.ok(summary.includes('Caixa projetado:'));
  assert.ok(summary.includes('Folha salarial / Teto:'));
});

console.log(`PASS: Todos os ${cases} grupos de teste da revisão de negociações foram validados com sucesso!`);
