import importlib.util, json, os, pathlib, tempfile, unittest
from unittest.mock import patch
os.environ.setdefault('SUITE_JENKINS_USER','fixture')
os.environ.setdefault('SUITE_JENKINS_TOKEN','fixture')
spec=importlib.util.spec_from_file_location('jenkins_transport',pathlib.Path(__file__).parents[1]/'jenkins.py')
j=importlib.util.module_from_spec(spec);spec.loader.exec_module(j)

class TransportBoundaryTests(unittest.TestCase):
    def test_other_job_mutation_is_denied_before_network(self):
        with patch.object(j.SESSION,'post') as post:
            with self.assertRaises(ValueError):j.post(j.BASE+'/job/another-job/config.xml',data=b'')
            post.assert_not_called()

    def test_ambiguous_build_submission_is_not_replayed(self):
        with tempfile.TemporaryDirectory() as d, patch.object(j,'STATE',pathlib.Path(d)/'checkpoint.json'):
            j.write(j.STATE,{'status':'submitting','requestId':'pending'})
            with patch.object(j,'reconcile',return_value=False),patch.object(j,'post') as post:
                with self.assertRaises(RuntimeError):j.submit()
                post.assert_not_called()

    def test_existing_queued_request_is_resumed(self):
        with tempfile.TemporaryDirectory() as d, patch.object(j,'STATE',pathlib.Path(d)/'checkpoint.json'):
            j.write(j.STATE,{'status':'queued','requestId':'pending','queueUrl':j.BASE+'/queue/item/1/'})
            with patch.object(j,'reconcile',return_value=True),patch.object(j,'post') as post:
                j.submit();post.assert_not_called()

    def test_analyzed_same_commit_and_scope_do_not_start_another_build(self):
        with tempfile.TemporaryDirectory() as d, patch.object(j,'STATE',pathlib.Path(d)/'checkpoint.json'):
            j.write(j.STATE,{'status':'analyzed','gitSha':'a'*40,'runScope':'pilot'})
            with patch.object(j,'git',return_value='a'*40),patch.object(j,'post') as post:
                j.submit('pilot');post.assert_not_called()

if __name__=='__main__':unittest.main()
