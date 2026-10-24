# ops

Всё, что нужно для запуска и сопровождения стека: Compose-файлы, сиды, генератор демо-данных. Команды вызываются из корня репозитория через `make` (корневой `Makefile` передаёт их в `ops/Makefile`).

## Состав

- `compose/` — Compose-файлы: основной стек, оверрайд для разработки, файл для развёртывания на сервере.
- `scripts/` — `seed.sh` (загрузка демо-данных), `generate_demo.py` (генератор демо-набора) и его тесты.
- `seeds/` — тестовые данные организаторов (`tmplt/`) и расширенный демо-набор (`demo/`).
- `config/`, `observability/` — зарезервированы под конфигурацию Prometheus и дашборды Grafana, пока пусты.

## Команды

Перед первым запуском: `cp .env.example .env` (в корне репозитория).

| Команда | Что делает |
|---|---|
| `make up` | собирает образы и поднимает `pg`, `api`, `web`, `mcp`, затем запускает одноразовый `seed` |
| `make down` | останавливает стек, том базы сохраняется |
| `make restart` | перезапускает контейнеры |
| `make ps` | список контейнеров, включая остановленные |
| `make logs` | логи всех сервисов в реальном времени |
| `make dev` | поднимает только `pg` с портом `5432` на хосте (оверрайд `compose.dev.yml`), для запуска `api` и `web` с хоста |
| `make seed` | повторно запускает загрузку данных в работающем стеке |
| `make db-reset` | удаляет том базы и поднимает стек заново |
| `make demo-data` | перегенерирует демо-набор (`python3 scripts/generate_demo.py --seed 42`) |
| `make demo-data-test` | тесты генератора демо-данных |
| `make build-images` | собирает образы `api`, `web`, `mcp` с параметрами из `.env.build` |
| `make push` | собирает и отправляет образы в реестр `IMAGE_REGISTRY` |

Эквивалент без `make`:

```bash
docker compose -f ops/compose/compose.yml --env-file .env up -d --build --wait pg api web mcp
docker compose -f ops/compose/compose.yml --env-file .env run --rm seed
```

## Compose-файлы

| Файл | Назначение |
|---|---|
| `compose/compose.yml` | основной стек: `pg` (PostgreSQL 18), `api`, `web` (порт `WEB_PORT`, по умолчанию 8080), `mcp` (порт `MCP_PORT`, по умолчанию 8090), одноразовый `seed`; том `pgdata` |
| `compose/compose.dev.yml` | оверрайд для разработки: публикует `pg` на `5432` и `api` на `8081` |
| `compose/compose.prod.yml` | развёртывание из готовых образов реестра во внешней сети `nginx`; переменные `api` берутся из файла `.env` рядом с ним |

Профилей Compose в стеке нет: `seed` запускается командой `run --rm`, а не профилем.

Сборка образов: `.env.build` (шаблон `.env.build.example`) задаёт зеркала для закрытых сетей: `BASE_REGISTRY` (базовые образы), `NPM_REGISTRY`, `GRADLE_MIRROR`, `PIP_INDEX_URL`, а также `IMAGE_REGISTRY` и `IMAGE_TAG`.

## Сиды

`scripts/seed.sh` запускается контейнером `seed` и:

1. ничего не делает, если таблица `accounts` не пуста (повторный `make up` данные не дублирует);
2. загружает `seeds/<DEMO_SEED>/002_seed.sql`: `demo` (по умолчанию), `tmplt` или `none` (не загружать);
3. настраивает модельные часы по `DEMO_CLOCK`: `shifted` (по умолчанию, «сейчас» равно `DEMO_AS_OF`, дальше время идёт), `frozen` (время остановлено на `DEMO_AS_OF`), `real` (не трогать).

Наборы:

| Набор | Состав |
|---|---|
| `seeds/tmplt/` | набор организаторов: 10 аккаунтов, 30 услуг, 100 транзакций (`data.json`, `002_seed.sql`, схема `001_schema.up.sql` / `001_schema.down.sql`) |
| `seeds/demo/` | расширенный набор: 310 аккаунтов, 760 услуг, 3317 транзакций (`data.json`, `002_seed.sql`) |

Первые 10 аккаунтов `demo` с их услугами и транзакциями совпадают с `tmplt` без изменений.

Загрузить другой набор в уже заполненную базу: `make db-reset` с нужным `DEMO_SEED` в `.env`.

## Генератор демо-данных

`scripts/generate_demo.py` детерминированно строит расширенный набор поверх данных организаторов: сохраняет первые 10 клиентов и добавляет сгенерированных по профилям (здоровые, с истекающими услугами без автопродления, в ожидании оплаты, с выключенными услугами, с историей удалений и т. д.). Моментом отсчёта служит `2026-10-19T15:00:00Z`.

```bash
make demo-data        # python3 scripts/generate_demo.py --seed 42, перезаписывает seeds/demo
make demo-data-test   # тесты генератора
```

Результат записывается в `seeds/demo/data.json` и `seeds/demo/002_seed.sql`. Тот же seed даёт тот же набор.

## Бэкап и сброс базы

Данные хранятся в томе `churn_pgdata` (проект Compose `churn`).

```bash
docker compose -f ops/compose/compose.yml --env-file .env exec -T pg \
  pg_dump -U churn -d churn -Fc > churn.dump

docker compose -f ops/compose/compose.yml --env-file .env exec -T pg \
  pg_restore -U churn -d churn --clean --if-exists < churn.dump

make db-reset
```

Пользователь и база — значения `POSTGRES_USER` и `POSTGRES_DB` из `.env`. После восстановления дамп-снимка триггеры источников поставят изменённых клиентов в очередь, и пересчёт подхватит их по таймеру; для немедленного пересчёта выполните `POST /api/v1/recalc?scope=all`.

`make db-reset` удаляет том целиком (`docker compose down -v`) и запускает `make up`: схема создаётся миграциями при старте `api`, данные загружает `seed`.
