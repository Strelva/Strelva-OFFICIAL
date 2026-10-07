"""Local release-rehearsal primitives. No dependencies or application credentials."""
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlsplit, parse_qs, unquote, urlunsplit, quote

BIN = Path('/opt/homebrew/opt/postgresql@18/bin')


def is_local_url(url):
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in ('postgres', 'postgresql') or not parsed.path.strip('/'):
            return False
        # libpq query parameters override the authority. Refuse routing/command overrides.
        query = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
        allowed = {'sslmode', 'connect_timeout', 'application_name', 'channel_binding', 'gssencmode', 'host', 'port'}
        if set(query) - allowed or any(len(v) != 1 for v in query.values()):
            return False
        host = parsed.hostname or ''
        if 'host' in query:
            if host or not query['host'][0].startswith('/') or ',' in query['host'][0]:
                return False
            return True  # An absolute Unix socket directory is local.
        if host == 'localhost' or host.endswith('.localhost'):
            return True
        return ipaddress.ip_address(host).is_loopback
    except (ValueError, TypeError):
        return False


def require_local(url, jacobs_yes=False):
    if not is_local_url(url) and not jacobs_yes:
        raise ValueError('Refusing a non-local Postgres target without --i-have-jacobs-yes.')


def db_url(admin, name):
    p = urlsplit(admin)
    return urlunsplit((p.scheme, p.netloc, '/' + quote(name, safe=''), p.query, ''))


def pg_env(url):
    # PGHOST/PGSERVICE/PASSFILE etc must not reroute an explicitly selected connection.
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env.update(PGDATABASE=url, PGAPPNAME='strelva-release-rehearsal')
    return env


def command(name, args, url, *, input=None, timeout=300):
    binary = str(BIN / name) if (BIN / name).exists() else name
    result = subprocess.run([binary, *args], env=pg_env(url), input=input,
                            text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        # PostgreSQL diagnostics may contain row data / connection credentials.
        with tempfile.NamedTemporaryFile(mode='w', prefix='strelva-pg-error-', suffix='.log', delete=False) as diagnostic:
            os.chmod(diagnostic.name, 0o600)
            diagnostic.write(result.stderr)
        raise RuntimeError(f'{name} failed (exit {result.returncode}); private diagnostics: {diagnostic.name}')
    return result.stdout.strip()


def sql(url, text=None, file=None):
    args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1']
    args += ['-f', str(file)] if file else ['-c', text]
    return command('psql', args, url)


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


def catalog(url, root):
    return json.loads(sql(url, file=root / 'scripts/release-safety/catalog.sql'))
