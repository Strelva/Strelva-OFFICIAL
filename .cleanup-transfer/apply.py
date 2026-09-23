import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zlib

EXPECTED = 'b231739494b49fb06f883db0305b84a87f56d056774490af0aeaa3552dc93236'
ROOT = Path.cwd().resolve()
encoded = ''.join((ROOT / f'.cleanup-transfer/part-{i}').read_text() for i in range(5))
raw = zlib.decompress(base64.b64decode(encoded, validate=True))
if hashlib.sha256(raw).hexdigest() != EXPECTED:
    raise SystemExit('Delta integrity check failed')
manifest = json.loads(raw)
base = os.environ.get('LOCAL_BASE', manifest['base'])
def git(*args):
    return subprocess.check_output(['git', *args])
if git('rev-parse', f'{base}^{{tree}}').decode().strip() != manifest['baseTree']:
    raise SystemExit('Base tree mismatch')
def safe(name):
    path = Path(name)
    if path.is_absolute() or '..' in path.parts or not path.parts:
        raise SystemExit('Unsafe path')
    if path.parts[0] not in {'src', 'scripts', 'docs'} and name not in {'package.json', 'pnpm-lock.yaml'}:
        raise SystemExit('Path outside cleanup scope')
    target = ROOT / path
    if not target.resolve().is_relative_to(ROOT):
        raise SystemExit('Path escapes checkout')
    return target

def blob_sha(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

prepared = []
seen = set()
for entry in manifest['files']:
    target = safe(entry['path'])
    if entry['path'] in seen:
        raise SystemExit('Duplicate output path')
    seen.add(entry['path'])
    if entry.get('delete'):
        prepared.append((target, None))
        continue
    lines = []
    if 'source' in entry:
        safe(entry['source'])
        source = git('show', f"{base}:{entry['source']}")
        if blob_sha(source) != entry['sourceSha']:
            raise SystemExit('Source blob mismatch')
        lines = source.decode().splitlines(keepends=True)
    output = []
    for operation in entry['ops']:
        if isinstance(operation, str):
            output.append(operation)
        elif len(operation) == 2 and 0 <= operation[0] <= operation[1] <= len(lines):
            output.extend(lines[operation[0]:operation[1]])
        else:
            raise SystemExit('Invalid copy range')
    content = ''.join(output).encode()
    if blob_sha(content) != entry['sha'] or entry['mode'] != '100644':
        raise SystemExit('Output blob mismatch')
    prepared.append((target, content))
for target, content in prepared:
    if content is None:
        target.unlink()
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        target.chmod(0o644)
subprocess.run(['git', 'add', '--all', '--', *[entry['path'] for entry in manifest['files']]], check=True)
print(f"Applied {len(prepared)} checked source changes; expected tree {manifest['tree']}")
