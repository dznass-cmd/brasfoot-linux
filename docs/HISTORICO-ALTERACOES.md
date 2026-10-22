# Histórico consolidado das modificações

Registro atualizado em **22/10/2026**. Consolida a base documentada e as etapas de desenvolvimento, incluindo a correção das brechas de mercado, escalação e negociações.

Projeto: Brasfoot Revenge.

[Contexto para retomar o desenvolvimento](../CONTEXTO-PROJETO.md) · [Guia principal](../README.md) · [Revisão de Negociações](REVISAO-NEGOCIACOES.md)

## 22/10/2026 — Ofertas de Transferência Calculadas por Clubes Interessados (Não-Genéricas)

Solicitação: quero que quando clicar apareça ofertas calculadas nao seja generico.

- **Motor de Cálculo Dinâmico de Propostas (`MarketEngine.calculateTransferOffers`)**:
  - Em vez de uma tela genérica com lista estática de clubes e valores fixos, o sistema calcula propostas personalizadas e dinâmicas de clubes que possuem interesse real no jogador.
  - **Critérios de IA para os clubes interessados**:
    - **Capacidade financeira real**: o clube comprador deve possuir saldo em caixa e limite orçamentário suficiente (`availableBudget >= offerAmount`) para honrar a compra ou empréstimo.
    - **Teto salarial**: verificação rigorosa de que o salário do atleta cabe na folha autorizada do clube comprador.
    - **Carência e urgência por posição**: analisa o número de atletas inscritos no setor (G, L, Z, M, A) e dá preferência a posições com defasagem no elenco.
    - **Qualidade técnica**: compara a força do jogador à média do elenco e dos titulares do clube comprador, pagando ágio (105% a 120% do valor) por atletas que chegam para ser titulares absolutos.
    - **Desempenho e momento**: notas médias recentes, gols, assistências, idade jovem (promessa) ou veterano são ponderados no cálculo.
    - **Variedade de propostas**: combina propostas de compra definitiva de clubes com alto poderio financeiro e opções de empréstimo (cobrindo 100% dos salários + taxa proporcional) para jogadores que buscam rodagem.
    - **Justificativas personalizadas em português**: cada proposta exibe um motivo claro e detalhado formulado pela IA (ex: "O Palmeiras busca um titular absoluto para a zaga...", "O Coritiba detectou carência urgente no setor ofensivo...", etc.).
- **Interface e Modal de Transferência (`#transfer-modal`)**:
  - Nova seção no topo: **"💼 Ofertas Calculadas & Clubes Interessados"** (`#transfer-calculated-section`).
  - Cards visuais completos com:
    - Escudo oficial do clube comprador e divisão (Série A, Série B, etc.).
    - Saldo em caixa do clube interessado.
    - Badge de identificação: `[Compra Definitiva]` (verde) ou `[Empréstimo]` (azul).
    - Valor da proposta em destaque verde (`R$ 7.600.000` ou taxa + salários).
    - Justificativa técnica formulada pela IA.
    - Botão **"⚡ Aceitar Proposta"**: transação instantânea em 1 clique via `commitMarketAction({ type: 'accept', offerId })`.
    - Botão **"📝 Contraproposta"**: seleciona o clube e valor no formulário abaixo para ajuste manual.
  - Seção sanfonada inferior (`#transfer-manual-details`): permite oferecer o jogador diretamente a qualquer outro clube ou fazer contrapropostas manuais mantendo flexibilidade total.
  - No menu de contexto de clique direito, o botão de transferir informa a quantidade de propostas calculadas disponíveis.
- **Testes Automatizados**:
  - Criado `scripts/test-calculated-transfer-offers.cjs` com 6 testes validando geração de ofertas calculadas, checagem financeira de caixa e teto salarial, idempotência, bloqueios de regras, aceite instantâneo e integração com a interface DOM.

## 22/10/2026 — Menu de contexto ao clicar com botão direito no jogador para transferir e negociar

Solicitação: quero que no painel possa clicar com botao direito no nome do jogador e abrar opçao de transferir.

- **Menu de Contexto Flutuante (`#player-context-menu`)**:
  - Acionamento direto pelo clique com o botão direito do mouse (`contextmenu`) no nome ou na linha do jogador.
  - Disponível nas principais telas e painéis:
    - **Tabela do Elenco** (`#squad-table` / `#squad-tbody`): clique direito em qualquer atleta titular ou reserva abre imediatamente o menu.
    - **Painel Lateral do Jogador** (`#player-profile-panel` / `#profile-name`): clique com o botão direito no nome ou na ficha do jogador inspecionado.
    - **Botão Rápido no Painel Lateral** (`#profile-transfer-btn`): botão "Transferir / Negociar" para acesso também por clique convencional.
    - **Tela de Táticas e Escalação** (`#lineup-tbody`): atalho direto para transferir reservas ou titulares.
    - **Navegador de Clubes** (`#browser-roster-tbody`): clique com botão direito em atletas do próprio clube ou de clubes rivais.
    - **Busca de Mercado** (`#market-tbody`) e **Elenco no Mercado** (`#market-squad-tbody`).
- **Ações disponíveis conforme a titularidade e posse do passe**:
  - **Jogadores do próprio clube**:
    - 💼 **Transferir jogador...** (opção principal destacada): abre o modal oficial de venda (`#transfer-modal`) com valor sugerido de mercado, escolha do clube de destino e projeção de impacto orçamentário.
    - 🔄 **Emprestar jogador...**: abre a negociação de empréstimo do atleta para outro clube até o fim da temporada.
    - 📝 **Renovar contrato...**: abre o modal de extensão de vínculo e ajuste salarial (`#contract-modal`).
    - ⚠️ **Rescindir contrato...**: abre o cálculo da multa rescisória e liberação imediata.
  - **Jogadores de clubes rivais**:
    - 💼 **Comprar / Transferir...**: faz proposta de contratação direta ao clube proprietário.
    - 🔄 **Pedir por empréstimo...**: solicita a cessão temporária do atleta.
- **Design e usabilidade**:
  - Cabeçalho com o emblema da posição (G, L, Z, M, A com cores correspondentes), nome, estrelas, força, valor de passe e clube.
  - Clamping inteligente de coordenadas para garantir que o menu nunca ultrapasse as bordas da tela.
  - Fechamento automático ao clicar fora, ao pressionar tecla `Escape`, ao redimensionar a janela ou ao rolar a página.
- **Testes automatizados**:
  - Criado `scripts/test-player-context-menu.cjs` com 5 testes automatizados cobrindo abertura, renderização das opções para time próprio e rivais, disparo da transferência e fechamento.

## 22/10/2026 — Desempenho com a Diretoria, Confiança em Tempo Real e Sistema de Demissão

Solicitação: colocar status do meu desempenho com a diretoria e caso muito baixa podemos ser demitidos.

- **Motor de Avaliação da Diretoria (`BoardEngine`)**:
  - **Cálculo de metas realistas da temporada** (`expectation`):
    - Baseia-se na força do elenco do usuário em relação aos rivais da mesma divisão.
    - Na Série A: G4/Título (elencos top 2), Vaga Continental/G6 (top 3 a 6), Campanha Estável/Sul-Americana (7 a 13) e Permanência/Fora do Z4 (14 a 20).
    - Nas divisões de acesso: Acesso à divisão superior (G4), primeira metade da tabela ou permanência.
  - **Índice de confiança em tempo real (0 a 100%)** (`evaluate`):
    - Impacto da posição atual versus meta estabelecida (bônus por estar acima da meta, penalidade por estar abaixo).
    - Penalidade severa por estar na zona de rebaixamento (Z4).
    - Avaliação de momento recente com base nos últimos 5 jogos (vitórias, empates, derrotas).
    - Penalidade progressiva por sequência de derrotas consecutivas (2 a 5+ derrotas).
    - Penalidade por déficit financeiro crônico (saldo negativo abaixo de -R$ 500 mil e -R$ 2 milhões).
    - Período de carência nas primeiras 4 rodadas (score mínimo de 45% para evitar demissões precipitadas).
    - Classificação em 6 níveis de estabilidade: *Inabalável* (>= 85%), *Muito Boa* (70–84%), *Estável* (50–69%), *Sob Pressão* (35–49%), *Ameaçado* (20–34%) e *Demissão Iminente* (< 20%).
- **Interface e Feedback Visual**:
  - **Painel de Confiança na Barra Lateral** (`#board-confidence-panel`):
    - Barra de progresso colorida dinâmica (verde, amarelo, laranja, vermelho escuro).
    - Indicação da meta da temporada, percentual exato e status da diretoria.
    - Animação de pulso em alerta vermelho (`threatened`) quando a confiança cai abaixo de 35%.
  - **Seção de Avaliação no Perfil do Treinador** (`manager-board-section`):
    - Grid com: Objetivo da temporada, Posição atual, Aproveitamento (%), Saldo financeiro, Segurança no cargo, Confiança geral (pontuação / 100) e parecer detalhado da diretoria.
- **Mecânica de Demissão e Continuidade da Carreira**:
  - **Gatilho de demissão justa**:
    - Disparado se a confiança cair abaixo de 20% após a 5ª rodada e o último resultado **não** for uma vitória (protegendo o técnico em caso de vitória de reação).
  - **Modal de Comunicado Oficial** (`#dismissal-modal`):
    - Comunicado oficial da diretoria com escudo do clube, motivos detalhados da rescisão e estatísticas da passagem (jogos, vitórias, empates e derrotas).
    - Geração de até 3 propostas de emprego de clubes interessados para continuar a carreira imediatamente sem perder o progresso.
    - Opção de reiniciar escolhendo outro clube da base de dados.
  - **Transição de Carreira Limpa**:
    - Passagem anterior registrada no histórico com status `dismissed` e motivo de rescisão.
    - Nova passagem iniciada com o novo clube; comissão técnica interina assume o clube anterior.
    - Salva persistido no LocalStorage de forma segura e 100% offline.
- **Testes automatizados**:
  - Criado `scripts/test-board-dismissal.cjs` com 8 grupos de testes automatizados cobrindo metas, carência, sequências de vitórias/derrotas, proteção contra demissão após vitória, geração de propostas e transição de carreira no motor e na interface.

## 22/10/2026 — Organização de funções/posições com cores e sistema visual de humor dos jogadores

Solicitação: organizar a função dos jogadores no menu com cores específicas para cada posição (G, L, Z, M, A) e exibir o humor do jogador ao clicar nele.

- **Cores específicas por posição no menu e tabelas**:
  - **G** (Goleiro): Amarelo / Âmbar (`#d97706`), com borda e contraste legível.
  - **L** (Lateral): Azul Claro / Ciano (`#0284c7`).
  - **Z** (Zagueiro): Azul Escuro / Real (`#2563eb`).
  - **M** (Meio-campo): Verde clássico (`#16a34a`).
  - **A** (Atacante): Vermelho vivo (`#dc2626`).
  - **D** (Defensor genérico): Índigo / Violeta (`#6366f1`).
  - Emblemas em formato `.pos-badge` aplicados no elenco (`squad-table`), na tela de táticas (`lineup-roster`), no navegador de clubes (`browser-roster`), no mercado de transferências, nos contratos e nos jogadores livres.
  - Legenda de cores e funções adicionada na barra de status inferior do elenco.
- **Organização estruturada do elenco**:
  - Jogadores organizados com **Titulares** primeiro (Goleiro, Laterais, Zagueiros, Meias, Atacantes) e **Reservas** em seguida (Goleiro, Laterais, Zagueiros, Meias, Atacantes), desempatando por força.
  - Linha divisória visual clara (`RESERVAS`) separando os titulares dos suplentes no elenco e na tela de escalação.
- **Sistema de humor ao clicar nos jogadores**:
  - Exibição de humor com 5 faixas baseadas em `player.morale` (40 a 110):
    - **Radiante (105–110)**: 😄 Em excelente fase e com moral nas alturas (`#16a34a`).
    - **Feliz (95–104)**: 😊 Confiante e satisfeito com o momento (`#22c55e`).
    - **Normal (80–94)**: 😐 Tranquilo e focado nos treinamentos (`#eab308`).
    - **Descontente (65–79)**: 🙁 Insatisfeito com resultados ou poucos minutos (`#f97316`).
    - **Abatido (40–64)**: 😡 Muito insatisfeito e com moral em baixa (`#ef4444`).
  - **Card de Humor no Perfil Lateral** (`#profile-humor-card`):
    - Apresenta o emoji do humor em destaque, o status textual, o valor exato, a barra colorida proporcional e a descrição do estado de ânimo do atleta.
    - Efeito de pulso suave (`pulse-highlight`) acionado a cada clique para destacar visualmente a reação emocional do atleta.
    - Linha de detalhamento no extrato de dados (`Humor / Moral`) com valor e rótulo.
  - **Feedback no rodapé e na tela tática**:
    - Barra de status inferior (`#roster-selection-status`) detalha o nome, posição e humor completo ao selecionar um jogador.
    - Na tela tática (`#lineup-help`), a seleção do jogador indica o humor atual para apoiar decisões de substituição e desgaste.
    - Ícone e tooltip de humor exibidos diretamente na lista de jogadores e no banco de reservas.

Arquivos principais: `index.html`, `style.css`, `app.js`, `src/public/app.js`, `src/public/style.css`.
Testes: validação da suíte completa de táticas, otimizações, mercado e offline em `python3 scripts/check-offline.py`.

## 22/10/2026 — Correção de valores, forças e dados de jogadores famosos e estrelas

Solicitação: corrigir valores de jogadores importantes e famosos no mercado e na base de dados offline (`data/teams.json` e `data/teams_data.js`).

- **Cura e padronização de craques mundiais e ídolos nacionais**:
  - Superestrelas mundiais (Vinícius Jr, Mbappé, Haaland, Rodri, Bellingham, Salah, Messi, Cristiano Ronaldo, Kane, De Bruyne, Yamal, Musiala, Palmer, etc.) configurados com força de elite (63–65), `isStar: true`, `isTopWorld: true`, valores de mercado autênticos (R$ 8M a R$ 19M+) e salários semanais condizentes.
  - Ídolos e destaques do futebol brasileiro (Pedro, Arrascaeta, Memphis Depay, Estêvão, Hulk, Lucas Moura, Thiago Silva, Rodrigo Garro, Gustavo Gómez, Raphael Veiga, etc.) com forças de 56 a 60, `isStar: true`, valores de R$ 5M a R$ 15M e salários ajustados.
- **Relocação e restauração de lendas**:
  - Correção de 34 atletas de ponta que estavam em clubes incorretos devido a raspagens antigas ou ambíguas (Hulk no Atlético-MG, Estêvão e Veiga no Palmeiras, Matheus Pereira e Cássio no Cruzeiro, Vegetti e Coutinho no Vasco, Luiz Henrique e Almada no Botafogo, De Bruyne e Rodri no Man City, Modric no Real Madrid, Gerson no Flamengo, Arias no Fluminense, etc.).
  - Adição de lendas e reforços ausentes (Messi, Lewandowski, Salah, Griezmann, Payet, Igor Jesus, Benzema, De Paul, Son, etc.) em seus clubes adequados com IDs únicos.
- **Emblemas e identificação visual no jogo**:
  - Superestrelas mundiais recebem a estrela dourada `⭐` (`isTopWorld`).
  - Craques nacionais e destaques da liga recebem a clássica estrela prateada `★` (`isStar`).
  - Exibição consistente em todas as telas: navegação de clubes, perfil do atleta, escalação do elenco, mercado e simulação da partida.
- **Integração com scripts de atualização**:
  - Script autônomo `scripts/fix-famous-players.py` integrado à rotina `scripts/update-rosters.py`, garantindo que futuras atualizações de elencos preservem os atributos e estrelas curados.

Arquivos principais: `scripts/fix-famous-players.py`, `scripts/update-rosters.py`, `data/teams.json`, `data/teams_data.js`, `app.js`, `src/public/app.js`.
Testes: validação da fórmula de passe, integridade dos IDs e verificação de offline em `python3 scripts/check-offline.py`.

## 22/10/2026 — Correção do mercado, escalação, empréstimos e negociações

Solicitação: corrigir as 5 falhas reproduzíveis e 2 limitações identificadas no mercado (lucro com venda/recompra imediata, empréstimos sem jogos, desfazimento da escalação, mercado externo congelado, busca sensível a acentos, orçamento/folha da IA e passe estático).

- **Anti-arbitragem e proteção de revenda**: alinhamento bid/ask onde o valor máximo pago pela IA é menor ou igual ao valor mínimo exigido para venda. Bloqueio estrito de recompra imediata na mesma rodada e piso de revenda baseado no valor pago na aquisição recente, eliminando ciclos de lucro sem passagem de tempo.
- **Empréstimos com duração e vigência real**: bloqueio de novos empréstimos com o campeonato encerrado. Cálculo de taxa proporcional aos jogos restantes da temporada e exibição da estimativa de jogos e prazo antes da confirmação.
- **Preservação da escalação manual**: contratações entram no banco de reservas sem mexer nos titulares. Vendas e rescisões de reservas preservam exatamente os 11 titulares e suas posições. A saída de um titular preenche exclusivamente a vaga desocupada pelo melhor reserva disponível, mantendo intactos os outros 10 titulares e táticas.
- **Envelhecimento determinístico de clubes externos**: clubes ainda não materializados no save são avançados ano a ano de forma determinística até o ano atual da carreira (`simulatedYear`), refletindo idades, evolução e aposentadorias tanto na busca quanto na negociação, sem inflar o save com os 703 clubes da base.
- **Busca sem acentos**: normalização Unicode (`NFD` sem marcas diacríticas) tanto na consulta quanto nos nomes dos atletas, permitindo localizar "José" digitando "Jose", "João" com "joao", independente de maiúsculas/minúsculas.
- **Passe de referência dinâmico**: recálculo automático de `player.value` durante a evolução anual da carreira acompanhando o ganho de força e o impacto da idade.
- **Orçamento e folha salarial da IA**: a IA respeita os mesmos limites de caixa, verba de transferências da diretoria e limite de folha salarial antes de aceitar compras manuais do usuário, além de avaliar necessidade por posição e nível do elenco.
- **Contrapropostas e recusa fundamentada**: propostas fora da faixa aceitável recebem contraproposta clara com valor sugerido (com botão para aplicação imediata) ou recusa fundamentada, sem revelar valores mágicos garantidos.
- **Filtros avançados de mercado**: novos filtros por preço máximo, salário máximo, idade máxima e situação contratual (disponíveis, jovens emprestáveis, contrato no fim).
- **Resumo financeiro completo**: modal de transferência com projeção de impacto no caixa, compromisso com a folha salarial, espaço restante no teto da diretoria, prazo e avisos preventivos de impedimentos.

Arquivos principais: `src/engine/market.js`, `src/engine/squad.js`, `src/engine/contracts.js`, `src/engine/economy.js`, `src/engine/career.js`, `app.js`, `index.html`, `style.css`.
Testes: `scripts/test-negotiations-revisao.cjs` (8 grupos de teste específicos cobrindo todos os cenários da revisão) e preservação dos 35 grupos de testes anteriores.

## 22/10/2026 — Análise tática durante as partidas

Solicitação: acompanhar em um gráfico estatístico o efeito das táticas em tempo real.

- Painel **Efeito das táticas**, acima do Placar da Rodada nas janelas maiores, e botão **Análise tática** para ampliar a consulta em qualquer largura.
- Linhas dos dois clubes para posse, xG, finalizações, precisão dos passes e energia em campo. Estatísticas recentes usam uma janela móvel de até cinco minutos; energia usa o nível médio dos atletas em campo. Pontos do gráfico têm consulta pelo mouse; minutos futuros ficam vazios.
- Cada alteração de formação, estilo, instruções ou cobradores recebe um **T**, inclusive ajustes automáticos do adversário. O seletor permite consultar cada mudança ou acompanhar a última do próprio time.
- Tabela com valores anteriores, posteriores e variação para os dois clubes. Usa períodos iguais, de até cinco minutos, delimitados pelas outras mudanças táticas. Alterações sem minutos anteriores ou substituídas no mesmo minuto não recebem uma comparação inventada.
- Amostras e instruções históricas ficam em `activeMatch.tacticalAnalysis`, acompanhando save completo, checkpoint e exportação da partida ativa. Saves antigos começam a registrar no minuto recuperado; jogos automáticos não acumulam estas amostras.
- Registro sem consumir aleatoriedade ou mudar os parâmetros da simulação; cores, tipos de linha e legenda distinguem as equipes. O painel informa pausa e apito final, e a consulta permanece disponível antes de continuar a rodada.

Arquivos principais: novo `src/engine/tactical-analysis.js`, `src/engine/match.js`, `app.js`, `index.html`, `style.css` e ajustes da edição legada. [Regras de leitura](TATICAS.md#gráfico-durante-a-partida).

Verificações desta etapa:

- `node scripts/test-tactical-analysis.cjs`: oito grupos, incluindo igualdade de resultados e sorteios com/sem registro, dados recentes, períodos iguais, ambos os técnicos, migração, partidas como visitante, abandono e retomada determinística.
- `scripts/test-tactical-analysis-ui.js`, com Playwright e Chromium local: cinco indicadores, controles reais, recuperação, mudanças de ambos os técnicos, Placar da Rodada, apito final e larguras de 1260, 1024, 800 e 460 pixels. Capturas conferidas visualmente.
- Conferência gráfica isolada em GTK4/WebKitGTK: cinco indicadores, aplicação de pressão alta, comparação do desgaste, gravação/recuperação do histórico, ausência de transbordamento horizontal e captura real da tela.
- `bash scripts/test-offline.sh`: teste nativo completo sem interfaces de rede, agora incluindo o gráfico, recarga, importação/exportação e retomada em outro processo. Dois processos passaram com armazenamento e cache isolados.
- Motor completo: 12 grupos e 3.072 partidas; táticas: 11 grupos e 24 comparações; otimizações: 13 grupos; carreira rápida: nove grupos e dez transições; partidas ao vivo e Placar da Rodada também passaram.
- Auditoria offline e compilação dos fontes legados com `node scripts/legacy/build.cjs` passaram. A compilação não representa um novo teste em Windows XP.

Backup dos arquivos iniciais desta etapa: `.backups/before-live-tactical-analysis-20261022-103026/`. Testes usaram clubes e perfis isolados, sem acessar os saves do jogador.

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
