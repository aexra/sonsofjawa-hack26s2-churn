CREATE TABLE public.api_keys (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    prefix text NOT NULL UNIQUE CHECK (prefix ~ '^[a-z0-9]{8}$'),
    secret_hash text NOT NULL,
    scopes text[] NOT NULL CHECK (scopes <@ ARRAY['read', 'ingest', 'metrics']::text[] AND cardinality(scopes) > 0),
    created_by bigint REFERENCES public.users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    last_used_at timestamptz,
    revoked_at timestamptz
);
