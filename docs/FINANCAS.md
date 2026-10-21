# Finanças do clube

Implementação de **21/10/2026**. A aba **Finanças** fica na barra superior, ao lado de **Estádio**. Funciona offline, com os dados da carreira aberta. A etapa seguinte acrescentou [TV, patrocínios, orçamento e contratos](ECONOMIA-CONTRATOS.md), com regras e testes registrados.

## O que está disponível

- Caixa atual, entradas, saídas e resultado do período registrado.
- Extrato por temporada, com filtro de rodadas, transferências/empréstimos, obras e premiações. Cada movimentação mostra o saldo resultante e o detalhamento dos valores.
- Gráfico das últimas 12 movimentações e totais por categoria.
- Folha salarial atual, ordenada do maior salário para o menor, com participação de cada atleta no total.
- Simulador de ingresso, público estimado, bilheteria, salários, manutenção, resultado em casa e fora e caixa estimado até o fim do campeonato.
- Pontos de atenção conforme caixa e projeção, com atalhos para Mercado, Desempenho e Estádio.
- TV automática, três propostas de patrocínio anual e limites da diretoria para negociações e salários, com revisão após quatro rodadas.

O ingresso passou para esta aba. O controle permite R$ 10 a R$ 150, em passos de R$ 5, alinhado ao limite já tratado pelo aplicativo. Arrastar simula; soltar grava. As previsões não alteram o dinheiro nem usam números aleatórios. O preço e as obras só substituem a carreira aberta depois de uma gravação completa bem-sucedida. Durante uma partida aberta, esses comandos ficam bloqueados.

## Registro dos valores

O histórico pertence ao **clube**, em `team.finances`; não acompanha o técnico ao aceitar outro emprego. São mantidas até cinco temporadas por clube.

Cada temporada registra `openingBalance`, `startedRound` e `entries`. As entradas guardam descrição, rodada, categorias, valor líquido e saldo posterior. O saldo inicial somado às entradas e subtraído das saídas reconcilia com o saldo final daquele período.

As fontes registradas são:

| Movimento | Tratamento |
| --- | --- |
| Rodada concluída | Bilheteria, TV, patrocínio fixo, eventual bônus por vitória, salários e manutenção numa única movimentação detalhada. Ano e rodada identificam a cobrança, impedindo duplicação. |
| Compra e venda | Débito do comprador e crédito do vendedor, ligados ao mesmo negócio. |
| Empréstimo | Taxa inicial nos dois clubes. Salário pertence ao clube que recebe o atleta. O retorno não cobra outra taxa. |
| Ampliação do estádio | Despesa à vista; a nova capacidade passa a influenciar a manutenção. Valores de lugares inválidos são rejeitados. |
| Premiação | Registrada no ano concluído, quando o dinheiro é creditado ao iniciar o ano seguinte. |
| Contrato | Luvas e rescisões pagas à vista, com efeito na verba de negociações. A compra pode incluir luvas no mesmo lançamento do passe. |
| Meta de patrocínio | Bônus proporcional às rodadas contratadas, creditado no ano concluído ao iniciar o seguinte se a meta for cumprida. |

Recusar uma proposta, simular ingresso ou consultar a aba não gera lançamento de caixa. Todas as operações do cliente ativo usam os registros acima; os arquivos antigos de servidor continuam fora do aplicativo nativo.

## Saves existentes

O saldo e o progresso existentes são preservados. Ao carregar um clube sem histórico financeiro, o saldo atual vira o saldo inicial do registro, com a rodada e o ano correspondentes. Não são inventadas receitas ou despesas de partidas anteriores, nem reconstruídas transações antigas com dados incompletos. A tela informa o início da cobertura.

O extrato permanece no JSON de exportação e nas gravações da carreira. Os checkpoints das partidas também preservam os dados dos clubes envolvidos. Históricos de clubes externos passam a existir quando eles participam de negociações registradas; a economia das ligas de outros clubes continua com as regras já existentes.

## Projeção

A estimativa central utiliza a mesma fórmula de público das partidas, com variação central igual a 1. A partida real mantém a variação aleatória anterior de 0,85 a 1,15. Preço, capacidade, reputação, salários e manutenção continuam usando as regras do motor existente.

A projeção conta as rodadas ainda não concluídas e os jogos restantes em casa, usando o elenco, o estádio, a TV e o patrocínio fixo contratado atuais. Não inclui bônus por desempenho, premiação futura nem compras, vendas, empréstimos ou obras ainda não realizados. Em caso de clube sem jogo numa rodada, a estimativa considera receitas fixas, salários e manutenção, conforme o processamento do jogo. A unidade exibida é **por rodada**, correspondente à cobrança efetiva do motor.

As receitas começam na atualização da carreira, sem créditos retroativos. Na mesma atualização, os contratos existentes recebem prazos sem cobrança de luvas e sem alteração dos salários atuais.

## Evolução das sugestões

As três primeiras sugestões foram implementadas: patrocínios/TV, limites da diretoria e contratos/renovações. Veja [regras, telas, migração e testes](ECONOMIA-CONTRATOS.md).

No modelo inicial, 71 dos 80 clubes tinham caixa final projetado negativo no cenário central de calendário inteiro. Com TV e patrocínio fixo, são quatro. Os cenários usam o caixa inicial da base e não antecipam premiações, bônus ou negociações; não representam o save do jogador.

**Negociações parceladas** permanecem como sugestão futura: exigem registrar recebíveis e compromissos futuros na projeção.

## Arquivos e verificações

- `src/engine/finance.js`: contas, extrato, projeção e estimativa de público.
- `src/engine/market.js` e `src/engine/career.js`: lançamentos de negócios e premiações.
- `app.js`, `index.html`, `style.css`: aba, filtros, gráfico, simulação e confirmação após salvar.
- `scripts/test-finance.cjs`: 12 grupos de regressão, com clubes copiados e armazenamento em memória.
- [finance-test-results.json](finance-test-results.json): alcance dos testes e diagnóstico da projeção inicial.

As suítes completas do motor e da carreira, mercado/desempenho, perfil e otimizações também passaram após a integração. A verificação offline e a estrutura da página foram conferidas. A renderização foi verificada logicamente com um DOM simulado; a conferência visual na janela GTK/WebKit continua pendente. O roteiro nativo de teste foi atualizado para navegar pela nova aba.

Backup anterior: `.backups/before-club-finances-20261021-132253/`. Para usar, fechar e reabrir o jogo e carregar a carreira; não é necessário recompilar o executável.
