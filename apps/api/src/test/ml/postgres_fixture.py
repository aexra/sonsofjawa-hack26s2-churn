import json
import subprocess
import time
import unittest
import uuid
from pathlib import Path


HERE = Path(__file__).resolve().parent
MIGRATIONS = HERE.parents[1] / 'main/resources/db/migration'
IMAGE = 'postgres:18-alpine@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5'
AS_OF = '2026-10-19T15:00:00Z'


def command(args, sql=None, timeout=60):
    return subprocess.run(
        args, input=sql, text=True, capture_output=True, check=True, timeout=timeout
    ).stdout.strip()


class PostgresFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.container = 'churn-ml-test-' + uuid.uuid4().hex
        cls.addClassCleanup(cls.cleanup)
        command([
            'docker', 'run', '--detach', '--name', cls.container,
            '--network', 'none', '--label', 'churn.component=ml-test',
            '--tmpfs', '/var/lib/postgresql:rw',
            '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', IMAGE,
        ])
        for _ in range(60):
            ready = subprocess.run(
                ['docker', 'exec', cls.container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'],
                capture_output=True, timeout=10,
            )
            if ready.returncode == 0:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError('PostgreSQL readiness timeout')
        cls.schema = '\n'.join(
            (MIGRATIONS / name).read_text()
            for name in ['V1__source_schema.sql', 'V2__risk_core.sql',
                         'V3__risk_settings_validation.sql', 'R__risk_model.sql']
        )

    @classmethod
    def cleanup(cls):
        command(['docker', 'rm', '--force', cls.container])

    @classmethod
    def sql(cls, statement):
        return command([
            'docker', 'exec', '-i', cls.container, 'psql', '-X', '-qAt',
            '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
        ], statement)

    def setUp(self):
        self.sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public; BEGIN;'
                 + self.schema + 'COMMIT;')
        self.sql(f"UPDATE model_clock SET mode='frozen', frozen_at='{AS_OF}';")

    def rows(self, statement):
        result = self.sql(
            'SELECT coalesce(jsonb_agg(to_jsonb(t)), \'[]\'::jsonb) FROM ('
            + statement + ') t;'
        )
        return json.loads(result)

    def fixture(self, data=None):
        if data is None:
            data = json.loads((HERE / 'fixtures/organizer.json').read_text())
        for table in ['accounts', 'services', 'transactions']:
            payload = json.dumps(data[table]).replace("'", "''")
            self.sql(f"INSERT INTO {table} SELECT * FROM "
                     f"jsonb_populate_recordset(NULL::{table}, '{payload}'::jsonb);")

    def scores(self):
        return self.rows('SELECT * FROM scores_delta_vw ORDER BY account_id')

    def account(self, balance=0, bonus=0, bonus_state='locked', withdraw=0):
        self.sql(f'''INSERT INTO accounts
            (id, email, balance, "bonusBalance", "bonusState", "withdrawBalance")
            VALUES (101, 'scenario@example.test', {balance}, {bonus}, '{bonus_state}', {withdraw});''')

    def service(self, service_id=101, status='active', auto=True, days=1, price=1000, term='month'):
        self.sql(f'''INSERT INTO services
            (id, name, "ownerId", "paymentTerm", "autoProlong", "createdAt", "expiresAt", status, price)
            VALUES ({service_id}, 'scenario-{service_id}', 101, '{term}', {str(auto).lower()},
            '{AS_OF}'::timestamptz - interval '365 days',
            '{AS_OF}'::timestamptz + {days} * interval '1 day', '{status}', {price});''')

    def transaction(self, transaction_id, hours=48, status='not_performed', kind='prolong', service_id=101):
        performed = 'NULL' if status == 'not_performed' else f"'{AS_OF}'::timestamptz - {hours} * interval '1 hour'"
        self.sql(f'''INSERT INTO transactions
            (id, amount, status, "createdAt", "performedAt", type, "serviceId")
            VALUES ({transaction_id}, 100, '{status}',
            '{AS_OF}'::timestamptz - {hours} * interval '1 hour', {performed}, '{kind}', {service_id});''')

    def score(self):
        return next(row for row in self.scores() if row['account_id'] == 101)

    def persist_scores(self):
        self.sql("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT * FROM recalculate_risk('manual'); COMMIT;")
