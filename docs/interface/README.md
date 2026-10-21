# Interface do Brasfoot

A referência principal desta revisão foi o próprio `brasfoot22-23.exe` fornecido no projeto. O instalador foi extraído em uma pasta temporária, e o programa original foi aberto somente para consulta visual. O aplicativo Linux continua usando HTML, CSS, JavaScript e GTK/WebKit, sem Java ou acesso à rede.

## Telas

- [Referência do programa original](referencia-original.png)
- [Menu inicial](menu.png)
- [Tela do clube no WebKit](time-webkit.png)
- [Escalação no WebKit](escalacao-webkit.png)

O menu usa a arte `aiconsj/tela_inicial.jpg` do instalador. O campo, o banco de reservas, as camisas e os ícones também vêm dos recursos originais já disponíveis no projeto.

A tela principal reúne barra de ícones, informações do clube, próximo jogo, perfil do jogador e tabela do elenco. A escalação é uma tela separada. As métricas da lateral refletem condição física e força disponíveis no motor atual.

O Editor do menu permite modificar nome, estádio e técnico dos clubes. As alterações são guardadas localmente. Os saves existentes mantêm a mesma chave de armazenamento e o mesmo formato de arquivo JSON.

## Verificações realizadas

- Navegação pelo menu, seleção de clube e edição de dados.
- Consulta de perfil sem alterar a escalação.
- Troca entre titular e reserva, formação e uniforme.
- Simulação de rodada, salvamento e carregamento.
- Agenda, tabelas, busca no mercado e preço de ingresso.
- Larguras de 1260, 768 e 390 pixels, com rolagem local nas tabelas.
- Capturas de 1260 × 840 no Chromium e no GTK4/WebKit6, sem exceções de JavaScript.

A interface anterior a esta revisão está em `.backups/interface-before-original-reference/`.

## Alterações durante a partida

A janela da partida agora tem um painel de comando ao lado da narração. A simulação avança minuto a minuto; o placar e as estatísticas mostram somente o que já aconteceu.

- **Pausar jogo / Continuar jogo:** interrompe ou retoma o relógio. O intervalo pausa automaticamente aos 45 minutos.
- **Velocidade:** 1×, 2× ou 4×.
- **Tática:** escolha formação e estilo e use **Aplicar tática**. Os jogadores em campo são mantidos; as forças são recalculadas para os minutos seguintes.
- **Substituição:** selecione um jogador em **Sai**, outro em **Entra**, confirme e retome o jogo. O limite é de cinco substituições. Jogadores que saíram ou foram expulsos não podem voltar.
- **Cartões, lesões e energia:** aparecem nos jogadores. Uma lesão ou expulsão do seu time pausa a partida para revisão.
- **Salvar:** o progresso é salvo a cada minuto e alteração. Ao carregar uma partida em andamento, ela abre pausada no minuto salvo.
- **Avançar para o fim:** simula os minutos restantes com a escalação e a tática atuais. Os resultados e as finanças da rodada são processados uma única vez, ao terminar.

[Partida no WebKit](partida-webkit.png) · [Intervalo](partida-intervalo.png) · [Tela estreita](partida-mobile.png)

Verificação do motor: `node scripts/test-live-match.cjs`. Também foram verificados no navegador os controles, o relógio, as alterações em casa e fora, o save durante a partida e o fechamento da rodada sem duplicação de pagamentos.

## Consulta de outros clubes

A barra superior tem uma aba **Times**, separada de **Meu time**. A coluna esquerda reúne país, liga/divisão, busca e lista de clubes. O painel do clube mostra escudo, uniformes, técnico, estádio, formação, folha salarial e elenco. Selecionar uma linha do elenco abre a ficha do jogador sem mudar a escalação.

- **País:** os 134 países presentes na base original, ou todos os países para pesquisar entre os 703 clubes.
- **Liga / divisão:** as Séries A–D configuradas no jogo e os demais clubes brasileiros. Os outros países permitem consultar os clubes disponíveis na base local, com origem e data de cada elenco.
- **Temporada atual:** os clubes participantes usam os mesmos objetos da liga em andamento, incluindo elenco, condição física, estatísticas e classificação. Os clubes de fora da liga mostram o elenco importado e a data de coleta; os que não possuem atualização suficiente são identificados como base 22/23.
- **Atalhos:** seu clube, próximo adversário e nomes dos clubes na classificação.
- **Teclado:** as setas percorrem clubes e jogadores; Enter seleciona a ficha.
- **Offline:** nomes dos países extraídos de `arquivos/default_lang.xml` e bandeiras de `aflags` do instalador original, distribuídos em `data/countries_data.js` e `assets/flags`.

[Prévia da aba Times no WebKit](times-webkit.png) · [Tela estreita](times-mobile.png)

Cópia da interface anterior: `.backups/before-club-browser/`.

## Elencos públicos de 2026

A seleção de novo jogo informa a data e a cobertura da base. Os cartões dos clubes e a aba Times distinguem elencos atuais de base antiga. A ficha exibe camisa e nacionalidade quando disponíveis. Idade e lado ausentes aparecem como não informados; defensores sem posição detalhada aparecem como D / Defensor.

[Prévia com o elenco atualizado](elenco-atualizado-webkit.png) · [Critérios e fontes](../ELENCOS.md).
