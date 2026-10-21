# Motor de partidas — versão 2

O motor é próprio, probabilístico e executado inteiramente no computador. As fórmulas são decisões de balanceamento deste projeto; não reproduzem o código interno do Brasfoot original. Não utiliza serviços de inteligência artificial, APIs, dados em tempo real ou conexão de rede.

## Características e rendimento

A força continua sendo a base de cada jogador. A posição natural define sua aptidão para cada ação e cada característica compatível acrescenta 10% à habilidade correspondente.

| Habilidade | Características que ajudam | Uso |
| --- | --- | --- |
| Finalização | Finalização, Técnica, Força | Chutes, pênaltis e escolha do finalizador |
| Cabeceio | Cabeceio, Força | Cruzamentos e escanteios |
| Passe | Passe, Armação, Técnica | Construção das jogadas e acerto de passes |
| Criação | Armação, Passe, Cruzamento, Técnica | Escolha do jogador que inicia o ataque |
| Drible | Drible, Velocidade, Técnica | Superação da marcação em jogadas individuais |
| Marcação | Marcação, Desarme, Força | Interrupção das jogadas e força defensiva |
| Defesa do goleiro | Reflexo, Elasticidade, Saída de Gol | Chutes e pênaltis |

As habilidades são derivadas da força e das características já existentes na base. Não representam novas medições reais dos atletas. A escolha dos jogadores em cada lance é ponderada por função e habilidade; atacantes recebem mais oportunidades de chute, meias participam mais da criação e zagueiros ganham presença nas bolas aéreas.

O fator físico é `0,35 + 0,65 × energia / 100`. A moral varia de 40 a 110 e aplica o fator `0,85 + 0,15 × moral / 100`. Uma contusão durante a partida multiplica o rendimento por 0,55. Os fatores se acumulam.

Gols, assistências e resultados alteram a moral. Expulsões, lesões e pênaltis perdidos podem reduzi-la. A cada rodada a moral se aproxima um ponto de 100.

## Formação e função

As 11 formações usam vagas individuais de goleiro, zagueiro, lateral, meia e atacante. O campo da escalação e o motor usam a mesma distribuição. Os jogadores são distribuídos primeiro nas funções naturais; as vagas restantes recebem os melhores encaixes disponíveis. Uma substituição herda a função de quem saiu. Alterar a formação redistribui os jogadores que já estão em campo. [Instruções, planos rápidos e cobradores](TATICAS.md).

| Improvisação | Rendimento de posição |
| --- | --- |
| Zagueiro ↔ lateral | 88% |
| Defensor sem posição detalhada atuando de lateral | 96% |
| Lateral ↔ meia; meia ↔ atacante | 80% |
| Zagueiro ↔ meia | 74% |
| Lateral ↔ atacante | 62% |
| Zagueiro ↔ atacante | 52% |
| Goleiro na linha ou jogador de linha no gol | 18%, além da aptidão natural para a ação |

Atuar no lado oposto ao informado aplica mais um fator de 94%. Não há essa penalidade quando o lado não foi informado pela fonte. A interface identifica improvisações com adaptação abaixo de 90%; o percentual completo fica na descrição do jogador.

As forças dos setores combinam as habilidades dos jogadores efetivamente alocados, a ocupação das vagas, a inferioridade numérica, o esquema e o estilo. O mando aplica 5% ao time da casa, exceto em campo neutro. A prévia da escalação não inclui mando. Expulsões deixam vagas e reduzem os setores; uma alteração tática redistribui apenas os atletas restantes.

| Estilo | Ataque | Defesa | Desgaste básico por minuto na linha |
| --- | --- | --- | --- |
| Ofensivo | +15% | −12% | 0,26 ponto |
| Equilibrado | Padrão | Padrão | 0,21 ponto |
| Defensivo | −15% | +18% | 0,17 ponto |

O esquema também aplica modificadores por quantidade de defensores, meias e atacantes. O desgaste aumenta com o cansaço; o goleiro tem desgaste básico de 0,065 ponto. Só quem está em campo perde energia.

## Lances e estatísticas

Cada minuto calcula posse e circulação de passes, com acerto dependente do meio-campo e da defesa adversária. Faltas e ataques são sorteados separadamente. Nos ataques há escolha de criador, marcador e tipo de jogada — passe, drible ou cruzamento. A superação da marcação depende dos jogadores envolvidos e dos setores. O chute compara a habilidade do finalizador, a defesa e o goleiro. Há finalizações para fora, defesas, escanteios com disputa aérea, faltas diretas e pênaltis.

O xG é a soma das probabilidades de gol calculadas pelo próprio simulador antes de resolver cada finalização. Não é um modelo estatístico treinado em partidas reais. A precisão dos passes usa passes completados / tentados. As estatísticas são as mesmas ao acompanhar ao vivo ou avançar até o fim.

## Técnico adversário

- Antes da partida, escolhe titulares entre atletas disponíveis, considerando força, energia, moral e encaixe no esquema. Começa com estilo equilibrado.
- Tenta substituir lesionados e repor um goleiro expulso assim que possível. Para colocar um goleiro reserva, precisa retirar outro atleta e gastar uma substituição.
- A partir dos 55 minutos, compara reservas com titulares desgastados, improvisados ou amarelados, respeitando intervalo mínimo de oito minutos entre trocas de rotina.
- Reavalia a tática em intervalos de cinco minutos, com quinze minutos entre avaliações: procura mais ataque quando perde e mais defesa quando vence após os 70 minutos. Escolhe o esquema pela força dos setores dos jogadores em campo.
- Segue o limite de cinco substituições, sem reentrada de quem saiu e sem substituir um expulso.

O time do usuário recebe apenas as alterações comandadas pelo jogador. Os demais confrontos da rodada utilizam o mesmo motor, com os dois técnicos automáticos.

## Lesões, cartões e descanso

- Uma lesão reduz o rendimento na hora e afasta o atleta por uma, duas ou quatro rodadas seguintes. O risco aumenta com o desgaste. A previsão é uma regra do jogo.
- A cada três amarelos acumulados, o jogador recebe suspensão de um jogo e começa outro ciclo. O total histórico de amarelos continua visível.
- Segundo amarelo: expulsão e um jogo de suspensão. Vermelho direto: dois jogos. Punições recebidas na mesma partida usam o maior afastamento, sem somar o terceiro amarelo à expulsão.
- A rodada primeiro desconta afastamentos anteriores e depois aplica os novos. Assim, uma suspensão recebida hoje não desaparece antes de impedir a participação no próximo jogo.
- Suspensões só diminuem quando o clube disputa uma partida; lesões diminuem a cada rodada. Descanso recupera 27 pontos de energia para quem não jogou, 21 para quem jogou até 60 minutos e 18 para os demais, até 100.
- **Escalar melhores** exclui lesionados e suspensos. A escalação manual e o banco também bloqueiam a entrada de indisponíveis. Antes de começar um jogo, a interface pede a correção de titulares indisponíveis.
- A regra administrativa deste projeto encerra jogos quando um time fica com menos de sete atletas: derrota por ao menos 3 × 0; se ambos estiverem nessa situação, 0 × 0. Não é uma reprodução dos regulamentos de cada competição.

## Saves e funcionamento offline

Carreiras existentes continuam usando seus elencos e resultados. Uma partida antiga em andamento recebe os novos campos ao ser retomada, mantendo placar, minuto, alterações e eventos. As novas estatísticas de passes e xG começam nesse minuto e a interface informa isso. Não há recálculo de partidas encerradas.

O ciclo inicial de amarelos em jogadores de saves antigos usa o total já registrado, módulo três, sem impor suspensões retroativas por partidas concluídas. As novas ocorrências ficam no estado da partida até seu encerramento. Finalização e fechamento de rodada possuem guardas contra aplicação duplicada.

A carreira agora continua após a última rodada: o encerramento calcula as outras divisões, define acesso e rebaixamento e prepara o próximo ano no mesmo save. As regras de evolução anual, descanso e histórico estão em [TEMPORADAS.md](TEMPORADAS.md).

Partidas concluídas guardam a energia e as forças no apito final, para que o painel não mostre o descanso da rodada como se tivesse ocorrido em campo. Os jogos do usuário preservam todos os lances; os outros confrontos guardam os eventos decisivos e as estatísticas, reduzindo o tamanho do save local.

Os arquivos ativos incluem `src/engine/squad.js`, `src/engine/match.js`, `src/engine/league.js`, `src/engine/career.js`, `app.js`, `index.html` e `style.css`. O executável lê esses arquivos da pasta do projeto ao abrir; não é necessário recompilá-lo. As cópias anteriores estão em `.backups/before-engine-improvements/` e `.backups/before-season-continuity/`.

## Limites atuais

A simulação continua baseada em funções e probabilidades por minuto, sem deslocamento individual contínuo da bola e dos atletas. Não inclui impedimentos, arbitragem por posicionamento, acréscimos, prorrogação, treinamento individual ou modelos específicos de cada técnico.

A campanha inicial executou 12 grupos de regressão e 3.072 partidas, além dos testes da interface e da persistência no WebKit sem interfaces de rede. Ela verifica funcionamento e sensibilidade dos parâmetros; não estabelece equivalência estatística com futebol real. [Resultados e comandos](TESTES-MOTOR.md).
