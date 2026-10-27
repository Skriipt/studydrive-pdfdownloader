import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[1]


class ReleasePackageTest(unittest.TestCase):
    def test_zip_is_installable_contains_only_runtime_files_and_is_reproducible(self):
        expected = {
            'manifest.json', 'background.js', 'content.js', 'inject.js', 'utils.js', 'ui-styles.js',
            'onboarding.html', 'onboarding.js', '_locales/en/messages.json', '_locales/de/messages.json',
            'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png',
        }
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'addon.zip'
            command = [sys.executable, str(ROOT / 'scripts/package.py'), '--output', str(output)]
            subprocess.run(command, check=True, capture_output=True, text=True)
            original = output.read_bytes()
            with ZipFile(output) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(set(archive.namelist()), expected)
                manifest = json.loads(archive.read('manifest.json'))
                self.assertEqual(manifest['manifest_version'], 3)
                resources = [manifest['background']['service_worker'], *manifest['icons'].values(),
                             manifest['options_ui']['page'], '_locales/en/messages.json', '_locales/de/messages.json']
                for script in manifest['content_scripts']:
                    resources.extend(script['js'])
                    resources.extend(script.get('css', []))
                for name in resources:
                    self.assertEqual(archive.read(name), (ROOT / 'extension' / name).read_bytes())
            subprocess.run(command, check=True, capture_output=True, text=True)
            self.assertEqual(output.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()
