# Histórico consolidado das modificações

Registro salvo em **21/10/2026**. Consolida a base documentada do projeto e as alterações concluídas nesta conversa até TV, patrocínios, orçamento e contratos dos jogadores.

Projeto: Brasfoot Revenge.

[Contexto para retomar o desenvolvimento](../CONTEXTO-PROJETO.md) · [Guia principal](../README.md)

## Base já documentada ao retomar o projeto

### Aplicativo Linux e interface clássica

- Aplicativo nativo em C/GTK4, com a interface local executada pelo WebKit.
- Menu inicial, campo tático, camisas, escudos, banco de reservas e ícones baseados nos recursos fornecidos com o projeto.
- Editor local para nome, estádio e técnico dos clubes.
- Atalho de aplicativo e possibilidade de abrir a interface local no navegador.

[Documentação da interface](interface/README.md).

### Funcionamento offline

- Arquivos do jogo, dados, imagens, bandeiras e áudios mantidos no computador.
- Aplicativo sem servidor HTTP e sem dependência de Java.
- Política de recursos e navegação que bloqueia acessos externos no aplicativo nativo.
- Salvamento local, exportação e importação de JSON.

[Regras e verificações históricas do modo offline](OFFLINE.md).

### Clubes e elencos

- 703 clubes de 134 países cadastrados e disponíveis para consulta.
- Aba **Times** com país, divisão, busca, elenco e ficha do jogador; atalhos pela classificação, clube atual e próximo adversário.
- Coleta local registrada em 21/10/2026: 486 clubes e 15.585 jogadores importados; 217 clubes identificados como base antiga.
- Nas quatro divisões brasileiras configuradas, 79 dos 80 clubes tiveram atualização suficiente; Brasil de Pelotas manteve a base anterior.
- Forças, características, salários e passes tratados como estimativas de jogabilidade.
- Atualização da base usada em novos jogos; elencos já gravados continuam associados às respectivas carreiras.

[Fontes e critérios](ELENCOS.md) · [Relatório dos elencos](../data/roster-update.csv).

### Motor de partidas e gestão do elenco

- Simulação por minuto com gols, assistências, finalizações, posse, faltas, cartões, lesões, escanteios, passes e xG estimado.
- Pausa, velocidades 1×/2×/4×, intervalo automático e avanço até o fim.
- Até cinco substituições e mudanças táticas com efeito nos minutos seguintes.
- Energia, moral, características e adaptação à posição influenciando os lances.
- Técnicos automáticos escalando atletas disponíveis, substituindo e ajustando seus times.
- Lesões e suspensões persistentes, inclusive pelo terceiro amarelo; recuperação entre rodadas.
- Saves de partidas em andamento, com retomada pausada, e proteção contra duplicar a finalização ou as finanças da rodada.

[Motor e regras](MOTOR.md) · [Verificações do motor](TESTES-MOTOR.md).

### Continuidade das temporadas

- Séries A–D configuradas com 20 clubes e 38 rodadas por divisão.
- Encerramento, campeões, premiação, acesso/rebaixamento, calendário seguinte e histórico.
- Envelhecimento, evolução, declínio, aposentadoria e reposição por jovens fictícios identificados como atletas da base.
- Migração de saves anteriores, inclusive com campeonato concluído ou partida em andamento.
- Simulação das outras divisões com progresso de encerramento salvo e retomável.
- Construção e gravação da próxima temporada antes de substituir a carreira aberta.

[Continuidade das temporadas](TEMPORADAS.md).

## Alterações concluídas nesta conversa

### Meu perfil

Solicitação: acrescentar histórico dos clubes dirigidos, troféus e propostas para assumir outros clubes.

- Aba **Meu perfil** na barra superior.
- Nome do técnico editável e preservado nas mudanças de emprego.
- Histórico das passagens, com período, escudo, campanhas, jogos, vitórias, empates, derrotas e gols.
- Sala de troféus com competição, clube e ano; título reconhecido ao concluir a rodada final, sem duplicação na virada do ano.
- Totais de aproveitamento, títulos e acessos.
- Até três propostas ao iniciar o ano seguinte, com interesse conforme a campanha e a divisão elegível.
- Aceitação com revisão e confirmação; recusa e consulta das propostas encerradas.
- Mudança permitida antes da primeira partida da temporada; propostas expiram quando o campeonato começa.
- O novo clube conserva seu elenco, estádio e caixa. O histórico e as conquistas acompanham o técnico.
- Migração do perfil a partir das temporadas que já constam no save.
- Correção da consulta dos resultados antigos para usar o clube dirigido naquele ano, mesmo após uma mudança de emprego.

Arquivos principais: `app.js`, `index.html`, `style.css`, `src/engine/career.js`.

[Detalhes de Meu perfil](MEU-PERFIL.md).

### Abertura sem terminal

Solicitação: abrir o jogo sem uma janela de terminal junto.

- O inicializador `brasfoot` usa `setsid --fork`, com alternativa por `nohup`, para separar o processo do terminal.
- Entrada padrão desligada e saída/mensagens encaminhadas para arquivo.
- Log em `${XDG_STATE_HOME:-$HOME/.local/state}/brasfoot/launcher.log`; em caso de indisponibilidade da pasta, usa `/dev/null`.
- Caminho com espaço corrigido no campo `Exec` do atalho.
- Atalhos com `Terminal=false`, instalados no menu e na área de trabalho, além da cópia na pasta do projeto.
- Verificados retorno imediato do inicializador, sessão separada, preservação de argumentos e gravação de saída no log, usando um aplicativo de teste isolado.

Atalhos:

- `Brasfoot.desktop` na pasta do projeto.
- `~/.local/share/applications/Brasfoot.desktop`.
- `~/Área de trabalho/Brasfoot.desktop`.

A tentativa de definir o atributo de confiança `metadata::trusted` da cópia da área de trabalho não foi suportada pelo ambiente. A configuração do atalho e sua sintaxe foram validadas; não registrar esse atributo como aplicado.

### Mercado, transferências e empréstimos

Solicitação: uma aba Mercado, negociações de jogadores e propostas ocasionais guiadas pelo desempenho.

- **Mercado** ao lado de **Meu time**, com contador de propostas.
- Menus **Contratar**, **Negociar meu elenco**, **Propostas**, **Empréstimos** e **Negociações**.
- Compras e vendas com destino real para o jogador, alterações nos dois saldos e registro do negócio.
- Correção da persistência de negócios com clubes de fora das quatro divisões: esses participantes ficam em `marketClubs` no save.
- Proteção contra jogador reaparecer no clube anterior ou pertencer a dois elencos.
- Empréstimos até o fim da temporada, com taxa inicial, salário assumido pelo destino e retorno automático ao dono do passe antes da atualização anual.
- Retorno aplicado uma vez, sem cobrança repetida e com preservação da identidade do atleta.
- Proteções de saldo, valor, elenco mínimo de 15 jogadores e conservação de pelo menos um goleiro.
- Bloqueio de novas negociações para um jogador já emprestado e enquanto uma partida estiver aberta.
- Propostas a partir da terceira rodada, com intervalo mínimo de três rodadas e até três pendentes.
- Interesse de compra por partidas, notas, forma, gols, assistências e destaques; interesse de empréstimo por jovens com poucos minutos.
- Necessidade da posição e dinheiro do clube interessado considerados na escolha.
- Convites estáveis ao recarregar, com aceitação, recusa, prazo e histórico.
- Negócios construídos em uma cópia da carreira e efetivados na interface após gravação bem-sucedida.

Arquivos principais: `src/engine/market.js`, `src/engine/career.js`, `app.js`, `index.html`, `style.css`.

[Regras do mercado](MERCADO-DESEMPENHO.md).

### Desempenho e destaques por jogo

Solicitação: uma aba de desempenho dos jogadores, com destaque por partida.

- Aba **Desempenho**, com consulta por jogadores e por jogo.
- Notas de 1 a 10 calculadas pelos eventos e minutos realmente produzidos pelo simulador.
- Gols, assistências, finalizações, defesas, desarmes, resultado, disciplina e partidas sem sofrer gols compondo a avaliação.
- Quem não entra em campo permanece sem nota; jogos encerrados por insuficiência de atletas não concedem prêmio de craque.
- Craque do jogo, forma das últimas cinco atuações, minutos, médias, gols e assistências.
- Filtros por posição e ordenação por média, forma, gols, assistências, minutos ou destaques.
- Ficha das atuações recentes com adversários e placares.
- Relatórios dos dois clubes em cada partida, preservados mesmo após um atleta ser transferido.
- Exibição do craque no resultado ao vivo.
- Arquivo de relatórios das duas temporadas anteriores, além da temporada atual.
- Saves antigos mantidos; jogos sem registros individuais suficientes mostram a ausência de avaliação, sem notas inventadas.

Arquivos principais: novo `src/engine/performance.js`, `src/engine/match.js`, `src/engine/career.js`, `app.js`, `index.html`, `style.css`.

[Notas e relatórios](MERCADO-DESEMPENHO.md#avaliações-dos-jogadores).

### Mais opções táticas

Solicitação: ampliar as escolhas táticas e seus efeitos na simulação.

- Total de **11 formações**. Acrescentadas 5-3-2, 5-4-1, 4-1-4-1, 4-4-2 diamante e 4-3-2-1, com distribuição no campo e no motor.
- Sete grupos de instruções: passes, direção do ataque, ritmo, pressão, linha defensiva, entradas e transição.
- Seis planos rápidos: Equilibrado, Posse de bola, Contra-ataque, Pressão alta, Bola aérea e Segurar resultado.
- Cobradores de pênaltis, faltas diretas e escanteios, com alternativa automática se o escolhido estiver fora de campo.
- Efeitos sobre circulação e precisão, escolha dos criadores e lados, cruzamentos, frequência dos ataques, desgaste, desarmes, faltas, cartões e exposição da defesa.
- Lances específicos de contra-ataque e efeito dos espaços deixados por uma linha adiantada.
- Qualidade da criação influenciando escanteios e impedimento de o cobrador cabecear o próprio cruzamento.
- Instruções disponíveis na escalação e no painel da partida; durante o jogo, preservam os minutos, placar e lances anteriores.
- Técnicos adversários usando as novas formações e ajustando instruções ao placar e à energia.
- Instruções e cobradores guardados no clube e na partida salva; partidas anteriores recebem padrões quando necessário.
- Controles bloqueados após o apito final e proteção de gravação das instruções antes do jogo.

Arquivos principais: novo `src/engine/tactics.js`, `src/engine/squad.js`, `src/engine/match.js`, `app.js`, `index.html`, `style.css`.

[Opções e efeitos das táticas](TATICAS.md).

### Otimizações organizadas

- Motor com caches de características e efeitos táticos, índices de jogadores, menos cálculos de força repetidos e menos trabalho ao avaliar substituições da IA. Os mesmos dados e números aleatórios produzem os mesmos resultados.
- Novo `src/engine/storage.js`: save completo com revisão interna, checkpoints menores da partida, compatibilidade com saves anteriores, proteção contra checkpoints antigos e pausa caso a gravação ao vivo falhe.
- Negociações, propostas ao técnico, instruções antes do jogo e mudanças anuais continuam dependendo da gravação completa antes de substituir a carreira. Novo jogo e importação também gravam antes de confirmar o estado aberto.
- Atualização de abas e subabas sob demanda; botões dos jogadores durante a partida reaproveitados, com atualização de energia e ocorrências nos elementos existentes.
- Catálogo e índice de clubes reutilizados; mercado seleciona os melhores 100 resultados antes de copiar os jogadores, mantendo filtros e ordem dos empates. Avaliação de propostas reutiliza necessidade e desempate por candidato.
- Calendários das outras divisões reutilizados; preparação em etapas de uma partida, com cursor salvo para a rodada incompleta e recuperação de energia uma vez por rodada.
- Testes novos para falhas de armazenamento, retomada de partida e de preparação, caches, ordenação e renderização. Roteiros nativos adaptados ao formato interno do save e à atualização sob demanda; execução gráfica ainda pendente.
- Comparação direta de 120 partidas: 68,7% menos tempo total em Node, com resultados e elencos idênticos; checkpoint 96,8% menor na amostra. Os tempos não medem gravação ou renderização no WebKit.

Arquivos principais: `app.js`, `index.html`, novo `src/engine/storage.js`, motores de partidas, táticas, elenco, mercado e carreira; verificações em `scripts/`.

[Implementação, medições e reprodução](OTIMIZACOES.md) · [Comparação registrada](optimization-benchmark-results.json).

### Finanças do clube

- Aba própria ao lado de Estádio, com caixa, entradas, saídas, resultado do período, extrato por temporada e tipo de movimento, gráfico e folha salarial atual.
- Registro financeiro pertencente ao clube, com até cinco temporadas. Saves antigos começam no saldo e na rodada existentes, sem criar receitas ou despesas retroativas.
- Rodadas registram bilheteria, salários e manutenção; transferências e taxas de empréstimos aparecem nos dois clubes; obras registram o pagamento e premiações ficam no ano concluído.
- Simulador de ingresso e caixa futuro com a fórmula de público usada nas partidas. A consulta não usa aleatoriedade nem muda dinheiro. Ingresso e obras só são confirmados após salvar; alterações são bloqueadas com uma partida aberta.
- Atalhos de gestão e avisos conforme o saldo e a projeção. O estádio mantém as obras e passa a encaminhar o controle de ingresso à aba Finanças.
- Doze grupos de testes próprios, além da reexecução do motor, carreira, mercado/desempenho, perfil e otimizações. Roteiro nativo atualizado para abrir a aba; conferência gráfica pendente.
- Nesta etapa foram sugeridos patrocínio/TV, orçamento da diretoria, contratos e parcelas. As três primeiras sugestões foram implementadas na etapa seguinte; parcelas seguem como evolução futura.

Arquivos principais: `src/engine/finance.js`, `src/engine/market.js`, `src/engine/career.js`, `app.js`, `index.html`, `style.css`, `scripts/test-finance.cjs` e roteiro nativo offline.

[Regras, limites e próximas sugestões](FINANCAS.md) · [Relatório de finanças](finance-test-results.json).

### TV, patrocínios, orçamento e contratos

- TV por divisão/reputação e três propostas anuais de patrocínio: receita fixa, bônus por vitória ou meta entre os quatro primeiros. Créditos por rodada sem duplicação; meta proporcional paga no ano encerrado. A projeção inclui apenas receitas fixas contratadas.
- Limites da diretoria para salários e negociações, retorno dos cedidos reservado na folha, vendas liberando verba e revisão após quatro rodadas. Cada negócio também precisa de dinheiro em caixa.
- Contratos com prazo, salário, luvas, renovação por desempenho e rescisão. Compras definitivas incluem os termos do jogador. Mercado ganhou as opções Contratos e Sem clube, com custos antes da confirmação.
- Empréstimos mantêm o salário acordado até o retorno, mesmo com renovação pelo dono. Vencimentos liberam atletas antes da reposição por jovens; a lista sem clube preserva identidade e envelhece uma vez por ano.
- Atualização dos saves preserva dinheiro, salários, calendário e partida aberta; sem luvas ou créditos retroativos. Operações usam cópia e só se confirmam após gravar.
- Quinze grupos de regressão novos; testes anteriores e suítes completas do motor e carreira passaram. Conferência lógica/estrutural das telas e offline; aparência GTK/WebKit pendente.
- Diagnóstico da base inicial: de 71/80 projeções de caixa negativas para 4/80 com TV e patrocínio fixo, sem antecipar bônus, prêmios ou negócios.

[Condições e migração](ECONOMIA-CONTRATOS.md) · [Relatório](economy-contracts-test-results.json).

## Verificações registradas

Motor, carreira, mercado, perfil, finanças, otimizações e táticas passaram após integrar economia e contratos. A tabela também conserva as verificações anteriores; a conferência visual continua separada.

| Verificação | Resultado e alcance |
| --- | --- |
| `node scripts/test-tactics.cjs` | 11 grupos e 24 comparações de partidas para entradas; formações, campo, passes, pressão, lados, contra-ataque, cobradores, alteração em jogo e saves. |
| `node scripts/test-engine-v2.cjs` | 12 grupos, 1.520 jogos de quatro divisões, 352 amistosos cobrindo 703 clubes e 1.200 jogos de comparação: 3.072 partidas. |
| `node scripts/test-market-performance.cjs` | 8 grupos sobre transferências, empréstimos, propostas, notas, propriedade e dinheiro, retomada e falha de gravação; catálogo consultado antes e depois da negociação. |
| `node scripts/test-manager-profile.cjs` | 9 grupos sobre migração, títulos, clubes, propostas, nome e gravação. |
| `node scripts/test-career.cjs --quick` | 9 grupos e 10 transições anuais sintéticas. |
| `node scripts/test-career.cjs` | Duas temporadas simuladas, 2026 → 2027 → 2028, com 3.040 partidas nas quatro divisões. |
| `node scripts/test-optimizations.cjs` | 13 grupos de regressão, incluindo falhas de gravação, checkpoints inválidos ou antigos, retomada determinística, caches, mercado, abas sob demanda, botões e rodadas incompletas. |
| `node scripts/test-finance.cjs` | 12 grupos: abertura de saves antigos, conciliação, cobrança única, projeção sem efeitos, negócios nos dois clubes, obras, premiação, troca de técnico, cinco temporadas, entradas inválidas, interface/filtros e falhas de gravação. |
| `node scripts/test-economy-contracts.cjs` | 15 grupos: migração, patrocínios, TV, bônus, orçamento, renovações, rescisões, empréstimos, vencimentos, jovens, atletas sem clube, transações, recarga, telas e falha de gravação. |
| `node scripts/benchmark-optimizations.cjs --baseline '.backups/before-optimizations-20261021-125309'` | 120 partidas equivalentes e 20 jogos equivalentes na preparação, além das medições de mercado, catálogo e salvamento em memória. |
| `node scripts/test-live-match.cjs` | Controles incrementais, mudanças, substituições, fadiga, intervalo, retomada determinística e finalização sem duplicação. |
| `python3 scripts/check-offline.py` | Scripts, estilos, imagens, sons, inventário local e política de rede verificados. |
| Validação estrutural de `index.html` | Encadeamento das tags, IDs únicos e referências estáticas da aplicação verificados. |
| Inicializador e atalhos | `bash -n`, validação dos arquivos desktop e teste isolado de processo separado, argumentos e log. |

Relatórios persistidos: [motor](engine-test-results.json), [carreira](career-test-results.json), [finanças](finance-test-results.json), [economia/contratos](economy-contracts-test-results.json) e [comparação da etapa de otimizações](optimization-benchmark-results.json).

Os testes utilizaram cópias dos clubes e armazenamento isolado, sem modificar os saves do jogador.

### Conferência visual

A compilação do teste nativo GTK/WebKit passou na etapa do perfil, mas sua execução foi bloqueada por falta de acesso ao display. A tentativa de navegador também foi bloqueada pelas restrições do ambiente. As novas telas desta conversa têm verificação de código, estrutura e lógica; sua aparência ainda precisa ser conferida em uma sessão gráfica real.

As capturas e os testes nativos históricos já existentes em `docs/interface/` e `docs/OFFLINE.md` pertencem às etapas anteriores e não comprovam a aparência das telas novas.

## Cópias anteriores dos arquivos

As pastas abaixo existem em `.backups/`. Cada uma preserva arquivos anteriores à respectiva etapa; não são backups dos saves do jogador.

| Pasta | Etapa |
| --- | --- |
| `interface-before-original-reference/` | Revisão da interface clássica |
| `before-live-match-controls/` | Controles da partida ao vivo |
| `before-offline/` | Funcionamento offline |
| `before-club-browser/` | Aba Times |
| `before-roster-update-2026-10-21/` | Atualização de elencos |
| `before-engine-improvements/` | Melhorias do motor |
| `before-season-continuity/` | Temporadas consecutivas |
| `before-manager-profile-20261021-111715/` | Meu perfil e propostas de emprego |
| `before-silent-launch-20261021-113639/` | Abertura sem terminal |
| `before-market-performance-20261021-114325/` | Mercado, empréstimos e desempenho |
| `before-expanded-tactics-20261021-121000/` | Ampliação das táticas |
| `before-optimizations-20261021-125309/` | Motor, salvamento, abas sob demanda, mercado e encerramento em etapas |
| `before-club-finances-20261021-132253/` | Aba Finanças, extrato, projeção e integração dos movimentos de caixa |
| `before-sponsors-budgets-contracts-20261021-135744/` | TV, patrocínios, limites da diretoria e contratos dos jogadores |

## Como usar a versão atual

1. Feche o aplicativo aberto e inicie **Brasfoot Linux** pelo menu de aplicativos.
2. Carregue sua carreira para acessar as novas funcionalidades com o progresso existente.
3. Consulte **Meu perfil**, **Mercado**, **Desempenho** e **Finanças** na barra superior.
4. Abra **Escalar time → Instruções do time** para as táticas. Durante a partida, abra **Instruções e bolas paradas**.
5. As notas são registradas nas novas partidas finalizadas. Propostas por jogadores começam após a terceira rodada; propostas de emprego chegam ao iniciar o ano seguinte.
6. Em **Finanças**, escolha o patrocinador e consulte a verba da diretoria. Em **Mercado → Contratos**, acompanhe os prazos antes de encerrar o ano; **Sem clube** reúne jogadores liberados na carreira.

Alterações nos arquivos HTML/CSS/JavaScript são carregadas ao reabrir o jogo. O executável nativo não precisa ser recompilado para essas modificações.
