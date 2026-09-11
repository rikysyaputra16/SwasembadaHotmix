# Swasembada Hotmix — Cloudflare Edition

Migration of the existing local HTML/JavaScript + Excel application to Cloudflare Workers, D1, and R2.

## Target architecture

```text
Browser
  |
  v
Cloudflare Worker
  |-- Static Assets: HTML / CSS / JavaScript
  |-- /api/*
        |-- D1: members, installment plans, payments, settings
        `-- R2: payment-proof files
```

The existing Excel workbook is no longer the live database. Excel remains available as an **export format**. The current workbook data has been transformed into D1 migrations.

## Migrated data

The supplied workbook was analyzed and validated before migration. Real member, phone, payment, account-destination, and payment-proof metadata are **not committed** because this repository is public. They are delivered separately as a private D1 seed package.

See [`docs/MIGRATION_ANALYSIS.md`](docs/MIGRATION_ANALYSIS.md) for the sheet-to-table mapping.

## Prerequisites

- Node.js 20+ recommended
- Cloudflare account
- Wrangler authentication (`npx wrangler login`)

## 1. Install dependencies

```bash
npm install
```

## 2. Create D1

```bash
npx wrangler d1 create swasembada-hotmix --location apac
```

Copy the returned D1 UUID into `wrangler.jsonc`:

```json
"database_id": "YOUR_D1_DATABASE_ID"
```

Do not put API tokens or other secrets in this file.

## 3. Create the private R2 bucket

```bash
npx wrangler r2 bucket create swasembada-hotmix-proofs
```

The bucket is accessed only through the Worker binding `PROOFS`; no public R2 URL is required.

## 4. Test locally

Apply the schema and the separately delivered private seed locally:

```bash
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Open the URL printed by Wrangler. The application will load its state from `/api/bootstrap`.

## 5. Initialize production D1

```bash
npm run db:migrate:remote
```

The public repository contains `migrations/0001_schema.sql` for the relational schema and indexes. Real workbook data is provided separately in `private-migration/current-data.sql` and is ignored by Git.

## 6. Import the private workbook seed

Copy the separately delivered `private-migration/` folder into the project root. It is covered by `.gitignore`. Then initialize the real D1 data without committing it:

```bash
npm run db:seed:remote
```

## 7. Migrate payment proofs to R2

The public repository intentionally contains no payment-proof binaries or manifest with real payment identifiers. From a machine that still has the original application folder and the private migration package:

```bash
node scripts/upload-r2-proofs.mjs "/path/to/original/SwasembadaHotmix" --dry-run
node scripts/upload-r2-proofs.mjs "/path/to/original/SwasembadaHotmix"
```

The script reads `private-migration/r2-manifest.json` and uploads the local proof files to the R2 keys referenced by the private D1 seed.

## 8. Deploy

```bash
npm run deploy
```

For Git-based deployments, connect this repository in Cloudflare Workers Builds after the D1 database and R2 bucket have been created and `database_id` has been committed.

## API routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | D1/R2 health indicator |
| GET | `/api/bootstrap` | Load application state |
| POST | `/api/mutate` | Member, plan, and payment CRUD |
| PUT | `/api/settings` | Persist report/history filters |
| POST | `/api/proofs/upload/:paymentId` | Upload a proof to R2 |
| GET | `/api/proofs/object/:key` | Stream a proof from private R2 |
| DELETE | `/api/proofs/object/:key` | Explicit proof cleanup endpoint |

## Production security

**Do not publish the write-enabled application to unrestricted Internet access.** The original app has no login. Before production, put Cloudflare Access in front of the app/custom hostname and restrict it to the intended users/identity provider. For production, also review rate limiting, logs, backups/export, and rollback.

Recommended request flow:

```text
User -> Cloudflare Access -> Worker -> D1 / R2
```

## WhatsApp reminder behavior

The existing reminder feature remains browser-side: it creates the message and opens the WhatsApp chat/deep link. This migration does not add a WhatsApp Business API credential or server-side message sender.

## Rollback

- Source rollback: revert the GitHub deployment/commit.
- D1: Cloudflare captures backups around migration operations; keep a pre-cutover export as an additional operational safeguard.
- R2: keep the original local `outputs/upload` directory until production validation is complete.

## Important private-data note

Keep `private-migration/`, the original Excel workbook, and payment-proof files outside Git. This repository intentionally uses runtime D1 settings for payment destination/contact configuration so those values do not appear in public source code.
