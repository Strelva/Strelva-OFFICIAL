"""Failure paths for restore preparation; all provider execution is mocked."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parent))
from postgres import is_local_url, pg_env
SPEC = importlib.util.spec_from_file_location('restore', Path(__file__).resolve().parent.parent / 'rehearse-database-restore.py')
restore = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(restore)


class RestoreTests(unittest.TestCase):
    def test_local_target_classification_cannot_be_overridden(self):
        for url in ['postgresql://localhost/test', 'postgres://127.0.0.1:5432/test', 'postgresql://[::1]/test',
                    'postgresql:///test?host=/tmp/local-socket&port=5432']:
            self.assertTrue(is_local_url(url), url)
        for url in ['postgresql://prod.example/test', 'postgresql://localhost.evil/test',
                    'postgresql://localhost/test?host=prod.example', 'postgresql://localhost/test?hostaddr=1.2.3.4',
                    'postgresql://localhost/test?service=production', 'postgresql://localhost/test?dbname=other',
                    'postgresql://localhost/test?options=-c', 'postgresql:///test?host=/tmp/a,prod.example',
                    'postgresql:///test', 'not a url', 'postgresql://localhost/test?port=5432&port=5433']:
            self.assertFalse(is_local_url(url), url)

    def test_refuses_nonlocal_source_or_target_before_connection_or_artifact(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / 'backup'
            for source, target in [('postgresql://prod.example/db', 'postgresql://localhost/db'),
                                   ('postgresql://localhost/db', 'postgresql://prod.example/db')]:
                with patch.object(restore.subprocess, 'Popen') as connect:
                    with self.assertRaisesRegex(ValueError, 'non-local'):
                        restore.rehearse(source, target, out)
                    connect.assert_not_called()
                self.assertFalse(out.exists())

    def test_never_reuses_a_backup_or_writes_inside_checkout(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(FileExistsError):
                restore.rehearse('postgresql://localhost/db', 'postgresql://localhost/db', temp)
        with self.assertRaisesRegex(ValueError, 'outside'):
            restore.rehearse('postgresql://localhost/db', 'postgresql://localhost/db', Path(__file__).resolve().parent / 'dump')

    def test_counts_require_same_tables_and_same_rows(self):
        restore.compare_counts({'a': 2, 'b': 0}, {'a': 2, 'b': 0})
        for after in [{'a': 1, 'b': 0}, {'a': 2}, {'a': 2, 'b': 0, 'extra': 1}]:
            with self.assertRaisesRegex(ValueError, 'mismatch'):
                restore.compare_counts({'a': 2, 'b': 0}, after)

    def test_ambient_libpq_settings_cannot_reroute_target(self):
        with patch.dict(os.environ, {'PGHOST': 'production', 'PGSERVICE': 'production', 'PGPASSFILE': 'production'}):
            env = pg_env('postgresql://localhost/db')
        self.assertEqual(env['PGDATABASE'], 'postgresql://localhost/db')
        self.assertNotIn('PGHOST', env)
        self.assertNotIn('PGSERVICE', env)
        self.assertNotIn('PGPASSFILE', env)


if __name__ == '__main__':
    unittest.main()
