import importlib.util, inspect, os, pathlib, tempfile, unittest
from unittest.mock import patch
os.environ.setdefault('SUITE_JENKINS_USER','fixture')
os.environ.setdefault('SUITE_JENKINS_TOKEN','fixture')
spec=importlib.util.spec_from_file_location('transport',pathlib.Path(__file__).parents[1]/'jenkins.py')
j=importlib.util.module_from_spec(spec);spec.loader.exec_module(j)

class ChainSubmission(unittest.TestCase):
    intent_id='123e4567-e89b-12d3-a456-426614174000'

    def test_submit_cli_contract_accepts_scope_and_auto_chain(self):
        self.assertEqual(list(inspect.signature(j.submit).parameters), ['scope', 'auto_chain'])
        self.assertEqual(set(j.BUILD_STRING_PARAMETERS), {
            'GIT_SHA', 'MC_GIT_SHA', 'TAP_GIT_SHA', 'REQUEST_ID', 'INTENT_ID',
            'RUN_SCOPE', 'TRIGGER_SOURCE', 'MC_RUNTIME_ENV',
        })
        self.assertEqual(j.BUILD_BOOLEAN_PARAMETERS, ['AUTO_CHAIN'])

    def test_chain_loads_runtime_at_contracts_and_pins_dependencies(self):
        with tempfile.TemporaryDirectory() as d:
            f=pathlib.Path(d)/'runtime.env'; f.write_text('FIXTURE=value',encoding='utf-8')
            with patch.dict(os.environ,{'MC_RUNTIME_ENV_PATH':str(f)}):
                data=j.submission_parameters('a'*40,'contracts','request',self.intent_id,True)
            self.assertEqual(data['AUTO_CHAIN'],'true')
            self.assertEqual(data['MC_RUNTIME_ENV'],'FIXTURE=value')
            self.assertEqual(data['MC_GIT_SHA'],j.read(j.ROOT/'ci/dependency-manifest.json')['repositories']['mc']['revision'])
            self.assertEqual(len(data['TAP_GIT_SHA']),40)

    def test_missing_runtime_blocks_chain_before_submit(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ,{'MC_RUNTIME_ENV_PATH':str(pathlib.Path(d)/'missing.env')}):
            with self.assertRaises(FileNotFoundError):
                j.submission_parameters('a'*40,'contracts','request',self.intent_id,True)
            data=j.submission_parameters('a'*40,'contracts','request',self.intent_id,False)
            self.assertNotIn('MC_RUNTIME_ENV',data)

    def test_full_regression_cannot_chain(self):
        with self.assertRaises(ValueError):
            j.submission_parameters('a'*40,'full-regression','request',self.intent_id,True)

if __name__=='__main__': unittest.main()
