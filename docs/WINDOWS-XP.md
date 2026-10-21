# Edição legada: Windows XP e código acessível

Esta edição preserva o jogo atual em JavaScript, HTML e CSS. O pacote transforma os fontes para o componente visual antigo, sem minificar ou ofuscar o código do jogo. Não precisa de WebView2, .NET, Java, Node ou de um navegador instalado para jogar.

## Compatibilidade: alvo e testes são coisas diferentes

- **Alvo:** Windows XP SP3 de 32 bits e versões posteriores com suporte a aplicativos x86.
- **Runtime:** NW.js 0.14.7 de 32 bits, baseado em Chromium 50, cuja versão oficial declara suporte ao XP. O executável informa subsistema Windows 5.1.
- **Verificação automática:** o workflow `Windows legacy desktop` executa o pacote em Windows Server 2022, criando uma carreira, abrindo sete telas, simulando minutos de partida e gravando/lendo o save.
- **Wine local:** o executável de 32 bits passou no Wine 11.17 Staging, usando um perfil temporário, sem opções especiais de renderização, incluindo a retomada da carreira em outro processo.
- **XP real:** não há uma máquina ou VM de Windows XP neste ambiente. Suporte confirmado no XP exige teste em XP SP3; o cabeçalho do executável e o suporte declarado pelo fabricante não substituem esse teste.
- A compatibilidade depende também do processador, da memória e dos drivers. Não se promete funcionamento em qualquer computador.

Fonte do fabricante: https://nwjs.io/blog/v0.14.7/

Esta edição usa um componente antigo exclusivamente para os arquivos locais do jogo. O conteúdo do jogo não acessa sites; navegações externas e novas janelas são bloqueadas. Para Windows 10/11, a edição moderna continua disponível separadamente.

## Como jogar

Extraia **toda** a pasta `Brasfoot-Revenge-Legacy` do ZIP e abra `BrasfootRevenge.exe`. Mantenha as DLLs, os arquivos do runtime e as pastas de dados junto dele. Não copie apenas o executável.

O nome do aplicativo separa o armazenamento desta edição dos saves da versão WebView2. Use **Exportar/Importar** para transferir carreiras. Antes de reinstalar, exporte uma cópia do save.

## Onde editar

| Arquivo | O que controla |
| --- | --- |
| `app.js` | Telas, botões e fluxo do jogo |
| `src/engine/` | Partidas, carreira, mercado, finanças e salvamento |
| `index.html` | Estrutura das telas |
| `style.css` | Visual da edição moderna |
| `src-windows/legacy/layout.css` | Ajustes visuais para o componente antigo |
| `src-windows/legacy/desktop.js` | Janela, bloqueio de navegação e compatibilidade de interface |
| `src-windows/legacy/smoke.js` | Teste de funcionamento da edição legada |
| `scripts/legacy/build.cjs` | Adaptação automática de JavaScript e CSS |
| `scripts/build-windows-legacy.py` | Verificação do runtime e montagem do pacote |

Edite os fontes acima, não os arquivos gerados em `dist/`. A pasta do pacote também contém o JavaScript adaptado, legível, e `source-manifest.json` com os hashes dos fontes usados. As dependências e o runtime mantêm suas próprias licenças; os créditos do NW.js são incluídos no pacote.

## Gerar um novo pacote

Na máquina de desenvolvimento, instale Node.js atual e Python 3. Esses programas não são exigidos no PC do jogador.

```sh
npm ci --prefix scripts/legacy
python3 scripts/build-windows-legacy.py
```

O script baixa o runtime oficial, verifica seu SHA-256 fixado e produz:

- `dist/windows-legacy/Brasfoot-Revenge-Windows-Legacy-x86.zip`
- `dist/windows-legacy/SHA256SUMS-LEGACY.txt`

Para reutilizar um arquivo já baixado:

```sh
python3 scripts/build-windows-legacy.py --runtime /caminho/nwjs-v0.14.7-win-ia32.zip
```

## Testar sem alterar os saves

Use um perfil temporário e o argumento `--legacy-smoke-test`. O relatório é gravado em `legacy-test-result.txt` ao lado do executável; somente uma linha final `PASS` representa sucesso. O teste também gera `legacy-test-screen.png`.

```powershell
.\BrasfootRevenge.exe --user-data-dir=C:\Temp\brasfoot-teste --legacy-smoke-test
```

Na validação manual em XP, confira criação e retomada de carreira em outro processo, sons, importação/exportação, táticas, substituições, mercado, mudança de temporada, acentos e telas com resolução de 1024×768. Registre a versão do Windows e do Wine quando aplicável.
