"""Actual harmless local-child faults. Never loads a DB URL or invokes psql."""
import importlib.util
import json
import os
import pathlib
import signal
import subprocess
import sys
import tempfile
import threading
import time
from unittest.mock import patch
import hashlib
import inspect

spec=importlib.util.spec_from_file_location('source_harness',pathlib.Path(__file__).with_name('check-private-source-exit-lock-order.py'))
harness=importlib.util.module_from_spec(spec);spec.loader.exec_module(harness)
CHILD="import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); print('READY',flush=True); time.sleep(30)"
SIBLING="import time; print('READY',flush=True); time.sleep(30)"
ENV={'PATH':'/usr/bin:/bin','LC_ALL':'C'}


def launch(registry, receipt, resistant=False):
    process=registry.spawn([sys.executable,'-I','-c',CHILD if resistant else SIBLING],receipt,env=ENV,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if process.stdout.readline().strip()!='READY':
        raise AssertionError('Harmless child readiness missing')
    receipt['backendPid']=process.pid  # Local child disappearance only, no DB backend.
    return process


def assert_closed(registry):
    for entry in registry.entries:
        p=entry['process']
        if p.poll() is None or harness.backend_closed(p.pid)!='CLOSED':
            raise AssertionError('Actual harmless child survived/reap unproven')


def spawn_gap_case(directory):
    gate=harness.SignalGate();gate.install();registry=harness.ChildRegistry(gate)
    evidence={'status':'PASS','scope':'harmless-local-child-only','fullReleaseQualified':False}
    stop=threading.Event();sender=None
    try:
        sibling={};launch(registry,sibling)
        vulnerable={};actual_popen=subprocess.Popen
        def gap_popen(*args,**kwargs):
            process=actual_popen(*args,**kwargs)
            if process.stdout.readline().strip()!='READY':
                raise AssertionError('TERM-resistant child did not become ready')
            # Exact fault: OS child exists, wrapper has not returned Popen yet,
            # caller assignment/registration have not occurred.
            os.kill(os.getpid(),signal.SIGINT);os.kill(os.getpid(),signal.SIGTERM)
            return process
        observed=False
        with patch.object(harness.subprocess,'Popen',gap_popen):
            try:
                registry.spawn([sys.executable,'-I','-c',CHILD],vulnerable,env=ENV,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            except RuntimeError as error:
                observed='after ownership' in str(error)
        if not observed or len(registry.entries)!=2:
            raise AssertionError('Spawn interruption escaped registry ownership')
        for entry in registry.entries:
            entry['receipt']['backendPid']=entry['process'].pid
        def repeat():
            # Repeat SIGINT/SIGTERM while TERM-resistant wait/KILL/reap runs.
            for number in [signal.SIGINT,signal.SIGTERM]*5:
                if stop.wait(0.03):
                    return
                os.kill(os.getpid(),number)
        sender=threading.Thread(target=repeat);sender.start()
        terminal=harness.finish_owned_run(gate,registry,directory/'spawn-gap.json',evidence)
        stop.set();sender.join(timeout=2)
        assert_closed(registry)
        saved=json.loads(pathlib.Path(terminal['path']).read_text())
        if saved['status']!='HOLD' or len(saved['signals'])<4 or not all(r['reaped'] for r in saved['terminalChildren']):
            raise AssertionError('Repeated-signal fault evidence missing or wrongly green')
        resistant=next(r for r in saved['terminalChildren'] if r['clientPid']==vulnerable['clientPid'])
        if resistant['returncode']!=-signal.SIGKILL or not resistant['errors']:
            raise AssertionError('Actual TERM-resistant child did not require bounded KILL/reap')
        return saved
    finally:
        stop.set()
        if sender:
            sender.join(timeout=2)
        with gate.protected(deliver=False):
            registry.close()
        gate.restore()


def retention_case(directory):
    gate=harness.SignalGate();gate.install();registry=harness.ChildRegistry(gate)
    evidence={'status':'PASS','scope':'harmless-local-child-only','fullReleaseQualified':False}
    try:
        launch(registry,{})
        primary=directory/'retention-failure.json';primary.mkdir()
        original_replace=harness.os.replace;injected=False
        def replace_fault(source,destination):
            nonlocal injected
            if not injected:
                injected=True;os.kill(os.getpid(),signal.SIGTERM)
            return original_replace(source,destination)
        with patch.object(harness.os,'replace',replace_fault):
            terminal=harness.finish_owned_run(gate,registry,primary,evidence)
        assert_closed(registry)
        if terminal['status']!='FALLBACK_HOLD':
            raise AssertionError('Primary retention failure did not retain independent fallback')
        saved=json.loads(pathlib.Path(terminal['path']).read_text())
        if saved['status']!='HOLD' or 'retentionFailure' not in saved or signal.SIGTERM not in saved['signals']:
            raise AssertionError('Signal during failed retention was lost')
        return saved
    finally:
        with gate.protected(deliver=False):
            registry.close()
        gate.restore()


def backend_gate_case(directory):
    gate=harness.SignalGate();gate.install();registry=harness.ChildRegistry(gate)
    evidence={'status':'PASS','scope':'harmless-local-child-only','fullReleaseQualified':False}
    try:
        launch(registry,{})
        observed_depth=[]
        def backend_fault(pid):
            observed_depth.append(gate.depth)
            os.kill(os.getpid(),signal.SIGINT);os.kill(os.getpid(),signal.SIGTERM)
            return harness.backend_closed(pid)
        terminal=harness.finish_owned_run(gate,registry,directory/'backend-gate.json',evidence,backend_check=backend_fault)
        assert_closed(registry)
        saved=json.loads(pathlib.Path(terminal['path']).read_text())
        if saved['status']!='HOLD' or saved['signals']!=[signal.SIGINT,signal.SIGTERM] or observed_depth!=[1]:
            raise AssertionError('Backend-closure repeated signals escaped protected terminal retention')
        return saved
    finally:
        with gate.protected(deliver=False):
            registry.close()
        gate.restore()


def final_handoff_case(directory):
    gate=harness.SignalGate();gate.install();registry=harness.ChildRegistry(gate)
    evidence={'status':'PASS','scope':'harmless-local-child-only','fullReleaseQualified':False}
    try:
        receipt={}
        process=registry.spawn([sys.executable,'-I','-c',"print('READY',flush=True)"],receipt,env=ENV,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if process.stdout.readline().strip()!='READY':
            raise AssertionError('Natural-exit child readiness missing')
        process.wait(timeout=2);receipt['backendPid']=process.pid
        source,start=inspect.getsourcelines(harness.finish_owned_run)
        line=start+next(i for i,text in enumerate(source) if text.strip()=='return receipt')
        injected=[]
        def trace(frame,event,arg):
            if frame.f_code is harness.finish_owned_run.__code__ and event=='line' and frame.f_lineno==line and not injected:
                injected.append({'line':line,'depth':gate.depth})
                os.kill(os.getpid(),signal.SIGTERM)
            return trace
        sys.settrace(trace)
        try:
            terminal=harness.finish_owned_run(gate,registry,directory/'final-handoff.json',evidence)
        finally:
            sys.settrace(None)
        saved=json.loads(pathlib.Path(terminal['path']).read_text())
        accepts=not gate.pending and evidence['status']=='PASS' and terminal['status']=='RETAINED'
        if saved['status']!='HOLD' or evidence['status']!='HOLD' or gate.pending!=[signal.SIGTERM] or accepts or not injected or injected[0]['depth']!=1:
            raise AssertionError('Final deferred handoff signal incorrectly qualified clean natural exit')
        if any(row['forced'] or not row['reaped'] for row in saved['terminalChildren']):
            raise AssertionError('Late signal control must exercise natural, unforced child closure')
        assert_closed(registry)
        saved['observedFinalHandoff']={'injected':injected,'pending':gate.pending,'inMemoryStatus':evidence['status'],'mainAccepts':accepts,'childNaturalExit':True}
        return saved
    finally:
        sys.settrace(None)
        with gate.protected(deliver=False):
            registry.close()
        gate.restore()


def persist_release_case(directory):
    gate=harness.SignalGate();gate.install();registry=harness.ChildRegistry(gate)
    evidence={'status':'PASS','scope':'harmless-local-child-only','fullReleaseQualified':False}
    try:
        receipt={}
        process=registry.spawn([sys.executable,'-I','-c',"print('READY',flush=True)"],receipt,env=ENV,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if process.stdout.readline().strip()!='READY':
            raise AssertionError('Natural-exit child readiness missing')
        process.wait(timeout=2);receipt['backendPid']=process.pid
        source,start=inspect.getsourcelines(harness.finish_owned_run)
        line=start+next(i for i,text in enumerate(source) if text.strip()=='writing=False')
        injected=[]
        def trace(frame,event,arg):
            if frame.f_code.co_name=='persist_terminal' and event=='line' and frame.f_lineno==line and not injected:
                injected.append({'line':line,'depth':gate.depth,'writingBeforeRelease':frame.f_locals['writing']})
                os.kill(os.getpid(),signal.SIGTERM)
            return trace
        sys.settrace(trace)
        try:
            terminal=harness.finish_owned_run(gate,registry,directory/'persist-release.json',evidence)
        finally:
            sys.settrace(None)
        saved=json.loads(pathlib.Path(terminal['path']).read_text())
        accepts=not gate.pending and evidence['status']=='PASS' and terminal['status']=='RETAINED'
        if saved['status']!='HOLD' or saved['signals']!=[signal.SIGTERM] or evidence['status']!='HOLD' or accepts or not injected or not injected[0]['writingBeforeRelease']:
            raise AssertionError('Writer-release gap lost durable HOLD invalidation')
        if any(row['forced'] or not row['reaped'] for row in saved['terminalChildren']):
            raise AssertionError('Writer-release control must use clean natural child exit')
        assert_closed(registry)
        saved['observedWriterRelease']={'injected':injected,'pending':gate.pending,'inMemoryStatus':evidence['status'],'retainedStatus':saved['status'],'mainAccepts':accepts,'childNaturalExit':True}
        return saved
    finally:
        sys.settrace(None)
        with gate.protected(deliver=False):
            registry.close()
        gate.restore()


def main():
    runtime=harness.verified_python_runtime()
    if len(sys.argv)!=2:
        raise SystemExit('Usage: harmless-child-faults retained-proof.json')
    output=pathlib.Path(sys.argv[1])
    if output.exists():
        raise SystemExit('Refuse overwriting prior fault evidence')
    report={'scope':'actual-harmless-local-child-faults','pythonRuntime':runtime,'databaseExecuted':False,'nativeSQLExecuted':False,'fullReleaseQualified':False,'status':'RUNNING','cases':[]}
    try:
        with tempfile.TemporaryDirectory(prefix='source-child-fault-',dir='/tmp') as temp:
            directory=pathlib.Path(temp)
            for name,fn in [('spawn-gap/repeated-signals/TERM-resistant/sibling',spawn_gap_case),('retention-failure/signal-during-terminal-write',retention_case),('repeated-signals-inside-backend-closure',backend_gate_case),('final-handoff-signal-after-clean-natural-exit',final_handoff_case),('writer-release-signal-after-last-dirty-check',persist_release_case)]:
                retained=fn(directory)
                report['cases'].append({'case':name,'faultObserved':True,'retainedTerminal':retained})
        report['status']='FAULT_CONTROLS_PASS'
    except BaseException as error:
        report['status']='HOLD';report['failure']=harness.safe_error(error)
        raise
    finally:
        report['harnessSha256']=hashlib.sha256(pathlib.Path(harness.__file__).read_bytes()).hexdigest()
        output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'caseCount':len(report['cases']),'databaseExecuted':False}))


if __name__=='__main__':
    main()
