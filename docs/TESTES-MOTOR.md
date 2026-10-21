# Verificação do motor 2

Campanha executada em 21/10/2026 com Node.js 24.22.0 e o WebKitGTK instalado no computador. Os testes usam cópias dos clubes e armazenamento isolado; os saves do jogador não foram modificados.

## Resultado

- Sintaxe de `app.js`, dos motores e dos novos scripts de teste: aprovada.
- Suíte anterior de partidas ao vivo: aprovada, incluindo substituições, limite de cinco trocas, expulsões, energia, intervalo, retomada determinística e finalização idempotente.
- Nova suíte: **12 grupos de regressão aprovados**, cobrindo características, encaixe das seis formações, indisponibilidade, três amarelos, expulsões, lesões de uma/duas/quatro rodadas, descanso, decisões da IA, reposição de goleiro, migração de save antigo, mando, campo neutro, encerramento administrativo e pênaltis.
- **1.520 partidas** nas quatro temporadas completas de 38 rodadas: classificação, estatísticas, ausências e fechamento único da rodada aprovados. O teste usa a função real `app.finalizeRound` e as regras de finanças e recuperação.
- **352 amistosos** cobrindo os **703 clubes** da base: todos concluídos, sem resultados administrativos por falta de atletas.
- **1.200 partidas** em cenários controlados de força, energia e mando: efeitos na direção esperada.
- Aplicativo nativo em namespace sem interfaces IPv4/IPv6: imagens, áudio, mercado, tabela, importação, exportação e retomada em outro processo aprovados. Também foram conferidos bloqueio de titular indisponível, força efetiva, adaptação, tática adversária, xG e energia no apito final.
- Uma temporada completa da Série A foi gravada no armazenamento local, recarregada e exportada no WebKit isolado: **380 resultados preservados**, save compacto de 2.811.417 bytes e exportação formatada de 5.194.071 bytes.

## Problema encontrado e corrigido

Um gol sem assistência criava a propriedade `assist` com valor `undefined`. A serialização JSON removia essa propriedade, fazendo o histórico em memória divergir do histórico recuperado. Os campos opcionais do evento de gol agora usam `null`, preservando a estrutura ao salvar e carregar. A suíte que detectou o problema foi executada novamente e passou.

## Temporadas simuladas

| Divisão configurada | Jogos | Gols | Gols/jogo | xG/jogo | Lesões | Amarelos | Expulsões |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Série A | 380 | 1.262 | 3,321 | 3,225 | 141 | 1.531 | 163 |
| Série B | 380 | 1.214 | 3,195 | 3,259 | 129 | 1.404 | 147 |
| Série C | 380 | 1.177 | 3,097 | 3,076 | 133 | 1.476 | 150 |
| Série D | 380 | 1.166 | 3,068 | 3,044 | 141 | 1.412 | 140 |

Esses números são resultados do simulador. Não foram comparados com dados reais das competições. Não houve encerramentos por insuficiência de jogadores nessas temporadas.

## Cenários de sensibilidade

Cada cenário contém 300 jogos entre elencos sintéticos de mesma composição, com as mesmas sementes iniciais por partida. Os resultados abaixo descrevem a primeira equipe / empate / segunda equipe.

| Cenário | Vitórias / empates / derrotas | Gols |
| --- | ---: | ---: |
| Força 50 × 50, campo neutro | 120 / 65 / 115 | 524 × 499 |
| Força 60 × 35, campo neutro | 281 / 17 / 2 | 1.314 × 124 |
| Força 50 × 50, energia 45% × 100%, campo neutro | 10 / 14 / 276 | 141 × 1.049 |
| Força 50 × 50, primeira equipe mandante | 135 / 63 / 102 | 549 × 452 |

Força e cansaço têm efeitos acentuados nos cenários extremos. A campanha confirma esses efeitos e a integridade da simulação; o ajuste fino da dificuldade continua sendo uma decisão de jogabilidade.

## Repetir a campanha

Na pasta do projeto:

```bash
node --check app.js
node --check src/engine/match.js
node --check src/engine/squad.js
node scripts/test-live-match.cjs
node scripts/test-engine-v2.cjs
./scripts/test-offline.sh
./scripts/test-season-save.sh
```

`test-engine-v2.cjs` grava os resultados detalhados em [engine-test-results.json](engine-test-results.json) e gera a temporada temporária `/tmp/brasfoot-engine-season-BRA_A.json`, usada pelo último comando. A campanha usa a semente 20261021 para temporadas e amistosos, e sementes 1337 a 1636 em cada cenário controlado.

Os testes nativos criam seus próprios diretórios temporários de dados e cache e os removem ao terminar. A verificação offline requer as ferramentas de compilação e as bibliotecas de desenvolvimento descritas em [OFFLINE.md](OFFLINE.md).
