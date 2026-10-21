#!/usr/bin/env python3
"""
Build Windows installer and portable packages for Brasfoot Revenge.
Generates:
  - dist/windows/BrasfootRevenge.exe (Native Windows Forms + WebView2 client)
  - dist/windows/Instalador-Brasfoot-Revenge.exe
  - dist/windows/Brasfoot-Revenge-Windows-Portable.zip
"""

import os
import sys
import gzip
import struct
import shutil
import zipfile
import subprocess
from PIL import Image

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_WIN_DIR = os.path.join(PROJECT_DIR, 'dist', 'windows')
LIBS_DIR = os.path.join(PROJECT_DIR, 'src-windows', 'libs')

def find_csc():
    candidates = [
        os.path.expanduser('~/.wine-classic/drive_c/windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
        os.path.expanduser('~/.wine/drive_c/windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
        os.path.expanduser('~/.wine-classic/drive_c/windows/Microsoft.NET/Framework/v4.0.30319/csc.exe'),
        os.path.expanduser('~/.wine/drive_c/windows/Microsoft.NET/Framework/v4.0.30319/csc.exe'),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return 'csc.exe'

CSC_PATH = find_csc()

def to_wine(p):
    return 'Z:' + p.replace('/', '\\')

def ensure_ico():
    png_path = os.path.join(PROJECT_DIR, 'assets', 'icons', 'ic_champion.png')
    ico_path = os.path.join(PROJECT_DIR, 'assets', 'icons', 'brasfoot.ico')
    img = Image.open(png_path).convert('RGBA')
    img.save(ico_path, format='ICO', sizes=[(16,16), (24,24), (32,32), (48,48), (64,64), (128,128), (256,256)])
    return ico_path

def build_launcher(ico_path):
    print('[1/4] Compilando BrasfootRevenge.exe (Cliente Nativo Windows)...')
    cs_file = os.path.join(PROJECT_DIR, 'src-windows', 'Launcher.cs')
    out_exe = os.path.join(DIST_WIN_DIR, 'BrasfootRevenge.exe')
    core_dll = os.path.join(LIBS_DIR, 'Microsoft.Web.WebView2.Core.dll')
    wf_dll = os.path.join(LIBS_DIR, 'Microsoft.Web.WebView2.WinForms.dll')
    
    cmd = [
        'wine', CSC_PATH,
        '/target:winexe',
        '/optimize+',
        '/platform:anycpu',
        '/r:System.Windows.Forms.dll',
        '/r:System.Drawing.dll',
        f'/r:{to_wine(core_dll)}',
        f'/r:{to_wine(wf_dll)}',
        f'/win32icon:{to_wine(ico_path)}',
        f'/out:{to_wine(out_exe)}',
        to_wine(cs_file)
    ]
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        print('Erro compilação launcher:', res.stderr.decode())
        sys.exit(1)
        
    # Copy DLLs to dist/windows for standalone test
    shutil.copy(core_dll, DIST_WIN_DIR)
    shutil.copy(wf_dll, DIST_WIN_DIR)
    shutil.copy(os.path.join(LIBS_DIR, 'WebView2Loader.dll'), DIST_WIN_DIR)
    shutil.copytree(os.path.join(LIBS_DIR, 'runtimes'), os.path.join(DIST_WIN_DIR, 'runtimes'), dirs_exist_ok=True)
    
    print('  -> Criado com sucesso:', out_exe)
    return out_exe

def create_archive_payload(launcher_exe):
    print('[2/4] Compactando payload do jogo (GameArchive)...')
    archive_path = os.path.join(DIST_WIN_DIR, 'game-archive.bin')
    
    # Files to include in payload
    root_files = ['index.html', 'style.css', 'app.js']
    dirs = ['assets', 'data', 'src']
    
    files_to_pack = []
    # Launcher and native WebView2 runtime DLLs
    files_to_pack.append(('BrasfootRevenge.exe', launcher_exe))
    files_to_pack.append(('Microsoft.Web.WebView2.Core.dll', os.path.join(LIBS_DIR, 'Microsoft.Web.WebView2.Core.dll')))
    files_to_pack.append(('Microsoft.Web.WebView2.WinForms.dll', os.path.join(LIBS_DIR, 'Microsoft.Web.WebView2.WinForms.dll')))
    files_to_pack.append(('WebView2Loader.dll', os.path.join(LIBS_DIR, 'WebView2Loader.dll')))
    
    runtimes_dir = os.path.join(LIBS_DIR, 'runtimes')
    for root, _, filenames in os.walk(runtimes_dir):
        for fn in filenames:
            full_fn = os.path.join(root, fn)
            rel = os.path.relpath(full_fn, LIBS_DIR).replace('\\', '/')
            files_to_pack.append((rel, full_fn))
    
    for rf in root_files:
        src = os.path.join(PROJECT_DIR, rf)
        if os.path.exists(src):
            files_to_pack.append((rf, src))
            
    for d in dirs:
        full_d = os.path.join(PROJECT_DIR, d)
        for root, _, filenames in os.walk(full_d):
            for fn in filenames:
                full_fn = os.path.join(root, fn)
                rel_path = os.path.relpath(full_fn, PROJECT_DIR).replace('\\', '/')
                files_to_pack.append((rel_path, full_fn))
                
    print(f'  -> Total de arquivos a empacotar: {len(files_to_pack)}')
    
    with open(archive_path, 'wb') as out_f:
        with gzip.GzipFile(fileobj=out_f, mode='wb', compresslevel=9) as gz:
            for rel_path, full_src in files_to_pack:
                with open(full_src, 'rb') as sf:
                    data = sf.read()
                p_bytes = rel_path.encode('utf-8')
                gz.write(struct.pack('<I', len(p_bytes)))
                gz.write(p_bytes)
                gz.write(struct.pack('<Q', len(data)))
                gz.write(data)
            gz.write(struct.pack('<I', 0)) # EOF
            
    size_mb = os.path.getsize(archive_path) / (1024 * 1024)
    print(f'  -> GameArchive gerado ({size_mb:.2f} MB): {archive_path}')
    return archive_path, files_to_pack

def build_installer(ico_path, archive_path):
    print('[3/4] Compilando Instalador-Brasfoot-Revenge.exe (GUI Installer)...')
    cs_file = os.path.join(PROJECT_DIR, 'src-windows', 'Installer.cs')
    out_installer = os.path.join(DIST_WIN_DIR, 'Instalador-Brasfoot-Revenge.exe')
    
    cmd = [
        'wine', CSC_PATH,
        '/target:winexe',
        '/optimize+',
        '/platform:anycpu',
        '/r:System.Windows.Forms.dll',
        '/r:System.Drawing.dll',
        f'/resource:{to_wine(archive_path)},GameArchive',
        f'/win32icon:{to_wine(ico_path)}',
        f'/out:{to_wine(out_installer)}',
        to_wine(cs_file)
    ]
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        print('Erro compilação instalador:', res.stderr.decode())
        sys.exit(1)
        
    size_mb = os.path.getsize(out_installer) / (1024 * 1024)
    print(f'  -> Instalador criado ({size_mb:.2f} MB): {out_installer}')
    return out_installer

def build_portable_zip(files_to_pack):
    print('[4/4] Gerando Brasfoot-Revenge-Windows-Portable.zip...')
    zip_path = os.path.join(DIST_WIN_DIR, 'Brasfoot-Revenge-Windows-Portable.zip')
    
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for rel_path, full_src in files_to_pack:
            arc_name = f'Brasfoot-Revenge/{rel_path}'
            zf.write(full_src, arc_name)
            
        # Add LEIAME.txt
        readme = (
            "=====================================================\r\n"
            "⚽ BRASFOOT REVENGE (Edição Windows Nativo Offline)\r\n"
            "=====================================================\r\n\r\n"
            "COMO JOGAR:\r\n"
            "1. Dê dois cliques em 'BrasfootRevenge.exe' para iniciar o jogo!\r\n"
            "2. O jogo inicia como um aplicativo nativo do Windows, sem abrir navegador.\r\n"
            "3. 100% offline, sem necessidade de internet, servidor ou Java.\r\n"
            "4. Seus saves e histórico ficam salvos no seu computador com total segurança.\r\n\r\n"
            "Divirta-se!\r\n"
        )
        zf.writestr('Brasfoot-Revenge/LEIAME.txt', readme.encode('utf-8'))
        
    size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    print(f'  -> ZIP portátil gerado ({size_mb:.2f} MB): {zip_path}')
    return zip_path

def main():
    os.makedirs(DIST_WIN_DIR, exist_ok=True)
    ico_path = ensure_ico()
    launcher_exe = build_launcher(ico_path)
    archive_path, files_to_pack = create_archive_payload(launcher_exe)
    build_installer(ico_path, archive_path)
    build_portable_zip(files_to_pack)
    
    # Remove intermediate binary archive
    if os.path.exists(archive_path):
        os.remove(archive_path)
        
    print('\n Pacotes Windows nativos gerados com sucesso em dist/windows/!')

if __name__ == '__main__':
    main()
