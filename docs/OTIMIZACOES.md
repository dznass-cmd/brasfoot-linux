# Otimizações — revisão e implementação em 21/10/2026

As prioridades 1–5 da revisão inicial foram implementadas. Este documento conserva a análise inicial e registra as mudanças, a comparação com o backup e os testes. O carregamento de elencos sob demanda (prioridade 6) permanece para uma etapa futura; o arquivo inicial da base não foi dividido nesta implementação.

## Prioridades da revisão inicial

| Ordem | Área | Proposta | Benefício esperado |
| --- | --- | --- | --- |
| 1 | Motor de partidas | Reutilizar características normalizadas e efeitos táticos enquanto suas entradas permanecerem iguais; evitar calcular novamente a força no mesmo minuto quando não houver mudança de jogadores. | Reduzir o processamento das rodadas e do encerramento das temporadas. |
| 2 | Salvamento | Separar os dados grandes da carreira dos pequenos checkpoints da partida e agrupar gravações redundantes. Preservar a gravação confirmada das negociações e transições. | Diminuir trabalho na interface durante as partidas e manter a recuperação do progresso. |
| 3 | Interface | Atualizar o cabeçalho e a aba visível; marcar as outras para atualização ao abrir. Durante o jogo, atualizar somente os campos alterados. | Reduzir reconstruções da tela e preservar a seleção e o foco dos controles. |
| 4 | Mercado e consulta de clubes | Manter um índice de clubes e jogadores, reconstruído após mudanças de propriedade; filtrar antes de copiar os resultados e limitar a lista exibida. | Tornar as buscas mais leves na base completa. |
| 5 | Encerramento da temporada | Reutilizar os calendários e avaliar a simulação fora da tarefa da interface, mantendo progresso, pausa e retomada. | Melhorar a resposta dos controles enquanto as outras divisões são simuladas. |
| 6 | Abertura | Avaliar carregar o catálogo de clubes primeiro e os elencos sob demanda. | Reduzir o volume inicial de dados; o ganho exige medição no WebKit. |

## Evidências da revisão inicial, antes das alterações

- `app.js`, `persistState`: serializa o estado completo e grava de forma síncrona. `advanceLiveMinute` chama o salvamento a cada minuto; uma pausa automática também pode provocar outra gravação no mesmo avanço.
- `app.js`, `refreshUI`: redesenha elenco, campo, classificação, artilheiros, estádio, histórico e perfil, inclusive quando essas abas estão fechadas. Mercado, desempenho e consulta de times já têm condicionais pela aba aberta.
- `src/engine/match.js`, `traits`: remove acentos e converte as características para minúsculas a cada consulta de atributo. Esses textos normalmente permanecem iguais durante toda a partida.
- `src/engine/match.js`, `stepMatch`: calcula a força dos dois times antes e depois da possível falta, mesmo quando a escalação permanece igual. `playersFor` procura os jogadores por buscas repetidas nos elencos.
- `src/engine/match.js`, `manageOpponent`: monta a lista de reservas em cada avaliação. As decisões táticas também avaliam todas as formações disponíveis.
- `src/engine/tactics.js`, `effects`: normaliza e reconstrói os efeitos a cada chamada.
- `app.js`, `currentTeams`: reconstrói o catálogo e a filtragem de propriedade dos jogadores. `src/engine/market.js`, `searchPlayers`: percorre os elencos, copia os resultados, ordena e depois limita a exibição.
- `src/engine/career.js`, `preparationProgress` e `simulateBackgroundRound`: geram calendários completos repetidamente, inclusive para consultar o número de rodadas.

## Medições iniciais, antes das alterações

Ambiente: Node.js v24.22.0/V8. Dados e clubes copiados; nenhum save do jogador foi aberto ou alterado. A medição de CPU usou 60 partidas com sementes determinísticas, depois de seis partidas de aquecimento, e amostragem a cada 500 microssegundos.

| Medição | Resultado |
| --- | --- |
| Normalização dos textos das características | 26,5% das amostras de tempo próprio do perfil de CPU |
| Partida automática, mediana com profiler ligado | 30,24 ms |
| Chamadas de `traits` em uma partida adicional instrumentada | 10.213 |
| Chamadas de cálculo de força nessa partida | 432 |
| Chamadas de efeitos táticos nessa partida | 679 |
| Save isolado de pré-temporada | 2.987.713 bytes em JSON UTF-8 |
| Conversão desse save em texto, mediana de 25 repetições | 13,14 ms |
| Cópia completa por conversão e leitura de JSON, mediana | 28,43 ms |
| Reconstrução de `currentTeams`, mediana de 25 repetições | 4,32 ms |
| Busca ampla no mercado, mediana de 25 repetições | 35,11 ms |
| Base consultada | 703 clubes e 19.987 jogadores |
| Arquivo inicial `data/teams_data.js` | 13.744.432 bytes |

As contagens são de uma única partida e variam conforme os acontecimentos e elencos. Os tempos são referências deste ambiente, não promessas de ganho. O perfil mede tempo próprio por função, não o tempo acumulado de todas as funções chamadas por ela.

Não foram medidos o custo de `localStorage.setItem`, a renderização, o uso de memória ou o tempo de abertura no GTK/WebKit. A conversão de JSON não inclui gravação em disco. O tamanho do arquivo inicial não determina sozinho o tempo de abertura. A busca medida foi ampla, sem filtros restritivos. Não foi estimado um limite de armazenamento do aplicativo.

## Implementação concluída

- **Motor:** cache das características com invalidação quando `cr1` ou `cr2` mudam; efeitos táticos reutilizados com detecção de alterações no próprio objeto; índices de jogadores por clube; menos cálculos de força no mesmo minuto e construção do banco somente quando a IA pode considerar uma substituição. Energia, moral, lesões e encaixe na posição continuam dinâmicos. Pênaltis perdidos e expulsões continuam provocando o recálculo necessário.
- **Salvamento:** novo `src/engine/storage.js`. A chave principal conserva a estrutura da carreira, com uma revisão interna adicional. O checkpoint contém a partida e os dois clubes e só se aplica à revisão, ano, rodada e confronto correspondentes. Saves antigos continuam aceitos. A gravação completa acontece antes da limpeza do checkpoint; uma limpeza malsucedida não permite reaplicar dados antigos. A exportação usa o estado completo, sem a revisão interna. Falhas de gravação ao vivo pausam o jogo.
- **Interface:** cabeçalho e indicadores continuam atualizados; abas e subabas da classificação são marcadas para atualização e renderizadas ao abrir. As linhas do elenco exibem somente a tabela correspondente à aba. Os botões dos jogadores durante a partida são reaproveitados, preservando foco e eventos; energia e ocorrências são atualizadas nos elementos existentes.
- **Mercado:** catálogo e índice de clubes reutilizados, com invalidação ao gravar alterações completas, carregar a carreira ou editar a base. A busca mantém somente as melhores 100 referências e copia os resultados no final, preservando a ordem dos empates. Necessidade por posição e critério de desempate das propostas são calculados uma vez por candidato.
- **Encerramento:** calendários reutilizados enquanto os participantes não mudarem. A interface simula um jogo por etapa e devolve o controle entre os jogos. O cursor `nextMatch` permite salvar uma rodada incompleta; a recuperação de energia acontece somente quando ela termina. O salvamento periódico continua a cada quatro rodadas completas e ao cancelar a preparação. A API que simula uma rodada inteira continua disponível para testes e outras integrações.

Os caches ficam fora do JSON e são liberados com os objetos. A simulação do encerramento continua na thread da interface, em pequenas etapas cooperativas; não foi introduzido um worker dependente de suporte adicional a arquivos locais no WebKit.

## Comparação após a implementação

Comparação direta com `.backups/before-optimizations-20261021-125309/`, em Node.js v24.22.0, sem profiler. A ordem das versões foi alternada entre as partidas. Os tempos da tabela são medianas; as buscas, consultas e gravações usaram 25 repetições após aquecimento.

| Operação | Antes / gravação completa | Depois / checkpoint |
| --- | --- | --- |
| Partida automática | 28,837 ms | 8,836 ms |
| Busca ampla de jogadores | 9,445 ms | 0,674 ms |
| Consulta repetida do catálogo | 3,794 ms | Menos de 0,001 ms, com catálogo já construído |
| JSON gravado durante a partida | 2.462.061 bytes | 79.959 bytes |
| Serialização e gravação em armazenamento simulado | 9,882 ms | 0,298 ms |

O conjunto de 120 partidas passou de 3.498,252 ms para 1.093,573 ms: **68,7% menos tempo**, com resultados, lances, estatísticas e elencos idênticos para as mesmas sementes. Mais 20 jogos de outras divisões produziram o mesmo estado ao comparar as rodadas completas antigas com as novas etapas por partida. O checkpoint foi **96,8% menor** que a gravação completa do mesmo estado de teste.

Esses valores medem cálculo, serialização e armazenamento em memória no Node. Não incluem o custo real de `localStorage`, renderização, abertura ou uso de memória do aplicativo GTK/WebKit. Não representam uma garantia de ganho igual na janela do jogo. Os resultados completos estão em [optimization-benchmark-results.json](optimization-benchmark-results.json).

## Verificação e reprodução

Todos os testes usaram clubes copiados e armazenamento isolado:

As verificações da interface nesta etapa usam um DOM simulado para conferir chamadas de renderização, referências dos botões e foco lógico; não substituem a conferência visual no WebKit.

- `node scripts/test-optimizations.cjs`: 13 grupos sobre saves antigos, retomada determinística, falhas de gravação e limpeza, checkpoint inválido, gravação única no intervalo, caches, pausa por falha, ordenação do mercado, abas sob demanda, preservação de botões/foco e rodadas incompletas com cancelamento/retomada.
- `node scripts/test-engine-v2.cjs`: 12 grupos e 3.072 partidas, incluindo quatro campeonatos, amistosos cobrindo 703 clubes e comparações de equilíbrio.
- `node scripts/test-career.cjs`: nove grupos, dez transições sintéticas e 3.040 partidas em duas temporadas consecutivas.
- Suítes de partidas ao vivo, táticas (11 grupos e 24 comparações), mercado/desempenho (oito grupos) e perfil (nove grupos): aprovadas.
- Verificação estática offline e sintaxe dos arquivos alterados: aprovadas. Os roteiros nativos foram adaptados para a revisão interna do save, para checkpoints e para abrir o histórico antes de verificar a tela; a execução visual permanece pendente na sessão gráfica.

Para repetir a comparação com o código anterior:

```bash
node scripts/benchmark-optimizations.cjs --baseline '.backups/before-optimizations-20261021-125309'
```

O comando verifica a equivalência das partidas e gera [optimization-benchmark-results.json](optimization-benchmark-results.json). O backup conserva os arquivos ativos anteriores à otimização.

## Cuidados preservados

- Caches devem ser invalidados em mudanças de características, instruções, elenco, formação e propriedade dos jogadores. Energia, moral, lesão e adaptação continuam influenciando os cálculos dinâmicos.
- A otimização do motor deve preservar resultados e estatísticas para a mesma sequência de números aleatórios, além das regras de lesões, cartões, substituições e táticas.
- Salvamento deve manter compatibilidade com as carreiras existentes e a recuperação das partidas. Uma gravação malsucedida não pode confirmar uma transferência ou troca de temporada.
- Processamento separado deve ser verificado no WebKit usado pelo aplicativo, com pausa e retomada testadas.
- Medir novamente depois de cada etapa; conferir a fluidez na sessão gráfica antes de afirmar ganho visual.

Uma próxima etapa pode medir abertura, memória e fluidez na sessão gráfica e avaliar o carregamento dos elencos sob demanda. As medições em Node não verificam o custo de gravação ou renderização do WebKit.
