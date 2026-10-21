# Mais opções táticas

Abra **Escalar time → Instruções do time**. As escolhas são guardadas na carreira e usadas pelo motor nos jogos seguintes. Durante uma partida, abra **Instruções e bolas paradas**, no painel de comando; use **Aplicar tática** e retome o relógio. Continuar a partida também aplica uma alteração pendente.

## Formações

As seis formações anteriores permanecem disponíveis: 4-4-2, 4-3-3, 3-5-2, 4-5-1, 4-2-3-1 e 3-4-3. Foram acrescentadas:

- **5-3-2:** três zagueiros, dois laterais, três meias e dois atacantes.
- **5-4-1:** cinco defensores e quatro meias protegendo um atacante.
- **4-1-4-1:** um meia recuado e uma linha de quatro à frente; reforça a proteção e o meio, reduzindo um pouco o ataque.
- **4-4-2 diamante:** um meia recuado, dois pelos lados e um avançado; ganha presença central e ofensiva, com menor proteção defensiva.
- **4-3-2-1:** três meias na base, dois avançados e um atacante; concentra a construção no meio.

Todas têm 11 vagas compartilhadas pela escalação e pelo motor. Antes do jogo, mudar a formação reescala os melhores jogadores disponíveis. Durante a partida, a mudança redistribui os atletas que já estão em campo, sem fazer substituições.

## Instruções

| Controle | Opções | Efeito |
| --- | --- | --- |
| Passes | Mistos, curtos, diretos | Curtos aumentam circulação e precisão; diretos reduzem passes e precisão, mas aumentam a presença ofensiva. |
| Direção do ataque | Variada, meio, pontas, esquerda, direita | Altera a escolha dos criadores conforme a função e o lado; atacar pelos lados aumenta a frequência de cruzamentos. |
| Ritmo | Cadenciado, normal, rápido | Afeta a frequência dos ataques, a precisão e o gasto de energia. |
| Pressão | Baixa, média, alta | Pressão alta fortalece disputas no meio e dificulta os passes rivais, com mais desgaste e faltas. A baixa preserva energia e recua a disputa. |
| Linha defensiva | Recuada, normal, adiantada | Recuar melhora a proteção e reduz a presença no meio e ataque. Adiantar comprime o espaço, mas abre risco para passes diretos e contra-ataques. |
| Entradas | Cautelosas, normais, firmes | Entradas firmes melhoram a disputa pelo desarme, com mais faltas e cartões. Cautelosas reduzem esses riscos e a força do bote. |
| Transição | Equilibrada, contra-ataque, conservar a bola | Contra-ataques cedem posse e buscam chances rápidas, especialmente contra adversários ofensivos ou adiantados. Conservar aumenta circulação e precisão, reduzindo o ritmo ofensivo. |

As instruções se combinam com o estilo ofensivo, equilibrado ou defensivo e com as características, energia, moral e posição dos atletas. O resumo da escalação informa o multiplicador de desgaste das instruções. Nenhuma configuração garante vitória; mais ritmo e pressão podem prejudicar o rendimento depois pelo cansaço.

A linha adiantada representa disputa territorial e risco de espaço nas costas. Esta alteração não acrescenta a regra de impedimento ao simulador.

## Planos rápidos

Estão disponíveis **Equilibrado**, **Posse de bola**, **Contra-ataque**, **Pressão alta**, **Bola aérea** e **Segurar resultado**. Antes do jogo, **Aplicar plano** grava o estilo e as instruções. A formação e os titulares permanecem os escolhidos pelo técnico.

Durante o jogo, **Usar plano** preenche os controles e deixa as alterações prontas para **Aplicar tática**. O relógio pausa para a decisão. Os novos parâmetros valem para os próximos minutos; placar, eventos e participações anteriores são preservados.

## Bolas paradas

Escolha os cobradores de **pênaltis**, **faltas diretas** e **escanteios**, ou deixe **Automático**. O atleta escolhido só cobra se estiver em campo. Se estiver no banco, lesionado, suspenso, expulso, substituído ou tiver saído do clube, o motor usa outro cobrador disponível.

A finalização influencia pênaltis e faltas diretas. A criação e as características de cruzamento influenciam a qualidade dos escanteios. O cobrador de um cruzamento não pode ser o próprio cabeceador.

## Adversários e saves

Os técnicos automáticos também usam as novas formações e instruções. A partir das avaliações táticas habituais, buscam pressão alta quando estão perdendo e com energia suficiente, abrem as jogadas quando cansados e reduzem o ritmo para proteger uma vantagem nos minutos finais.

Partidas antigas recebem instruções neutras ao carregar, preservando minuto, placar, atletas e eventos. Instruções, cobradores e alterações durante uma partida continuam no JSON salvo e exportado. O aplicativo permanece offline.

## Verificação

```bash
node scripts/test-tactics.cjs
node scripts/test-live-match.cjs
node scripts/test-engine-v2.cjs
node scripts/test-market-performance.cjs
node scripts/test-manager-profile.cjs
node scripts/test-career.cjs --quick
python3 scripts/check-offline.py
```

Os testes específicos verificam as 11 formações no motor e no campo, passes, desgaste, faltas e cartões, ataque por lado, contra-ataques, os três tipos de cobrador, alteração durante o jogo, retomada de save, migração e falha de gravação. São utilizados clubes copiados e armazenamento isolado.
