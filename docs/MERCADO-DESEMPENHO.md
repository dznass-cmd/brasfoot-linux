# Mercado e desempenho

As abas **Mercado** e **Desempenho** ficam ao lado de **Meu time** na barra superior. Funcionam offline no mesmo save da carreira.

## Negociar jogadores

No **Mercado**, use os menus:

- **Contratar:** pesquise jogadores dos 703 clubes por nome, posição e força. Escolha **Comprar** ou **Empréstimo**, confira os termos e informe o valor.
- **Negociar meu elenco:** escolha **Vender** ou **Emprestar**, selecione o clube de destino e o valor desejado.
- **Propostas:** analise os convites de clubes interessados nos seus atletas. Aceite pela tela de confirmação ou recuse. As decisões continuam gravadas ao carregar a carreira.
- **Empréstimos:** consulte atletas recebidos e cedidos, com origem, destino, taxa e ano de retorno.
- **Negociações:** consulte as transferências, os empréstimos e os retornos concluídos pelo clube.

O passe só muda de clube numa transferência definitiva. No empréstimo, o atleta joga no destino até o encerramento da temporada atual. O destino paga a taxa uma vez e assume o salário integral acordado enquanto o jogador está em seu elenco. Ao iniciar o ano seguinte, ele volta ao dono do passe antes do envelhecimento e da renovação dos elencos. O retorno não cobra outra taxa. O dono pode renovar durante a cessão; o reajuste passa a valer após o retorno.

Compras também negociam duração, salário e luvas, sujeitas ao caixa e ao orçamento da diretoria. As novas opções **Contratos** e **Sem clube** permitem renovar, rescindir e contratar atletas liberados durante a carreira. [Condições, vencimentos e persistência](ECONOMIA-CONTRATOS.md).

Compras, vendas e taxas de empréstimo também são lançadas no extrato dos dois clubes, disponível na aba [Finanças](FINANCAS.md). A negociação continua sendo confirmada somente depois de salvar a nova carreira.

O preço de referência da compra é o valor do passe; o vendedor exige pelo menos 95% dele. A taxa de referência de um empréstimo é 8% do passe. Ao vender ou emprestar, o limite aceito pela outra diretoria considera o valor de referência e o desempenho do atleta. A confirmação informa qualquer recusa ou falta de saldo.

O clube de origem precisa conservar pelo menos 15 atletas e um goleiro. Um jogador já emprestado não pode ser revendido ou emprestado novamente. Negociações ficam bloqueadas enquanto uma partida estiver aberta, inclusive no placar final: clique em **Continuar** para fechá-la.

Cada atleta continua em um único elenco. Os clubes de fora das quatro divisões que participarem de negócios passam a ter seus elencos e saldos preservados no save. A transferência só substitui a carreira aberta depois que a gravação funciona.

## Interesse de outros clubes

A avaliação começa após a terceira rodada. O interesse é ocasional, com intervalo mínimo de três rodadas entre propostas e até três pendentes. A decisão é estável por rodada: recarregar ou abrir a aba novamente não cria novos convites.

Compradores priorizam jogadores com pelo menos duas partidas. Nota recente, média, gols, assistências e prêmios de craque influenciam o interesse e o preço. Propostas de empréstimo procuram atletas de até 25 anos com poucos jogos. As diretorias compradoras também consideram a necessidade da posição e a disponibilidade de dinheiro.

O contador da aba **Mercado** indica propostas pendentes. Elas expiram após o prazo mostrado, na virada do ano, se o jogador sair ou se o técnico mudar de clube. Ofertas por um atleta são encerradas quando ele é negociado. O histórico recente guarda também recusas e expirações.

Essas regras são estimativas de jogabilidade. Os valores e interesses não representam contratos ou intenções reais dos clubes.

## Avaliações dos jogadores

Em **Desempenho → Jogadores**, a tabela reúne jogos, minutos avaliados, gols, assistências, nota média, últimas cinco notas e quantidade de prêmios de craque. Filtre pela posição ou ordene por média, forma, gols, assistências, minutos ou destaques. Clique no nome para ver as atuações recentes e adversários.

As notas vão de 1 a 10. A avaliação parte de 6 e considera gols, assistências, finalizações, defesas, desarmes, resultado, cartões e partidas sem sofrer gols para goleiros e defensores que jogaram pelo menos 60 minutos. Quem não entra em campo fica sem nota. O maior desempenho recebe o prêmio de craque; empates usam gols, assistências, minutos e identificador do jogador. Partidas encerradas por insuficiência de atletas não concedem o prêmio.

Em **Destaques por jogo**, escolha a temporada e a partida. A tela mostra o craque, o placar e as notas e ações dos jogadores dos dois clubes. O resultado final ao vivo também informa o destaque. Os relatórios mantêm o nome e a atuação mesmo depois de o jogador sair do clube.

O ano novo reinicia as avaliações individuais. Os relatórios da temporada atual e das duas anteriores ficam disponíveis, limitando o crescimento dos saves. As estatísticas e os títulos gerais da carreira seguem no histórico existente.

## Saves anteriores

Carregue normalmente. Elencos, resultados, dinheiro e carreira continuam disponíveis. As notas começam nas partidas que forem finalizadas com esta versão; jogos antigos sem os registros individuais necessários aparecem com o placar e a indicação de avaliação indisponível. O jogo não inventa notas para essas partidas.

## Verificação

```bash
node scripts/test-market-performance.cjs
node scripts/test-live-match.cjs
node scripts/test-career.cjs
node scripts/test-manager-profile.cjs
node scripts/test-engine-v2.cjs
python3 scripts/check-offline.py
```

Os testes usam cópias dos clubes e armazenamento isolado. Cobrem propriedade única dos jogadores, dinheiro, negócios com clubes externos, salários, retorno e envelhecimento dos emprestados, propostas por desempenho, recusas, expiração, notas, craque, save durante uma partida, arquivos de atuações e falha de gravação.
