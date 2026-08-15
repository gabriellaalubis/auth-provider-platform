# Identity & Authorization Provider

Monorepo Seleksi 2 Laboratorium Pemrograman 2026. Sistem terdiri dari Auth
Provider, Control Panel, dua Relying Application, Sync Worker, MySQL, dan
RabbitMQ.

## Prerequisites

- Node.js 24
- pnpm 10
- Docker Desktop dengan Linux containers

## Menjalankan seluruh stack

1. Salin `.env.example` menjadi `.env`.
2. Isi seluruh password pada `.env` dengan nilai development milik sendiri.
3. Jalankan:

```bash
docker compose up --build
```

Service `migrate` otomatis menerapkan seluruh migration sebelum aplikasi
dimulai. Build pertama memerlukan waktu lebih lama untuk mengunduh image dan
dependency; build selanjutnya menggunakan cache Docker.

## URL development

| Komponen | URL/port |
| --- | --- |
| Auth Server | http://localhost:3000 |
| Control Panel | http://localhost:3001 |
| App A | http://localhost:4001 |
| App B | http://localhost:4002 |
| Sync Worker health | http://localhost:5000/health |
| MySQL Docker dari Windows | `127.0.0.1:3308` |
| RabbitMQ AMQP | `localhost:5672` |
| RabbitMQ Management | http://localhost:15672 |

MySQL lokal pemilik repository memakai port 3307, sehingga MySQL Docker proyek
dipetakan ke port host 3308. Di jaringan Docker, aplikasi tetap mengakses
`mysql:3306`.

Contoh akses manual MySQL Docker:

```bash
mysql -h 127.0.0.1 -u root -p --port=3308
```

## Struktur

```text
apps/
  auth-server/
  control-panel/
  app-a/
  app-b/
  sync-worker/
libs/
  config/
  contracts/
  shared/
prisma/
  auth/
  app-a/
  app-b/
docker/
  mysql/init/
```

Database dipisahkan menjadi:

- `auth_db`: sumber utama identitas, policy, central session, token, audit, dan
  event outbox.
- `app_a_db`: local session, profile cache, processed event, dan activity log
  App A.
- `app_b_db`: penyimpanan lokal App B yang independen dari App A.

## Perintah pengembangan

```bash
pnpm install
pnpm lint
pnpm test -- --runInBand
pnpm run build:all
pnpm run db:validate
pnpm run db:generate
pnpm run db:migrate:deploy
```

Menjalankan satu aplikasi secara lokal:

```bash
pnpm exec nest start auth-server --watch
```

URL database dalam `.env` menggunakan hostname internal Docker. Jika Prisma
dijalankan langsung dari Windows, override URL ke `127.0.0.1:3308` untuk command
tersebut.

## Keamanan konfigurasi

- `.env` tidak boleh di-commit.
- `.env.example` hanya berisi nama variabel dan referensi antarvariabel.
- Source code tidak menyimpan password, client secret, atau token.
- Aplikasi menggunakan user MySQL `platform`; user `root` hanya untuk
  administrasi lokal.

## Status implementasi

Fondasi Hari 1 sudah tersedia: monorepo, validasi konfigurasi, Docker Compose,
schema dan migration awal, serta health endpoint. Authentication, OAuth, policy,
dan event processing ditambahkan pada tahap berikutnya.
