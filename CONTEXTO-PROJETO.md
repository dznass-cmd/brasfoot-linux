# Contexto do projeto Brasfoot Revenge

Registro atualizado em **21/10/2026**, após a implementação de TV, patrocínios, orçamento da diretoria, contratos, textura aprimorada e Placar da Rodada em tempo real.

Pasta do projeto: `.` (raiz do repositório).

O histórico consolidado está em [docs/HISTORICO-ALTERACOES.md](docs/HISTORICO-ALTERACOES.md). Leia este contexto e o histórico ao retomar o desenvolvimento.

As cinco primeiras prioridades da [revisão de otimizações](docs/OTIMIZACOES.md) foram implementadas e verificadas. O documento conserva as medições iniciais, descreve a implementação e liga a comparação reproduzível com a versão anterior.

## Estado atual

O jogo é um aplicativo Linux com inicializador Bash, janela nativa em C/GTK4 e interface local em HTML, CSS e JavaScript no WebKit. Usa arquivos locais, funciona offline e não depende de Java ou de servidor HTTP. O executável lê os arquivos da pasta do projeto ao abrir.

As funcionalidades implementadas incluem:

- Base local de 703 clubes, escudos, uniformes, bandeiras e sons; 486 elencos atualizados na coleta registrada em 21/10/2026. Os 217 sem atualização suficiente continuam identificados como base antiga.
- Consulta dos clubes na aba **Times**, com busca, filtros e ficha dos jogadores.
- Partidas minuto a minuto, pausa, velocidades, intervalo, substituições, cartões, lesões e retomada de partida salva.
- Carreira com Séries A–D, temporadas consecutivas, acessos, rebaixamentos, premiação, evolução, aposentadoria, jovens e histórico.
- **Meu perfil:** nome do técnico, passagens por clubes, estatísticas, troféus e propostas de emprego para o ano seguinte.
- **Mercado:** compras, vendas, empréstimos, propostas por desempenho, histórico de negócios e preservação de elencos e dinheiro nos clubes envolvidos.
- **Desempenho:** notas, forma recente, gols, assistências, minutos, craque do jogo e relatórios individuais por partida.
- **Finanças:** caixa, receitas, despesas, extrato por temporada e tipo, gráfico, folha salarial e projeção do ingresso e do caixa. O histórico pertence ao clube e começa a partir do saldo preservado na atualização. [Regras e próximas sugestões](docs/FINANCAS.md).
- **Economia e contratos:** TV automática, três patrocínios anuais, limites de salário/negociações e revisão da diretoria; prazos, renovação por desempenho, luvas e rescisão. Mercado tem **Contratos** e **Sem clube**. Expirados saem antes da formação de jovens; a migração mantém dinheiro e salários. [Regras completas](docs/ECONOMIA-CONTRATOS.md).
- **Táticas:** 11 formações, sete grupos de instruções, seis planos rápidos e escolha dos cobradores de pênaltis, faltas e escanteios.
- Abertura pelo inicializador e atalhos com o processo separado do terminal.
- Motor com caches derivados fora dos saves; abas atualizadas sob demanda; catálogo de clubes reutilizado e busca limitada aos melhores 100 resultados.
- Salvamento completo nas operações de carreira e checkpoints menores durante a partida. Encerramento em etapas de uma partida, com retomada de rodadas incompletas.

## Características a preservar

- Funcionamento offline, com recursos e dados locais.
- Interface clássica do projeto e recursos visuais já existentes.
- Carreiras e partidas salvas: não apagar nem reiniciar o progresso para acrescentar funcionalidades.
- Identidade única dos jogadores, dinheiro pertencente a cada clube e histórico acompanhando o técnico nas mudanças de emprego.
- Abertura sem janela de terminal pelos atalhos instalados.
- Novas escolhas táticas precisam afetar o motor, além de aparecer na interface.

## Arquivos ativos

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html`, `style.css`, `app.js` | Interface e integração do aplicativo offline |
| `src/engine/squad.js` | Formações, escalação, adaptação, disponibilidade e recuperação |
| `src/engine/tactics.js` | Instruções, planos rápidos, efeitos e cobradores |
| `src/engine/match.js` | Simulação ao vivo e automática |
| `src/engine/performance.js` | Notas e relatórios das atuações |
| `src/engine/market.js` | Negócios, propostas e contratos de empréstimo |
| `src/engine/economy.js` | Cotas, patrocínios, orçamento e bônus de encerramento |
| `src/engine/contracts.js` | Vínculos, renovações, rescisões e atletas sem clube |
| `src/engine/career.js` | Temporadas, migração, perfil e propostas ao técnico |
| `src/engine/league.js`, `src/engine/finance.js` | Calendário, classificação e finanças |
| `src/engine/storage.js` | Save completo, revisão de gravação e recuperação dos checkpoints da partida |
| `data/`, `assets/` | Base local e recursos do jogo |
| `src-native/main.c`, `brasfoot-app` | Janela GTK4/WebKit e executável nativo |
| `brasfoot`, `Brasfoot.desktop` | Abertura separada do terminal e atalho |

Os arquivos de `src/public/` e `src/server.js` pertencem à implementação antiga com servidor. A versão nativa usa os arquivos da raiz e os motores acima.

## Regras importantes de persistência

- O save continua usando a chave local `brasfoot_linux_saved_game` e pode ser exportado/importado em JSON.
- A gravação completa acrescenta `_saveRevision` somente à cópia armazenada. A chave `brasfoot_linux_saved_game_match_checkpoint` guarda a partida e os dois clubes, vinculados à mesma revisão. Checkpoints antigos ou inválidos não substituem uma carreira nova; a exportação continua usando o estado completo, sem essa revisão interna.
- O carregamento aceita o formato anterior. Gravações completas confirmam a carreira antes de remover o checkpoint; se falharem, o save anterior continua disponível. Falhas ao salvar durante a partida pausam a simulação.
- `managerProfile` guarda nome, passagens e decisões sobre propostas de emprego; títulos e estatísticas usam os resultados da carreira.
- `marketState` guarda propostas e negociações; `marketClubs` preserva os clubes externos envolvidos nos negócios.
- `player.loan` identifica o dono do passe, o clube que recebeu o atleta e o ano de retorno.
- `player.loan.wage` preserva o salário combinado até o retorno. `player.contract` guarda o contrato do dono do passe; a renovação de um cedido altera o compromisso futuro sem repassar reajuste ao destinatário durante a cessão.
- `team.economy` mantém cotas, patrocínio e orçamento por clube/ano. `state.freeAgents` conserva os atletas liberados; não podem reaparecer no clube estático da base. Migrações não cobram luvas ou reajustam salários nem creditam receitas passadas.
- `player.performance` guarda avaliações da temporada. `playerRatings` nos jogos guarda as atuações; `performanceArchive` conserva duas temporadas anteriores.
- As instruções e os cobradores ficam no clube e no estado da partida. Saves anteriores recebem valores padrão quando necessário.
- Trocas de clube, transições anuais, novas instruções antes do jogo e negociações só substituem a carreira aberta após a gravação funcionar.
- `team.finances` guarda até cinco temporadas de registros financeiros, com saldo inicial e movimentações por rodada, negócios, obras e premiações. O registro não reconstrói receitas antigas. O ingresso fica em Finanças; sua alteração e as obras só são confirmadas após salvar. A projeção é estimada e não inclui receitas futuras ainda não contratadas nem premiação.
- O encerramento pode guardar `backgroundSeasons[divisionId].nextMatch` durante uma rodada incompleta. A recuperação de energia acontece uma vez, no fim da rodada; calendários e índices são derivados, não são acrescentados ao save.

## Verificações e retomada

Os comandos e os resultados já obtidos estão no [histórico](docs/HISTORICO-ALTERACOES.md#verificações-registradas). Há suítes específicas em `scripts/` para táticas, mercado/desempenho, perfil, partidas e carreira.

As otimizações acrescentaram `scripts/test-optimizations.cjs` (13 grupos) e `scripts/benchmark-optimizations.cjs`. As suítes completas do motor (3.072 partidas) e da carreira (3.040 partidas em duas temporadas) passaram após as alterações. O backup anterior desta etapa está em `.backups/before-optimizations-20261021-125309/`.

A aba Finanças acrescentou `scripts/test-finance.cjs` (12 grupos) e [relatório próprio](docs/finance-test-results.json). Motor, carreira, mercado/desempenho, perfil e otimizações também passaram após a integração. Backup: `.backups/before-club-finances-20261021-132253/`.

A etapa de economia e contratos acrescentou `scripts/test-economy-contracts.cjs` (15 grupos) e [relatório](docs/economy-contracts-test-results.json). As suítes anteriores e as completas de motor/carreira passaram após a integração. TV mais patrocínio fixo reduziram o diagnóstico inicial de caixa negativo de 71/80 clubes para 4/80, sem bônus, prêmios ou negócios futuros. Backup: `.backups/before-sponsors-budgets-contracts-20261021-135744/`. Parcelamento segue como sugestão futura. O tamanho dos estados simulados está nos relatórios; a quota efetiva do WebKit não foi medida.

As verificações desta conversa usaram clubes copiados e armazenamento isolado. A execução visual do GTK/WebKit ficou bloqueada pelo acesso ao display; a tentativa com navegador também foi bloqueada pelas restrições do ambiente. Não registrar as novas telas como visualmente aprovadas sem uma conferência real na sessão gráfica.

As cópias anteriores dos arquivos modificados ficam em `.backups/`. São cópias das etapas de desenvolvimento, não exportações dos saves do jogador.

Para usar a versão atual, fechar e reabrir **Brasfoot Linux** pelo menu de aplicativos e carregar a carreira. Alterações apenas em HTML/CSS/JavaScript não exigem recompilar `brasfoot-app`.
