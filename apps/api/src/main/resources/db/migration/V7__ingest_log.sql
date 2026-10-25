CREATE TABLE public.ingest_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    received_at timestamptz NOT NULL DEFAULT now(),
    actor text NOT NULL,
    channel text NOT NULL CHECK (channel IN ('api', 'web')),
    mode text NOT NULL CHECK (mode IN ('upsert', 'snapshot')),
    entity text NOT NULL CHECK (entity IN ('accounts', 'services', 'transactions', 'snapshot')),
    format text NOT NULL CHECK (format IN ('json', 'csv')),
    rows_received integer NOT NULL,
    rows_applied integer NOT NULL,
    status text NOT NULL CHECK (status IN ('ok', 'rejected')),
    errors jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX ingest_log_received_idx ON public.ingest_log (received_at DESC);
