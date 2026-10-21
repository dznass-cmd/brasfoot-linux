# Windows: janela própria e instalação offline

O cliente usa Windows Forms e WebView2 dentro da janela do jogo. Não inicia navegador externo, mesmo quando a inicialização falha. Requer Windows 10/11 x64 com .NET Framework 4.7.2 ou superior (incluído nas versões atuais do Windows 10/11).

## Pacotes

Baixe em https://github.com/dznass-cmd/brasfoot-revenge/releases/latest.

O instalador e o ZIP incluem o instalador Evergreen Standalone x64 oficial da Microsoft em `prerequisites/MicrosoftEdgeWebView2RuntimeInstallerX64.exe`. Ele é executado com `/silent /install` somente quando o runtime não está instalado. A interface do jogo bloqueia navegações externas, novas janelas e requisições de recursos de rede. O componente Evergreen pode ter seu próprio mecanismo de atualização do Windows; isso não é necessário para jogar.

Documentação do fabricante: https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution

## Gerar os pacotes no Linux

Instale Python 3, Pillow e Wine com compilador C# disponível. O script procura `csc.exe` nos prefixos `~/.wine-classic` e `~/.wine`.

```sh
mkdir -p dist/windows/prerequisites
curl -fL 'https://go.microsoft.com/fwlink/?linkid=2124701' -o dist/windows/prerequisites/MicrosoftEdgeWebView2RuntimeInstallerX64.exe
python3 scripts/build-windows.py
```

O build exige o runtime offline e rejeita sua ausência; os binários grandes são publicados em Releases, não no histórico Git. O compilador gera executáveis x64, coerentes com o runtime incluído.

## Verificar no Windows

O workflow `Windows desktop` compila os dois executáveis em Windows, verifica a assinatura Microsoft do instalador WebView2 e abre o jogo com um perfil temporário isolado. O teste exige o carregamento dos 703 clubes, do motor e da tela inicial, e verifica leitura/gravação no armazenamento local. Falhas ou um tempo limite produzem código diferente de zero. Os testes do motor também rodam no workflow.

```powershell
$p = Start-Process .\BrasfootRevenge.exe -ArgumentList '--smoke-test' -PassThru
$p.WaitForExit()
$p.ExitCode
```

O teste de inicialização não substitui uma sessão manual de jogo: confira sons, importação/exportação de saves, partida, instalação em pasta personalizada e desinstalação em um Windows 10/11 real antes de considerar essas funções validadas.
