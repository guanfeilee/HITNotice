"""Execute actual launcher control flow against isolated filesystem/process doubles."""
import datetime, hashlib, json, pathlib, runpy, signal, subprocess, sys, tempfile, unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parent.parent

class LauncherTests(unittest.TestCase):
    def launch(self,task,code,paused=False,interrupt=False):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);release=root/'release';(release/'ops').mkdir(parents=True);state=root/'state';(state/'logs').mkdir(parents=True);cfg=root/'config';cfg.mkdir()
            original_pause={'task':'crawler','reason':'CRAWL_SYSTEMIC_SOURCE_FAILURE','time':'2026-09-11T19:50:00+08:00','log':'/var/lib/hitnotice-daily/logs/fixture.log'}
            if paused:(state/'PAUSED').write_text(json.dumps(original_pause))
            captured=[]; handlers={}
            source=(ROOT/'ops/run-daily.py').read_text().replace('/opt/hitnotice-tasks',str(root/'tasks')).replace('/var/lib/hitnotice-daily',str(state)).replace('/etc/hitnotice/daily',str(cfg))
            script=release/'ops/run-daily.py';script.write_text(source)
            policy=release/'ops/task-policy.py';policy.write_bytes((ROOT/'ops/task-policy.py').read_bytes())
            (release/'ops/source-manifest.json').write_text(json.dumps({'version':'fixture','files':{'ops/task-policy.py':hashlib.sha256(policy.read_bytes()).hexdigest()}}))
            role='hitnotice_crawler_daily' if task=='crawler' else 'hitnotice_'+task
            env={'DATABASE_URL':'postgresql:///hitnotice?host=/var/run/postgresql&user='+role}
            if task!='crawler':env.update(RESEND_API_KEY='fixture',EMAIL_FROM='fixture@example.invalid',NEXT_PUBLIC_SITE_URL='https://example.invalid')
            if task=='health':env['HEALTH_REPORT_EMAIL']='fixture@example.invalid'
            config=cfg/(task+'.json');config.write_text(json.dumps(env));config.chmod(0o600)
            if task=='digest':
                snapshot=cfg/'suppressions.json';snapshot.write_text(json.dumps({'version':1,'generated_at':'2026-10-13T13:30:00Z','email_sha256':[]}));snapshot.chmod(0o600)
            class Clock(datetime.datetime):
                @classmethod
                def now(cls,tz=None):return cls(2026,9,11,19,50,tzinfo=tz) if task=='crawler' else cls(2026,9,11,20,10,tzinfo=tz)
            class Process:
                def __init__(self,*a,**k): self.pid=123;captured.append(k["env"])
                def poll(self):return None
                def wait(self,timeout=None):
                    if interrupt:handlers[signal.SIGTERM](signal.SIGTERM,None)
                    return code
            # stat uid check is root-only in production; fixture ownership is current user.
            source=script.read_text().replace('cfg.stat().st_uid!=0','cfg.stat().st_uid!=__import__("os").getuid()');script.write_text(source)
            with patch.object(sys,'argv',[str(script),task,'--scheduled']),patch('os.getuid',return_value=0),patch('pwd.getpwnam') as account,patch('datetime.datetime',Clock),patch('subprocess.check_output',return_value=b''),patch('subprocess.Popen',Process),patch('signal.signal',side_effect=lambda sig,fn:handlers.update({sig:fn})),patch('os.killpg'):
                # On non-root local machines the config check above must use fixture ownership.
                script.write_text(script.read_text().replace('cfg.stat().st_uid!=__import__("os").getuid()', 'False').replace('snapshot.stat().st_uid!=0','False'))
                account.return_value.pw_gid=1;account.return_value.pw_uid=1
                with self.assertRaises(SystemExit) as result:runpy.run_path(str(script),run_name='__main__')
                self.assertEqual(result.exception.code,"WORKFLOW_PAUSED" if paused and task!="health" else code)
            if paused and task=='health':
                self.assertEqual(len(captured),1)
                self.assertEqual(captured[0]['HITNOTICE_SCHEDULE_STATE'],'paused')
                self.assertEqual(json.loads(captured[0]['HITNOTICE_PAUSE_CONTEXT']),original_pause)
                self.assertEqual(json.loads((state/'PAUSED').read_text()),original_pause)
            if paused and task!='health':self.assertEqual(captured,[])
            return (state/'PAUSED').exists()
    def test_completed_healthy_or_degraded_does_not_pause(self):self.assertFalse(self.launch('crawler',0))
    def test_database_failure_pauses(self):self.assertTrue(self.launch('crawler',1))
    def test_crashed_child_pauses(self):self.assertTrue(self.launch('crawler',-9))
    def test_readiness_refusal_does_not_pause(self):self.assertFalse(self.launch('digest',10))
    def test_confirmed_preflight_refusal_does_not_pause(self):self.assertFalse(self.launch('digest',11))
    def test_crawler_cannot_use_preflight_exit(self):self.assertTrue(self.launch('crawler',11))
    def test_send_failure_still_pauses(self):self.assertTrue(self.launch('digest',1))
    def test_crawler_cannot_use_digest_readiness_exit(self):self.assertTrue(self.launch('crawler',10))
    def test_paused_health_runs_with_original_evidence(self):self.assertTrue(self.launch('health',0,paused=True))
    def test_paused_crawler_blocked(self):self.assertTrue(self.launch('crawler',0,paused=True))
    def test_paused_digest_blocked(self):self.assertTrue(self.launch('digest',0,paused=True))
    def test_health_send_failure_never_pauses(self):self.assertFalse(self.launch('health',1))
    def test_health_timeout_never_pauses(self):self.assertFalse(self.launch('health',124))
    def test_health_signal_never_pauses(self):self.assertFalse(self.launch('health',-15,interrupt=True))
    def test_health_failure_preserves_existing_pause(self):self.assertTrue(self.launch('health',1,paused=True))
    def test_health_signal_preserves_existing_pause(self):self.assertTrue(self.launch('health',-15,paused=True,interrupt=True))
    def test_crawler_signal_still_pauses(self):self.assertTrue(self.launch('crawler',-15,interrupt=True))
if __name__=='__main__':unittest.main()
