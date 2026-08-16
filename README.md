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

Service `migrate` otomatis menerapkan seluruh migration dan seed user
development sebelum aplikasi dimulai. Build pertama memerlukan waktu lebih lama
untuk mengunduh image dan dependency; build selanjutnya menggunakan cache
Docker.

## URL development

| Komponen                  | URL/port                     |
| ------------------------- | ---------------------------- |
| Auth Server               | http://localhost:3000        |
| Control Panel             | http://localhost:3001        |
| App A                     | http://localhost:4001        |
| App B                     | http://localhost:4002        |
| Sync Worker health        | http://localhost:5000/health |
| MySQL Docker dari Windows | `127.0.0.1:3308`             |
| RabbitMQ AMQP             | `localhost:5672`             |
| RabbitMQ Management       | http://localhost:15672       |

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
  auth-database/
  config/
  contracts/
  security/
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
pnpm run db:seed
pnpm run test:e2e:all
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
- Password disimpan sebagai Argon2id hash.
- Central session memakai opaque token pada cookie `HttpOnly`; database hanya
  menyimpan SHA-256 hash token.
- Aplikasi menggunakan user MySQL `platform`; user `root` hanya untuk
  administrasi lokal.

## Endpoint Hari 2

| Method  | Endpoint                                   | Fungsi                   |
| ------- | ------------------------------------------ | ------------------------ |
| `POST`  | `http://localhost:3001/users`              | Membuat user             |
| `GET`   | `http://localhost:3001/users`              | Melihat daftar user      |
| `GET`   | `http://localhost:3001/users/:id`          | Melihat detail user      |
| `PATCH` | `http://localhost:3001/users/:id`          | Mengubah nama/email      |
| `PATCH` | `http://localhost:3001/users/:id/status`   | Mengubah status user     |
| `PATCH` | `http://localhost:3001/users/:id/password` | Mengubah password        |
| `POST`  | `http://localhost:3000/auth/login`         | Membuat central session  |
| `GET`   | `http://localhost:3000/auth/session`       | Membaca central session  |
| `POST`  | `http://localhost:3000/auth/logout`        | Mencabut central session |

## Status implementasi

Hari 1–2 sudah tersedia: monorepo, validasi konfigurasi, Docker Compose, schema,
migration, seed idempotent, health endpoint, pengelolaan user, Argon2id password
hashing, audit log, login, central session cookie, pemeriksaan session, logout,
dan pencabutan session ketika user dinonaktifkan atau password berubah. OAuth,
group policy, relying application flow, dan event processing dikerjakan pada
tahap berikutnya.
