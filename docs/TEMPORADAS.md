# Continuidade das temporadas

A carreira continua no mesmo save após o campeonato. A implementação cobre as quatro divisões brasileiras configuradas no projeto, com 20 clubes por divisão e 38 rodadas. Os demais clubes da base continuam disponíveis para consulta e mercado; seus campeonatos não fazem parte deste ciclo de temporadas.

## Como passar para o próximo ano

1. Termine a última rodada e clique em **Continuar** para fechar o placar.
2. Clique em **Encerrar temporada** na lateral. O botão **Jogar** da escalação também passa a abrir esse encerramento.
3. Aguarde a preparação dos campeonatos. A tela mostra o progresso; é possível voltar e retomar depois.
4. Confira campeões, premiação, acessos e rebaixamentos. Clique em **Iniciar temporada** para continuar no ano seguinte.

O ano avança, outro calendário é criado e o clube permanece com o mesmo técnico, estádio, caixa e jogadores com contrato em vigor que não se aposentaram. Contratos próprios vencidos liberam o atleta para a lista Sem clube antes da formação de jovens. O valor da premiação e eventual bônus de colocação do patrocinador é acrescentado ao saldo existente. [Regras dos contratos e receitas](ECONOMIA-CONTRATOS.md).

A premiação passa a aparecer no extrato de [Finanças](FINANCAS.md) do ano concluído, quando o crédito é aplicado ao iniciar o ano seguinte. A abertura financeira do novo ano preserva esse saldo, sem creditar o prêmio novamente.

O histórico fica em **Classificação → Histórico**, com posição e campanha do clube, campeões das quatro divisões, tabelas finais, jogos do clube e renovação do elenco.

## Saves existentes

Reabra o jogo e carregue a carreira normalmente. A migração mantém o elenco da sua divisão, as contratações presentes nesse elenco, o saldo, as partidas, o ano e uma eventual partida em andamento. Também atende saves que já chegaram ao fim das 38 rodadas.

As outras divisões, que não existiam no save antigo, são inicializadas a partir da base local. Jogadores que já pertencem à divisão salva são retirados das cópias de seus clubes de origem, evitando reaparecimento após uma contratação. Os clubes das quatro divisões passam a ser preservados no save.

Nenhum resultado da sua liga é recalculado. As outras três divisões são simuladas ao encerrar o ano, usando o mesmo motor das partidas ao vivo. O encerramento guarda o progresso a cada quatro rodadas simuladas e ao fechar a tela; sua retomada continua desse ponto.

A interface agora processa uma partida por etapa e devolve o controle entre os jogos. O save pode guardar uma rodada incompleta em `nextMatch`, sem repetir os confrontos já feitos. Energia e suspensões são recuperadas uma vez ao completar a rodada. Os calendários são reutilizados enquanto os participantes não mudarem. [Otimizações e verificações](OTIMIZACOES.md).

## Acesso e rebaixamento

As movimentações usam as classificações finais antes de qualquer troca de clube:

| Divisão | Acesso | Rebaixamento |
| --- | --- | --- |
| A | — | Quatro últimos para B |
| B | Quatro primeiros para A | Quatro últimos para C |
| C | Quatro primeiros para B | Quatro últimos para D |
| D | Quatro primeiros para C | Permanece como última divisão |

Cada divisão continua com 20 clubes. O clube do usuário recebe o calendário e os adversários da divisão em que estará no novo ano. A aba **Times** e as zonas da classificação acompanham essa composição.

Essas são as regras simplificadas configuradas neste projeto. Não reproduzem todos os formatos e regulamentos reais das competições. As zonas continentais da Série A continuam sendo indicações na tabela; esta alteração não implementa Libertadores ou Sul-Americana.

## Atualização anual dos atletas

- Idades conhecidas aumentam um ano. Para idade não informada pela fonte, uma idade interna da simulação permite evolução e aposentadoria; a interface continua indicando que a idade pública não foi informada.
- Até 22 anos, o atleta ganha de um a três pontos de força. Dos 23 aos 28 anos, quem disputou pelo menos dez jogos tem 45% de chance de ganhar um ponto.
- A partir de 32 anos na linha e 35 no gol, há 65% de chance de perder um ou dois pontos por ano. A força tem piso 15 e teto normal 75; valores previamente editados acima desse teto são respeitados.
- Aposentadorias podem começar aos 39 anos na linha e 42 no gol. O limite é 43 e 46 anos, respectivamente.
- Cada elenco conserva pelo menos 18 jogadores, com cobertura mínima por posição. Jovens fictícios de 17 a 20 anos completam as vagas e são identificados como atletas da base. Eles não são apresentados como jogadores reais ou novas informações públicas.
- Gols, assistências, jogos e cartões da temporada voltam a zero. Os totais anteriores são acumulados nos dados de carreira do jogador e os destaques ficam no histórico anual.
- A energia volta a 100, a moral se aproxima de 100 e as férias descontam quatro rodadas de contusão. Suspensões restantes continuam valendo no ano seguinte. O ciclo de amarelos é reiniciado.

As mudanças de força e os jovens são regras de jogabilidade, não projeções reais sobre os atletas. O relatório de renovação registra aposentados, promovidos, evoluções e perdas de força.

## Premiação e preservação

A premiação máxima é de R$ 20 milhões na A, R$ 6 milhões na B, R$ 2 milhões na C e R$ 800 mil na D. O campeão recebe o máximo; a quantia cai conforme a colocação, até 25% desse valor para o último. São valores definidos para a economia do jogo.

A passagem de ano constrói uma cópia do estado e grava essa cópia antes de substituir a carreira aberta. Se a gravação falhar, o último save continua disponível. A operação rejeita temporadas incompletas, movimentações inconsistentes e tentativas de avançar duas vezes. Caixa, premiação e envelhecimento são aplicados uma vez por transição.

O histórico guarda classificações, campeões, artilheiros e os 1.520 resultados das quatro divisões em formato compacto. Comentários rotineiros dos jogos de outros clubes são descartados ao gravar esses confrontos; placares, estatísticas e ocorrências de gols, cartões e lesões permanecem. Isso reduz o tamanho dos saves de carreiras longas.

## Verificação executada

- Nove grupos de regressão: migração com partida ao vivo, propriedade dos jogadores contratados, bloqueio de encerramento antecipado, retomada do fechamento, acesso/rebaixamento em todas as divisões, evolução e aposentadoria, consistência dos clubes e gravação antes da troca de estado.
- Dez transições anuais com classificações controladas, verificando 80 clubes, identidades dos jogadores, histórico e calendários.
- Duas temporadas consecutivas totalmente simuladas: **2026 → 2027 → 2028**, com **3.040 partidas** nas quatro divisões. Na execução após as otimizações, a carreira passou da A para a B e voltou para a A na temporada seguinte.
- Aplicativo nativo sem interfaces de rede: carregamento de save antigo, interrupção e retomada do encerramento, avanço de ano, idade, premiação, histórico, proteção contra avanço duplicado, início de jogo no ano seguinte, recarga desse jogo e exportação.
- A suíte de partidas ao vivo e a verificação offline anterior também passaram após a integração.

Resultados detalhados: [career-test-results.json](career-test-results.json). Na execução após Finanças, o JSON da carreira ficou com aproximadamente 4,25 MB antes da primeira transição e 4,83 MB antes da segunda; os novos anos iniciaram com aproximadamente 3,10 MB e 3,24 MB. Esses tamanhos não medem o limite de armazenamento do WebKit.

Para repetir na pasta do projeto:

```bash
node scripts/test-career.cjs --quick
node scripts/test-career.cjs
./scripts/test-career.sh
node scripts/test-live-match.cjs
./scripts/test-offline.sh
```

O segundo comando gera o save antigo temporário usado no teste nativo. Todos esses testes usam dados copiados e armazenamento isolado, sem modificar os saves do jogador. A cópia do código anterior está em `.backups/before-season-continuity/`.
