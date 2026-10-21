# TV, patrocínios, orçamento e contratos

Implementado em **21/10/2026**. As três melhorias propostas após a aba Finanças estão disponíveis offline, sem recompilar o executável. Feche e reabra o jogo e carregue a carreira.

## Onde usar

- **Finanças → TV e patrocínio:** consultar a cota de TV e escolher uma das três propostas anuais.
- **Finanças → Orçamento da diretoria:** consultar verba de negociações e limite da folha; solicitar revisão após quatro rodadas.
- **Mercado → Contratos:** consultar vencimentos, renovar ou rescindir vínculos próprios, incluindo atletas cedidos por empréstimo.
- **Mercado → Sem clube:** contratar jogadores liberados durante a carreira, pagando luvas e salário, sem passe.
- **Mercado → Contratar:** compras definitivas agora incluem prazo, salário e luvas na própria negociação.

Os pagamentos imediatos e os termos aparecem antes da confirmação. Patrocínios, revisões e contratos só substituem a carreira aberta depois de uma gravação completa bem-sucedida. Uma partida aberta bloqueia essas operações.

## TV e patrocínios

Os valores são regras fictícias da simulação, definidos no início de cada ano conforme divisão e reputação. Não representam contratos comerciais reais. A base por rodada é:

| Divisão | TV | Patrocínio fixo de referência |
| --- | ---: | ---: |
| Série A | R$ 500.000 | R$ 300.000 |
| Série B | R$ 350.000 | R$ 250.000 |
| Série C | R$ 250.000 | R$ 160.000 |
| Série D | R$ 200.000 | R$ 130.000 |

As bases são multiplicadas por `0,88 + reputação × 0,12`, com reputação limitada a 1–5. A TV é automática. O patrocinador precisa ser escolhido na aba Finanças; nenhum é escolhido pelo jogador automaticamente.

| Proposta | Receita fixa por rodada | Bônus |
| --- | --- | --- |
| Horizonte Esportes | 100% da referência | Sem bônus |
| Rede Arquibancada | 85% da referência | 55% da referência por vitória |
| Impulso Brasil | 70% da referência | 12 vezes a referência se terminar entre os quatro primeiros |

Cada clube escolhe um patrocinador por ano. O acordo cobre a rodada atual ainda não concluída e as restantes; não paga entrada nem reconstrói receitas passadas. O bônus de colocação é proporcional ao número de rodadas cobertas pelo acordo e é creditado no ano concluído durante a transição anual.

TV, patrocínio fixo e bônus por vitória entram na mesma movimentação de cada rodada que registra bilheteria, salários e manutenção. O resultado real do jogo determina o bônus por vitória, em casa ou fora. Repetir a finalização não paga novamente. O bônus de colocação também tem identificação única no extrato.

A previsão de caixa inclui TV e patrocínio fixo contratado nas rodadas restantes. Não antecipa bônus por vitória ou colocação, premiação, nem negócios futuros. Ao iniciar outro ano, as cotas são recalculadas e novas propostas ficam disponíveis; o patrocínio anterior termina.

## Orçamento da diretoria

Há dois limites, pertencentes ao clube:

- **Negociações:** metade do caixa positivo no início do ano ou da atualização. Vendas e taxas de empréstimos recebidas ampliam a verba; passes, taxas pagas, luvas e rescisões consomem a verba. Salários, manutenção e obras continuam afetando o caixa, mas não essa verba de negociações.
- **Folha comprometida:** parte da folha existente, com margem de 15%, espaço para pelo menos o maior salário atual e um piso conforme a divisão. Considera os salários atuais e os contratos dos atletas cedidos por empréstimo, reservando seu retorno.

O negócio precisa caber no orçamento e no dinheiro efetivamente disponível. Um empréstimo recebido também ocupa espaço na folha. Uma renovação utiliza a diferença entre o salário novo e o já comprometido.

A revisão fica disponível após quatro rodadas desde a última definição. Pode elevar a verba disponível até metade do caixa atual e ampliar a margem salarial conforme a folha; não cria dinheiro nem reduz limites já concedidos. Os limites são recalculados no próximo ano. Receitas e despesas anteriores à inicialização do orçamento não são cobradas retroativamente contra sua verba.

## Contratos dos jogadores

`player.contract` guarda clube dono, início, término, salário contratado e ano da última assinatura/renovação. Os prazos negociados vão de uma a cinco temporadas, incluindo a atual. Um contrato de três temporadas assinado em 2026 termina ao fim de 2028.

| Operação | Condições mínimas |
| --- | --- |
| Compra definitiva | Salário atual, três temporadas sugeridas, luvas opcionais a partir de zero, além do passe |
| Contratação sem clube | Salário atual e quatro salários de luvas |
| Renovação | Reajuste de 5%, ou 10% com pelo menos cinco avaliações e média de 7,5; arredondamento para R$ 100; luvas de dois salários mínimos propostos |
| Rescisão | Até seis rodadas de salário, limitado ao prazo restante; manter 15 jogadores e um goleiro |

O prazo, salário e luvas podem ser ajustados na negociação, respeitando as exigências, o caixa e os limites da diretoria. A renovação não encurta o vínculo vigente. Cada atleta pode assinar ou renovar uma vez por ano no clube.

Atletas cedidos continuam com contrato do dono do passe. A renovação pode ser feita pelo dono durante o empréstimo; o destinatário paga o salário originalmente acordado até o retorno. Ao voltar, o atleta passa ao salário renovado. Atletas recebidos não podem ter o contrato renovado pelo destinatário. A rescisão de um atleta cedido aguarda o retorno.

Na virada do ano, os empréstimos retornam antes da evolução e da conferência de vencimentos. Contratos próprios não renovados liberam o jogador para `state.freeAgents`. A saída aparece no relatório de renovação do elenco. A formação de jovens acontece depois dessas saídas e mantém o elenco com pelo menos 18 jogadores e cobertura mínima por posição. Jovens também recebem contrato. Clubes controlados pela simulação renovam seus vínculos vencidos automaticamente, mantendo o salário; essa etapa não acrescenta uma economia completa para todos os clubes da IA.

Atletas sem clube envelhecem, evoluem/perdem força e se aposentam uma vez por ano. Não reaparecem no clube da base original e não podem pertencer simultaneamente a dois elencos. A lista começa vazia; recebe atletas liberados na carreira, sem criar um cadastro fictício de jogadores disponíveis.

## Saves existentes e registros

Os jogadores existentes recebem prazos determinísticos de duas a quatro temporadas, incluindo a atual, mantendo salários e dinheiro. Não há luvas de migração. O calendário e a partida em andamento são preservados. Contratos já existentes não são substituídos ao recarregar.

O clube recebe `team.economy` com ano, cotas, patrocínio escolhido e orçamento. `team.finances` continua guardando o extrato por clube, com as novas categorias de TV, patrocínio, bônus, luvas e rescisões. Tudo acompanha o JSON de save/exportação e os checkpoints preservam os clubes envolvidos na partida.

O técnico mantém seu histórico ao trocar de emprego; receitas, orçamento, contratos e dinheiro continuam no clube. Não foram modificados os saves reais do jogador durante o desenvolvimento. O tamanho dos estados de teste é registrado nos relatórios; a quota efetiva de armazenamento do WebKit não foi medida nesta etapa.

## Verificação e arquivos

`scripts/test-economy-contracts.cjs` passou em **15 grupos**, cobrindo migração sem cobranças, escolha de propostas, projeção, receitas sem duplicação, bônus proporcional na transição real da carreira, orçamento, reajustes, empréstimos, vencimentos, jovens, atletas sem clube, identidade única, termos negociados, recarga, interface lógica e falhas de gravação.

As suítes de finanças, mercado/desempenho, perfil, otimizações, táticas e as suítes completas do motor (3.072 partidas) e da carreira (3.040 partidas) também passaram após a integração. Os testes usam clubes copiados e armazenamento em memória. A estrutura HTML, a ordem de carga dos scripts e os recursos offline foram conferidos. O roteiro nativo foi ampliado; a conferência visual GTK/WebKit permanece pendente por restrição de acesso ao display.

Na análise dos 80 clubes da base inicial, mantendo caixa e salários originais, calendário inteiro e público central, 17 tiveram caixa final projetado negativo com TV e quatro com TV mais Horizonte Esportes. O modelo anterior tinha 71. A análise não considera premiações, bônus ou negócios futuros, nem representa o save do jogador. [Resultado reproduzível](economy-contracts-test-results.json).

Arquivos principais: `src/engine/economy.js`, `src/engine/contracts.js`, integração em `finance.js`, `market.js`, `career.js`, `app.js`, `index.html` e `style.css`.

Backup anterior: `.backups/before-sponsors-budgets-contracts-20261021-135744/`. Negociações parceladas permanecem como evolução futura.
