import importlib.util,json,os,pathlib,subprocess,sys,tempfile,time,unittest
ROOT=pathlib.Path(__file__).parents[2]
sys.path.insert(0,str(ROOT/'tap/src/ci'))
from build_queue import BuildQueue
from windows_process_job import ProcessJob
from bundle_contract import validate_bundle
from repair_contract import apply_changes,prepare_changes,apply_plan,verified_followup

class RepairTests(unittest.TestCase):
    def test_interrupted_plan_resumes_and_does_not_overwrite_new_edits(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);(root/'src').mkdir();p=root/'src/a.py';p.write_text('old')
            plan=prepare_changes(root,[{'path':'src/a.py','before':'old','after':'new'}],['src/'])
            apply_plan(root,plan,['src/']);apply_plan(root,plan,['src/'])
            self.assertEqual(p.read_text(),'new')
            p.write_text('user edit')
            with self.assertRaisesRegex(ValueError,'intervening'):apply_plan(root,plan,['src/'])
    def test_followup_requires_exact_identity_scope_review_and_source_sync(self):
        detail={'commit':'a'*40,'followupRequestId':'r','verificationScope':'reports'}
        build={'buildNumber':3,'gitSha':'a'*40,'requestId':'r','runScope':'reports','building':False}
        review={**build,'status':'complete','actionRequired':'none','evidence':['analysis.json']}
        self.assertTrue(verified_followup(detail,build,review))
        for key,value in [('gitSha','b'*40),('requestId','other'),('runScope','pilot'),('building',True)]:
            self.assertFalse(verified_followup(detail,{**build,key:value},review))
        self.assertFalse(verified_followup({**detail,'sourceSyncPending':['src/a.py']},build,review))
        self.assertFalse(verified_followup(detail,build,{**review,'evidence':[]}))
    def test_exact_patch_is_scoped_and_replay_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);(root/'src').mkdir();(root/'src/calc.py').write_text('return a-b\n')
            patch=[{'path':'src/calc.py','before':'a-b','after':'a+b'}]
            self.assertEqual(apply_changes(root,patch,['src/']),['src/calc.py'])
            self.assertEqual((root/'src/calc.py').read_text(),'return a+b\n')
            with self.assertRaises(ValueError):apply_changes(root,patch,['src/'])
    def test_bad_second_patch_leaves_first_file_unchanged(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);(root/'src').mkdir();p=root/'src/a.py';p.write_text('old')
            with self.assertRaises(ValueError):apply_changes(root,[{'path':'src/a.py','before':'old','after':'new'},{'path':'../escape.py','before':'','after':'bad'}],['src/'])
            self.assertEqual(p.read_text(),'old')
    def test_ambiguous_replacement_and_private_path_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);(root/'src').mkdir();(root/'src/a.py').write_text('x+x')
            for patch in [[{'path':'src/a.py','before':'x','after':'y'}],[{'path':'src/.secrets/secret.py','before':'','after':'x'}]]:
                with self.assertRaises(ValueError):apply_changes(root,patch,['src/'])

class BundleTests(unittest.TestCase):
    def test_modified_missing_and_unsafe_content_cannot_be_accepted(self):
        import hashlib
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);(root/'file.json').write_text('{}')
            expected={'gitSha':'a'*40,'buildNumber':7,'requestId':'request-7'}
            manifest={**expected,'artifacts':[{'path':'file.json','size':2,'sha256':hashlib.sha256(b'{}').hexdigest()}]}
            (root/'bundle-manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(validate_bundle(root,expected),[])
            self.assertIn('bundle-manifest-missing',validate_bundle(root/'missing',{**expected,'requireManifest':True}))
            (root/'file.json').write_text('bad')
            self.assertIn('bundle-content-mismatch',validate_bundle(root,expected))
            manifest['artifacts'][0]['path']='../outside';(root/'bundle-manifest.json').write_text(json.dumps(manifest))
            self.assertIn('bundle-path-invalid',validate_bundle(root,expected))

class QueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.q=BuildQueue(pathlib.Path(self.tmp.name)/'queue.sqlite')
    def tearDown(self):self.q.db.close();self.tmp.cleanup()
    def test_duplicate_event_is_one_task_and_same_sha_different_builds_are_distinct(self):
        for _ in range(2):self.q.enqueue('server|job|1',{'gitSha':'a'*40})
        self.q.enqueue('server|job|2',{'gitSha':'a'*40})
        self.assertEqual(len(self.q.rows()),2)
    def test_one_owner_and_no_duplicate_claim(self):
        self.q.enqueue('1',{});self.q.enqueue('2',{})
        task=self.q.claim();self.assertIsNone(self.q.claim())
        self.q.finish(task,'reviewed',{})
        self.assertEqual(self.q.claim()['identity'],'2')
    def test_recovery_increments_generation_and_rejects_old_owner(self):
        self.q.enqueue('1',{});old=self.q.claim();self.q.recover();new=self.q.claim()
        self.assertGreater(new['generation'],old['generation'])
        with self.assertRaisesRegex(RuntimeError,'stale'):self.q.finish(old,'reviewed',{})
        self.q.finish(new,'reviewed',{})
    def test_expired_owner_cannot_publish_or_complete(self):
        self.q.enqueue('1',{});task=self.q.claim();self.q.db.execute('UPDATE tasks SET lease_until=0')
        with self.assertRaisesRegex(RuntimeError,'stale'):self.q.assert_owner(task)
    def test_identity_drift_is_rejected(self):
        self.q.enqueue('1',{'gitSha':'a'})
        with self.assertRaises(ValueError):self.q.enqueue('1',{'gitSha':'b'})
    def test_retry_does_not_immediately_call_ai_again(self):
        self.q.enqueue('1',{});task=self.q.claim();self.q.finish(task,'retry',{},60)
        self.assertIsNone(self.q.claim())

@unittest.skipUnless(os.name=='nt','Windows job ownership')
class ProcessTests(unittest.TestCase):
    def test_closing_job_terminates_owned_process(self):
        process=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],creationflags=subprocess.CREATE_NO_WINDOW)
        job=ProcessJob()
        try:job.attach(process)
        finally:job.close()
        process.wait(timeout=5)
        self.assertIsNotNone(process.returncode)

if __name__=='__main__':unittest.main()
