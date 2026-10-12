import importlib.util,pathlib,sys,os,signal,subprocess,json,hashlib
root=pathlib.Path(__file__).parent
spec=importlib.util.spec_from_file_location('h',root/'check-private-source-exit-lock-order.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
gate=h.SignalGate();gate.install();registry=h.ChildRegistry(gate);evidence={'status':'PASS','scope':'harmless-local-child-only','fullReleaseQualified':False};seen=[]
try:
 receipt={};p=registry.spawn([sys.executable,'-I','-c',"print('READY',flush=True)"],receipt,env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 assert p.stdout.readline().strip()=='READY';p.wait(timeout=2);receipt['backendPid']=p.pid
 lines=(root/'check-private-source-exit-lock-order.py').read_text().splitlines()
 line=next(i+1 for i,s in enumerate(lines) if s.strip()=='writing=False')
 def trace(frame,event,arg):
  if frame.f_code.co_name=='persist_terminal' and event=='line' and frame.f_lineno==line and not seen:
   seen.append({'line':line,'depth':gate.depth});os.kill(os.getpid(),signal.SIGTERM)
  return trace
 sys.settrace(trace)
 try: terminal=h.finish_owned_run(gate,registry,root/'persist-gap-primary.json',evidence)
 finally:sys.settrace(None)
 saved=json.loads(pathlib.Path(terminal['path']).read_text());gone=h.backend_closed(p.pid)
 result={'harnessSha256':hashlib.sha256(pathlib.Path(h.__file__).read_bytes()).hexdigest(),'injected':seen,'pending':gate.pending,'memoryStatus':evidence['status'],'retainedStatus':saved['status'],'retainedSignals':saved['signals'],'mainAccepts':not gate.pending and evidence['status']=='PASS' and terminal['status']=='RETAINED','childReturncode':p.returncode,'childGone':gone,'scope':'actual-harmless-local-child-only','databaseExecuted':False}
 (root/'persist-gap-observation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
 assert seen and evidence['status']=='HOLD' and saved['status']=='PASS' and gone=='CLOSED'
finally:
 sys.settrace(None)
 with gate.protected(deliver=False):registry.close()
 gate.restore()
