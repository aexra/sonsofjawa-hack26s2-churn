DROP VIEW IF EXISTS public.churn_forecast_vw;
DROP VIEW IF EXISTS public.churn_overdue_vw;
DROP VIEW IF EXISTS public.churn_history_vw;
DROP VIEW IF EXISTS public.customer_scores_vw;
DROP VIEW IF EXISTS public.scores_delta_vw;
DROP VIEW IF EXISTS public.risk_payment_scores_vw;
DROP VIEW IF EXISTS public.risk_payment_inputs_vw;

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
     'достаточность истории',
     'минимум наблюдавшихся транзакций для отметки достаточности; не изменяет силу сигнала', 320),
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


CREATE OR REPLACE FUNCTION public.risk_due_dates(p_due timestamptz, p_term text, p_as_of timestamptz, p_horizon numeric)
RETURNS TABLE(due_at timestamptz, payment_index integer) LANGUAGE plpgsql STABLE STRICT
AS $$
DECLARE
    v_step interval;
    v_due timestamptz;
    v_index integer := 0;
BEGIN
    IF p_horizon < 1 OR p_horizon > 365 OR p_horizon::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'invalid renewal horizon';
    END IF;
    v_step := CASE p_term WHEN 'hour' THEN interval '1 hour' WHEN 'week' THEN interval '7 days'
        WHEN 'month' THEN interval '1 month' WHEN 'quarter_year' THEN interval '3 months'
        WHEN 'half_year' THEN interval '6 months' WHEN 'year' THEN interval '1 year' END;
    IF v_step IS NULL THEN RAISE EXCEPTION 'unknown billing period'; END IF;
    LOOP
        v_due := ((p_due AT TIME ZONE 'UTC') + v_index * v_step) AT TIME ZONE 'UTC';
        EXIT WHEN v_due >= p_as_of + p_horizon * interval '24 hours';
        due_at := v_due;
        payment_index := v_index;
        RETURN NEXT;
        EXIT WHEN p_due < p_as_of;
        v_index := v_index + 1;
    END LOOP;
END
$$;


CREATE OR REPLACE FUNCTION public.risk_horizon_boundary(p_due timestamptz,p_term text,p_as_of timestamptz,p_horizon numeric)
RETURNS timestamptz LANGUAGE sql STABLE STRICT AS $$
    SELECT CASE WHEN p_due<p_as_of THEN NULL ELSE (
        (p_due AT TIME ZONE 'UTC')+(SELECT count(*) FROM public.risk_due_dates(p_due,p_term,p_as_of,p_horizon))*
        CASE p_term WHEN 'hour' THEN interval '1 hour' WHEN 'week' THEN interval '7 days'
            WHEN 'month' THEN interval '1 month' WHEN 'quarter_year' THEN interval '3 months'
            WHEN 'half_year' THEN interval '6 months' WHEN 'year' THEN interval '1 year' END
    ) AT TIME ZONE 'UTC' - p_horizon*interval '24 hours'+interval '1 millisecond' END
$$;

CREATE OR REPLACE FUNCTION public.risk_group_contributions(p_values numeric[], p_weights numeric[])
RETURNS numeric[] LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
DECLARE
    v_budget numeric;
    v_winner integer := 1;
    v_i integer;
    v_result numeric[] := ARRAY[0,0,0,0,0,0]::numeric[];
BEGIN
    PERFORM public.risk_normalized_score(p_values, p_weights);
    IF cardinality(p_values) <> 6 THEN RAISE EXCEPTION 'six known features required'; END IF;
    v_budget := greatest(p_weights[1],p_weights[2],p_weights[3],p_weights[6]) + p_weights[4] + p_weights[5];
    FOREACH v_i IN ARRAY ARRAY[2,3,6] LOOP
        IF p_values[v_i]*p_weights[v_i] > p_values[v_winner]*p_weights[v_winner] THEN v_winner := v_i; END IF;
    END LOOP;
    FOREACH v_i IN ARRAY ARRAY[v_winner,4,5] LOOP
        v_result[v_i] := 100*p_values[v_i]*p_weights[v_i]/v_budget;
    END LOOP;
    RETURN v_result;
END
$$;

CREATE VIEW public.risk_payment_inputs_vw AS
WITH p AS (
    SELECT public.model_now() AS as_of,
        max(value) FILTER (WHERE key='horizon_days') AS horizon,
        max(value) FILTER (WHERE key='grace_days') AS grace,
        max(value) FILTER (WHERE key='payment_overdue_hours') AS overdue,
        max(value) FILTER (WHERE key='payment_lookback_days') AS lookback
    FROM public.model_settings
), raw AS (
    SELECT a.id AS account_id, s.id AS service_id, s.name, s.status, s."autoProlong" AS auto_prolong,
        s."paymentTerm" AS payment_term, s.price, d.due_at, d.payment_index,
        a.balance::numeric + CASE WHEN a."bonusState"='unlocked' THEN a."bonusBalance"::numeric ELSE 0 END AS funds,
        p.*,
        least(greatest((exp(-greatest(extract(epoch FROM d.due_at-p.as_of)/86400,0)/(p.horizon/3))
            -exp(-3))/(1-exp(-3)),0),1) AS urgency,
        1-exp(-greatest(extract(epoch FROM p.as_of-d.due_at)/86400,0)/greatest(p.grace,1)) AS late_severity,
        (SELECT count(*) FILTER (WHERE h.status='deleted')::numeric/nullif(count(*),0)
         FROM public.services h WHERE h."ownerId"=a.id AND h.status<>'blocked') AS termination_share
    FROM public.services s JOIN public.accounts a ON a.id=s."ownerId"
    CROSS JOIN p
    CROSS JOIN LATERAL public.risk_due_dates(s."expiresAt",s."paymentTerm",p.as_of,p.horizon) d
    WHERE s.status IN ('active','suspended','prolong_wait') AND s."createdAt"<=p.as_of
), allocated AS (
    SELECT raw.*, least(price::numeric,greatest(funds-coalesce(sum(price::numeric) OVER (
        PARTITION BY account_id ORDER BY due_at,service_id,payment_index ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0),0)) AS allocated
    FROM raw
), tx AS (
    SELECT s.id AS service_id,
        count(*) AS total,
        max(CASE WHEN t.status='not_performed' OR t."performedAt">p.as_of
            THEN 1-exp(-greatest(extract(epoch FROM p.as_of-t."createdAt")/3600-p.overdue,0)/p.overdue)
            ELSE 0 END) AS severity
    FROM public.transactions t JOIN public.services s ON s.id=t."serviceId" CROSS JOIN p
    WHERE t.type='prolong' AND t."createdAt"<=p.as_of
      AND t."createdAt">p.as_of-p.lookback*interval '24 hours'
    GROUP BY s.id
)
SELECT a.*, coalesce(tx.total,0) AS transactions_observed,
    ARRAY[
        CASE WHEN NOT auto_prolong THEN urgency ELSE 0 END,
        CASE WHEN price>0 THEN (1-allocated/price)*urgency ELSE 0 END,
        late_severity,
        CASE WHEN status='suspended' THEN 1 ELSE 0 END,
        coalesce(termination_share,0), coalesce(tx.severity,0)
    ]::numeric[] AS feature_values
FROM allocated a LEFT JOIN tx ON tx.service_id=a.service_id;

CREATE VIEW public.risk_payment_scores_vw AS
WITH w AS (
    SELECT array_agg(s.value ORDER BY x.ord) AS weights
    FROM unnest(ARRAY['renewal_unsecured','insufficient_funds','prolong_wait','suspended_share','termination_history','payment_failures']) WITH ORDINALITY x(key,ord)
    LEFT JOIN public.model_features f ON f.key=x.key
    LEFT JOIN public.model_settings s ON s.key=f.weight_key
), c AS (
    SELECT i.*, w.weights, public.risk_group_contributions(i.feature_values,w.weights) AS contributions
    FROM public.risk_payment_inputs_vw i CROSS JOIN w
)
SELECT c.*, (SELECT sum(v) FROM unnest(contributions) v) AS risk_score,
    round(price*(SELECT sum(v) FROM unnest(contributions) v)/100)::bigint AS risk_amount
FROM c;

CREATE VIEW public.scores_delta_vw AS
WITH clock AS (
    SELECT public.model_now() AS as_of, now() AS calculated_at,
        (SELECT max(version) FROM public.model_revisions) AS model_version
), p AS (
    SELECT max(value) FILTER (WHERE key='level_high') AS high,
        max(value) FILTER (WHERE key='level_medium') AS medium,
        max(value) FILTER (WHERE key='max_score_age_hours') AS max_age,
        max(value) FILTER (WHERE key='grace_days') AS grace,
        max(value) FILTER (WHERE key='horizon_days') AS horizon
    FROM public.model_settings
), batch AS (
    SELECT DISTINCT account_id FROM public.delta WHERE proc_date IS NULL
), payments AS (
    SELECT r.* FROM public.risk_payment_scores_vw r JOIN batch b USING(account_id)
), aggregated AS (
    SELECT account_id, sum(price)::bigint AS revenue, sum(allocated)::bigint AS covered,
        sum(risk_amount)::bigint AS risk_amount,
        CASE WHEN sum(price)>0 THEN sum(risk_score*price)/sum(price) ELSE avg(risk_score) END AS score,
        count(DISTINCT service_id) FILTER (WHERE risk_score>0) AS at_risk,
        min(due_at) FILTER (WHERE due_at>as_of) AS next_due
    FROM payments GROUP BY account_id
), components AS (
    SELECT account_id, n, max(weights[n]) AS weight,
        CASE WHEN sum(price)>0 THEN sum(feature_values[n]*price)/sum(price) ELSE avg(feature_values[n]) END AS value,
        CASE WHEN sum(price)>0 THEN sum(contributions[n]*price)/sum(price) ELSE avg(contributions[n]) END AS contribution
    FROM payments CROSS JOIN generate_series(1,6) n GROUP BY account_id,n
), examples AS (
    SELECT DISTINCT ON (account_id,n) account_id,n,service_id,name,price,allocated
    FROM payments CROSS JOIN generate_series(1,6) n
    ORDER BY account_id,n,contributions[n]*price DESC,due_at,service_id
), reasons AS (
    SELECT c.account_id,
        jsonb_object_agg(k.key,round(c.value,4)) AS features,
        coalesce(jsonb_agg(jsonb_build_object('key',k.key,'value',round(c.value,4),'weight',c.weight,
            'contribution',round(c.contribution,2),'params',jsonb_build_object('signalPct',round(c.value*100),'serviceId',e.service_id,'serviceName',e.name,'requiredAmount',e.price,'allocatedAmount',e.allocated))
            ORDER BY c.contribution DESC,k.key) FILTER (WHERE c.contribution>0),'[]'::jsonb) AS reasons
    FROM components c JOIN unnest(ARRAY['renewal_unsecured','insufficient_funds','prolong_wait','suspended_share','termination_history','payment_failures']) WITH ORDINALITY k(key,n) USING(n)
    JOIN examples e ON e.account_id=c.account_id AND e.n=c.n
    GROUP BY c.account_id
), base AS (
    SELECT b.account_id, a.id IS NOT NULL AS exists, a.balance, a."totalReplenished" AS replenished,
        count(s.id) AS total, count(s.id) FILTER (WHERE s.status IN ('active','suspended','prolong_wait')) AS live,
        bool_or(s.status IN ('active','suspended') AND s."expiresAt"<c.as_of) AS expired,
        bool_or(s.status='prolong_wait' AND s."expiresAt"+p.grace*interval '24 hours'<=c.as_of) AS overdue,
        min(public.risk_horizon_boundary(s."expiresAt",s."paymentTerm",c.as_of,p.horizon)) FILTER (WHERE s.status IN ('active','suspended','prolong_wait')) AS boundary
    FROM batch b LEFT JOIN public.accounts a ON a.id=b.account_id
    LEFT JOIN public.services s ON s."ownerId"=b.account_id AND s."createdAt"<=public.model_now()
    CROSS JOIN clock c CROSS JOIN p
    GROUP BY b.account_id,a.id,a.balance,a."totalReplenished"
)
SELECT b.account_id,c.calculated_at,c.as_of,c.model_version,
    CASE WHEN NOT b.exists THEN 'removed' WHEN b.live=0 THEN 'no_score' ELSE 'scored' END AS status,
    CASE WHEN NOT b.exists THEN NULL WHEN b.total=0 THEN 'no_services' WHEN b.live=0 THEN 'no_live_services' END AS no_score_reason,
    CASE WHEN b.live>0 THEN round(coalesce(g.score,0),2) END AS risk_score,
    CASE WHEN b.live>0 THEN public.risk_level(coalesce(g.score,0),p.medium,p.high) END AS risk_level,
    CASE WHEN b.live>0 THEN coalesce(g.revenue,0) END AS revenue_horizon,
    CASE WHEN b.live>0 THEN coalesce(g.covered,0) END AS secured_amount,
    CASE WHEN b.live>0 THEN coalesce(g.risk_amount,0) END AS expected_loss,
    b.total::integer AS services_total,b.live::integer AS services_live,coalesce(g.at_risk,0)::integer AS services_at_risk,
    g.next_due AS next_expiry_at,coalesce(r.reasons,'[]'::jsonb) AS reasons,
    CASE WHEN b.live=0 THEN '{}'::jsonb ELSE coalesce(r.features,jsonb_build_object('renewal_unsecured',0,'insufficient_funds',0,'prolong_wait',0,'suspended_share',0,'termination_history',0,'payment_failures',0)) END AS features,
    array_remove(ARRAY[CASE WHEN b.expired THEN 'expired_but_live' END,
        CASE WHEN b.overdue THEN 'overdue_prolong_wait' END,
        CASE WHEN b.balance>b.replenished THEN 'balance_exceeds_replenished' END],NULL) AS anomalies,
    CASE WHEN b.live>0 THEN least(g.next_due,b.boundary,c.as_of+least(p.max_age,1)*interval '1 hour') END AS valid_until,
    true AS is_current
FROM base b CROSS JOIN clock c CROSS JOIN p LEFT JOIN aggregated g USING(account_id) LEFT JOIN reasons r USING(account_id);

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
    s."expiresAt" + p.grace_days * interval '24 hours' AS deleted_at,
    true AS estimated
FROM public.services s
CROSS JOIN (SELECT value AS grace_days FROM public.model_settings WHERE key = 'grace_days') p
WHERE s.status = 'deleted'
  AND s."expiresAt" + p.grace_days * interval '24 hours' <= public.model_now()
  AND NOT EXISTS (
      SELECT 1 FROM public.service_status_history h
      WHERE h.service_id=s.id AND h.to_status='deleted' AND h.from_status IS NOT NULL
  );


CREATE TABLE IF NOT EXISTS public.risk_payment_assessments (
    score_id bigint NOT NULL, service_id bigint NOT NULL, account_id bigint NOT NULL,
    due_at timestamptz NOT NULL, payment_index integer NOT NULL, price bigint NOT NULL,
    payment_term text NOT NULL, risk_score numeric NOT NULL, allocated numeric NOT NULL,
    transactions_observed integer NOT NULL,
    PRIMARY KEY(score_id,service_id,due_at)
);

CREATE VIEW public.churn_forecast_vw AS
SELECT r.service_id,r.account_id,r.price,r.payment_term,
    r.due_at AS expected_at,
    round(r.risk_score/100,4) AS risk_weight,sc.as_of AS calculated_as_of,sc.model_version
FROM public.risk_payment_assessments r JOIN public.scores sc ON sc.id=r.score_id AND sc.is_current AND sc.status='scored'
CROSS JOIN public.model_settings p
WHERE r.payment_index=0 AND r.risk_score>0
  AND p.key='grace_days'
  AND r.due_at+p.value*interval '24 hours'>public.model_now()
  AND NOT public.risk_projection_stale(sc.account_id,sc.model_version,sc.valid_until);

CREATE VIEW public.churn_overdue_vw AS
SELECT r.service_id,r.account_id,r.price,r.payment_term,
    r.due_at+p.value*interval '24 hours' AS deadline,
    round(r.risk_score/100,4) AS risk_weight,sc.as_of AS calculated_as_of,sc.model_version
FROM public.risk_payment_assessments r JOIN public.scores sc ON sc.id=r.score_id AND sc.is_current AND sc.status='scored'
CROSS JOIN public.model_settings p
WHERE r.payment_index=0 AND r.risk_score>0
  AND p.key='grace_days'
  AND r.due_at+p.value*interval '24 hours'<=public.model_now()
  AND NOT public.risk_projection_stale(sc.account_id,sc.model_version,sc.valid_until);


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
    'сумма платежей за горизонт, взвешенных по эвристическому риску каждой услуги; покрытие баланса — резервирование, не гарантия оплаты; не прогноз убытков'::text AS money_description,
    'risk-score от 0 до 100 — приоритет проверки непродлений; пересекающиеся платёжные сигналы объединены максимумом; не вероятность ухода'::text AS score_description,
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

DROP FUNCTION IF EXISTS public.recalculate_risk(text);

CREATE OR REPLACE FUNCTION public.recalculate_risk(p_trigger text DEFAULT 'manual', p_run_id bigint DEFAULT NULL)
    RETURNS TABLE (run_id bigint, status text, accounts_processed integer, model_version bigint, as_of timestamptz)
    LANGUAGE plpgsql
AS $$
DECLARE
    v_run bigint;
    v_count integer;
    v_version bigint;
    v_as_of timestamptz;
BEGIN
    IF p_trigger IS NULL OR p_trigger NOT IN ('timer', 'manual', 'model', 'snapshot', 'ingest') THEN
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
    IF (SELECT count(*) FROM public.model_features)<>6 OR EXISTS (
        SELECT 1 FROM public.model_features WHERE key NOT IN ('renewal_unsecured','insufficient_funds','prolong_wait','suspended_share','termination_history','payment_failures')
    ) OR v_version IS NULL OR NOT EXISTS (
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
    IF p_run_id IS NULL THEN
        INSERT INTO public.recalc_runs (trigger, started_at, as_of, model_version, status)
        VALUES (p_trigger, now(), v_as_of, v_version, 'running') RETURNING id INTO v_run;
    ELSE
        UPDATE public.recalc_runs
        SET started_at = now(), as_of = v_as_of, model_version = v_version, status = 'running'
        WHERE id = p_run_id
        RETURNING id INTO v_run;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'recalculation run does not exist';
        END IF;
    END IF;
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
        'type','recalc.completed','at',now(),'runId',v_run,'trigger',p_trigger,
        'accountsProcessed',v_count,'modelVersion',v_version,'asOf',v_as_of,'finishedAt',now()
    )::text);
    RETURN QUERY SELECT v_run, 'ok'::text, v_count, v_version, v_as_of;
END
$$;

UPDATE public.model_features SET reason_template=CASE key
    WHEN 'renewal_unsecured' THEN 'ручное продление: сигнал {signalPct}%; например, услуга {serviceName}'
    WHEN 'insufficient_funds' THEN 'нехватка средств: сигнал {signalPct}%; платёж {serviceName} — {requiredAmount}, зарезервировано {allocatedAmount}'
    WHEN 'prolong_wait' THEN 'задержка продления: сигнал {signalPct}%; например, услуга {serviceName}'
    WHEN 'suspended_share' THEN 'приостановленные услуги: {signalPct}% платежей'
    WHEN 'termination_history' THEN 'удалено {signalPct}% учитываемых услуг; блокировки исключены'
    WHEN 'payment_failures' THEN 'неоплаченные продления: сигнал {signalPct}%; например, услуга {serviceName}' END,
    description=CASE key
        WHEN 'renewal_unsecured' THEN 'плавная срочность ручного продления'
        WHEN 'insufficient_funds' THEN 'непокрытая доля платежа с учётом срочности; баланс распределяется по времени и id услуги'
        WHEN 'prolong_wait' THEN 'плавная тяжесть задержки относительно срока продления'
        WHEN 'suspended_share' THEN 'доля платежей приостановленных услуг'
        WHEN 'termination_history' THEN 'доля удалённых услуг без заблокированных'
        WHEN 'payment_failures' THEN 'максимальная тяжесть неоплаты продлений услуги; повторные попытки не суммируются' END;

CREATE TABLE IF NOT EXISTS public.risk_observations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id bigint NOT NULL,
    service_id bigint NOT NULL,
    as_of timestamptz NOT NULL,
    due_at timestamptz NOT NULL,
    deadline timestamptz NOT NULL,
    model_version bigint NOT NULL,
    amount bigint NOT NULL,
    heuristic_score numeric NOT NULL,
    features jsonb NOT NULL,
    provenance text NOT NULL CHECK(provenance IN ('real','synthetic','unverified')),
    target text NOT NULL DEFAULT 'service_nonrenewal_v2',
    UNIQUE(account_id,service_id,as_of,due_at,model_version)
);

CREATE TABLE IF NOT EXISTS public.risk_outcomes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id bigint NOT NULL,
    service_id bigint NOT NULL,
    due_at timestamptz NOT NULL,
    event_at timestamptz NOT NULL,
    observed_at timestamptz NOT NULL DEFAULT now(),
    outcome text NOT NULL CHECK(outcome IN ('renewed','not_renewed','blocked')),
    provenance text NOT NULL CHECK(provenance IN ('real','synthetic','unverified')),
    target text NOT NULL DEFAULT 'service_nonrenewal_v2',
    CHECK(event_at<=observed_at),
    UNIQUE(account_id,service_id,due_at,event_at,outcome,provenance)
);

CREATE OR REPLACE FUNCTION public.capture_risk_observation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.risk_payment_assessments
    SELECT NEW.id,r.service_id,r.account_id,r.due_at,r.payment_index,r.price,r.payment_term,r.risk_score,r.allocated,r.transactions_observed
    FROM public.risk_payment_scores_vw r WHERE r.account_id=NEW.account_id AND r.payment_index=0;
    INSERT INTO public.risk_observations(account_id,service_id,as_of,due_at,deadline,model_version,amount,heuristic_score,features,provenance)
    SELECT r.account_id,r.service_id,NEW.as_of,r.due_at,r.due_at+r.grace*interval '24 hours',NEW.model_version,r.price,r.risk_score,
        (SELECT jsonb_object_agg(k.key,r.feature_values[k.n]) FROM unnest(ARRAY['renewal_unsecured','insufficient_funds','prolong_wait','suspended_share','termination_history','payment_failures']) WITH ORDINALITY k(key,n)),
        coalesce(nullif(current_setting('churn.data_provenance',true),''),'unverified')
    FROM public.risk_payment_scores_vw r
    WHERE r.account_id=NEW.account_id AND r.payment_index=0 AND r.due_at>NEW.as_of AND r.price>0
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS risk_observation_capture ON public.scores;
CREATE TRIGGER risk_observation_capture AFTER INSERT ON public.scores
FOR EACH ROW WHEN (NEW.status='scored') EXECUTE FUNCTION public.capture_risk_observation();

CREATE OR REPLACE FUNCTION public.export_risk_dataset() RETURNS jsonb LANGUAGE sql STABLE AS $$
SELECT jsonb_build_object(
    'observations',coalesce((SELECT jsonb_agg(to_jsonb(r)-'id') FROM public.risk_observations r),'[]'::jsonb),
    'outcomes',coalesce((SELECT jsonb_agg(to_jsonb(r)-'id') FROM public.risk_outcomes r),'[]'::jsonb)
)
$$;

CREATE OR REPLACE VIEW public.risk_target_definitions_vw AS
SELECT 'service_nonrenewal_v2'::text AS target,
    'платная услуга не продлена к ближайшему сроку плюс grace; блокировки исключены; отсутствие события не является отрицательным исходом'::text AS event_definition,
    (SELECT value FROM public.model_settings WHERE key='horizon_days') AS horizon_days,
    (SELECT value FROM public.model_settings WHERE key='grace_days') AS grace_days,
    'снимок до срока; исход подтверждён источником; повторные снимки одного продления объединяются'::text AS observation_policy,
    'уход клиента требует подтверждённых 30 дней без платных услуг; не выводится из единичного непродления'::text AS account_churn_definition;

CREATE OR REPLACE VIEW public.risk_data_quality_vw AS
SELECT sc.account_id,sc.as_of,
    public.risk_projection_stale(sc.account_id,sc.model_version,sc.valid_until) AS is_stale,
    count(DISTINCT r.service_id)::integer AS services_with_payments,
    coalesce(min(r.transactions_observed),0)::integer AS minimum_transactions_per_service,
    CASE WHEN count(r.service_id)=0 THEN 'no_upcoming_payments'
        WHEN min(r.transactions_observed)<(SELECT value FROM model_settings WHERE key='min_transactions') THEN 'limited_history'
        ELSE 'observed_history' END AS data_sufficiency,
    false AS predictive_accuracy_validated
FROM public.scores sc LEFT JOIN public.risk_payment_assessments r ON r.score_id=sc.id AND r.payment_index=0
WHERE sc.is_current GROUP BY sc.account_id,sc.id;

CREATE OR REPLACE FUNCTION public.capture_risk_outcome() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_now timestamptz := public.model_now();
    v_provenance text := coalesce(nullif(current_setting('churn.data_provenance',true),''),'unverified');
BEGIN
    INSERT INTO public.risk_outcomes(account_id,service_id,due_at,event_at,observed_at,outcome,provenance)
    SELECT DISTINCT o.account_id,o.service_id,o.due_at,v_now,v_now,
        CASE WHEN NEW.status='blocked' THEN 'blocked'
             WHEN NEW."expiresAt">o.due_at AND v_now<=o.deadline THEN 'renewed' ELSE 'not_renewed' END,
        v_provenance
    FROM public.risk_observations o
    WHERE o.service_id=NEW.id AND o.account_id=NEW."ownerId" AND o.as_of<v_now
      AND o.due_at=OLD."expiresAt" AND (
        NEW.status='blocked'
        OR (NEW."expiresAt">OLD."expiresAt" AND v_now<=o.deadline)
        OR (v_now>=o.deadline AND NEW."expiresAt"=o.due_at AND NEW.status IN ('deleted','prolong_wait'))
      )
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS risk_outcome_capture ON public.services;
CREATE TRIGGER risk_outcome_capture AFTER UPDATE OF status,"expiresAt" ON public.services
FOR EACH ROW EXECUTE FUNCTION public.capture_risk_outcome();
