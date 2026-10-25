ALTER TABLE public.recalc_runs DROP CONSTRAINT recalc_runs_trigger_check;
ALTER TABLE public.recalc_runs ADD CONSTRAINT recalc_runs_trigger_check
    CHECK (trigger IN ('timer', 'manual', 'model', 'snapshot', 'ingest'));
