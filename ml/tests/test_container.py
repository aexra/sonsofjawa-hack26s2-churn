import json
import os
import subprocess
import unittest
import uuid


@unittest.skipUnless(os.environ.get('RISKML_TEST_IMAGE'), 'set RISKML_TEST_IMAGE to run container checks')
class ContainerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.image = os.environ['RISKML_TEST_IMAGE']
        cls.volume = 'riskml-test-' + uuid.uuid4().hex
        subprocess.run(['docker', 'volume', 'create', cls.volume], check=True, capture_output=True)
        cls.addClassCleanup(subprocess.run, ['docker', 'volume', 'rm', cls.volume],
                            check=True, capture_output=True)
        result = cls.run_image('demo', '--out-dir', '/app/ml/reports/demo')
        if result.returncode:
            raise AssertionError(result.stderr)
        cls.demo = json.loads(result.stdout)

    @classmethod
    def run_image(cls, *args, entrypoint=None):
        command = ['docker', 'run', '--rm', '--network', 'none', '--read-only',
                   '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                   '--tmpfs', '/tmp:rw,noexec,nosuid,size=256m',
                   '--mount', f'type=volume,source={cls.volume},target=/app/ml/reports']
        if entrypoint:
            command += ['--entrypoint', entrypoint]
        return subprocess.run([*command, cls.image, *args], capture_output=True, text=True, timeout=120)

    def test_image_runs_unprivileged_without_packaged_data(self):
        result = self.run_image('-c',
            'import json,os,pathlib; print(json.dumps({"uid":os.getuid(),'
            '"tests":pathlib.Path("tests").exists(),"venv":pathlib.Path(".venv").exists()}))',
            entrypoint='python')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {'uid': 10001, 'tests': False, 'venv': False})

    def test_model_survives_container_and_predicts_in_next_run(self):
        self.assertEqual(self.demo['usage'], 'demonstration_only')
        result = self.run_image('predict', '--model', '/app/ml/reports/demo/model.json',
                                '--input', '/app/ml/reports/demo/requests.json',
                                '--out', '/app/ml/reports/separate-predictions.json')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['payments'], 20)
        read = self.run_image('-c',
            'import json; p=json.load(open("reports/separate-predictions.json"));'
            'print(json.dumps({"model_id":p["model_id"],"usage":p["usage"]}))', entrypoint='python')
        self.assertEqual(read.returncode, 0, read.stderr)
        self.assertEqual(json.loads(read.stdout), {
            'model_id': self.demo['model_id'], 'usage': 'demonstration_only'})

    def test_job_fails_on_missing_input_or_existing_output(self):
        missing = self.run_image('predict', '--model', '/app/ml/reports/missing.json',
                                '--input', '/app/ml/reports/demo/requests.json',
                                '--out', '/app/ml/reports/missing-output.json')
        self.assertEqual(missing.returncode, 2)
        self.assertEqual(json.loads(missing.stderr)['status'], 'error')
        existing = self.run_image('demo', '--out-dir', '/app/ml/reports/demo')
        self.assertEqual(existing.returncode, 2)
        self.assertIn('already exists', json.loads(existing.stderr)['message'])


if __name__ == '__main__':
    unittest.main()
