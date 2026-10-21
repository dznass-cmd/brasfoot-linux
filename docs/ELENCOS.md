# Atualização dos elencos

A base do jogo inclui uma cópia local de listas públicas de jogadores consultadas em **21/10/2026**. A importação mantém os identificadores dos 703 clubes, escudos e referências usadas pelos saves.

## Cobertura da coleta

- **486 de 703 clubes** com elencos atuais importados; **15.585 jogadores**.
- **435 clubes** pela ESPN e **51** pelo oGol.
- **217 clubes** identificados como base 22/23, com o motivo no relatório.
- **79 de 80 clubes** das divisões configuradas no projeto possuem listas atuais. O Brasil de Pelotas mantém a base anterior: a página pública encontrada tinha elenco insuficiente, e as demais listas não permitiram confirmar a temporada atual.

| Divisão configurada | Elencos atualizados |
| --- | --- |
| Brasileirão Série A | 20 / 20 |
| Brasileirão Série B | 20 / 20 |
| Brasileirão Série C | 19 / 20 |
| Brasileirão Série D | 20 / 20 |

## Fontes

- **ESPN:** [elenco do Flamengo](https://www.espn.com.br/futebol/time/elenco/_/id/819/flamengo), [Palmeiras](https://www.espn.com.br/futebol/time/elenco/_/id/2029/palmeiras) e os demais clubes identificados no relatório. A coleta usa as respostas JSON públicas do mesmo serviço de futebol.
- **oGol:** [diretório de clubes](https://www.ogol.com.br/equipes/futebol), com consulta à temporada selecionada na página de elenco. Complementa a cobertura de clubes fora das competições disponíveis na ESPN.

Seis elencos foram transcritos das páginas públicas de elenco consultadas pelo navegador de pesquisa porque o acesso HTML direto redirecionava para outra equipe. Esses registros, com fonte e data, estão em `data/sources/public-page-rosters-2026-10-21.json`. Quando o identificador público do jogador não estava disponível, foi criada uma chave local estável; `sourceId` fica vazio nesses casos.

Cada clube importado registra o provedor, o endereço da lista, o nome e o identificador na fonte, a temporada e a data da coleta. A cópia compactada dos dados públicos fica em `data/sources/public-rosters-2026-10-21.json.gz`; o relatório por clube está em `data/roster-update.json` e na planilha `data/roster-update.csv`.

## Como os dados são usados

| Informação | Origem |
| --- | --- |
| Nome, clube, posição geral, idade e camisa | Lista pública do elenco |
| Nascimento e nacionalidade | Fonte pública, quando disponíveis |
| Participação na temporada atual | Listagem da competição ou partidas datadas; no oGol, temporada do elenco selecionada |
| Força, características, lado, salário e passe | Atributos de simulação; valores estimados para o jogo |
| Técnico, estádio e estrutura das ligas | Cadastro do projeto |
| Gols, jogos, assistências e cartões exibidos na temporada | Partidas disputadas dentro do jogo |

Os atributos de jogadores reconhecidos com nome e idade compatíveis aproveitam as estimativas existentes. Para novos jogadores, as estimativas seguem uma fórmula determinística baseada no nível do clube, idade e participação disponível na fonte. Salários e passes não representam valores contratuais reais.

A ESPN e o oGol frequentemente classificam defensores apenas como **D**. O motor os representa internamente na defesa; a interface mostra **D / Defensor** quando não há detalhe para afirmar lateral ou zagueiro. O lado desconhecido e idades ausentes aparecem como **não informado / —**. O valor interno de idade usado nesses casos serve apenas à simulação.

As estatísticas públicas auxiliares ficam separadas em `sourceStats`. Novas carreiras começam com os contadores de jogo zerados. A lista de um clube só substitui o elenco antigo quando tem ao menos 15 jogadores identificados e um goleiro. Não são acrescentados jogadores fictícios para preencher uma lista incompleta. Filiações conflitantes dentro da mesma fonte são registradas no relatório e excluídas das listas importadas.

O cabeçalho “2026” de uma resposta não basta para aceitar um elenco: alguns serviços retornam listas históricas nesse contexto. A coleta exige evidência de participação atual na competição ou jogos datados. As páginas do oGol exigem a temporada correspondente selecionada.

## Uso no jogo e saves

Reabra o aplicativo e crie um **Novo jogo** para começar com a base atualizada e a temporada 2026. Os elencos e o progresso já gravados na liga de um save continuam associados àquela carreira. A atualização não grava no armazenamento local do jogador.

A seleção de clubes e a aba **Times** mostram a origem da base. Clubes sem lista atual suficiente são identificados como **Base antiga / 22–23**. O relatório apresenta a cobertura exata e o motivo de cada elenco mantido.

O jogo continua funcionando **100% offline**. Nomes, elencos, metadados, escudos, bandeiras e camisas são arquivos locais. Consultar os clubes e jogar não faz requisições aos provedores.

## Reproduzir a importação sem internet

```bash
python3 scripts/update-rosters.py --snapshot data/sources/public-rosters-2026-10-21.json.gz --apply
```

A base original usada para estimar atributos e manter os clubes sem cobertura está em `data/sources/legacy-teams-22-23.json.gz`. Uma cópia anterior à atualização está em `.backups/before-roster-update-2026-10-21/`.

## Fazer uma nova coleta

Este comando de manutenção acessa a internet explicitamente; ele não é executado pelo aplicativo:

```bash
python3 scripts/update-rosters.py --download --year 2026 --apply
```

`data/sources/club-source-map.json` relaciona os identificadores dos clubes às fontes e às competições consultadas. Para outra temporada, atualize os endereços de temporada fixos do oGol nesse arquivo. Uma falha de consulta preserva a última lista pública já coletada, com sua data original.
