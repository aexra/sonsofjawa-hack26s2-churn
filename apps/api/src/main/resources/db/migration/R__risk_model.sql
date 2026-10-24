DROP VIEW IF EXISTS public.churn_forecast_vw;
DROP VIEW IF EXISTS public.churn_history_vw;
DROP VIEW IF EXISTS public.customer_scores_vw;
DROP VIEW IF EXISTS public.scores_delta_vw;

CREATE OR REPLACE FUNCTION public.term_days(term text) RETURNS numeric
    LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE term
               WHEN 'hour' THEN 1.0 / 24
               WHEN 'week' THEN 7.0
               WHEN 'month' THEN 30.4375
               WHEN 'quarter_year' THEN 91.3125
               WHEN 'half_year' THEN 182.625
               WHEN 'year' THEN 365.25
           END
$$;

CREATE TEMPORARY TABLE model_settings_declared (
    key text, group_key text, default_value numeric, min_value numeric, max_value numeric,
    unit text, title text, description text, sort_order integer
) ON COMMIT DROP;

INSERT INTO model_settings_declared VALUES
    ('weight_renewal_unsecured', 'weights', 25, 0, 100, 'points',
     'продление не обеспечено',
     'вес признака: услуга истекает в пределах горизонта и не продлится автоматически', 10),
    ('weight_insufficient_funds', 'weights', 22, 0, 100, 'points',
     'нехватка средств на продления',
     'вес признака: средств на балансе меньше, чем нужно на продления в пределах горизонта', 20),
    ('weight_prolong_wait', 'weights', 30, 0, 100, 'points',
     'услуги в ожидании оплаты',
     'вес признака: есть услуги в статусе prolong_wait', 30),
    ('weight_suspended_share', 'weights', 10, 0, 100, 'points',
     'выключенные клиентом услуги',
     'вес признака: доля выручки услуг в статусе suspended', 40),
    ('weight_termination_history', 'weights', 5, 0, 100, 'points',
     'история удалений и блокировок',
     'вес признака: доля удалённых и заблокированных услуг аккаунта', 50),
    ('weight_payment_failures', 'weights', 5, 0, 100, 'points',
     'незавершённые платежи',
     'вес признака: доля транзакций в статусе not_performed', 60),
    ('weight_withdrawable_share', 'weights', 3, 0, 100, 'points',
     'баланс доступен к выводу',
     'вес признака: доля баланса, которую клиент может вывести', 70),
    ('level_high', 'levels', 50, 1, 100, 'points',
     'порог высокого риска',
     'risk-score не ниже порога — высокий риск', 110),
    ('level_medium', 'levels', 25, 0, 99, 'points',
     'порог среднего риска',
     'risk-score не ниже порога — средний риск; ниже — низкий', 120),
    ('horizon_days', 'horizon', 30, 1, 365, 'days',
     'горизонт прогноза',
     'на сколько дней вперёд оцениваются продления, выручка и потери', 210),
    ('grace_days', 'horizon', 5, 0, 30, 'days',
     'срок ожидания оплаты',
     'сколько дней услуга находится в prolong_wait до удаления', 220),
    ('max_score_age_hours', 'quality', 6, 1, 168, 'hours',
     'максимальный возраст оценки',
     'через сколько часов оценка пересчитывается, даже если данные не менялись', 310),
    ('min_transactions', 'quality', 2, 1, 100, 'count',
     'минимум транзакций',
     'меньше транзакций — признак незавершённых платежей не учитывается', 320);

DELETE FROM public.model_settings s
WHERE NOT EXISTS (SELECT 1 FROM model_settings_declared d WHERE d.key = s.key);

INSERT INTO public.model_settings AS s
    (key, group_key, value, default_value, min_value, max_value, unit, title, description, sort_order)
SELECT key, group_key, default_value, default_value, min_value, max_value, unit, title, description, sort_order
FROM model_settings_declared
ON CONFLICT (key) DO UPDATE SET
    group_key = excluded.group_key,
    default_value = excluded.default_value,
    min_value = excluded.min_value,
    max_value = excluded.max_value,
    value = least(greatest(s.value, excluded.min_value), excluded.max_value),
    unit = excluded.unit,
    title = excluded.title,
    description = excluded.description,
    sort_order = excluded.sort_order;

CREATE TEMPORARY TABLE model_features_declared (
    key text, weight_key text, title text, description text, reason_template text, sort_order integer
) ON COMMIT DROP;

INSERT INTO model_features_declared VALUES
    ('renewal_unsecured', 'weight_renewal_unsecured',
     'продление не обеспечено',
     '1 − дней до окончания срока / горизонт по самой срочной действующей услуге, которая не продлится автоматически: автопродление выключено или услуга уже в prolong_wait; для истёкших услуг 1',
     'услуга {serviceName} не продлится автоматически: {deadline}', 10),
    ('insufficient_funds', 'weight_insufficient_funds',
     'нехватка средств на продления',
     '1 − доступные средства / сумма продлений в пределах горизонта',
     'средств хватает на {coveragePct}% продлений за {horizonDays} дн.: доступно {fundsAmount}, нужно {requiredAmount}', 20),
    ('prolong_wait', 'weight_prolong_wait',
     'услуги в ожидании оплаты',
     '0,5 + 0,5 × доля действующих услуг в статусе prolong_wait; 0, если таких нет',
     '{count} из {live} действующих услуг ожидают оплаты', 30),
    ('suspended_share', 'weight_suspended_share',
     'выключенные клиентом услуги',
     'доля выручки за горизонт, приходящаяся на услуги в статусе suspended',
     '{count} из {live} действующих услуг выключены клиентом ({sharePct}% выручки)', 40),
    ('termination_history', 'weight_termination_history',
     'история удалений и блокировок',
     'доля услуг в статусах deleted и blocked среди всех услуг аккаунта',
     '{count} из {total} услуг удалены или заблокированы', 50),
    ('payment_failures', 'weight_payment_failures',
     'незавершённые платежи',
     'доля транзакций not_performed; 0, если транзакций меньше минимума',
     '{count} из {total} платежей не завершены', 60),
    ('withdrawable_share', 'weight_withdrawable_share',
     'баланс доступен к выводу',
     'withdrawBalance / balance',
     '{sharePct}% баланса доступно к выводу', 70);

DELETE FROM public.model_features f
WHERE NOT EXISTS (SELECT 1 FROM model_features_declared d WHERE d.key = f.key);

INSERT INTO public.model_features AS f (key, weight_key, title, description, reason_template, sort_order)
SELECT key, weight_key, title, description, reason_template, sort_order
FROM model_features_declared
ON CONFLICT (key) DO UPDATE SET
    weight_key = excluded.weight_key,
    title = excluded.title,
    description = excluded.description,
    reason_template = excluded.reason_template,
    sort_order = excluded.sort_order;

CREATE VIEW public.scores_delta_vw AS
WITH
clock AS (
    SELECT public.model_now() AS as_of,
           now() AS calculated_at,
           (SELECT max(version) FROM public.model_revisions) AS model_version
),
p AS (
    SELECT
        max(value) FILTER (WHERE key = 'horizon_days') AS horizon_days,
        max(value) FILTER (WHERE key = 'grace_days') AS grace_days,
        max(value) FILTER (WHERE key = 'level_high') AS level_high,
        max(value) FILTER (WHERE key = 'level_medium') AS level_medium,
        max(value) FILTER (WHERE key = 'max_score_age_hours') AS max_age_hours,
        max(value) FILTER (WHERE key = 'min_transactions') AS min_transactions
    FROM public.model_settings
),
w AS (
    SELECT f.key, s.value AS weight
    FROM public.model_features f
    JOIN public.model_settings s ON s.key = f.weight_key
),
w_total AS (
    SELECT coalesce(sum(weight), 0) AS total FROM w
),
batch AS (
    SELECT DISTINCT account_id FROM public.delta WHERE proc_date IS NULL
),
svc AS (
    SELECT
        s.id,
        s.name,
        s."ownerId" AS account_id,
        s."autoProlong" AS auto_prolong,
        s."expiresAt" AS expires_at,
        s.status,
        s.price,
        s.status IN ('active', 'suspended', 'prolong_wait') AS is_live,
        public.term_days(s."paymentTerm") AS term_days,
        CASE WHEN s.status = 'prolong_wait' THEN 0
             ELSE greatest(extract(epoch FROM s."expiresAt" - c.as_of) / 86400.0, 0)
        END AS days_left,
        s.status IN ('active', 'suspended') AND s."expiresAt" <= c.as_of AS expired_but_live,
        s.status = 'prolong_wait' AND s."expiresAt" + p.grace_days * interval '1 day' < c.as_of AS overdue_prolong_wait,
        (SELECT min(x) FROM unnest(ARRAY[
            s."expiresAt" - p.horizon_days * interval '1 day',
            s."expiresAt",
            s."expiresAt" + p.grace_days * interval '1 day'
        ]) AS x WHERE x > c.as_of) AS next_boundary
    FROM public.services s
    JOIN batch b ON b.account_id = s."ownerId"
    CROSS JOIN clock c
    CROSS JOIN p
),
svc2 AS (
    SELECT
        svc.*,
        CASE WHEN is_live THEN least(greatest(1 - days_left / p.horizon_days, 0), 1) ELSE 0 END AS urgency,
        CASE WHEN is_live THEN price * p.horizon_days / term_days ELSE 0 END AS revenue_h,
        CASE WHEN NOT is_live OR days_left > p.horizon_days THEN 0
             ELSE 1 + floor((p.horizon_days - days_left) / term_days)
        END AS renewals_h
    FROM svc CROSS JOIN p
),
agg AS (
    SELECT
        account_id,
        count(*) AS services_total,
        count(*) FILTER (WHERE is_live) AS services_live,
        count(*) FILTER (WHERE status IN ('deleted', 'blocked')) AS services_terminated,
        count(*) FILTER (WHERE status = 'prolong_wait') AS services_prolong_wait,
        count(*) FILTER (WHERE status = 'suspended') AS services_suspended,
        coalesce(sum(revenue_h), 0) AS revenue_h,
        coalesce(sum(revenue_h) FILTER (WHERE status = 'suspended'), 0) AS revenue_suspended,
        coalesce(sum(revenue_h) FILTER (WHERE auto_prolong AND status <> 'prolong_wait'), 0) AS revenue_auto,
        coalesce(sum(price * renewals_h), 0) AS required_h,
        min(expires_at) FILTER (WHERE is_live AND status <> 'prolong_wait' AND days_left > 0) AS next_expiry_at,
        min(next_boundary) FILTER (WHERE is_live) AS next_boundary,
        bool_or(expired_but_live) AS any_expired_but_live,
        bool_or(overdue_prolong_wait) AS any_overdue_prolong_wait
    FROM svc2
    GROUP BY account_id
),
top_unsecured AS (
    SELECT DISTINCT ON (account_id) account_id, id AS service_id, name AS service_name, days_left, urgency
    FROM svc2
    WHERE is_live AND (NOT auto_prolong OR status = 'prolong_wait') AND urgency > 0
    ORDER BY account_id, urgency DESC, price DESC, id
),
tx AS (
    SELECT s."ownerId" AS account_id,
           count(*) AS total,
           count(*) FILTER (WHERE t.status = 'not_performed') AS failed
    FROM public.transactions t
    JOIN public.services s ON s.id = t."serviceId"
    JOIN batch b ON b.account_id = s."ownerId"
    GROUP BY s."ownerId"
),
base AS (
    SELECT
        b.account_id,
        a.id IS NOT NULL AS account_exists,
        coalesce(a.balance, 0) AS balance,
        coalesce(a."withdrawBalance", 0) AS withdraw_balance,
        coalesce(a."totalReplenished", 0) AS total_replenished,
        coalesce(a.balance, 0) + CASE WHEN a."bonusState" = 'unlocked' THEN a."bonusBalance" ELSE 0 END AS funds,
        coalesce(g.services_total, 0) AS services_total,
        coalesce(g.services_live, 0) AS services_live,
        coalesce(g.services_terminated, 0) AS services_terminated,
        coalesce(g.services_prolong_wait, 0) AS services_prolong_wait,
        coalesce(g.services_suspended, 0) AS services_suspended,
        coalesce(g.revenue_h, 0) AS revenue_h,
        coalesce(g.revenue_suspended, 0) AS revenue_suspended,
        coalesce(g.revenue_auto, 0) AS revenue_auto,
        coalesce(g.required_h, 0) AS required_h,
        g.next_expiry_at,
        g.next_boundary,
        coalesce(g.any_expired_but_live, false) AS any_expired_but_live,
        coalesce(g.any_overdue_prolong_wait, false) AS any_overdue_prolong_wait,
        te.service_id AS top_service_id,
        te.service_name AS top_service_name,
        te.days_left AS top_days_left,
        coalesce(te.urgency, 0) AS top_urgency,
        coalesce(tx.total, 0) AS tx_total,
        coalesce(tx.failed, 0) AS tx_failed
    FROM batch b
    LEFT JOIN public.accounts a ON a.id = b.account_id
    LEFT JOIN agg g ON g.account_id = b.account_id
    LEFT JOIN top_unsecured te ON te.account_id = b.account_id
    LEFT JOIN tx ON tx.account_id = b.account_id
),
feat AS (
    SELECT
        base.*,
        top_urgency AS f_renewal_unsecured,
        CASE WHEN required_h > 0 THEN least(greatest(1 - funds / required_h, 0), 1) ELSE 0 END AS f_insufficient_funds,
        CASE WHEN services_prolong_wait > 0 AND services_live > 0
             THEN 0.5 + 0.5 * services_prolong_wait::numeric / services_live ELSE 0 END AS f_prolong_wait,
        CASE WHEN revenue_h > 0 THEN revenue_suspended / revenue_h ELSE 0 END AS f_suspended_share,
        CASE WHEN services_total > 0 THEN services_terminated::numeric / services_total ELSE 0 END AS f_termination_history,
        CASE WHEN tx_total >= p.min_transactions THEN tx_failed::numeric / tx_total ELSE 0 END AS f_payment_failures,
        CASE WHEN balance > 0 THEN least(withdraw_balance::numeric / balance, 1) ELSE 0 END AS f_withdrawable_share
    FROM base CROSS JOIN p
),
scored AS (
    SELECT
        feat.*,
        r.reasons,
        r.features,
        CASE WHEN wt.total > 0 THEN round(r.weighted / wt.total * 100, 2) ELSE 0 END AS score
    FROM feat
    CROSS JOIN w_total wt
    CROSS JOIN p
    CROSS JOIN LATERAL (
        SELECT
            coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'key', v.key,
                        'value', round(v.f, 4),
                        'weight', w.weight,
                        'contribution', round(w.weight * v.f / nullif(wt.total, 0) * 100, 2),
                        'params', v.params
                    )
                    ORDER BY w.weight * v.f DESC, v.key
                ) FILTER (WHERE w.weight * v.f > 0),
                '[]'::jsonb
            ) AS reasons,
            coalesce(jsonb_object_agg(v.key, round(v.f, 4)), '{}'::jsonb) AS features,
            coalesce(sum(w.weight * v.f), 0) AS weighted
        FROM (VALUES
            ('renewal_unsecured', feat.f_renewal_unsecured, jsonb_build_object(
                'serviceId', feat.top_service_id,
                'serviceName', feat.top_service_name,
                'daysLeft', round(coalesce(feat.top_days_left, 0), 1),
                'deadline', CASE WHEN coalesce(feat.top_days_left, 0) = 0 THEN 'срок истёк'
                                 WHEN feat.top_days_left < 1
                                 THEN 'срок истекает через ' || ceil(feat.top_days_left * 24) || ' ч'
                                 ELSE 'срок истекает через '
                                      || replace(round(feat.top_days_left, 1)::text, '.', ',') || ' дн.' END)),
            ('insufficient_funds', feat.f_insufficient_funds, jsonb_build_object(
                'fundsAmount', feat.funds,
                'requiredAmount', round(feat.required_h),
                'coveragePct', CASE WHEN feat.required_h > 0
                                    THEN least(round(feat.funds / feat.required_h * 100), 100) ELSE 100 END,
                'horizonDays', p.horizon_days)),
            ('prolong_wait', feat.f_prolong_wait, jsonb_build_object(
                'count', feat.services_prolong_wait,
                'live', feat.services_live)),
            ('suspended_share', feat.f_suspended_share, jsonb_build_object(
                'count', feat.services_suspended,
                'live', feat.services_live,
                'sharePct', round(feat.f_suspended_share * 100))),
            ('termination_history', feat.f_termination_history, jsonb_build_object(
                'count', feat.services_terminated,
                'total', feat.services_total)),
            ('payment_failures', feat.f_payment_failures, jsonb_build_object(
                'count', feat.tx_failed,
                'total', feat.tx_total)),
            ('withdrawable_share', feat.f_withdrawable_share, jsonb_build_object(
                'sharePct', round(feat.f_withdrawable_share * 100)))
        ) AS v(key, f, params)
        JOIN w ON w.key = v.key
    ) r
),
final AS (
    SELECT
        s.*,
        CASE
            WHEN NOT s.account_exists THEN 'removed'
            WHEN s.services_total = 0 THEN 'no_score'
            WHEN s.services_live = 0 THEN 'no_score'
            ELSE 'scored'
        END AS status,
        CASE
            WHEN NOT s.account_exists THEN NULL
            WHEN s.services_total = 0 THEN 'no_services'
            WHEN s.services_live = 0 THEN 'no_live_services'
        END AS no_score_reason,
        least(s.revenue_auto, greatest(s.balance - s.withdraw_balance, 0)) AS secured
    FROM scored s
)
SELECT
    f.account_id,
    c.calculated_at,
    c.as_of,
    c.model_version,
    f.status,
    f.no_score_reason,
    CASE WHEN f.status = 'scored' THEN f.score END AS risk_score,
    CASE WHEN f.status <> 'scored' THEN NULL
         WHEN f.score >= p.level_high THEN 'high'
         WHEN f.score >= p.level_medium THEN 'medium'
         ELSE 'low'
    END AS risk_level,
    CASE WHEN f.status = 'scored' THEN round(f.revenue_h)::bigint END AS revenue_horizon,
    CASE WHEN f.status = 'scored' THEN round(f.secured)::bigint END AS secured_amount,
    CASE WHEN f.status = 'scored'
         THEN round(f.score / 100 * greatest(f.revenue_h - f.secured, 0))::bigint END AS expected_loss,
    f.services_total::integer AS services_total,
    f.services_live::integer AS services_live,
    CASE WHEN f.status = 'scored' THEN (
        SELECT count(*)::integer
        FROM svc2 x
        WHERE x.account_id = f.account_id
          AND x.is_live
          AND (x.status = 'prolong_wait' OR x.urgency > 0)
          AND (x.status = 'prolong_wait' OR NOT x.auto_prolong OR f.f_insufficient_funds > 0)
    ) ELSE 0 END AS services_at_risk,
    f.next_expiry_at,
    CASE WHEN f.status = 'scored' THEN f.reasons ELSE '[]'::jsonb END AS reasons,
    CASE WHEN f.status = 'scored' THEN f.features ELSE '{}'::jsonb END AS features,
    array_remove(ARRAY[
        CASE WHEN f.any_expired_but_live THEN 'expired_but_live' END,
        CASE WHEN f.any_overdue_prolong_wait THEN 'overdue_prolong_wait' END,
        CASE WHEN f.withdraw_balance > f.balance THEN 'withdraw_exceeds_balance' END,
        CASE WHEN f.balance > f.total_replenished THEN 'balance_exceeds_replenished' END
    ], NULL) AS anomalies,
    CASE WHEN f.status = 'scored'
         THEN least(f.next_boundary, c.as_of + p.max_age_hours * interval '1 hour') END AS valid_until,
    true AS is_current
FROM final f
CROSS JOIN clock c
CROSS JOIN p;

CREATE VIEW public.customer_scores_vw AS
SELECT
    a.id,
    a.email,
    a.balance,
    a."withdrawBalance" AS withdraw_balance,
    a."totalReplenished" AS total_replenished,
    a."bonusBalance" AS bonus_balance,
    a."bonusState" AS bonus_state,
    coalesce(s.status, 'pending') AS score_status,
    s.no_score_reason,
    s.risk_score,
    s.risk_level,
    s.expected_loss,
    s.revenue_horizon,
    s.secured_amount,
    s.services_total,
    s.services_live,
    s.services_at_risk,
    s.next_expiry_at,
    s.reasons,
    s.reasons -> 0 ->> 'key' AS top_reason_key,
    s.anomalies,
    s.calculated_at,
    s.as_of,
    s.model_version
FROM public.accounts a
LEFT JOIN public.scores s ON s.account_id = a.id AND s.is_current;

CREATE VIEW public.churn_history_vw AS
SELECT
    s.id AS service_id,
    s."ownerId" AS account_id,
    s.price,
    s."paymentTerm" AS payment_term,
    coalesce(h.changed_at, s."expiresAt" + p.grace_days * interval '1 day') AS deleted_at,
    h.changed_at IS NULL AS estimated
FROM public.services s
CROSS JOIN (SELECT value AS grace_days FROM public.model_settings WHERE key = 'grace_days') p
LEFT JOIN LATERAL (
    SELECT x.changed_at
    FROM public.service_status_history x
    WHERE x.service_id = s.id AND x.to_status = 'deleted' AND x.from_status IS NOT NULL
    ORDER BY x.id DESC
    LIMIT 1
) h ON true
WHERE s.status = 'deleted';

CREATE VIEW public.churn_forecast_vw AS
WITH
c AS (SELECT public.model_now() AS as_of),
p AS (
    SELECT
        max(value) FILTER (WHERE key = 'horizon_days') AS horizon_days,
        max(value) FILTER (WHERE key = 'grace_days') AS grace_days
    FROM public.model_settings
),
x AS (
    SELECT
        s.id AS service_id,
        s."ownerId" AS account_id,
        s.price,
        s."paymentTerm" AS payment_term,
        CASE WHEN s.status = 'prolong_wait'
             THEN greatest(s."expiresAt" + p.grace_days * interval '1 day', c.as_of)
             ELSE greatest(s."expiresAt", c.as_of)
        END AS expected_at,
        sc.risk_score / 100.0 * CASE
            WHEN s."autoProlong" AND s.status <> 'prolong_wait'
            THEN coalesce((sc.features ->> 'insufficient_funds')::numeric, 0)
            ELSE 1
        END AS probability,
        c.as_of,
        p.horizon_days
    FROM public.services s
    JOIN public.scores sc ON sc.account_id = s."ownerId" AND sc.is_current AND sc.status = 'scored'
    CROSS JOIN c
    CROSS JOIN p
    WHERE s.status IN ('active', 'suspended', 'prolong_wait')
)
SELECT service_id, account_id, price, payment_term, expected_at, round(probability, 4) AS probability
FROM x
WHERE expected_at <= as_of + horizon_days * interval '1 day'
  AND probability > 0;

INSERT INTO public.model_revisions (changed_by, source, changes)
VALUES ('system', 'migration', jsonb_build_array(jsonb_build_object('file', 'R__risk_model.sql')));
