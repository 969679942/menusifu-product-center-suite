import importlib.util,json,pathlib,tempfile,unittest

spec=importlib.util.spec_from_file_location('render_report',pathlib.Path(__file__).parents[1]/'render-report.py')
report=importlib.util.module_from_spec(spec);spec.loader.exec_module(report)

class RenderReportTests(unittest.TestCase):
    def test_report_renders_allure_selection_reason_without_running_any_case(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            (root/'analysis.json').write_text(json.dumps({
                'buildUrl':'http://jenkins/job/suite/7/','buildNumber':7,'jenkinsResult':'SUCCESS',
                'gitSha':'a'*40,'identityVerified':True,'executionComplete':True,
                'kind':'ci-report-smoke','actionRequired':'none','passed':1,'failed':0,
            }),encoding='utf-8')
            (root/'allure-audit.json').write_text(json.dumps({'status':'complete','selection':{'reason':'selection-complete'}}),encoding='utf-8')
            rendered=report.render(root)
            self.assertTrue(rendered.exists())
            self.assertIn('selection-complete',rendered.read_text(encoding='utf-8'))

if __name__=='__main__':unittest.main()
