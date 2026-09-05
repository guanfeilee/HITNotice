#!/usr/bin/env python3
"""Human-only hidden input, following a completed Dashboard password reset."""
import getpass,json,os,pathlib,stat,sys
if os.geteuid()!=0 or not sys.stdin.isatty():
 raise SystemExit('Run interactively as root using ssh -t.')
root=pathlib.Path('/root/.config/hitnotice')
root.mkdir(mode=0o700,parents=True,exist_ok=True)
if root.is_symlink() or root.stat().st_uid!=0:
 raise SystemExit('Unsafe credential directory.')
os.chmod(root,0o700)
path=root/'supabase-production-db.json'
if path.exists() or path.is_symlink():
 raise SystemExit('Credential already exists; refusing overwrite.')
password=getpass.getpass('Paste the newly reset Supabase database password (hidden): ')
confirm=getpass.getpass('Confirm the same password (hidden): ')
if not password:
 raise SystemExit('Empty password; nothing saved.')
if password!=confirm:
 raise SystemExit('Passwords do not match; nothing saved.')
if '\n' in password or '\r' in password:
 raise SystemExit('Password contains a line break; nothing saved.')
config={'host':'aws-1-ap-northeast-2.pooler.supabase.com','port':5432,'database':'postgres','user':'postgres.wzticbvfzehpukwtqcoi','password':password,'sslmode':'require'}
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'w') as f:
 json.dump(config,f);f.write('\n');f.flush();os.fsync(f.fileno())
print('Credential file: '+str(path))
print('Directory: 0700; file: 0600. Connection has NOT yet been verified.')
