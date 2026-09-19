import importlib.util, json, os, pathlib, tempfile, unittest, shutil, zipfile
from contextlib import ExitStack
from unittest.mock import patch
os.environ.setdefault('SUITE_JENKINS_USER','fixture')
os.environ.setdefault('SUITE_JENKINS_TOKEN','fixture')
spec=importlib.util.spec_from_file_location('jenkins_transport',pathlib.Path(__file__).parents[1]/'jenkins.py')
j=importlib.util.module_from_spec(spec);spec.loader.exec_module(j)

class TransportBoundaryTests(unittest.TestCase):
    def test_legacy_build_110_analysis_is_reconciled_once_without_granting_pass(self):
        build={'buildNumber':110,'gitSha':'a'*40,'requestId':'request-110',
               'intentId':'123e4567-e89b-12d3-a456-426614174000','runScope':'full-regression'}
        with tempfile.TemporaryDirectory() as d:
            folder=pathlib.Path(d)
            old={**build,'jenkinsResult':'FAILURE','identityVerified':True,
                 'errors':['selection-drift-or-incomplete','standard-business-ledger-missing'],
                 'actionRequired':'ai-evidence-review','businessPassAuthority':False}
            j.write(folder/'analysis.json',old)
            j.write(folder/'result-envelope.json',{**build,'selectedCaseIds':['A','B'],
                'terminalCaseIds':[],'status':'blocked','publicReceiptAccepted':False})
            result=j.reconcile_legacy_analysis(folder,build)
            self.assertEqual(result['executionStatus'],'blocked')
            self.assertEqual(result['actionRequired'],'technical-remediation-required')
            self.assertFalse(result['businessPassAuthority'])
            self.assertEqual(j.read(folder/'analysis.legacy-original.json'),old)
            self.assertEqual(j.reconcile_legacy_analysis(folder,build),result)
            with self.assertRaisesRegex(RuntimeError,'legacy-analysis-identity-mismatch'):
                j.reconcile_legacy_analysis(folder,{**build,'requestId':'another'})

    def test_build_108_non_business_errors_are_deterministically_classified(self):
        result=j.arbitrate_result(['allure-evidence-incomplete','bundle-file-missing','selection-drift-or-incomplete','execution-incomplete','standard-business-ledger-missing'],
            {'selectedCaseIds':['A','B'],'terminalCaseIds':[],'status':'blocked'},'FAILURE')
        self.assertEqual(result['executionStatus'],'blocked')
        self.assertEqual(result['actionRequired'],'technical-remediation-required')
        self.assertNotIn('product-failure',result['failureCategories'])

    def test_terminal_statistics_keep_known_case_results_when_aggregate_gate_fails(self):
        stats=j.terminal_statistics({'passed':0,'failed':0,'terminalCaseIds':['A','B'],
            'caseAudit':[{'caseId':'A','status':'passed'},{'caseId':'B','status':'broken'}]})
        self.assertEqual(stats['passed'],1)
        self.assertEqual(stats['failed'],1)
        self.assertEqual(stats['terminalCaseCount'],2)

    def test_terminal_statistics_never_infer_business_results_from_allure_counts(self):
        stats=j.terminal_statistics({'passed':0,'failed':0,'allureResultCount':366})
        self.assertEqual(stats['passed'],0)
        self.assertEqual(stats['failed'],0)

    def test_poll_requests_only_build_status_and_artifact_fields(self):
        with tempfile.TemporaryDirectory() as d:
            state_path=pathlib.Path(d)/'checkpoint.json'
            j.write(state_path,{'status':'running','buildNumber':111,
                'buildUrl':j.JOB_URL+'111/','gitSha':'a'*40,'requestId':'request-111',
                'intentId':'123e4567-e89b-12d3-a456-426614174000','runScope':'full-regression'})
            response=unittest.mock.Mock();response.json.return_value={'building':True,'result':None,'artifacts':[]}
            with patch.object(j,'get',return_value=response) as get,patch.object(j,'remember_explicit_submission'):
                j.poll(state_path)
            self.assertEqual(get.call_args.args[0],j.JOB_URL+'111/api/json')
            self.assertEqual(get.call_args.kwargs['params']['tree'],
                'building,result')

    def test_artifact_archive_extracts_only_safe_ci_evidence(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);archive_path=root/'artifacts.zip';stage=root/'stage'
            with zipfile.ZipFile(archive_path,'w') as archive:
                archive.writestr('archive/suite-src/output/ci/result-envelope.json',b'{}')
                archive.writestr('archive/suite-src/output/ci/business/run/evidence-ledger.json',b'{"cases":[]}')
                archive.writestr('archive/suite-src/output/ci/test-results/raw/trace.zip',b'raw')
                archive.writestr('archive/jenkins-terminal-report.html',b'outside')
                archive.writestr('archive/suite-src/output/ci/../escaped.txt',b'escape')
            downloaded=j.extract_ci_artifact_archive(archive_path,stage)
            self.assertEqual([item['path'] for item in downloaded],[
                'result-envelope.json','business/run/evidence-ledger.json'])
            self.assertTrue((stage/'result-envelope.json').exists())
            self.assertFalse((stage/'test-results/raw/trace.zip').exists())
            self.assertFalse((root/'escaped.txt').exists())

    def isolated_watch(self, directory):
        root=pathlib.Path(directory); out=root/'output/jenkins'
        helper=root/'tap/src/ci/build-watch-contract.cjs'
        helper.parent.mkdir(parents=True)
        shutil.copyfile(j.ROOT/'tap/src/ci/build-watch-contract.cjs',helper)
        j.write(root/'ci/watch-policy.json',{'jobName':j.JOB,'firstBuildNumber':34,'autoDiscoverHistorical':True,'registeredBuilds':[]})
        stack=ExitStack()
        for name,value in [('ROOT',root),('OUT',out),('STATE',out/'checkpoint.json'),('SUBMITTED_BUILDS',out/'submitted-builds.json'),('DISCOVERY_STATE',out/'discovery-checkpoint.json')]:stack.enter_context(patch.object(j,name,value))
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

    def test_explicitly_submitted_analyzed_build_remains_discoverable_for_ai_review(self):
        with tempfile.TemporaryDirectory() as d, self.isolated_watch(d):
            j.write(j.ROOT/'ci/watch-policy.json',{'jobName':j.JOB,'firstBuildNumber':34,'autoDiscoverHistorical':False,'registeredBuilds':[]})
            build={'buildNumber':51,'building':False,'result':'SUCCESS','gitSha':'a'*40,'requestId':'request-51','intentId':'123e4567-e89b-12d3-a456-426614174000','runScope':'reports'}
            j.write(j.STATE,{**build,'status':'analyzed'})
            j.write(j.OUT/'build-51/analysis.json',build)
            with patch.object(j,'discover_builds',return_value=[build]),patch.object(j,'poll') as poll:
                j.watch();poll.assert_not_called()
            self.assertEqual(j.read(j.OUT/'watch-checkpoint.json')['actions'][0]['action'],'review')
            remembered=j.read(j.SUBMITTED_BUILDS)['requests']
            self.assertEqual(remembered[0]['buildNumber'],51)

    def test_scheduled_build_is_discoverable_without_codex_process_state(self):
        """A heartbeat/watch invocation can collect a scheduled build later."""
        with tempfile.TemporaryDirectory() as d, self.isolated_watch(d):
            j.write(j.ROOT/'ci/watch-policy.json',{
                'jobName': j.JOB, 'firstBuildNumber': 34,
                'autoDiscoverHistorical': False, 'autoDiscoverScheduled': True,
                'registeredBuilds': [],
            })
            build={'buildNumber':56,'building':False,'result':'SUCCESS','gitSha':'a'*40,
                   'requestId':'schedule-56','intentId':'123e4567-e89b-12d3-a456-426614174000',
                   'runScope':'full-regression','triggerSource':'jenkins-schedule'}
            with patch.object(j,'discover_builds',return_value=[build]),patch.object(j,'poll') as poll:
                j.watch()
                self.assertEqual(poll.call_args.args[0],j.OUT/'build-56/checkpoint.json')

    def test_new_terminal_build_from_another_checkout_is_collected_once(self):
        with tempfile.TemporaryDirectory() as d, self.isolated_watch(d):
            j.write(j.ROOT/'ci/watch-policy.json',{
                'jobName': j.JOB, 'firstBuildNumber': 34,
                'autoDiscoverHistorical': False, 'autoDiscoverScheduled': False,
                'initialBackfillBuilds': 10, 'registeredBuilds': [],
            })
            j.write(j.DISCOVERY_STATE, {'schemaVersion': 1, 'terminalBuilds': list(range(34, 101))})
            build={'buildNumber':101,'building':False,'result':'FAILURE','gitSha':'a'*40,
                   'requestId':'request-101','intentId':'123e4567-e89b-12d3-a456-426614174000',
                   'runScope':'full-regression','triggerSource':'explicit-local-submit'}
            with patch.object(j,'discover_builds',return_value=[build]),patch.object(j,'poll') as poll:
                j.watch(); self.assertEqual(poll.call_args.args[0],j.OUT/'build-101/checkpoint.json')
            self.assertIn(101, j.read(j.DISCOVERY_STATE)['terminalBuilds'])
            with patch.object(j,'discover_builds',return_value=[build]),patch.object(j,'poll') as poll:
                j.watch(); poll.assert_not_called()

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
