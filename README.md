# ⚽ Brasfoot Revenge (100% Nativo, Sem Servidor, Sem Internet, Sem Java)

Reimplementação completa do clássico **Brasfoot** (Edição **Revenge**) compilada diretamente para Linux.

[Histórico de todas as modificações](docs/HISTORICO-ALTERACOES.md) · [Contexto salvo para retomar o projeto](CONTEXTO-PROJETO.md)

[Otimizações implementadas e medições locais](docs/OTIMIZACOES.md).

- ❌ **Sem Java**: Não precisa de Java / JRE / JVM.
- ❌ **Sem Servidor**: Não abre portas e não precisa de `node server.js` nem localhost. O inicializador abre o aplicativo em um processo separado do terminal.
- ❌ **Sem Internet**: 100% dos 703 clubes reais, escudos, camisas, sons e dados estão salvos localmente no seu computador.
- ✅ **Executável Binário Nativo ELF**: Compilado em C com interface gráfica GTK4 de alto desempenho.

---

## 📦 Pacotes de Instalação e Downloads

### 🐧 Para Linux
- **Instalador Auto-executável**: `brasfoot-revenge-installer-linux.sh` (extrai e configura o atalho no menu com 1 comando: `bash brasfoot-revenge-installer-linux.sh`).
- **Pacote Debian / Ubuntu**: `brasfoot-revenge_1.0.0_amd64.deb` (instalação padrão via `sudo dpkg -i brasfoot-revenge_1.0.0_amd64.deb`).
- **Pacote Portátil Tarball**: `brasfoot-revenge-linux-x86_64.tar.gz` (descompacte e jogue em qualquer distribuição).

### 🪟 Para Windows
- **Instalador Gráfico**: `Instalador-Brasfoot-Revenge.exe` (instalador nativo com interface gráfica, barra de progresso, atalhos na Área de Trabalho e Menu Iniciar, e desinstalador).
- **Versão Portátil ZIP**: `Brasfoot-Revenge-Windows-Portable.zip` (basta descompactar e dar dois cliques em `BrasfootRevenge.exe` para jogar).
- **Executável Nativo**: `BrasfootRevenge.exe` (executa em janela de aplicativo dedicada sem barra de navegação, com isolamento de saves locais).

Para compilar ou gerar novos pacotes a partir do código-fonte:
```bash
# Gerar pacotes Linux:
python3 scripts/build-linux-packages.py

# Gerar pacotes Windows:
python3 scripts/build-windows.py
```

---

## 🚀 Como Jogar

### Opção 1: Pelo Executável Nativo (Recomendado)
Execute diretamente o aplicativo compilado:
```bash
cd brasfoot-revenge
./brasfoot
# ou diretamente:
./brasfoot-app
```

### Opção 2: Pelo Menu de Aplicativos do Sistema
O jogo pode ser integrado ao menu de aplicativos do Linux (GNOME / KDE / XFCE):
- Execute `./scripts/install-desktop.sh` para instalar o atalho no sistema.
- Procure por **Brasfoot Revenge** no menu iniciar e clique para abrir!
- O jogo abre em um processo separado, sem janela de terminal. Mensagens de diagnóstico ficam em `~/.local/state/brasfoot/launcher.log`.

### Opção 3: Abrindo o Arquivo Diretamente
Se preferir, você pode simplesmente dar dois cliques em `index.html` para abrir no navegador via `file://`, sem precisar de nenhum comando nem servidor web.

---

## Funcionamento offline

O executável usa apenas arquivos locais e bloqueia recursos de rede. Saves, Editor, importação e exportação funcionam no computador. O modo offline foi verificado com o processo sem interfaces de rede e com cache vazio, incluindo os sons e a retomada de uma partida em outro processo. [Detalhes e testes](docs/OFFLINE.md).

## Desempenho e salvamento

O motor reutiliza cálculos de características e táticas; a interface atualiza as abas conforme são abertas. O mercado reutiliza o catálogo e seleciona os 100 melhores resultados antes de copiar os jogadores. O encerramento das outras divisões avança uma partida por etapa, com progresso e retomada de rodadas incompletas.

Durante as partidas, checkpoints menores guardam os dois elencos e o jogo em andamento. Negociações e mudanças de temporada continuam dependendo de uma gravação completa bem-sucedida. Saves anteriores e a exportação/importação de JSON continuam disponíveis. [Implementação, medições e testes](docs/OTIMIZACOES.md).

---

## Elencos de 2026

A coleta de **21/10/2026** atualizou **486 clubes e 15.585 jogadores** com listas públicas da ESPN e do oGol. **217 clubes** continuam identificados como base antiga por falta de confirmação atual suficiente. Há elencos atualizados para 79 dos 80 clubes das divisões configuradas no projeto.

Reabra o jogo e escolha **Novo jogo** para usar a base atualizada. As carreiras já salvas mantêm os elencos gravados na sua liga. O aplicativo continua 100% offline.

[Fontes, critérios e reprodução da importação](docs/ELENCOS.md) · [Relatório completo em planilha](data/roster-update.csv)

Forças, características, salários e passes são estimativas da simulação.

---

## 🎮 Funcionalidades

1. **703 Clubes Reais Extraídos do Brasfoot 22-23**:
   - Flamengo, Palmeiras, Corinthians, São Paulo, Grêmio, Cruzeiro, etc.
   - Atributos completos de todos os jogadores (força, idade, posição, características, lado, ⭐ estrelas).
   - Estádios autênticos e capacidades reais.
2. **Escudos e Uniformes Originais**:
   - 703 escudos oficiais dos clubes em alta definição.
   - 336 primeiros uniformes e 334 segundos uniformes originais, com camisas genéricas locais para os demais clubes.
   - Troféus das competições.
3. **Efeitos Sonoros Originais**:
   - Grito de gol, apito de fim de jogo, intervalo, expulsão, pênalti e contusão tocados nativamente.
4. **Motor de Jogo Offline**:
   - **Simulação minuto a minuto (1' a 90')**: Lances narrados ao vivo, substituições, faltas, cartões e estatísticas (posse de bola, finalizações).
   - **Táticas & Escalação**: Campo tático visual interativo (4-4-2, 4-3-3, 3-5-2, 4-5-1, etc.), estilos (Ofensivo, Equilibrado, Defensivo), troca rápida de titulares com um clique.
   - **Instruções táticas**: 11 formações, passes, direção do ataque, ritmo, pressão, linha defensiva, entradas e transição. Seis planos rápidos e escolha de cobradores de pênaltis, faltas e escanteios. Os comandos funcionam antes e durante a partida. [Opções e efeitos](docs/TATICAS.md).
   - **Comando durante a partida**: pausa, velocidades 1×/2×/4×, intervalo automático, até cinco substituições e mudanças de formação e estilo que afetam os minutos seguintes. Partidas em andamento são salvas e podem ser retomadas.
   - **Características nos lances**: passe, drible, finalização, cabeceio, marcação e habilidades do goleiro influenciam criação, desarmes e gols. Energia, moral e adaptação à posição alteram o rendimento.
   - **Técnicos adversários**: escalam jogadores disponíveis, fazem substituições e ajustam formação e estilo conforme placar e desgaste.
   - **Gestão do elenco**: lesões persistentes, suspensão por três amarelos ou expulsão, recuperação entre rodadas e bloqueio de atletas indisponíveis. A ficha mostra moral e cartões acumulados no ciclo.
   - **Leitura da partida**: força efetiva por setor, função de cada jogador, avisos de improvisação, tática adversária, escanteios, passes certos e xG estimado pelo simulador. [Regras e detalhes do motor](docs/MOTOR.md).
   - **Campeonatos**: Brasileirão Séries A, B, C e D em turno e returno (38 rodadas), zonas de Libertadores (G4) e Rebaixamento (Z4), artilharia.
   - **Carreira com temporadas consecutivas**: encerramento do ano, campeões, acesso e rebaixamento entre A–D, premiação, novo calendário e histórico das classificações e resultados. Os atletas envelhecem, evoluem, podem se aposentar e dão lugar a jovens fictícios da base. Funciona também em saves antigos e em campeonatos já concluídos. [Como continuar a temporada](docs/TEMPORADAS.md).
   - **Meu perfil**: nome do técnico, histórico dos clubes dirigidos, campanhas, estatísticas e sala de troféus. Ao iniciar o ano seguinte, outros clubes podem oferecer o cargo de técnico; você pode aceitar ou recusar antes da primeira partida. As passagens e conquistas acompanham o técnico no mesmo save. [Perfil e propostas](docs/MEU-PERFIL.md).
   - **Aba Times**: consulta dos 703 clubes de 134 países, com escudos, bandeiras e uniformes locais. Filtros das Séries A–D, busca por nome, elenco completo e ficha de cada jogador. Acesso direto pela classificação e atalhos para o seu clube e o próximo adversário. Cada elenco mostra sua fonte e data; clubes sem atualização suficiente são identificados como base antiga.
   - **Mercado**: compras, vendas e empréstimos com os 703 clubes, propostas ocasionais por desempenho, decisões de aceitar ou recusar e histórico de negócios. Os empréstimos retornam automaticamente ao fim da temporada; jogadores e dinheiro ficam preservados nos clubes envolvidos. [Mercado e desempenho](docs/MERCADO-DESEMPENHO.md).
   - **Desempenho**: notas dos atletas, forma nas últimas cinco atuações, gols, assistências, minutos, craques do jogo e avaliação individual por partida. Relatórios das duas temporadas anteriores permanecem disponíveis.
   - **Finanças do clube**: caixa, extrato com entradas e saídas, cinco temporadas de histórico, gráfico, folha salarial e simulação do ingresso e do caixa até o fim do campeonato. TV, escolha de patrocínio e orçamento da diretoria para salários e negociações. [Regras financeiras](docs/FINANCAS.md).
   - **Contratos**: prazo, salário, renovação por desempenho, luvas, rescisão e atletas sem clube em **Mercado → Contratos / Sem clube**. Compras incluem o contrato do reforço; a atualização preserva salários e caixa existentes. [Condições e testes](docs/ECONOMIA-CONTRATOS.md).
   - **Estádio**: consulta e obras de ampliação da capacidade da arena, com custo registrado nas finanças.
   - **Salvar & Exportar**: Saves locais instantâneos via `localStorage` ou exportação/importação direta de arquivos `.json`.

---

## 📁 Estrutura do Projeto

```
projeto Brasfoot/
├── brasfoot-app                 # Binário ELF nativo compilado (GTK4 + WebKit)
├── brasfoot                     # Script inicializador
├── Brasfoot.desktop             # Atalho para o menu de aplicativos do sistema
├── index.html                   # Interface do jogo
├── style.css                    # Estilos visuais clássicos
├── app.js                       # Controlador do jogo (100% offline)
├── assets/                      # Escudos, camisas, troféus e áudios .wav
├── data/                        # Bancos de dados convertidos (teams_data.js, leagues_data.js)
├── src/engine/                  # Motores de simulação (partida, tabela, tática, mercado, finanças)
├── src-native/main.c            # Código-fonte em C da aplicação GTK4 nativa
└── README.md
```
