# Funcionamento offline

Execute `./brasfoot` ou `./brasfoot-app`. A primeira abertura e todas as partidas usam os arquivos distribuídos na própria pasta. O jogo funciona sem servidor, conta online, cache prévio ou instalação de pacotes durante a execução.

O executável abre `index.html` por `file://`. Os clubes, ligas, motores, imagens e efeitos sonoros são locais. A interface bloqueia conexões de rede; o WebKit também filtra recursos externos e navegação para endereços remotos.

A atualização de elencos usa uma cópia pública baixada durante a manutenção. Os dados já importados ficam em `data/teams_data.js`, com versão e cobertura em `data/database_info.js`; iniciar carreiras e consultar jogadores não requer conexão. [Fontes e cobertura](ELENCOS.md).

A aba **Times** também usa somente arquivos locais: os nomes dos 134 países estão em `data/countries_data.js` e as bandeiras originais em `assets/flags`. Ela consulta todos os 703 clubes, as divisões brasileiras configuradas e o estado atual dos clubes da sua temporada, sem buscar informações na internet.

A continuidade das temporadas também é local. O módulo `src/engine/career.js` mantém os clubes das quatro divisões, encerra os campeonatos, atualiza jogadores e gera os novos calendários. Saves anteriores são adaptados sem precisar iniciar outra carreira. [Regras e verificação da continuidade](TEMPORADAS.md).

Os saves e as alterações do Editor ficam no armazenamento local do aplicativo. A exportação gera um arquivo JSON local, e a importação lê um arquivo escolhido no computador. A exportação padrão do aplicativo nativo vai para a pasta Downloads.

A pasta contém os 703 escudos originais. Há 336 primeiros uniformes e 334 segundos uniformes originais; os demais usam camisas genéricas incluídas no jogo. O inventário `data/assets_data.js` garante a escolha de uma imagem local existente. Os nomes de arquivos com codificação antiga foram normalizados para UTF-8.

O acesso somente para leitura à pasta `assets/sons` permite reproduzir os WAV originais dentro do processo do WebKit. O aplicativo usa as bibliotecas GTK4, WebKitGTK6 e de áudio já instaladas no sistema.

`src/server.js` e `src/public` pertencem à versão antiga do projeto e não são carregados pelo executável ou pelo `index.html` principal.

## Verificação

```bash
python3 scripts/check-offline.py
./scripts/test-offline.sh
```

O segundo comando compila um verificador usando a mesma criação de WebView do executável. Ele roda em um namespace sem interfaces IPv4 ou IPv6, com armazenamento e cache vazios, sem alterar a conexão do computador. Confere clubes, imagens, áudio, mercado, finanças, tabela, partida, substituição, tática, gráfico de análise e suas amostras, recarga, importação e exportação. Outro processo confirma a persistência do save e do histórico do gráfico após fechar e abrir novamente.

As verificações não modificam os saves do jogador. Compilador C, Python, pkg-config e as bibliotecas de desenvolvimento são necessários para executar os testes; o jogo compilado não depende dessas ferramentas.

A verificação do motor e de um save com temporada completa está descrita em [TESTES-MOTOR.md](TESTES-MOTOR.md). Ela inclui quatro temporadas, todos os clubes e persistência de 380 partidas no aplicativo nativo sem rede.

Para recompilar o executável com as bibliotecas já instaladas:

```bash
./scripts/build-native.sh
```
