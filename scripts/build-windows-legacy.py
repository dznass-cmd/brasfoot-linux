#!/usr/bin/env python3
"""Build the portable XP-targeted edition. No Node/.NET needed by players."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist/windows-legacy'
VERSION = '0.14.7'
RUNTIME_SHA256 = '94102e3af3f7e23ec19bfb0be10408337f3ccda80801b6191a91fd986795b682'
RUNTIME_URL = f'https://dl.nwjs.io/v{VERSION}/nwjs-v{VERSION}-win-ia32.zip'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, help='Previously downloaded official NW.js archive')
    args = parser.parse_args()
    DIST.mkdir(parents=True, exist_ok=True)
    archive = args.runtime or DIST / f'nwjs-v{VERSION}-win-ia32.zip'
    if not archive.exists():
        print('Downloading official XP-compatible NW.js runtime...', flush=True)
        request = urllib.request.Request(RUNTIME_URL, headers={'User-Agent': 'Mozilla/5.0 BrasfootBuild/1.0'})
        temporary = archive.with_suffix('.download')
        try:
            with urllib.request.urlopen(request, timeout=90) as response, temporary.open('wb') as output:
                shutil.copyfileobj(response, output)
            temporary.replace(archive)
        finally:
            temporary.unlink(missing_ok=True)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != RUNTIME_SHA256:
        raise ValueError('Runtime checksum mismatch; refusing to package it.')
    subprocess.run(['node', str(ROOT / 'scripts/legacy/build.cjs')], check=True)
    target = DIST / 'Brasfoot-Revenge-Legacy'
    if target.exists():
        shutil.rmtree(target)
    target.mkdir()
    prefix = f'nwjs-v{VERSION}-win-ia32/'
    with zipfile.ZipFile(archive) as runtime:
        for info in runtime.infolist():
            if not info.filename.startswith(prefix) or info.is_dir():
                continue
            rel = Path(info.filename[len(prefix):])
            if rel.is_absolute() or '..' in rel.parts:
                raise ValueError('Unexpected runtime archive path')
            dest = target / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(runtime.read(info))
    (target / 'nw.exe').rename(target / 'BrasfootRevenge.exe')
    shutil.copytree(DIST / 'app', target, dirs_exist_ok=True)
    (target / 'LEIA-ME.txt').write_text(
        'BRASFOOT REVENGE - EDICAO LEGADA OFFLINE\n\n'
        'Destino: Windows XP SP3 de 32 bits e versoes posteriores.\n'
        'Extraia TODA a pasta e abra BrasfootRevenge.exe.\n'
        'Nao precisa instalar WebView2, Java, Node ou .NET.\n'
        'Mantenha as DLLs e os arquivos ao lado do executavel.\n'
        'O runtime e antigo e deve ser usado somente com os arquivos locais deste jogo.\n'
        'Para compartilhar carreiras entre edicoes, use Exportar/Importar dentro do jogo.\n\n'
        'Codigo-fonte e instrucoes: https://github.com/dznass-cmd/brasfoot-revenge\n'
        'Consulte docs/WINDOWS-XP.md para os sistemas realmente testados.\n', encoding='utf-8')
    output = DIST / 'Brasfoot-Revenge-Windows-Legacy-x86.zip'
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as portable:
        for source in sorted(target.rglob('*')):
            if source.is_file():
                portable.write(source, str(source.relative_to(DIST)))
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    (DIST / 'SHA256SUMS-LEGACY.txt').write_text(f'{digest}  {output.name}\n')
    print(f'Built {output} ({output.stat().st_size / 1024**2:.1f} MiB)', flush=True)


if __name__ == '__main__':
    main()
