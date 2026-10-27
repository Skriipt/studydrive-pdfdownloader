"""Build the unpacked Chrome extension ZIP using only Python's standard library."""

import argparse
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / 'extension'


def runtime_files(manifest):
    files = {'manifest.json', manifest['background']['service_worker'], *manifest['icons'].values(),
             *manifest['action']['default_icon'].values()}
    for script in manifest['content_scripts']:
        files.update(script['js'])
        files.update(script.get('css', []))
    page = manifest['options_ui']['page']
    files.add(page)
    # Local scripts and images referenced by the help page.
    files.update(re.findall(r'(?:src|href)="([^":]+)"', (EXTENSION / page).read_text()))
    files.update(path.relative_to(EXTENSION).as_posix() for path in (EXTENSION / '_locales').glob('*/messages.json'))
    return files


def package(output):
    manifest = json.loads((EXTENSION / 'manifest.json').read_text())
    files = runtime_files(manifest)
    for name in files:
        source = (EXTENSION / name).resolve()
        if not source.is_relative_to(EXTENSION.resolve()) or not source.is_file():
            raise ValueError(f'Missing or unsafe manifest resource: {name}')
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, 'w') as archive:
        for name in sorted(files):
            info = ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (EXTENSION / name).read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    print(f'Packaged v{manifest["version"]}: {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist' / 'studydrive-pdfdownloader.zip')
    package(parser.parse_args().output)
