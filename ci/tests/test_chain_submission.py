import importlib.util, os, pathlib, tempfile, unittest
from unittest.mock import patch
os.environ.setdefault('SUITE_JENKINS_USER','fixture')
os.environ.setdefault('SUITE_JENKINS_TOKEN','fixture')
spec=importlib.util.spec_from_file_location('transport',pathlib.Path(__file__).parents[1]/'jenkins.py')
j=importlib.util.module_from_spec(spec);spec.loader.exec_module(j)

class ChainSubmission(unittest.TestCase):
    def test_chain_loads_runtime_at_contracts_and_pins_dependencies(self):
        with tempfile.TemporaryDirectory() as d:
            f=pathlib.Path(d)/'runtime.env'; f.write_text('FIXTURE=value',encoding='utf-8')
            with patch.dict(os.environ,{'MC_RUNTIME_ENV_PATH':str(f)}):
                data=j.submission_parameters('a'*40,'contracts','request','intent',True)
            self.assertEqual(data['AUTO_CHAIN'],'true')
            self.assertEqual(data['MC_RUNTIME_ENV'],'FIXTURE=value')
            self.assertEqual(data['MC_GIT_SHA'],j.read(j.ROOT/'ci/dependency-manifest.json')['repositories']['mc']['revision'])
            self.assertEqual(len(data['TAP_GIT_SHA']),40)

    def test_missing_runtime_blocks_chain_before_submit(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ,{'MC_RUNTIME_ENV_PATH':str(pathlib.Path(d)/'missing.env')}):
            with self.assertRaises(FileNotFoundError):
                j.submission_parameters('a'*40,'contracts','request','intent',True)
            data=j.submission_parameters('a'*40,'contracts','request','intent',False)
            self.assertNotIn('MC_RUNTIME_ENV',data)

    def test_full_regression_cannot_chain(self):
        with self.assertRaises(ValueError):
            j.submission_parameters('a'*40,'full-regression','request','intent',True)

if __name__=='__main__': unittest.main()
