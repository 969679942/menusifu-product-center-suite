import importlib.util, json, os, pathlib, tempfile, unittest, shutil
from contextlib import ExitStack
from unittest.mock import patch
os.environ.setdefault('SUITE_JENKINS_USER','fixture')
os.environ.setdefault('SUITE_JENKINS_TOKEN','fixture')
spec=importlib.util.spec_from_file_location('jenkins_transport',pathlib.Path(__file__).parents[1]/'jenkins.py')
j=importlib.util.module_from_spec(spec);spec.loader.exec_module(j)

class TransportBoundaryTests(unittest.TestCase):
    def isolated_watch(self, directory):
        root=pathlib.Path(directory); out=root/'output/jenkins'
        helper=root/'tap/src/ci/build-watch-contract.cjs'
        helper.parent.mkdir(parents=True)
        shutil.copyfile(j.ROOT/'tap/src/ci/build-watch-contract.cjs',helper)
        j.write(root/'ci/watch-policy.json',{'jobName':j.JOB,'firstBuildNumber':34,'autoDiscoverHistorical':True,'registeredBuilds':[]})
        stack=ExitStack()
        for name,value in [('ROOT',root),('OUT',out),('STATE',out/'checkpoint.json')]:stack.enter_context(patch.object(j,name,value))
        return stack

    def test_discovery_strips_password_parameters_and_rejects_malformed_identity(self):
        item={'number':35,'building':False,'result':'FAILURE','actions':[{'parameters':[
            {'name':'GIT_SHA','value':'bad sha'},{'name':'REQUEST_ID','value':'request-35'},
            {'name':'INTENT_ID','value':'123e4567-e89b-12d3-a456-426614174000'},
            {'name':'RUN_SCOPE','value':'pilot'},{'name':'MC_RUNTIME_ENV','value':'secret-fixture'}]}]}
        response=unittest.mock.Mock();response.json.return_value={'builds':[item]}
        with patch.object(j,'get',return_value=response): result=j.discover_builds(34)
        self.assertIsNone(result[0]['gitSha'])
        self.assertEqual(result[0]['intentId'],'123e4567-e89b-12d3-a456-426614174000')
        self.assertNotIn('secret-fixture',json.dumps(result))
        self.assertNotIn('MC_RUNTIME_ENV',json.dumps(result))

    def test_manual_new_build_is_collected_without_overwriting_submission_checkpoint(self):
        with tempfile.TemporaryDirectory() as d, self.isolated_watch(d):
            original={'status':'analyzed','buildNumber':34}
            j.write(j.STATE,original)
            build={'buildNumber':35,'building':False,'result':'SUCCESS','gitSha':'a'*40,'requestId':'manual-35','intentId':'123e4567-e89b-12d3-a456-426614174000','runScope':'pilot'}
            with patch.object(j,'discover_builds',return_value=[build]),patch.object(j,'poll') as poll,patch.object(j,'post') as post:
                j.watch()
                self.assertEqual(poll.call_args.args[0],j.OUT/'build-35/checkpoint.json')
                post.assert_not_called()
            self.assertEqual(j.read(j.STATE),original)
            self.assertEqual(j.read(j.OUT/'watch-checkpoint.json')['actions'][0]['action'],'review')

    def test_collected_build_stays_pending_until_ai_review_is_recorded(self):
        with tempfile.TemporaryDirectory() as d, self.isolated_watch(d):
            build={'buildNumber':35,'building':False,'result':'SUCCESS','gitSha':'a'*40,'requestId':'manual-35','intentId':'123e4567-e89b-12d3-a456-426614174000','runScope':'pilot'}
            j.write(j.OUT/'build-35/analysis.json',build)
            with patch.object(j,'discover_builds',return_value=[build]),patch.object(j,'poll') as poll:
                j.watch();poll.assert_not_called()
                self.assertEqual(j.read(j.OUT/'watch-checkpoint.json')['actions'][0]['action'],'review')
                j.write(j.OUT/'build-35/ai-review.json',{**build,'status':'complete','actionRequired':'none','conclusion':'Evidence reviewed','evidence':['analysis.json']})
                j.watch();poll.assert_not_called()
                self.assertEqual(j.read(j.OUT/'watch-checkpoint.json')['actions'][0]['action'],'done')

    def test_other_job_mutation_is_denied_before_network(self):
        with patch.object(j.SESSION,'post') as post:
            with self.assertRaises(ValueError):j.post(j.BASE+'/job/another-job/config.xml',data=b'')
            post.assert_not_called()

    def test_ambiguous_build_submission_is_not_replayed(self):
        with tempfile.TemporaryDirectory() as d, patch.object(j,'STATE',pathlib.Path(d)/'checkpoint.json'):
            j.write(j.STATE,{'status':'submitting','requestId':'pending','intentId':'123e4567-e89b-12d3-a456-426614174000'})
            with patch.object(j,'reconcile',return_value=False),patch.object(j,'post') as post:
                with self.assertRaises(RuntimeError):j.submit()
                post.assert_not_called()

    def test_existing_queued_request_is_resumed(self):
        with tempfile.TemporaryDirectory() as d, patch.object(j,'STATE',pathlib.Path(d)/'checkpoint.json'):
            j.write(j.STATE,{'status':'queued','requestId':'pending','intentId':'123e4567-e89b-12d3-a456-426614174000','queueUrl':j.BASE+'/queue/item/1/'})
            with patch.object(j,'reconcile',return_value=True),patch.object(j,'post') as post:
                j.submit();post.assert_not_called()

    def test_legacy_checkpoint_without_intent_is_quarantined_instead_of_replayed(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);out=root/'output/jenkins';state=out/'checkpoint.json'
            with patch.object(j,'OUT',out),patch.object(j,'STATE',state):
                j.write(state,{'status':'running','buildNumber':46,'requestId':'legacy'})
                self.assertTrue(j.quarantine_legacy_checkpoint())
                self.assertFalse(state.exists())
                records=list((out/'legacy-checkpoints').glob('*.json'))
                self.assertEqual(len(records),1)
                self.assertEqual(j.read(records[0])['status'],'legacy-unverified')

    def test_analyzed_same_commit_and_scope_do_not_start_another_build(self):
        with tempfile.TemporaryDirectory() as d, patch.object(j,'STATE',pathlib.Path(d)/'checkpoint.json'):
            j.write(j.STATE,{'status':'analyzed','gitSha':'a'*40,'runScope':'pilot','intentId':'123e4567-e89b-12d3-a456-426614174000'})
            with patch.object(j,'git',return_value='a'*40),patch.object(j,'post') as post:
                j.submit('pilot');post.assert_not_called()

if __name__=='__main__':unittest.main()
