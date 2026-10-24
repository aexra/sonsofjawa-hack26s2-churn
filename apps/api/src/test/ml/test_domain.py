import subprocess
import unittest

from postgres_fixture import PostgresFixture


class DomainTest(PostgresFixture):
    def test_weighted_score_has_known_values_and_scale_invariance(self):
        for weights in ['ARRAY[20,80]', 'ARRAY[2,8]', 'ARRAY[200,800]']:
            with self.subTest(weights=weights):
                self.assertEqual(self.sql(
                    f'SELECT risk_normalized_score(ARRAY[1,0.5]::numeric[], {weights}::numeric[]);'
                ), '60.00')
        self.assertEqual(self.sql('SELECT risk_normalized_score(ARRAY[0,0]::numeric[], ARRAY[1,2]::numeric[]);'), '0.00')
        self.assertEqual(self.sql('SELECT risk_normalized_score(ARRAY[1,1]::numeric[], ARRAY[1,2]::numeric[]);'), '100.00')

    def test_invalid_feature_and_weight_arrays_are_rejected(self):
        cases = [
            ('ARRAY[]::numeric[]', 'ARRAY[]::numeric[]'),
            ('ARRAY[1,0]', 'ARRAY[1]'),
            ('ARRAY[1.1]', 'ARRAY[1]'),
            ('ARRAY[-0.1]', 'ARRAY[1]'),
            ('ARRAY[1]', 'ARRAY[-1]'),
            ('ARRAY[1]', 'ARRAY[0]'),
            ('ARRAY[NULL]::numeric[]', 'ARRAY[1]'),
            ('ARRAY[1]', 'ARRAY[NULL]::numeric[]'),
            ("ARRAY['NaN'::numeric]", 'ARRAY[1]'),
            ('ARRAY[1]', "ARRAY['Infinity'::numeric]"),
            ('ARRAY[[1,0]]', 'ARRAY[[1,2]]'),
        ]
        for values, weights in cases:
            with self.subTest(values=values, weights=weights):
                with self.assertRaises(subprocess.CalledProcessError):
                    self.sql(f'SELECT risk_normalized_score({values}::numeric[], {weights}::numeric[]);')

    def test_risk_level_thresholds_are_inclusive(self):
        for score, expected in [(0, 'low'), (24.99, 'low'), (25, 'medium'), (49.99, 'medium'), (50, 'high'), (100, 'high')]:
            with self.subTest(score=score):
                self.assertEqual(self.sql(f'SELECT risk_level({score},25,50);'), expected)

    def test_invalid_risk_levels_are_rejected(self):
        for values in ['-1,25,50', '101,25,50', '50,50,50', '50,-1,50', '50,25,101', "'NaN'::numeric,25,50"]:
            with self.subTest(values=values):
                with self.assertRaises(subprocess.CalledProcessError):
                    self.sql(f'SELECT risk_level({values});')

    def test_money_estimate_is_exact_in_minor_units(self):
        row = self.rows('SELECT * FROM risk_money_estimate(10000,6000,5000,40)')[0]
        self.assertEqual(row, {'revenue_horizon': 10000, 'secured_amount': 5000, 'expected_loss': 2000})

    def test_money_rounding_respects_reported_unsecured_revenue(self):
        for revenue, automatic, funds, score in [('100.4', '100.4', '0.6', 100), ('0.6', '0.6', '0.4', 100), ('100.5', '100.5', '99.5', 50)]:
            with self.subTest(revenue=revenue, funds=funds):
                row = self.rows(f'SELECT * FROM risk_money_estimate({revenue},{automatic},{funds},{score})')[0]
                self.assertLessEqual(row['expected_loss'], row['revenue_horizon'] - row['secured_amount'])
                self.assertGreaterEqual(row['expected_loss'], 0)

    def test_invalid_money_inputs_are_rejected(self):
        for values in ['-1,0,0,50', '10,11,0,50', '10,0,-1,50', '10,0,0,101', "10,0,'NaN'::numeric,50"]:
            with self.subTest(values=values):
                with self.assertRaises(subprocess.CalledProcessError):
                    self.sql(f'SELECT * FROM risk_money_estimate({values});')


if __name__ == '__main__':
    unittest.main(verbosity=2)
