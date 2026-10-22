#!/usr/bin/env python3
"""Single-entry local judge setup. Python 3.10+, standard library only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import time
import urllib.request
import zipfile
import getpass

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / '.runtime'

def run(argv, **kwargs):
    return subprocess.run([str(v) for v in argv], cwd=ROOT, check=True, **kwargs)

def fetch(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        return response.read()

def node_runtime():
    candidates = [shutil.which('node')]
    candidates += list((RUNTIME / 'node').glob('node-*/node.exe'))
    candidates += list((RUNTIME / 'node').glob('node-*/bin/node'))
    for candidate in candidates:
        if not candidate:
            continue
        try:
            major = int(run([candidate, '-p', 'process.versions.node.split(".")[0]'], capture_output=True, text=True).stdout.strip())
            if major >= 22:
                print('Using Node', run([candidate, '--version'], capture_output=True, text=True).stdout.strip())
                return Path(candidate).resolve()
        except (OSError, ValueError, subprocess.CalledProcessError):
            pass
    systems = {'Darwin': 'darwin', 'Linux': 'linux', 'Windows': 'win'}
    arches = {'x86_64': 'x64', 'AMD64': 'x64', 'arm64': 'arm64', 'aarch64': 'arm64', 'ARM64': 'arm64'}
    system, arch = systems.get(platform.system()), arches.get(platform.machine())
    if not system or not arch:
        raise RuntimeError('Unsupported platform. Install Node 22+ from https://nodejs.org and rerun.')
    base = 'https://nodejs.org/dist/latest-v22.x/'
    sums = fetch(base + 'SHASUMS256.txt').decode()
    extension = 'zip' if system == 'win' else 'tar.gz'
    match = re.search(r'^([a-f0-9]{64})\s+(node-v22\.[\d.]+-' + system + '-' + arch + r'\.' + re.escape(extension) + r')$', sums, re.M)
    if not match:
        raise RuntimeError('No official Node 22 binary for this OS/CPU. Install Node manually and rerun.')
    digest, filename = match.groups()
    print('Installing official Node 22 locally for', platform.system(), arch, '(no administrator access).')
    payload = fetch(base + filename)
    if hashlib.sha256(payload).hexdigest() != digest:
        raise RuntimeError('Node download checksum mismatch; refusing to install.')
    folder = RUNTIME / 'node'
    folder.mkdir(exist_ok=True)
    archive = folder / filename
    archive.write_bytes(payload)
    # Validate all extraction paths, including tar link targets, before writing.
    def contained(name):
        target = (folder / name).resolve()
        return target == folder.resolve() or folder.resolve() in target.parents
    if extension == 'zip':
        with zipfile.ZipFile(archive) as bundle:
            if any(not contained(entry.filename) for entry in bundle.infolist()):
                raise RuntimeError('Unsafe archive path.')
            bundle.extractall(folder)
    else:
        with tarfile.open(archive) as bundle:
            for entry in bundle.getmembers():
                if not contained(entry.name) or entry.isdev():
                    raise RuntimeError('Unsafe archive path.')
                if entry.issym() and not contained(str(Path(entry.name).parent / entry.linkname)):
                    raise RuntimeError('Unsafe archive link.')
                if entry.islnk() and not contained(entry.linkname):
                    raise RuntimeError('Unsafe archive hard link.')
            bundle.extractall(folder)
    installed = folder / filename.removesuffix('.' + extension)
    node = installed / ('node.exe' if system == 'win' else 'bin/node')
    run([node, '--version'])
    return node

def npm_command(node):
    candidates = [node.parent / 'node_modules/npm/bin/npm-cli.js', node.parent.parent / 'lib/node_modules/npm/bin/npm-cli.js']
    for cli in candidates:
        if cli.exists():
            return [node, cli]
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if npm:
        # npm.cmd is a command shim; invoke its JS entry directly on Windows.
        cli = Path(npm).parent / 'node_modules/npm/bin/npm-cli.js'
        if cli.exists():
            return [node, cli]
        return [npm]
    raise RuntimeError('npm is missing. Install the full Node 22+ distribution, then rerun.')

def environment(node):
    code = "import fs from 'node:fs';import dotenv from 'dotenv';console.log(JSON.stringify(fs.existsSync('.env')?dotenv.parse(fs.readFileSync('.env')):{}))"
    values = json.loads(run([node, '--input-type=module', '-e', code], capture_output=True, text=True).stdout)
    # Explicit shell variables override file settings; never print secret values.
    for key in list(values) + ['LLM_API', 'LLM_API_KEY', 'TRAINIUM_LLM_MODEL', 'STP_API', 'STT_API_KEY', 'TTS_API', 'TTS_API_KEY', 'DEMO_MODE']:
        if key in os.environ:
            values[key] = os.environ[key]
    return values

def write_environment(values):
    filename = ROOT / '.env'
    existing = filename.read_text() if filename.exists() else '# Private local configuration; never commit.\n'
    for key, value in values.items():
        line = key + '=' + json.dumps(str(value))
        pattern = r'^' + re.escape(key) + r'=.*$'
        if re.search(pattern, existing, re.M):
            existing = re.sub(pattern, lambda _: line, existing, flags=re.M)
        else:
            existing = existing.rstrip() + '\n' + line + '\n'
    filename.write_text(existing)
    if os.name != 'nt':
        filename.chmod(0o600)

def choose_port(preferred, used):
    for port in list(range(preferred, min(preferred + 100, 65536))) + [0]:
        if port in used:
            continue
        with socket.socket() as listener:
            if os.name == 'nt':
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            try:
                listener.bind(('127.0.0.1', port))
                chosen = listener.getsockname()[1]
            except OSError:
                continue
        if chosen in used:
            continue
        if chosen != preferred:
            print('Port', preferred, 'is occupied; using', chosen, 'instead. Existing process left running.')
        used.add(chosen)
        return chosen
    raise RuntimeError('No local ports available.')

def alive_url(url):
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            return response.status == 200
    except Exception:
        return False

def prompt(values):
    print('\nOptional live services. Leave URLs blank to keep that feature disabled.')
    print('Provider requests may incur charges. Keys stay in your local ignored .env.')
    for label, url_key, key_key in [('LLM (OpenAI-compatible)', 'LLM_API', 'LLM_API_KEY'), ('Speech-to-text', 'STP_API', 'STT_API_KEY'), ('Text-to-speech', 'TTS_API', 'TTS_API_KEY')]:
        previous = values.get(url_key, '')
        entered = input(label + ' base URL [' + previous + ']: ').strip()
        values[url_key] = entered or previous
        if values[url_key]:
            key = getpass.getpass(label + ' API key (blank keeps existing/no key): ')
            if key:
                values[key_key] = key
    if values.get('LLM_API'):
        values['TRAINIUM_LLM_MODEL'] = input('LLM model ID [' + values.get('TRAINIUM_LLM_MODEL', '') + ']: ').strip() or values.get('TRAINIUM_LLM_MODEL', '')
        if not values['TRAINIUM_LLM_MODEL']:
            raise RuntimeError('Live LLM needs the model ID supplied by your provider.')
    for prefix, key, custom in [('STT', 'STP_API', 'whisper'), ('TTS', 'TTS_API', 'kokoro')]:
        if values.get(key):
            current = values.get(prefix + '_API_FORMAT', custom)
            values[prefix + '_API_FORMAT'] = input(prefix + ' API format (openai/' + custom + ') [' + current + ']: ').strip() or current
            if values[prefix + '_API_FORMAT'] not in ['openai', custom]:
                raise RuntimeError('Unsupported speech API format.')
    for key, fallback in [('STT_MODEL', 'whisper-1'), ('TTS_MODEL', 'tts-1'), ('TTS_VOICE', 'alloy')]:
        if values.get('STT_API_FORMAT' if key.startswith('STT') else 'TTS_API_FORMAT') == 'openai':
            values[key] = input(key + ' [' + values.get(key, fallback) + ']: ').strip() or values.get(key, fallback)

def smoke_check(base):
    def request(route, data=None):
        headers = {'Content-Type': 'application/json'} if data is not None else {}
        body = json.dumps(data).encode() if data is not None else None
        with urllib.request.urlopen(urllib.request.Request(base + route, data=body, headers=headers), timeout=15) as response:
            return response.read().decode()
    events = [json.loads(line) for line in request('/api/chat', {'message': 'How much rice is available?'}).splitlines() if line.strip()]
    calls = [event for event in events if event.get('type') == 'tool_result']
    reply = next(event['reply'] for event in events if event.get('type') == 'done')
    assert calls and all(call['name'] == 'get_inventory' and not call['isError'] for call in calls)
    rice = calls[-1]['result']['items'][0]
    assert rice['item'] in reply and str(rice['stock']) in reply
    catalog = json.loads(request('/shop/raj-demo/api/search?q=dal'))
    assert catalog['items'] and all('stock' not in item and 'unitCost' not in item for item in catalog['items'])
    expected = [call['requestId'] for call in calls] + [catalog['audit']['requestId']]
    options = json.loads(request('/store/api/admin/login-options'))
    login_request = urllib.request.Request(base + '/store/api/admin/login', data=json.dumps(options['demo']).encode(), headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(login_request, timeout=10) as login_response:
        cookies = '; '.join(value.split(';')[0] for value in login_response.headers.get_all('Set-Cookie', []))
    audit_request = urllib.request.Request(base + '/store/api/admin/audit', headers={'Cookie':cookies})
    with urllib.request.urlopen(audit_request, timeout=10) as audit_response:
        audit = json.loads(audit_response.read())
    for request_id in expected:
        record = next(call for call in audit['calls'] if call['requestId'] == request_id)
        assert record['queries'], 'Missing persisted SQL evidence'
    print('PASS: real MCP rice count, scoped customer lookup, matching persisted audit IDs/SQL. No emails, stock edits or purchases.', flush=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Configure/check optional AI services; small test requests can incur provider charges.')
    parser.add_argument('--demo', action='store_true', help='Force credential-free, deterministic MCP mode.')
    parser.add_argument('--non-interactive', action='store_true', help='Read .env/environment without prompting.')
    parser.add_argument('--verify', action='store_true', help='Run typecheck, unit/owner/OAuth suites plus the MCP self-test, then stop.')
    parser.add_argument('--test', action='store_true', help='Start, verify real MCP inventory/customer/audit calls, then stop.')
    parser.add_argument('--no-start', action='store_true', help='Install/configure/check only.')
    args = parser.parse_args()
    if args.verify:
        args.test = True
    if args.test and args.no_start:
        parser.error('--test/--verify cannot be combined with --no-start.')
    if args.live and args.demo:
        parser.error('Choose --live or --demo.')
    RUNTIME.mkdir(exist_ok=True)
    if os.name != 'nt':
        RUNTIME.chmod(0o700)
    print('StoreYog judge setup |', platform.system(), platform.machine(), flush=True)
    node = node_runtime()
    os.environ['PATH'] = str(node.parent) + os.pathsep + os.environ.get('PATH', '')
    # Reinstall only when the lockfile or Node native-module ABI changes.
    fingerprint = hashlib.sha256((ROOT / 'package-lock.json').read_bytes() + run([node, '-p', 'process.versions.modules'], capture_output=True).stdout).hexdigest()
    stamp = RUNTIME / 'dependencies.sha256'
    if not (ROOT / 'node_modules/tsx').exists() or not stamp.exists() or stamp.read_text() != fingerprint:
        print('Installing locked dependencies (SQLite and image processing included)...', flush=True)
        try:
            run(npm_command(node) + ['ci', '--no-audit', '--no-fund'])
        except subprocess.CalledProcessError:
            raise RuntimeError('Dependency install failed. Check internet access. If native prebuilt binaries are unavailable, install OS C++ build tools (README) and retry.')
        stamp.write_text(fingerprint)
    values = environment(node)
    live = args.live or (not args.demo and values.get('DEMO_MODE') == 'false')
    if not live and not args.demo and not args.non_interactive and sys.stdin.isatty():
        live = input('\nEnable optional live AI? Default demo needs no APIs or keys. [y/N]: ').strip().lower() in ['y', 'yes']
    if live and not args.non_interactive and sys.stdin.isatty():
        prompt(values)
    if live:
        write_environment(values)
        print('Checking configured AI services; one small request per configured service...', flush=True)
        checked = run([node, '--import', 'tsx', 'scripts/check-services.ts'], capture_output=True, text=True)
        print(checked.stdout.strip())
        # No configured/working LLM: keep all core features usable in demo mode.
        results = json.loads((RUNTIME / 'ai-check.json').read_text())
        if not results.get('llm'):
            print('No verified LLM. Continuing in credential-free MCP demo mode; optional speech can still be used.')
            live = False
    values['DEMO_MODE'] = 'false' if live else 'true'
    used = set()
    ports = {}
    for key, default in [('PORT', 3100), ('MCP_PORT', 3101), ('PUBLIC_MCP_PORT', 3102)]:
        try:
            preferred = int(values.get(key, default))
            if not 1024 <= preferred <= 65535:
                raise ValueError()
        except ValueError:
            preferred = default
        ports[key] = choose_port(preferred, used)
    values.update({key: str(value) for key, value in ports.items()})
    values.update({'APP_BIND': '127.0.0.1', 'PUBLIC_MCP_BIND': '127.0.0.1', 'MCP_DEMO_LOGIN': 'true', 'MCP_SERVER_URL': 'http://127.0.0.1:' + str(ports['MCP_PORT']) + '/mcp', 'MCP_CONSOLE_URL': 'http://localhost:' + str(ports['MCP_PORT']) + '/console/', 'OAUTH_ISSUER_URL': 'http://localhost:' + str(ports['PORT']), 'PUBLIC_MCP_URL': 'http://localhost:' + str(ports['PORT']) + '/mcp', 'PUBLIC_WEB_ORIGIN': 'http://localhost:' + str(ports['PORT']), 'STORE_OWNER_EMAIL': values.get('STORE_OWNER_EMAIL', 'owner@example.test')})
    write_environment(values)
    print('Configuration saved privately to .env. Mode:', 'live AI' if live else 'credential-free MCP demo', flush=True)
    if args.no_start:
        print('Setup complete. Run this same command without --no-start to launch.')
        return
    if args.verify:
        for command in [['run','typecheck'], ['test'], ['run','test:owner'], ['run','test:oauth'], ['run','test:oauth-proxy'], ['run','test:admin']]:
            run(npm_command(node) + command)
    log_path = RUNTIME / 'storeyog.log'
    child_env = {**os.environ, **values, 'PYTHON_BIN': sys.executable}
    with log_path.open('a') as log:
        options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
        child = subprocess.Popen([str(node), '--import', 'tsx', 'scripts/dev.ts'], cwd=ROOT, env=child_env, stdout=log, stderr=log, **options)
        try:
            for _ in range(90):
                if child.poll() is not None:
                    raise RuntimeError('App exited. Inspect .runtime/storeyog.log; rerun to select new ports if another app took one during startup.')
                if all(alive_url(url) for url in ['http://127.0.0.1:' + str(ports['PORT']) + '/', 'http://127.0.0.1:' + str(ports['MCP_PORT']) + '/health', 'http://127.0.0.1:' + str(ports['PUBLIC_MCP_PORT']) + '/health']):
                    break
                time.sleep(.3)
            else:
                raise RuntimeError('Startup timed out. Inspect .runtime/storeyog.log.')
            base = 'http://localhost:' + str(ports['PORT'])
            print('\nREADY\nLanding:    ' + base + '/\nSimulator:  ' + base + '/simulator\nWalkthrough:' + base + '/experience\nOwner app:  ' + base + '/store/\nCustomers:  ' + base + '/shop/raj-demo\nMCP console:http://localhost:' + str(ports['MCP_PORT']) + '/console/\nOAuth MCP:  ' + base + '/mcp\n\nClick Run demo script in the simulator. No AI credentials needed.\nJudge login dropdown is enabled for this local synthetic playground.\nLeave this terminal open. Ctrl+C stops this instance only. Logs: .runtime/storeyog.log', flush=True)
            if args.test:
                smoke_check(base)
                return
            while child.poll() is None:
                time.sleep(.5)
            if child.returncode:
                raise RuntimeError('App stopped unexpectedly; inspect .runtime/storeyog.log.')
        except KeyboardInterrupt:
            print('\nStopping this StoreYog instance...')
        finally:
            if child.poll() is None:
                if os.name == 'nt':
                    child.send_signal(signal.CTRL_BREAK_EVENT)
                else:
                    os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    if os.name == 'nt':
                        subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        os.killpg(child.pid, signal.SIGKILL)
            print('Stopped. Data and configuration preserved.')

if __name__ == '__main__':
    try:
        if sys.version_info < (3, 10):
            raise RuntimeError('Python 3.10+ is required: https://www.python.org/downloads/')
        main()
    except Exception as error:
        print('StoreYog setup:', str(error), file=sys.stderr)
        sys.exit(1)
