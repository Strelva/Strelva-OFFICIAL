"""Actual native rollback races on databases owned by the parent SQL check."""
import pathlib
import re
import subprocess
import sys
import time

socket, port, username, repo, work = sys.argv[1:]
root = pathlib.Path(repo)
owned = pathlib.Path(work)
rollback = root / "supabase/migrations/rollback-20261020090036_bundle_maintenance.sql"
fixture = (root / "tests/recurring-responsibilities-schema.sql").read_text().split("-- A revoked accepted mandate")[0]
fixture += (root / "tests/bundle-maintenance-schema.sql").read_text().split("create temp table bm_attachment")[0] + "\ncommit;\n"
attach = "select public.attach_keep_me_found_maintenance('99100000-0000-4000-8000-000000000001','rr-owner@example.test',(select id from public.responsibility_bundles where idempotency_key='bundle:1'),'99100000-0000-4000-8000-000000000201','location','business_record','approve');"

def args(db):
    return ["psql", "--host="+socket, "--port="+port, "--username="+username, "--dbname="+db, "--no-psqlrc", "-At", "-v", "ON_ERROR_STOP=1"]

def run(db, sql, ok=True):
    result = subprocess.run(args(db)+["-c", sql], text=True, capture_output=True)
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    return result

def prepare(db):
    subprocess.run(["createdb", "--host="+socket, "--port="+port, "--username="+username, "--template=postgres", db], check=True)
    result = subprocess.run(args(db), input=fixture, text=True, capture_output=True)
    assert result.returncode == 0, result.stderr

def wait_for(db, name, wait_event):
    for _ in range(100):
        found = run(db, "select count(*) from pg_stat_activity where application_name='"+name+"' and wait_event='"+wait_event+"';").stdout.strip()
        if found == "1":
            return
        time.sleep(0.02)
    raise AssertionError("Controlled race barrier did not arrive: "+name+"/"+wait_event)

prepare("maintenance_writer_first")
writer = subprocess.Popen(args("maintenance_writer_first")+["-c", "set application_name='maintenance-writer-first'; begin; "+attach+" select pg_sleep(2); commit;"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
wait_for("maintenance_writer_first", "maintenance-writer-first", "PgSleep")
inverse = subprocess.run(args("maintenance_writer_first")+["-f", str(rollback)], text=True, capture_output=True)
out, err = writer.communicate(timeout=8)
assert writer.returncode == 0, err
(owned / "rollback-writer-first.log").write_text(inverse.stdout+inverse.stderr+out+err)
assert inverse.returncode != 0 and "bundle_maintenance_evidence_preservation_required" in inverse.stderr, "Writer-first inverse erased committed evidence: "+inverse.stdout+inverse.stderr
assert run("maintenance_writer_first", "select count(*) from public.bundle_maintenance_attachments;").stdout.strip() == "1"
print("Writer-first: inverse waited, refused, and preserved the committed attachment.")
print(inverse.stderr.strip())

prepare("maintenance_writer_timeout")
writer = subprocess.Popen(args("maintenance_writer_timeout")+["-c", "set application_name='maintenance-writer-timeout'; begin; "+attach+" select pg_sleep(4); commit;"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
wait_for("maintenance_writer_timeout", "maintenance-writer-timeout", "PgSleep")
started = time.monotonic()
inverse = subprocess.run(args("maintenance_writer_timeout")+["-f", str(rollback)], text=True, capture_output=True, timeout=6)
elapsed = time.monotonic()-started
assert inverse.returncode != 0 and "lock timeout" in inverse.stderr and elapsed < 5, inverse.stdout+inverse.stderr
out, err = writer.communicate(timeout=8)
assert writer.returncode == 0, err
assert run("maintenance_writer_timeout", "select count(*) from public.bundle_maintenance_attachments;").stdout.strip() == "1"
print("Writer holds beyond timeout: inverse refused in %.2fs and committed attachment retained." % elapsed)
print(inverse.stderr.strip())

prepare("maintenance_inverse_first")
inverse_sql = rollback.read_text().replace("commit;", "select pg_sleep(2); commit;")
inverse = subprocess.Popen(args("maintenance_inverse_first")+["-c", "set application_name='maintenance-inverse-first'; "+inverse_sql], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
try:
    wait_for("maintenance_inverse_first", "maintenance-inverse-first", "PgSleep")
except AssertionError:
    out, err = inverse.communicate(timeout=8)
    raise AssertionError(out+err)
writer = subprocess.run(args("maintenance_inverse_first")+["-c", attach], text=True, capture_output=True, timeout=8)
out, err = inverse.communicate(timeout=8)
(owned / "rollback-inverse-first.log").write_text(out+err+writer.stdout+writer.stderr)
assert inverse.returncode == 0, err
assert writer.returncode != 0 and ("does not exist" in writer.stderr or "could not open relation" in writer.stderr), writer.stdout+writer.stderr
assert run("maintenance_inverse_first", "select to_regclass('public.bundle_maintenance_attachments') is null;").stdout.strip() == "t"
assert run("maintenance_inverse_first", "select count(*) from public.responsibility_bundles;").stdout.strip() == "1"
print("Inverse-first: delayed writer refused; existing bundle retained and no new receipt admitted.")
print(writer.stderr.strip())

prepare("maintenance_inverse_drift")
signature = "public.check_bundle_maintenance_attachment(uuid,uuid,text)"
source = (root / "supabase/migrations/20261020090036_bundle_maintenance.sql").read_text()
original = re.search(r"create function public\.check_bundle_maintenance_attachment\(.*?\$\$;", source, re.S).group(0).replace("create function", "create or replace function", 1)
for kind, alter, restore, reason in [
    ("definition", original.replace(" $$;", " -- successor drift\n $$;"), original, "function_drift"),
    ("security", "alter function "+signature+" security invoker;", "alter function "+signature+" security definer;", "function_drift"),
    ("configuration", "alter function "+signature+" set search_path=public;", "alter function "+signature+" set search_path=public,pg_temp;", "function_drift"),
    ("ACL", "grant execute on function "+signature+" to authenticated;", "revoke execute on function "+signature+" from authenticated;", "acl_drift"),
]:
    run("maintenance_inverse_drift", alter)
    inverse = subprocess.run(args("maintenance_inverse_drift")+["-f", str(rollback)], text=True, capture_output=True)
    assert inverse.returncode != 0 and "bundle_maintenance_rollback_"+reason in inverse.stderr, kind+": "+inverse.stdout+inverse.stderr
    assert run("maintenance_inverse_drift", "select to_regclass('public.bundle_maintenance_attachments') is not null;").stdout.strip() == "t"
    print("Actual "+kind+" drift: inverse refused and objects retained.")
    print(inverse.stderr.strip())
    run("maintenance_inverse_drift", restore)
inverse = subprocess.run(args("maintenance_inverse_drift")+["-f", str(rollback)], text=True, capture_output=True)
assert inverse.returncode == 0, inverse.stderr
print("Restored exact definitions/security/config/ACL: empty inverse succeeds.")
