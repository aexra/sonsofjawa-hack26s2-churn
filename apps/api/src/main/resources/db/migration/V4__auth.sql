CREATE TABLE public.users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    login text NOT NULL UNIQUE CHECK (login = lower(login)),
    email text,
    display_name text,
    role text NOT NULL CHECK (role IN ('user', 'admin')),
    auth_provider text NOT NULL CHECK (auth_provider IN ('local', 'oidc')),
    password_hash text,
    oidc_subject text UNIQUE,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz,
    CONSTRAINT users_provider_check CHECK (
        (auth_provider = 'local' AND password_hash IS NOT NULL AND oidc_subject IS NULL)
        OR (auth_provider = 'oidc' AND password_hash IS NULL AND oidc_subject IS NOT NULL)
    )
);

CREATE TABLE public.refresh_tokens (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    family_id uuid NOT NULL,
    token_hash text NOT NULL UNIQUE,
    issued_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_by bigint REFERENCES public.refresh_tokens (id) ON DELETE SET NULL
);

CREATE INDEX refresh_tokens_user_idx ON public.refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON public.refresh_tokens (family_id);
