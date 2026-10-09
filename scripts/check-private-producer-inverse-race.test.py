"""Pure lock matcher regression; synthetic rows are not native observations."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('producer', Path(__file__).with_name('check-private-producer-inverse-race.py'))
producer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(producer)


class ObservedMarkerWait(unittest.TestCase):
    def setUp(self):
        self.pid = 123
        self.locks = [
            {'pid': 123, 'relation': 'public.private_source_install_grants', 'mode': 'RowExclusiveLock', 'granted': True},
            {'pid': 123, 'relation': 'public.private_application_sources', 'mode': 'AccessShareLock', 'granted': True},
        ]
        self.wait = {'pid': 456, 'relation': 'public.private_application_sources', 'mode': 'AccessExclusiveLock', 'granted': False, 'wait': 'Lock', 'blockers': [123]}

    def match(self, row=None, locks=None, case='grant'):
        return producer.observed_marker_wait([self.wait if row is None else row], self.locks if locks is None else locks, self.pid, case)

    def test_ordered_source_first_requires_both_exact_holder_locks(self):
        self.assertEqual(self.match(), self.wait)
        for locks in [[], self.locks[:1], self.locks[1:], [{**x, 'pid': 999} for x in self.locks], [{**x, 'granted': False} for x in self.locks]]:
            self.assertIsNone(self.match(locks=locks))

    def test_exact_grant_marker_wait_remains_accepted(self):
        row = {**self.wait, 'relation': 'private_source_install_grants'}
        self.assertEqual(self.match(row, self.locks[:1]), row)

    def test_source_case_requires_its_actual_producer_write_lock(self):
        self.assertIsNone(self.match(case='source'))
        locks = [{**self.locks[1], 'mode': 'RowExclusiveLock'}]
        self.assertEqual(self.match(locks=locks, case='source'), self.wait)
        self.assertIsNone(self.match({**self.wait, 'relation': 'private_source_install_grants'}, locks, 'source'))

    def test_unrelated_pid_relation_mode_or_granted_wait_never_qualifies(self):
        for change in [{'blockers': [999]}, {'relation': 'public.system_versions'}, {'mode': 'RowShareLock'}, {'granted': True}, {'wait': 'Client'}, {'pid': 123}]:
            self.assertIsNone(self.match({**self.wait, **change}))


if __name__ == '__main__':
    unittest.main()
