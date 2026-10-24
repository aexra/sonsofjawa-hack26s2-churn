ALTER TABLE public.model_settings
    ADD CONSTRAINT model_settings_count_check CHECK (unit <> 'count' OR value = trunc(value));

CREATE FUNCTION public.validate_model_settings() RETURNS trigger
    LANGUAGE plpgsql
AS $$
DECLARE
    v_weight numeric;
    v_medium numeric;
    v_high numeric;
    v_overdue numeric;
    v_lookback numeric;
BEGIN
    SELECT sum(value) FILTER (WHERE group_key = 'weights'),
           max(value) FILTER (WHERE key = 'level_medium'),
           max(value) FILTER (WHERE key = 'level_high'),
           max(value) FILTER (WHERE key = 'payment_overdue_hours'),
           max(value) FILTER (WHERE key = 'payment_lookback_days')
    INTO v_weight, v_medium, v_high, v_overdue, v_lookback
    FROM public.model_settings;
    IF v_weight <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'sum of model weights must be positive';
    END IF;
    IF v_medium >= v_high THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'medium risk threshold must be below high threshold';
    END IF;
    IF v_overdue >= v_lookback * 24 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment lookback must exceed overdue threshold';
    END IF;
    RETURN NULL;
END
$$;

CREATE TRIGGER model_settings_validate AFTER UPDATE ON public.model_settings
    FOR EACH STATEMENT EXECUTE FUNCTION public.validate_model_settings();
