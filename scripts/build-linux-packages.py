#!/usr/bin/env python3
"""
Build Linux installer and distribution packages for Brasfoot Revenge.
Generates:
  - dist/linux/brasfoot-revenge-installer-linux.sh  (Universal self-extracting installer)
  - dist/linux/brasfoot-revenge-linux-x86_64.tar.gz (Portable archive)
  - dist/linux/brasfoot-revenge_1.0.0_amd64.deb    (Debian/Ubuntu package)
"""

import os
import sys
import io
import shutil
import tarfile
import subprocess

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_LINUX_DIR = os.path.join(PROJECT_DIR, 'dist', 'linux')

INSTALL_SH_CONTENT = """#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/brasfoot-revenge"
BIN_DIR="${HOME}/.local/bin"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"

echo "=========================================================="
echo "⚽ Instalando Brasfoot Revenge (Linux Nativo Offline)"
echo "=========================================================="
echo "Destino: $DEST_DIR"

mkdir -p "$DEST_DIR" "$BIN_DIR" "$APPS_DIR" "$ICONS_DIR"

# Copia arquivos do jogo
cp -a "$SRC_DIR"/* "$DEST_DIR/"
chmod +x "$DEST_DIR/brasfoot" "$DEST_DIR/brasfoot-app" 2>/dev/null || true

# Cria link para executar direto via terminal
ln -sf "$DEST_DIR/brasfoot" "$BIN_DIR/brasfoot"

# Registra ícone
if [ -f "$DEST_DIR/assets/icons/ic_champion.png" ]; then
    cp -f "$DEST_DIR/assets/icons/ic_champion.png" "$ICONS_DIR/brasfoot.png"
fi

# Cria atalho no menu de aplicativos do sistema
cat > "$APPS_DIR/Brasfoot.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Brasfoot Revenge
Comment=Simulador de Futebol Brasfoot Revenge (100% Nativo, Sem Java, Sem Servidor, 100% Offline)
Exec="$DEST_DIR/brasfoot"
Icon=$DEST_DIR/assets/icons/ic_champion.png
Terminal=false
Categories=Game;Simulation;Sports;
Keywords=brasfoot;revenge;futebol;soccer;manager;simulation;
StartupNotify=true
EOF
chmod +x "$APPS_DIR/Brasfoot.desktop"

# Desinstalador
cat > "$DEST_DIR/uninstall.sh" <<'UNINST'
#!/usr/bin/env bash
echo "Desinstalando Brasfoot Revenge..."
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/brasfoot-revenge"
rm -f "${HOME}/.local/bin/brasfoot"
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}/applications/Brasfoot.desktop"
rm -f "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps/brasfoot.png"
echo "Brasfoot Revenge foi removido com sucesso."
UNINST
chmod +x "$DEST_DIR/uninstall.sh"

echo ""
echo " Instalação concluída com sucesso!"
echo "Você pode abrir o jogo pelo menu de aplicativos ou digitando 'brasfoot' no terminal."
"""

SELF_EXTRACT_HEADER = """#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "⚽ Instalador Oficial - Brasfoot Revenge (Linux)"
echo "=========================================================="

TMP_DIR="$(mktemp -d /tmp/brasfoot-installer.XXXXXX)"
trap 'rm -rf -- "$TMP_DIR"' EXIT

ARCHIVE_LINE=$(awk '/^__ARCHIVE_BELOW__/ {print NR + 1; exit 0; }' "$0")

echo "Extraindo pacote de instalação..."
tail -n +"$ARCHIVE_LINE" "$0" | tar -xz -C "$TMP_DIR"

if [ -f "$TMP_DIR/brasfoot-revenge/install.sh" ]; then
    bash "$TMP_DIR/brasfoot-revenge/install.sh"
else
    echo "Erro: script de instalação não encontrado no pacote." >&2
    exit 1
fi

DEST_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/brasfoot-revenge"

# Pergunta se o usuário deseja iniciar o jogo agora
if [ -t 0 ]; then
    read -rp "Deseja iniciar o Brasfoot Revenge agora? [S/n] " RESP
    RESP="${RESP:-S}"
    if [[ "$RESP" =~ ^[Ss]$ ]]; then
        "$DEST_DIR/brasfoot" &
    fi
elif command -v zenity >/dev/null 2>&1; then
    if zenity --question --title="Brasfoot Revenge" --text="Instalação concluída!\n\nDeseja iniciar o jogo agora?" 2>/dev/null; then
        "$DEST_DIR/brasfoot" &
    fi
fi

exit 0

__ARCHIVE_BELOW__
"""

def compile_native():
    print('[1/4] Garantindo compilação nativa (brasfoot-app)...')
    build_sh = os.path.join(PROJECT_DIR, 'scripts', 'build-native.sh')
    res = subprocess.run(['bash', build_sh], capture_output=True)
    if res.returncode != 0:
        print('Erro compilação brasfoot-app:', res.stderr.decode())
        sys.exit(1)
    app_bin = os.path.join(PROJECT_DIR, 'brasfoot-app')
    print('  -> Binário nativo compilado:', app_bin)
    return app_bin

def get_file_list(app_bin):
    root_files = ['brasfoot', 'index.html', 'style.css', 'app.js', 'Brasfoot.desktop']
    dirs = ['assets', 'data', 'src', 'src-native']
    
    files = [('brasfoot-app', app_bin)]
    for rf in root_files:
        src = os.path.join(PROJECT_DIR, rf)
        if os.path.exists(src):
            files.append((rf, src))
            
    for d in dirs:
        full_d = os.path.join(PROJECT_DIR, d)
        for root, _, filenames in os.walk(full_d):
            for fn in filenames:
                full_fn = os.path.join(root, fn)
                rel_path = os.path.relpath(full_fn, PROJECT_DIR).replace('\\', '/')
                files.append((rel_path, full_fn))
                
    return files

def build_tarball(files):
    print('[2/4] Criando brasfoot-revenge-linux-x86_64.tar.gz...')
    tar_path = os.path.join(DIST_LINUX_DIR, 'brasfoot-revenge-linux-x86_64.tar.gz')
    
    with tarfile.open(tar_path, 'w:gz', compresslevel=9) as tar:
        # Add install.sh
        inst_bytes = INSTALL_SH_CONTENT.encode('utf-8')
        ti = tarfile.TarInfo('brasfoot-revenge/install.sh')
        ti.size = len(inst_bytes)
        ti.mode = 0o755
        tar.addfile(ti, io.BytesIO(inst_bytes))
        
        # Add LEIAME.txt
        readme_bytes = (
            "=====================================================\n"
            "⚽ BRASFOOT REVENGE (Edição Linux Nativo Offline)\n"
            "=====================================================\n\n"
            "COMO JOGAR:\n"
            "Opção 1 (Recomendado): Execute './install.sh' para instalar o atalho no sistema.\n"
            "Opção 2: Execute diretamente './brasfoot' para jogar sem instalar nada.\n\n"
            "100% offline, sem servidor, sem internet e sem Java.\n"
        ).encode('utf-8')
        ti_r = tarfile.TarInfo('brasfoot-revenge/LEIAME.txt')
        ti_r.size = len(readme_bytes)
        ti_r.mode = 0o644
        tar.addfile(ti_r, io.BytesIO(readme_bytes))
        
        for rel_path, full_src in files:
            arc_name = f'brasfoot-revenge/{rel_path}'
            ti = tar.gettarinfo(full_src, arcname=arc_name)
            if os.path.islink(full_src):
                ti.mode = 0o755
            elif rel_path in ['brasfoot', 'brasfoot-app'] or rel_path.endswith('.sh'):
                ti.mode = 0o755
            else:
                ti.mode = 0o644
            if ti.isreg():
                with open(full_src, 'rb') as f:
                    tar.addfile(ti, f)
            else:
                tar.addfile(ti)
                
    size_mb = os.path.getsize(tar_path) / (1024 * 1024)
    print(f'  -> Tarball gerado ({size_mb:.2f} MB): {tar_path}')
    return tar_path

def build_self_extractor(tar_path):
    print('[3/4] Criando instalador auto-executável (brasfoot-revenge-installer-linux.sh)...')
    sh_path = os.path.join(DIST_LINUX_DIR, 'brasfoot-revenge-installer-linux.sh')
    
    with open(sh_path, 'wb') as out_f:
        out_f.write(SELF_EXTRACT_HEADER.encode('utf-8'))
        with open(tar_path, 'rb') as tf:
            shutil.copyfileobj(tf, out_f)
            
    os.chmod(sh_path, 0o755)
    size_mb = os.path.getsize(sh_path) / (1024 * 1024)
    print(f'  -> Instalador auto-executável gerado ({size_mb:.2f} MB): {sh_path}')
    return sh_path

def build_deb_package(files):
    print('[4/4] Gerando pacote Debian/Ubuntu (brasfoot-revenge_1.0.0_amd64.deb)...')
    deb_path = os.path.join(DIST_LINUX_DIR, 'brasfoot-revenge_1.0.0_amd64.deb')
    tmp_deb_dir = os.path.join(DIST_LINUX_DIR, '.tmp_deb')
    shutil.rmtree(tmp_deb_dir, ignore_errors=True)
    os.makedirs(tmp_deb_dir, exist_ok=True)
    
    # 1. debian-binary
    deb_bin = os.path.join(tmp_deb_dir, 'debian-binary')
    with open(deb_bin, 'wb') as f:
        f.write(b'2.0\n')
        
    # 2. control.tar.gz
    ctrl_tar_path = os.path.join(tmp_deb_dir, 'control.tar.gz')
    with tarfile.open(ctrl_tar_path, 'w:gz') as tar:
        ctrl_content = (
            "Package: brasfoot-revenge\n"
            "Version: 1.0.0\n"
            "Section: games\n"
            "Priority: optional\n"
            "Architecture: amd64\n"
            "Depends: libgtk-4-1, libwebkitgtk-6.0-4\n"
            "Maintainer: Brasfoot Revenge <brasfoot-revenge@users.noreply.github.com>\n"
            "Description: Simulador de futebol clássico Brasfoot Revenge para Linux\n"
            " 100% nativo, sem servidor, sem internet e sem Java.\n"
        ).encode('utf-8')
        ti = tarfile.TarInfo('control')
        ti.size = len(ctrl_content)
        ti.mode = 0o644
        tar.addfile(ti, io.BytesIO(ctrl_content))
        
    # 3. data.tar.gz
    data_tar_path = os.path.join(tmp_deb_dir, 'data.tar.gz')
    with tarfile.open(data_tar_path, 'w:gz', compresslevel=9) as tar:
        # Install files into /opt/brasfoot-revenge/
        for rel_path, full_src in files:
            arc_name = f'./opt/brasfoot-revenge/{rel_path}'
            ti = tar.gettarinfo(full_src, arcname=arc_name)
            if rel_path in ['brasfoot', 'brasfoot-app'] or rel_path.endswith('.sh'):
                ti.mode = 0o755
            else:
                ti.mode = 0o644
            if ti.isreg():
                with open(full_src, 'rb') as f:
                    tar.addfile(ti, f)
            else:
                tar.addfile(ti)
                
        # /usr/bin/brasfoot wrapper
        wrapper = (
            "#!/usr/bin/env bash\n"
            "exec /opt/brasfoot-revenge/brasfoot \"$@\"\n"
        ).encode('utf-8')
        ti_w = tarfile.TarInfo('./usr/bin/brasfoot')
        ti_w.size = len(wrapper)
        ti_w.mode = 0o755
        tar.addfile(ti_w, io.BytesIO(wrapper))
        
        # /usr/share/applications/brasfoot-revenge.desktop
        desktop = (
            "[Desktop Entry]\n"
            "Version=1.0\n"
            "Type=Application\n"
            "Name=Brasfoot Revenge\n"
            "Comment=Simulador de Futebol Brasfoot Revenge (100% Nativo, Sem Java, Sem Servidor, 100% Offline)\n"
            "Exec=/usr/bin/brasfoot\n"
            "Icon=/opt/brasfoot-revenge/assets/icons/ic_champion.png\n"
            "Terminal=false\n"
            "Categories=Game;Simulation;Sports;\n"
            "Keywords=brasfoot;revenge;futebol;soccer;manager;simulation;\n"
            "StartupNotify=true\n"
        ).encode('utf-8')
        ti_d = tarfile.TarInfo('./usr/share/applications/brasfoot-revenge.desktop')
        ti_d.size = len(desktop)
        ti_d.mode = 0o644
        tar.addfile(ti_d, io.BytesIO(desktop))
        
    # Assemble with ar
    subprocess.run(['ar', 'rcs', deb_path, deb_bin, ctrl_tar_path, data_tar_path], check=True)
    shutil.rmtree(tmp_deb_dir, ignore_errors=True)
    
    size_mb = os.path.getsize(deb_path) / (1024 * 1024)
    print(f'  -> Pacote Debian gerado ({size_mb:.2f} MB): {deb_path}')
    return deb_path

def main():
    os.makedirs(DIST_LINUX_DIR, exist_ok=True)
    app_bin = compile_native()
    files = get_file_list(app_bin)
    tar_path = build_tarball(files)
    build_self_extractor(tar_path)
    build_deb_package(files)
    print('\n Pacotes Linux gerados com sucesso em dist/linux/!')

if __name__ == '__main__':
    main()
