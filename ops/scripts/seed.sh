#!/bin/sh
set -eu

DEMO_SEED="${DEMO_SEED:-demo}"
DEMO_CLOCK="${DEMO_CLOCK:-shifted}"
DEMO_AS_OF="${DEMO_AS_OF:-2026-10-19T15:00:00Z}"

run_sql() {
    psql -X -v ON_ERROR_STOP=1 "$@"
}

accounts="$(run_sql -At -c 'SELECT count(*) FROM public.accounts')"
if [ "$accounts" != "0" ]; then
    echo "seed: accounts are not empty, skipping"
    exit 0
fi

case "$DEMO_SEED" in
    none)
        echo "seed: DEMO_SEED=none, nothing to load"
        exit 0
        ;;
    tmplt)
        file=/seeds/tmplt/002_seed.sql
        ;;
    demo)
        file=/seeds/demo/002_seed.sql
        ;;
    *)
        echo "seed: unknown DEMO_SEED=$DEMO_SEED (expected demo, tmplt or none)" >&2
        exit 1
        ;;
esac

echo "seed: loading $file"
run_sql -f "$file"

has_clock="$(run_sql -At -c "SELECT to_regclass('public.model_clock') IS NOT NULL")"
if [ "$has_clock" = "t" ]; then
    case "$DEMO_CLOCK" in
        shifted)
            run_sql -v as_of="$DEMO_AS_OF" -f - <<'SQL'
UPDATE public.model_clock
SET mode = 'shifted', shift = now() - :'as_of'::timestamptz, updated_by = 'seed'
SQL
            ;;
        frozen)
            run_sql -v as_of="$DEMO_AS_OF" -f - <<'SQL'
UPDATE public.model_clock
SET mode = 'frozen', frozen_at = :'as_of'::timestamptz, updated_by = 'seed'
SQL
            ;;
        real) ;;
        *)
            echo "seed: unknown DEMO_CLOCK=$DEMO_CLOCK (expected shifted, frozen or real)" >&2
            exit 1
            ;;
    esac
fi

echo "seed: done"
