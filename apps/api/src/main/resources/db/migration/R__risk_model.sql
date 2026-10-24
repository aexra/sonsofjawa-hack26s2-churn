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

CREATE OR REPLACE FUNCTION public.risk_normalized_score(p_values numeric[], p_weights numeric[])
    RETURNS numeric LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
DECLARE
    v_total numeric;
    v_weighted numeric;
BEGIN
    IF cardinality(p_values) = 0 OR cardinality(p_values) <> cardinality(p_weights)
       OR array_ndims(p_values) <> 1 OR array_ndims(p_weights) <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'feature and weight arrays must be nonempty and aligned';
    END IF;
    IF EXISTS (
        SELECT 1 FROM unnest(p_values, p_weights) AS x(value, weight)
        WHERE value IS NULL OR weight IS NULL OR value < 0 OR value > 1 OR weight < 0
           OR value::text IN ('NaN', 'Infinity', '-Infinity')
           OR weight::text IN ('NaN', 'Infinity', '-Infinity')
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'features must be finite values in 0..1 and weights finite nonnegative values';
    END IF;
    SELECT sum(weight), sum(value * weight)
    INTO v_total, v_weighted FROM unnest(p_values, p_weights) AS x(value, weight);
    IF v_total <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sum of model weights must be positive';
    END IF;
    RETURN round(100 * v_weighted / v_total, 2);
END
$$;

CREATE OR REPLACE FUNCTION public.risk_level(p_score numeric, p_medium numeric, p_high numeric)
    RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
BEGIN
    IF p_score < 0 OR p_score > 100 OR p_medium < 0 OR p_medium >= p_high OR p_high > 100
       OR p_score::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_medium::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_high::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'score and ordered risk thresholds must be finite values in 0..100';
    END IF;
    RETURN CASE WHEN p_score >= p_high THEN 'high'
                WHEN p_score >= p_medium THEN 'medium' ELSE 'low' END;
END
$$;

CREATE OR REPLACE FUNCTION public.risk_money_estimate(
    p_revenue numeric, p_automatic_revenue numeric, p_funds numeric, p_score numeric
) RETURNS TABLE (revenue_horizon bigint, secured_amount bigint, expected_loss bigint)
    LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
BEGIN
    IF p_revenue < 0 OR p_automatic_revenue < 0 OR p_funds < 0
       OR p_automatic_revenue > p_revenue OR p_score < 0 OR p_score > 100
       OR EXISTS (SELECT 1 FROM unnest(ARRAY[p_revenue, p_automatic_revenue, p_funds, p_score]) AS n
                  WHERE n::text IN ('NaN', 'Infinity', '-Infinity')) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'money inputs must be finite and nonnegative with automatic revenue bounded by revenue';
    END IF;
    revenue_horizon := round(p_revenue)::bigint;
    secured_amount := round(least(p_automatic_revenue, p_funds))::bigint;
    expected_loss := round(p_score / 100 * (revenue_horizon - secured_amount))::bigint;
    RETURN NEXT;
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
    ('weight_insufficient_funds', 'weights', 25, 0, 100, 'points',
     'нехватка средств на продления',
     'вес признака: средств на балансе меньше, чем нужно на продления в пределах горизонта', 20),
    ('weight_prolong_wait', 'weights', 30, 0, 100, 'points',
     'услуги в ожидании оплаты',
     'вес признака: есть услуги в статусе prolong_wait', 30),
    ('weight_suspended_share', 'weights', 10, 0, 100, 'points',
     'выключенные клиентом услуги',
     'вес признака: доля выручки услуг в статусе suspended', 40),
    ('weight_termination_history', 'weights', 5, 0, 100, 'points',
     'история удалений',
     'вес признака: доля удалённых услуг среди действующих и удалённых; блокировки не учитываются', 50),
    ('weight_payment_failures', 'weights', 5, 0, 100, 'points',
     'просроченные продления',
     'вес признака: доля неоплаченных продлений старше порога в окне наблюдения', 60),
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
     'меньше подходящих продлений — признак просроченных продлений не учитывается', 320),
    ('payment_overdue_hours', 'quality', 24, 1, 720, 'hours',
     'порог просрочки продления',
     'минимальный возраст продления для учёта неоплаты', 330),
    ('payment_lookback_days', 'quality', 30, 2, 365, 'days',
     'окно наблюдения платежей',
     'старые транзакции за пределами окна не влияют на оценку', 340);

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
     'история удалений',
     'deleted / (active + suspended + prolong_wait + deleted); blocked исключён',
     '{count} из {total} учитываемых услуг удалены', 50),
    ('payment_failures', 'weight_payment_failures',
     'просроченные продления',
     'доля not_performed среди достаточно давних prolong действующих услуг в окне наблюдения',
     '{count} из {total} продлений старше {overdueHours} ч не оплачены за окно {lookbackDays} дн.', 60);

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
        max(value) FILTER (WHERE key = 'min_transactions') AS min_transactions,
        max(value) FILTER (WHERE key = 'payment_overdue_hours') AS payment_overdue_hours,
        max(value) FILTER (WHERE key = 'payment_lookback_days') AS payment_lookback_days
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
        s.status = 'prolong_wait' AND s."expiresAt" + p.grace_days * interval '1 day' <= c.as_of AS overdue_prolong_wait,
        (SELECT min(x) FROM unnest(ARRAY[
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
        CASE WHEN NOT is_live OR days_left >= p.horizon_days THEN 0
             ELSE ceil((p.horizon_days - days_left) / term_days)
        END AS renewals_h
    FROM svc CROSS JOIN p
),
svc3 AS (
    SELECT
        svc2.*,
        CASE WHEN is_live AND status <> 'prolong_wait' AND expires_at >= c.as_of
             THEN c.as_of
                  + (renewals_h * term_days - (p.horizon_days - days_left)) * interval '1 day'
                  + interval '1 millisecond'
        END AS next_renewal_boundary
    FROM svc2 CROSS JOIN clock c CROSS JOIN p
),
agg AS (
    SELECT
        account_id,
        count(*) AS services_total,
        count(*) FILTER (WHERE is_live) AS services_live,
        count(*) FILTER (WHERE status = 'deleted') AS services_terminated,
        count(*) FILTER (WHERE status <> 'blocked') AS services_considered,
        count(*) FILTER (WHERE status = 'prolong_wait') AS services_prolong_wait,
        count(*) FILTER (WHERE status = 'suspended') AS services_suspended,
        coalesce(sum(revenue_h), 0) AS revenue_h,
        coalesce(sum(revenue_h) FILTER (WHERE status = 'suspended'), 0) AS revenue_suspended,
        coalesce(sum(revenue_h) FILTER (WHERE auto_prolong AND status <> 'prolong_wait'), 0) AS revenue_auto,
        coalesce(sum(price * renewals_h), 0) AS required_h,
        min(expires_at) FILTER (WHERE is_live AND status <> 'prolong_wait' AND days_left > 0) AS next_expiry_at,
        least(min(next_boundary) FILTER (WHERE is_live), min(next_renewal_boundary)) AS next_boundary,
        bool_or(expired_but_live) AS any_expired_but_live,
        bool_or(overdue_prolong_wait) AS any_overdue_prolong_wait
    FROM svc3
    GROUP BY account_id
),
top_unsecured AS (
    SELECT DISTINCT ON (account_id) account_id, id AS service_id, name AS service_name, days_left, urgency
    FROM svc2
    WHERE is_live AND (NOT auto_prolong OR status = 'prolong_wait') AND urgency > 0
    ORDER BY account_id, urgency DESC, price DESC, id
),
tx_candidates AS (
    SELECT s."ownerId" AS account_id, t.status, t."createdAt" AS created_at,
           t."createdAt" <= c.as_of - p.payment_overdue_hours * interval '1 hour'
               AND (t.status <> 'performed' OR t."performedAt" <= c.as_of) AS mature,
           t."performedAt" AS performed_at,
           c.as_of,
           p.payment_overdue_hours, p.payment_lookback_days
    FROM public.transactions t
    JOIN public.services s ON s.id = t."serviceId"
    JOIN batch b ON b.account_id = s."ownerId"
    CROSS JOIN clock c
    CROSS JOIN p
    WHERE t.type = 'prolong'
      AND s.status IN ('active', 'suspended', 'prolong_wait')
      AND t."createdAt" <= c.as_of + p.max_age_hours * interval '1 hour'
      AND t."createdAt" > c.as_of - p.payment_lookback_days * interval '1 day'
),
tx AS (
    SELECT account_id,
           count(*) FILTER (WHERE mature) AS total,
           count(*) FILTER (WHERE mature AND status = 'not_performed') AS failed,
           min((SELECT min(boundary)
                FROM unnest(ARRAY[
                    created_at + payment_overdue_hours * interval '1 hour',
                    created_at + payment_lookback_days * interval '1 day',
                    performed_at
                ]) AS boundary WHERE boundary > as_of)) AS next_boundary
    FROM tx_candidates
    GROUP BY account_id
),
base AS (
    SELECT
        b.account_id,
        a.id IS NOT NULL AS account_exists,
        coalesce(a.balance, 0) AS balance,
        coalesce(a."withdrawBalance", 0) AS withdraw_balance,
        coalesce(a."totalReplenished", 0) AS total_replenished,
        coalesce(a.balance, 0)::numeric
            + CASE WHEN a."bonusState" = 'unlocked' THEN a."bonusBalance"::numeric ELSE 0 END AS funds,
        coalesce(g.services_total, 0) AS services_total,
        coalesce(g.services_live, 0) AS services_live,
        coalesce(g.services_terminated, 0) AS services_terminated,
        coalesce(g.services_considered, 0) AS services_considered,
        coalesce(g.services_prolong_wait, 0) AS services_prolong_wait,
        coalesce(g.services_suspended, 0) AS services_suspended,
        coalesce(g.revenue_h, 0) AS revenue_h,
        coalesce(g.revenue_suspended, 0) AS revenue_suspended,
        coalesce(g.revenue_auto, 0) AS revenue_auto,
        coalesce(g.required_h, 0) AS required_h,
        g.next_expiry_at,
        least(g.next_boundary, tx.next_boundary) AS next_boundary,
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
        CASE WHEN services_considered > 0 THEN services_terminated::numeric / services_considered ELSE 0 END AS f_termination_history,
        CASE WHEN tx_total >= p.min_transactions THEN tx_failed::numeric / tx_total ELSE 0 END AS f_payment_failures
    FROM base CROSS JOIN p
),
scored AS (
    SELECT
        feat.*,
        r.reasons,
        r.features,
        public.risk_normalized_score(r.feature_values, r.feature_weights) AS score
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
            array_agg(v.f ORDER BY v.key) AS feature_values,
            array_agg(w.weight ORDER BY v.key) AS feature_weights
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
                'total', feat.services_considered)),
            ('payment_failures', feat.f_payment_failures, jsonb_build_object(
                'count', feat.tx_failed,
                'total', feat.tx_total,
                'overdueHours', p.payment_overdue_hours,
                'lookbackDays', p.payment_lookback_days))
        ) AS v(key, f, params)
        RIGHT JOIN w ON w.key = v.key
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
        END AS no_score_reason
    FROM scored s
),
assessed AS (
    SELECT f.*, m.revenue_horizon, m.secured_amount, m.expected_loss
    FROM final f
    CROSS JOIN LATERAL public.risk_money_estimate(f.revenue_h, f.revenue_auto, f.funds, f.score) m
)
SELECT
    f.account_id,
    c.calculated_at,
    c.as_of,
    c.model_version,
    f.status,
    f.no_score_reason,
    CASE WHEN f.status = 'scored' THEN f.score END AS risk_score,
    CASE WHEN f.status = 'scored' THEN public.risk_level(f.score, p.level_medium, p.level_high) END AS risk_level,
    CASE WHEN f.status = 'scored' THEN f.revenue_horizon END AS revenue_horizon,
    CASE WHEN f.status = 'scored' THEN f.secured_amount END AS secured_amount,
    CASE WHEN f.status = 'scored' THEN f.expected_loss END AS expected_loss,
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
        CASE WHEN f.balance > f.total_replenished THEN 'balance_exceeds_replenished' END
    ], NULL) AS anomalies,
    CASE WHEN f.status = 'scored'
         THEN least(f.next_boundary, c.as_of + p.max_age_hours * interval '1 hour') END AS valid_until,
    true AS is_current
FROM assessed f
CROSS JOIN clock c
CROSS JOIN p;

CREATE OR REPLACE FUNCTION public.risk_projection_stale(
    p_account_id bigint, p_model_version bigint, p_valid_until timestamptz
) RETURNS boolean LANGUAGE sql STABLE
AS $$
    SELECT p_model_version IS NULL
        OR p_model_version IS DISTINCT FROM (SELECT max(version) FROM public.model_revisions)
        OR (p_valid_until IS NOT NULL AND p_valid_until <= public.model_now())
        OR EXISTS (SELECT 1 FROM public.delta d WHERE d.account_id=p_account_id AND d.proc_date IS NULL)
$$;

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
    s.model_version,
    public.risk_projection_stale(a.id, s.model_version, s.valid_until) AS is_stale
FROM public.accounts a
LEFT JOIN public.scores s ON s.account_id = a.id AND s.is_current;

CREATE VIEW public.churn_history_vw AS
SELECT
    h.service_id,
    h.account_id,
    s.price,
    s."paymentTerm" AS payment_term,
    h.changed_at AS deleted_at,
    false AS estimated
FROM public.service_status_history h
LEFT JOIN public.services s ON s.id=h.service_id
WHERE h.to_status='deleted' AND h.from_status IS NOT NULL AND h.changed_at <= public.model_now()
UNION ALL
SELECT
    s.id AS service_id,
    s."ownerId" AS account_id,
    s.price,
    s."paymentTerm" AS payment_term,
    s."expiresAt" + p.grace_days * interval '1 day' AS deleted_at,
    true AS estimated
FROM public.services s
CROSS JOIN (SELECT value AS grace_days FROM public.model_settings WHERE key = 'grace_days') p
WHERE s.status = 'deleted'
  AND s."expiresAt" + p.grace_days * interval '1 day' <= public.model_now()
  AND NOT EXISTS (
      SELECT 1 FROM public.service_status_history h
      WHERE h.service_id=s.id AND h.to_status='deleted' AND h.from_status IS NOT NULL
  );

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
        END AS risk_weight,
        sc.as_of AS calculated_as_of,
        sc.model_version,
        c.as_of,
        p.horizon_days
    FROM public.services s
    JOIN public.scores sc ON sc.account_id = s."ownerId" AND sc.is_current AND sc.status = 'scored'
    CROSS JOIN c
    CROSS JOIN p
    WHERE s.status IN ('active', 'suspended', 'prolong_wait')
      AND NOT public.risk_projection_stale(sc.account_id, sc.model_version, sc.valid_until)
)
SELECT service_id, account_id, price, payment_term, expected_at, round(risk_weight, 4) AS risk_weight,
       calculated_as_of, model_version
FROM x
WHERE expected_at < as_of + horizon_days * interval '1 day'
  AND risk_weight > 0;

INSERT INTO public.model_revisions (changed_by, source, changes)
VALUES ('system', 'migration', jsonb_build_array(jsonb_build_object('file', 'R__risk_model.sql')));

CREATE OR REPLACE VIEW public.model_metadata_vw AS
SELECT
    'heuristic_score'::text AS score_kind,
    false AS probability_calibrated,
    'heuristic_risk_weighted_revenue'::text AS money_estimate_kind,
    'EUR'::text AS currency,
    100 AS minor_units_per_currency,
    (SELECT value FROM public.model_settings WHERE key = 'horizon_days') AS horizon_days,
    'оценка выручки под риском'::text AS money_title,
    'взвешенная по эвристическому score часть тарифной выручки за горизонт, не покрытая доступными средствами для автопродления; не прогноз фактических убытков'::text AS money_description,
    'risk-score от 0 до 100 — приоритет внимания, а не вероятность ухода; веса относительные'::text AS score_description,
    (SELECT max(version) FROM public.model_revisions) AS model_version;

CREATE OR REPLACE FUNCTION public.set_risk_settings(p_values jsonb, p_actor text)
    RETURNS bigint LANGUAGE plpgsql
AS $$
DECLARE
    v_version bigint;
BEGIN
    IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR p_actor IS NULL OR btrim(p_actor) = '' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'settings must be an object and actor must be nonempty';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(p_values) AS e WHERE jsonb_typeof(e.value) <> 'number') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'setting values must be JSON numbers';
    END IF;
    PERFORM s.key FROM public.model_settings s ORDER BY s.key FOR UPDATE;
    IF EXISTS (
        SELECT 1 FROM jsonb_each(p_values) AS e
        WHERE NOT EXISTS (SELECT 1 FROM public.model_settings s WHERE s.key = e.key)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unknown model setting';
    END IF;
    UPDATE public.model_settings s
    SET value = (p_values ->> s.key)::numeric, updated_at = now(), updated_by = p_actor
    WHERE p_values ? s.key AND s.value IS DISTINCT FROM (p_values ->> s.key)::numeric;
    SELECT max(version) INTO v_version FROM public.model_revisions;
    RETURN v_version;
END
$$;

CREATE OR REPLACE FUNCTION public.delta_from_accounts() RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        INSERT INTO public.delta (account_id, reason) SELECT DISTINCT id, 'accounts' FROM new_rows;
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        INSERT INTO public.delta (account_id, reason) SELECT DISTINCT id, 'accounts' FROM old_rows;
    END IF;
    RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS accounts_delta_upd ON public.accounts;
CREATE TRIGGER accounts_delta_upd AFTER UPDATE ON public.accounts
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_accounts();

CREATE OR REPLACE FUNCTION public.recalculate_risk(p_trigger text DEFAULT 'manual')
    RETURNS TABLE (run_id bigint, status text, accounts_processed integer, model_version bigint, as_of timestamptz)
    LANGUAGE plpgsql
AS $$
DECLARE
    v_run bigint;
    v_count integer;
    v_version bigint;
    v_as_of timestamptz;
BEGIN
    IF p_trigger IS NULL OR p_trigger NOT IN ('timer', 'manual', 'model', 'snapshot', 'ingest', 'notify') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unknown recalculation trigger';
    END IF;
    IF current_setting('transaction_isolation') NOT IN ('repeatable read', 'serializable') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'risk recalculation requires a repeatable read or serializable transaction';
    END IF;
    SELECT public.model_now(), max(r.version) INTO v_as_of, v_version FROM public.model_revisions r;
    IF NOT pg_try_advisory_xact_lock(hashtext('churn.recalc')) THEN
        RETURN QUERY SELECT NULL::bigint, 'busy'::text, 0, v_version, v_as_of;
        RETURN;
    END IF;
    IF v_version IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.model_features f JOIN public.model_settings s ON s.key=f.weight_key WHERE s.value>0
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'risk model requires a revision and positive registered feature weights';
    END IF;
    INSERT INTO public.delta (account_id, reason)
    SELECT s.account_id, 'time' FROM public.scores s
    WHERE s.is_current AND s.valid_until <= v_as_of
      AND NOT EXISTS (SELECT 1 FROM public.delta d WHERE d.account_id=s.account_id AND d.proc_date IS NULL);
    SELECT count(DISTINCT d.account_id)::integer INTO v_count FROM public.delta d WHERE d.proc_date IS NULL;
    IF v_count = 0 THEN
        RETURN QUERY SELECT NULL::bigint, 'idle'::text, 0, v_version, v_as_of;
        RETURN;
    END IF;
    INSERT INTO public.recalc_runs (trigger, started_at, as_of, model_version, status)
    VALUES (p_trigger, now(), v_as_of, v_version, 'running') RETURNING id INTO v_run;
    UPDATE public.scores s SET is_current=false
    WHERE s.is_current AND s.account_id IN (SELECT d.account_id FROM public.delta d WHERE d.proc_date IS NULL);
    INSERT INTO public.scores (
        account_id, calculated_at, as_of, model_version, status, no_score_reason,
        risk_score, risk_level, revenue_horizon, secured_amount, expected_loss,
        services_total, services_live, services_at_risk, next_expiry_at,
        reasons, features, anomalies, valid_until, is_current
    )
    SELECT s.account_id, s.calculated_at, s.as_of, s.model_version, s.status, s.no_score_reason,
           s.risk_score, s.risk_level, s.revenue_horizon, s.secured_amount, s.expected_loss,
           s.services_total, s.services_live, s.services_at_risk, s.next_expiry_at,
           s.reasons, s.features, s.anomalies, s.valid_until, s.is_current
    FROM public.scores_delta_vw s;
    UPDATE public.delta d SET proc_date=now() WHERE d.proc_date IS NULL;
    INSERT INTO public.analytics_snapshots (
        recalc_run_id, calculated_at, as_of, model_version,
        accounts_high, accounts_medium, accounts_low, accounts_no_score,
        expected_loss, revenue_horizon, revenue_at_risk, services_at_risk, avg_risk_score
    )
    SELECT v_run, now(), v_as_of, v_version,
           count(*) FILTER (WHERE s.risk_level='high'),
           count(*) FILTER (WHERE s.risk_level='medium'),
           count(*) FILTER (WHERE s.risk_level='low'),
           count(*) FILTER (WHERE s.status='no_score'),
           coalesce(sum(s.expected_loss),0), coalesce(sum(s.revenue_horizon),0),
           coalesce(sum(s.revenue_horizon) FILTER (WHERE s.risk_level='high'),0),
           coalesce(sum(s.services_at_risk),0), round(avg(s.risk_score),2)
    FROM public.scores s WHERE s.is_current AND s.status <> 'removed';
    UPDATE public.recalc_runs r
    SET status='ok', finished_at=now(), accounts_processed=v_count WHERE r.id=v_run;
    PERFORM pg_notify('churn_events', json_build_object(
        'type','recalc.completed','at',now(),'modelVersion',v_version,'accountsProcessed',v_count
    )::text);
    RETURN QUERY SELECT v_run, 'ok'::text, v_count, v_version, v_as_of;
END
$$;
