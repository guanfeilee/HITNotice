#!/usr/bin/env python3
"""Phase C infrastructure only; run as root on the authorized empty PG17 cluster."""
from pathlib import Path
import json, os, secrets, subprocess

def run(sql, db='postgres', capture=False):
    result=subprocess.run(['runuser','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-d',db,'-At'], input=sql,text=True,capture_output=True)
    if result.returncode:
        raise SystemExit('PostgreSQL setup operation failed; sensitive SQL output withheld')
    return result.stdout if capture else None

conf=Path('/etc/postgresql/17/main/conf.d/phase-c.conf')
conf.write_text("""# Phase C: infrastructure only, no application cutover.
listen_addresses = '127.0.0.1'
port = 5432
password_encryption = 'scram-sha-256'
max_connections = 30
shared_buffers = '128MB'
work_mem = '4MB'
maintenance_work_mem = '64MB'
effective_cache_size = '512MB'
max_wal_size = '1GB'
min_wal_size = '80MB'
fsync = on
synchronous_commit = on
full_page_writes = on
timezone = 'UTC'
log_timezone = 'UTC'
log_error_verbosity = 'terse'
log_statement = 'none'
log_min_duration_statement = -1
log_min_error_statement = 'panic'
log_parameter_max_length = 0
log_parameter_max_length_on_error = 0
log_connections = off
log_disconnections = off
log_line_prefix = '%m [%p] %q%u@%d '
""")
hba=Path('/etc/postgresql/17/main/pg_hba.conf')
hba.write_text("""# Phase C: peer administration, SCRAM runtime on IPv4 loopback only.
local all postgres peer
local all all reject
host hitnotice,hitnotice_restore_test,hitnotice_restore_verify,hitnotice_phasec_test hitnotice_runtime 127.0.0.1/32 scram-sha-256
host all all 127.0.0.1/32 reject
host all all 0.0.0.0/0 reject
host all all ::0/0 reject
""")
os.chmod(hba,0o640)
subprocess.run(['chown','postgres:postgres',str(hba)],check=True)
subprocess.run(['systemctl','restart','postgresql@17-main'],check=True)
# Fail closed rather than rotate an existing secret or modify existing databases.
if run("SELECT count(*) FROM pg_roles WHERE rolname IN ('hitnotice_owner','hitnotice_runtime');",capture=True).strip()!='0':
    raise SystemExit('Roles already exist; inspect before rerunning setup')
if run("SELECT count(*) FROM pg_database WHERE datname='hitnotice';",capture=True).strip()!='0':
    raise SystemExit('Target exists; inspect before rerunning setup')
password=secrets.token_hex(32)
secret=Path('/etc/hitnotice/postgresql-runtime.json')
fd=os.open(secret,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f: json.dump({'host':'127.0.0.1','port':5432,'user':'hitnotice_runtime','password':password,'database':'hitnotice'},f)
run("CREATE ROLE hitnotice_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;\nCREATE ROLE hitnotice_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '"+password+"';")
for db in ['hitnotice','hitnotice_phasec_test','hitnotice_restore_test']:
    run(f"CREATE DATABASE {db} OWNER hitnotice_owner ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8';")
    run(f"REVOKE ALL ON DATABASE {db} FROM PUBLIC; GRANT CONNECT ON DATABASE {db} TO hitnotice_runtime; ALTER DATABASE {db} SET timezone TO 'UTC';")
    run('ALTER SCHEMA public OWNER TO hitnotice_owner; SET ROLE hitnotice_owner;\n'+Path(__file__).with_name('0001_current_baseline.sql').read_text(),db)
    run('SET ROLE hitnotice_owner;\n'+Path(__file__).with_name('runtime-grants.sql').read_text(),db)
print('PHASE_C_CONFIGURED: empty target, isolated tests, SCRAM credential saved root-only; no application configuration changed')
