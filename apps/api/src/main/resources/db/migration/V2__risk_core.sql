CREATE TABLE public.model_clock (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    mode text NOT NULL CHECK (mode IN ('real', 'frozen', 'shifted')),
    frozen_at timestamptz,
    shift interval NOT NULL DEFAULT interval '0',
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL DEFAULT 'system',
    CONSTRAINT model_clock_frozen_check CHECK (mode <> 'frozen' OR frozen_at IS NOT NULL)
);

INSERT INTO public.model_clock (mode) VALUES ('real');

CREATE FUNCTION public.model_now() RETURNS timestamptz
    LANGUAGE sql STABLE
AS $$
    SELECT CASE c.mode
               WHEN 'frozen' THEN c.frozen_at
               WHEN 'shifted' THEN now() - c.shift
               ELSE now()
           END
    FROM public.model_clock c
    WHERE c.id = 1
$$;

CREATE TABLE public.model_settings (
    key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    group_key text NOT NULL CHECK (group_key IN ('weights', 'levels', 'horizon', 'quality')),
    value numeric NOT NULL,
    default_value numeric NOT NULL,
    min_value numeric NOT NULL,
    max_value numeric NOT NULL,
    unit text NOT NULL CHECK (unit IN ('points', 'days', 'hours', 'count')),
    title text NOT NULL,
    description text NOT NULL,
    sort_order integer NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL DEFAULT 'system',
    CONSTRAINT model_settings_range_check CHECK (value BETWEEN min_value AND max_value)
);

CREATE TABLE public.model_features (
    key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    weight_key text NOT NULL UNIQUE REFERENCES public.model_settings (key) ON DELETE CASCADE,
    title text NOT NULL,
    description text NOT NULL,
    reason_template text NOT NULL,
    sort_order integer NOT NULL
);

CREATE TABLE public.model_revisions (
    version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    changed_at timestamptz NOT NULL DEFAULT now(),
    changed_by text NOT NULL,
    source text NOT NULL CHECK (source IN ('migration', 'settings', 'clock')),
    changes jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE public.delta (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id bigint NOT NULL,
    reason text NOT NULL CHECK (reason IN (
        'accounts', 'services', 'transactions', 'model', 'snapshot', 'time', 'manual'
    )),
    load_date timestamptz NOT NULL DEFAULT now(),
    proc_date timestamptz
);

CREATE INDEX delta_pending_idx ON public.delta (account_id) WHERE proc_date IS NULL;
CREATE INDEX delta_proc_date_idx ON public.delta (proc_date) WHERE proc_date IS NOT NULL;

CREATE TABLE public.scores (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id bigint NOT NULL,
    calculated_at timestamptz NOT NULL,
    as_of timestamptz NOT NULL,
    model_version bigint NOT NULL,
    status text NOT NULL CHECK (status IN ('scored', 'no_score', 'removed')),
    no_score_reason text CHECK (no_score_reason IN ('no_services', 'no_live_services')),
    risk_score numeric(5, 2) CHECK (risk_score BETWEEN 0 AND 100),
    risk_level text CHECK (risk_level IN ('high', 'medium', 'low')),
    revenue_horizon bigint,
    secured_amount bigint,
    expected_loss bigint,
    services_total integer NOT NULL DEFAULT 0,
    services_live integer NOT NULL DEFAULT 0,
    services_at_risk integer NOT NULL DEFAULT 0,
    next_expiry_at timestamptz,
    reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
    features jsonb NOT NULL DEFAULT '{}'::jsonb,
    anomalies text[] NOT NULL DEFAULT '{}',
    valid_until timestamptz,
    is_current boolean NOT NULL DEFAULT true,
    CONSTRAINT scores_scored_check CHECK (
        (status = 'scored' AND risk_score IS NOT NULL AND risk_level IS NOT NULL AND no_score_reason IS NULL)
        OR (status = 'no_score' AND risk_score IS NULL AND risk_level IS NULL AND no_score_reason IS NOT NULL)
        OR (status = 'removed' AND risk_score IS NULL AND risk_level IS NULL AND no_score_reason IS NULL)
    )
);

CREATE UNIQUE INDEX scores_current_uq ON public.scores (account_id) WHERE is_current;
CREATE INDEX scores_history_idx ON public.scores (account_id, calculated_at DESC);
CREATE INDEX scores_current_risk_idx ON public.scores (risk_score DESC NULLS LAST) WHERE is_current;
CREATE INDEX scores_current_valid_until_idx ON public.scores (valid_until) WHERE is_current AND valid_until IS NOT NULL;
CREATE INDEX scores_calculated_at_idx ON public.scores (calculated_at);

CREATE TABLE public.recalc_runs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trigger text NOT NULL CHECK (trigger IN ('timer', 'manual', 'model', 'snapshot', 'ingest', 'notify')),
    started_at timestamptz NOT NULL,
    finished_at timestamptz,
    as_of timestamptz,
    model_version bigint,
    accounts_processed integer NOT NULL DEFAULT 0,
    status text NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
    error text
);

CREATE INDEX recalc_runs_started_idx ON public.recalc_runs (started_at DESC);

CREATE TABLE public.analytics_snapshots (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recalc_run_id bigint REFERENCES public.recalc_runs (id) ON DELETE SET NULL,
    calculated_at timestamptz NOT NULL,
    as_of timestamptz NOT NULL,
    model_version bigint NOT NULL,
    accounts_high integer NOT NULL,
    accounts_medium integer NOT NULL,
    accounts_low integer NOT NULL,
    accounts_no_score integer NOT NULL,
    expected_loss bigint NOT NULL,
    revenue_horizon bigint NOT NULL,
    revenue_at_risk bigint NOT NULL,
    services_at_risk integer NOT NULL,
    avg_risk_score numeric(5, 2)
);

CREATE INDEX analytics_snapshots_as_of_idx ON public.analytics_snapshots (as_of);

CREATE TABLE public.service_status_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id bigint NOT NULL,
    account_id bigint NOT NULL,
    from_status text,
    to_status text NOT NULL,
    changed_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX service_status_history_service_idx ON public.service_status_history (service_id, id DESC);
CREATE INDEX service_status_history_to_status_idx ON public.service_status_history (to_status, changed_at);

CREATE FUNCTION public.delta_enqueue_all(p_reason text) RETURNS bigint
    LANGUAGE sql
AS $$
    WITH ids AS (
        SELECT id AS account_id FROM public.accounts
        UNION
        SELECT account_id FROM public.scores WHERE is_current AND status <> 'removed'
    ), ins AS (
        INSERT INTO public.delta (account_id, reason)
        SELECT account_id, p_reason FROM ids
        RETURNING 1
    )
    SELECT count(*) FROM ins
$$;

CREATE FUNCTION public.delta_from_accounts() RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        INSERT INTO public.delta (account_id, reason) SELECT DISTINCT id, 'accounts' FROM new_rows;
    ELSE
        INSERT INTO public.delta (account_id, reason) SELECT DISTINCT id, 'accounts' FROM old_rows;
    END IF;
    RETURN NULL;
END
$$;

CREATE FUNCTION public.delta_from_services() RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        INSERT INTO public.delta (account_id, reason) SELECT DISTINCT "ownerId", 'services' FROM new_rows;
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        INSERT INTO public.delta (account_id, reason) SELECT DISTINCT "ownerId", 'services' FROM old_rows;
    END IF;
    RETURN NULL;
END
$$;

CREATE FUNCTION public.delta_from_transactions() RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        INSERT INTO public.delta (account_id, reason)
        SELECT DISTINCT s."ownerId", 'transactions'
        FROM new_rows t JOIN public.services s ON s.id = t."serviceId";
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        INSERT INTO public.delta (account_id, reason)
        SELECT DISTINCT s."ownerId", 'transactions'
        FROM old_rows t JOIN public.services s ON s.id = t."serviceId";
    END IF;
    RETURN NULL;
END
$$;

CREATE FUNCTION public.delta_from_truncate() RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM public.delta_enqueue_all('snapshot');
    RETURN NULL;
END
$$;

CREATE FUNCTION public.delta_from_model() RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM public.delta_enqueue_all('model');
    RETURN NULL;
END
$$;

CREATE FUNCTION public.status_history_from_services() RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.service_status_history (service_id, account_id, from_status, to_status, changed_at)
    SELECT n.id, n."ownerId", h.to_status, n.status, public.model_now()
    FROM new_rows n
    LEFT JOIN LATERAL (
        SELECT x.to_status
        FROM public.service_status_history x
        WHERE x.service_id = n.id
        ORDER BY x.id DESC
        LIMIT 1
    ) h ON true
    WHERE h.to_status IS DISTINCT FROM n.status;
    RETURN NULL;
END
$$;

CREATE TRIGGER accounts_delta_ins AFTER INSERT ON public.accounts
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_accounts();
CREATE TRIGGER accounts_delta_upd AFTER UPDATE ON public.accounts
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_accounts();
CREATE TRIGGER accounts_delta_del AFTER DELETE ON public.accounts
    REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_accounts();
CREATE TRIGGER accounts_delta_trunc AFTER TRUNCATE ON public.accounts
    FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_truncate();

CREATE TRIGGER services_delta_ins AFTER INSERT ON public.services
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_services();
CREATE TRIGGER services_delta_upd AFTER UPDATE ON public.services
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_services();
CREATE TRIGGER services_delta_del AFTER DELETE ON public.services
    REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_services();
CREATE TRIGGER services_delta_trunc AFTER TRUNCATE ON public.services
    FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_truncate();

CREATE TRIGGER services_status_history_ins AFTER INSERT ON public.services
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.status_history_from_services();
CREATE TRIGGER services_status_history_upd AFTER UPDATE ON public.services
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.status_history_from_services();

CREATE TRIGGER transactions_delta_ins AFTER INSERT ON public.transactions
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_transactions();
CREATE TRIGGER transactions_delta_upd AFTER UPDATE ON public.transactions
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_transactions();
CREATE TRIGGER transactions_delta_del AFTER DELETE ON public.transactions
    REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_transactions();
CREATE TRIGGER transactions_delta_trunc AFTER TRUNCATE ON public.transactions
    FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_truncate();

CREATE FUNCTION public.model_revision_from_settings() RETURNS trigger
    LANGUAGE plpgsql
AS $$
DECLARE
    v_changes jsonb;
    v_by text;
BEGIN
    SELECT jsonb_agg(jsonb_build_object('key', n.key, 'from', o.value, 'to', n.value) ORDER BY n.key),
           max(n.updated_by)
    INTO v_changes, v_by
    FROM new_rows n
    JOIN old_rows o ON o.key = n.key
    WHERE o.value IS DISTINCT FROM n.value;
    IF v_changes IS NOT NULL THEN
        INSERT INTO public.model_revisions (changed_by, source, changes)
        VALUES (coalesce(v_by, 'system'), 'settings', v_changes);
    END IF;
    RETURN NULL;
END
$$;

CREATE FUNCTION public.model_revision_from_clock() RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    IF (OLD.mode, OLD.frozen_at, OLD.shift) IS DISTINCT FROM (NEW.mode, NEW.frozen_at, NEW.shift) THEN
        INSERT INTO public.model_revisions (changed_by, source, changes)
        VALUES (NEW.updated_by, 'clock', jsonb_build_array(jsonb_build_object(
            'from', jsonb_build_object('mode', OLD.mode, 'frozenAt', OLD.frozen_at, 'shift', OLD.shift::text),
            'to', jsonb_build_object('mode', NEW.mode, 'frozenAt', NEW.frozen_at, 'shift', NEW.shift::text))));
    END IF;
    RETURN NULL;
END
$$;

CREATE TRIGGER model_settings_revision AFTER UPDATE ON public.model_settings
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION public.model_revision_from_settings();

CREATE TRIGGER model_clock_revision AFTER UPDATE ON public.model_clock
    FOR EACH ROW EXECUTE FUNCTION public.model_revision_from_clock();

CREATE TRIGGER model_revisions_delta AFTER INSERT ON public.model_revisions
    FOR EACH STATEMENT EXECUTE FUNCTION public.delta_from_model();
