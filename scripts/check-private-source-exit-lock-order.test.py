"""Pure harness input/receipt tests; these never run PostgreSQL."""
import importlib.util
import pathlib
import unittest
import tempfile
import json
import os
import subprocess
from unittest.mock import Mock, patch
import uuid

spec=importlib.util.spec_from_file_location('lock_order',pathlib.Path(__file__).with_name('check-private-source-exit-lock-order.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class PreparedHarnessTests(unittest.TestCase):
    def test_arguments_are_literals_not_executable_sql(self):
        sql=module.call('registered_port',['text'],["x'); drop table users; --"])
        self.assertEqual(sql,"select public.registered_port(E'x''); drop table users; --'::text);")
    def test_backslashes_are_explicitly_escaped_independent_of_session_setting(self):
        value="path\\'; drop table fictional; --"
        self.assertEqual(module.literal(value),"E'path\\\\''; drop table fictional; --'")
        self.assertEqual(module.literal("line\nnext"),"E'line\nnext'")
    def test_uuid_integer_boolean_types_fail_closed(self):
        for kind,value in [('uuid','forged'),('integer','2'),('boolean','true')]:
            with self.assertRaises((ValueError,AttributeError)):
                module.call('registered_port',[kind],[value])
    def test_missing_original_or_supplemental_matrix_refuses(self):
        with self.assertRaisesRegex(ValueError,'matrix'):
            module.validate_cases({'cases':[]})
    def test_native_create_receipt_binds_actual_workspace_and_system(self):
        workspace=str(uuid.uuid4()); system=str(uuid.uuid4())
        c={'workspaceId':workspace,'port':'create'}
        args=[workspace,str(uuid.uuid4()),'fictional@example.invalid',{'name':'Fictional','kind':'internal_app'},str(uuid.uuid4()),'digest']
        receipt={'system':{'businessId':workspace,'id':system,'name':'Fictional','kind':'internal_app'},'source':{'source':{'businessId':workspace,'systemId':system}}}
        module.verify_receipt(c,receipt,args)
        receipt['source']['source']['businessId']=str(uuid.uuid4())
        with self.assertRaisesRegex(AssertionError,'identity'):
            module.verify_receipt(c,receipt,args)
    def test_native_listing_receipt_binds_revision_agreement_and_creator(self):
        workspace=str(uuid.uuid4()); revision=str(uuid.uuid4()); system=str(uuid.uuid4())
        c={'workspaceId':workspace,'port':'listing'}
        args=[str(uuid.uuid4()),'fictional@example.invalid',{'workspaceId':workspace,'sourceRevisionId':revision,'agreementVersion':'fictional','rateReference':'fictional'}]
        receipt={'id':str(uuid.uuid4()),'creatorWorkspaceId':workspace,'sourceRevisionId':revision,'sourceSystemId':system,'definitionId':'system-source:'+system,'agreementVersion':'fictional','rateReference':'fictional'}
        module.verify_receipt(c,receipt,args)
        receipt['sourceRevisionId']=str(uuid.uuid4())
        with self.assertRaisesRegex(AssertionError,'listing'):
            module.verify_receipt(c,receipt,args)

class OwnedEnvironmentTests(unittest.TestCase):
    def fixture(self, directory):
        data=pathlib.Path(directory).resolve()
        binary=data/'psql';binary.write_text('#!/bin/sh\nexit 0\n');binary.chmod(0o700)
        receipt={'purpose':'private-source-exit-disposable','host':'127.0.0.1','port':61123,'database':'fictional_proof','user':'postgres','windowId':str(uuid.uuid4()),'dataDirectory':str(data),'postmasterPid':os.getpid(),'psqlPath':str(binary),'databaseOid':123,'systemIdentifier':'fictional','startedAt':'fictional'}
        (data/'postmaster.pid').write_text(str(os.getpid())+'\n'+str(data)+'\n0\n61123\n')
        (data/'strelva-private-source-exit-owned.json').write_text(json.dumps(receipt))
        return receipt
    def test_reconstructs_args_and_strips_libpq_routing(self):
        with tempfile.TemporaryDirectory(dir='/tmp') as directory:
            receipt=self.fixture(directory)
            base,env,_=module.owned_connection('postgresql://postgres:fictional@127.0.0.1:61123/fictional_proof',receipt,{'PGHOSTADDR':'203.0.113.1','PGSERVICE':'production','PGOPTIONS':'bad','HOME':'foreign'})
            self.assertIn('--host=127.0.0.1',base)
            self.assertFalse(any('postgresql://' in arg for arg in base))
            self.assertNotIn('PGHOSTADDR',env);self.assertNotIn('PGSERVICE',env);self.assertNotIn('HOME',env)
            self.assertEqual(env['PGOPTIONS'],'-c statement_timeout=5000 -c standard_conforming_strings=on')
    def test_routing_uri_options_and_dns_host_refuse(self):
        for url in ['postgresql://postgres@127.0.0.1:61123/fictional_proof?hostaddr=203.0.113.1','postgresql://postgres@127.0.0.1:61123/fictional_proof?service=production','postgresql://postgres@localhost:61123/fictional_proof']:
            with self.assertRaises(ValueError):
                module.owned_connection(url,{}, {})
    def test_mismatched_owned_endpoint_refuses(self):
        with tempfile.TemporaryDirectory(dir='/tmp') as directory:
            receipt=self.fixture(directory);receipt['database']='another'
            with self.assertRaisesRegex(ValueError,'identity'):
                module.owned_connection('postgresql://postgres@127.0.0.1:61123/fictional_proof',receipt,{})
    def test_each_connection_guard_pins_cluster_before_effects(self):
        with tempfile.TemporaryDirectory(dir='/tmp') as directory:
            receipt=self.fixture(directory)
            guard=module.connection_guard(receipt,pathlib.Path(directory).resolve())
            for premise in ['data_directory','current_database()','system_identifier','inet_server_port()','pg_postmaster_start_time()','standard_conforming_strings','private_source_owned_cluster_mismatch']:
                self.assertIn(premise,guard)
            self.assertEqual(guard.count(guard.split()[1]),2)
    def test_backend_disappearance_and_unknown_identity_are_distinct(self):
        self.assertEqual(module.backend_closed(None),'UNKNOWN')
        with patch.object(module.os,'kill',side_effect=ProcessLookupError):
            self.assertEqual(module.backend_closed(123),'CLOSED')
        with patch.object(module.os,'kill',side_effect=PermissionError):
            self.assertEqual(module.backend_closed(123),'UNKNOWN')
    def test_timeout_child_killed_reaped_and_sibling_still_closed(self):
        first=Mock(pid=1001,returncode=-9);first.poll.side_effect=[None,-9]
        first.wait.side_effect=[subprocess.TimeoutExpired('fictional',2),-9]
        second=Mock(pid=1002,returncode=-15);second.poll.side_effect=[None,-15];second.wait.return_value=-15
        closed=module.close_children([first,second])
        first.kill.assert_called_once();second.terminate.assert_called_once()
        self.assertEqual(len(closed),2);self.assertTrue(all(r['reaped'] for r in closed))
        self.assertTrue(all(r['forced'] for r in closed))
        self.assertTrue(closed[0]['errors'])

class RetainedEvidenceTests(unittest.TestCase):
    def test_timeout_text_does_not_retain_uri_password_or_sql_argv(self):
        error=subprocess.TimeoutExpired(['psql','postgresql://user:fictional-secret@foreign/db','private SQL'],15)
        self.assertEqual(module.safe_error(error),'Bounded child timeout after 15 seconds')
    def test_authorized_stop_retirement_keeps_spec_and_records_exact(self):
        workspace=str(uuid.uuid4());work=str(uuid.uuid4())
        old={'work_id':work,'workspace_id':workspace,'lifecycle_status':'draft','updated_at':'before','spec':{'title':'Fictional'}}
        new={**old,'lifecycle_status':'retired','updated_at':'after'}
        before={'application_states':[old],'application_records':[{'id':'record','value':'retained'}]}
        after={'application_states':[new],'application_records':before['application_records']}
        projection=module.compare_retained(before,after,workspace,True)
        self.assertEqual(projection[0]['workId'],work)
        after['application_states'][0]['spec']={'title':'changed'}
        with self.assertRaisesRegex(AssertionError,'specification'):
            module.compare_retained(before,after,workspace,True)
    def test_foreign_stop_and_nonstop_retirement_refuse(self):
        workspace=str(uuid.uuid4());work=str(uuid.uuid4())
        old={'work_id':work,'workspace_id':workspace,'lifecycle_status':'installed','updated_at':'before'}
        new={**old,'lifecycle_status':'retired','updated_at':'after'}
        for actual_workspace,stop in [(str(uuid.uuid4()),True),(workspace,False)]:
            with self.assertRaises(AssertionError):
                module.compare_retained({'application_states':[old]},{'application_states':[new]},actual_workspace,stop)

class VerifiedRuntimeTests(unittest.TestCase):
    def test_old_interpreter_refuses_before_effects(self):
        with patch.object(module.sys,'version_info',(3,9,6)):
            with self.assertRaisesRegex(RuntimeError,'unsupported interpreter'):
                module.verified_python_runtime()
    def test_other_implementation_refuses(self):
        with patch.object(module.platform,'python_implementation',return_value='PyPy'):
            with self.assertRaises(RuntimeError):
                module.verified_python_runtime()
    def test_verified_existing_runtime_receipt(self):
        if tuple(module.sys.version_info[:3])!=(3,14,6):
            self.skipTest('Verified interpreter only')
        receipt=module.verified_python_runtime()
        self.assertEqual(receipt['implementation'],'CPython')
        self.assertEqual(receipt['version'],'3.14.6')
        self.assertEqual(receipt['entry'],'/opt/homebrew/bin/python3')

if __name__=='__main__':
    unittest.main()
