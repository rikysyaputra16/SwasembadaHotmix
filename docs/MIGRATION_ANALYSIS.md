# Migration Analysis — Swasembada Hotmix

## Source

The original application is a local HTML/JavaScript application whose persistence layer is an Excel workbook plus local payment-proof files. The migration keeps the existing UI and business calculations as much as possible, while replacing local persistence with Cloudflare D1 and R2.

## Data model mapping

| Original workbook sheet | Cloudflare target | Relationship / treatment |
|---|---|---|
| Anggota | `members` | Primary master table |
| Rencana Angsuran | `installment_plans` | Many plans belong to one member |
| Pembayaran | `payments` | Many payments belong to one member |
| Bukti Pembayaran | R2 + proof metadata in `payments` | Binary file in R2; key/name/type in D1 |
| Metadata | `app_settings` | Application/filter settings and original workbook metadata |
| Ringkasan | Derived | Recomputed from D1 data in the browser |
| Kontrol Rencana | Derived | Recomputed from members + plans |
| Tunggakan | Derived | Recomputed from plans + payments |
| Rincian Tunggakan | Derived | Recomputed from plans + payments |
| History Bulanan | Derived | Recomputed from payments |
| Laporan Angsuran | Derived | Recomputed from members + plans + payments |
| Panduan | Export/report content | Preserved by the existing Excel export builder |

## Cardinality

```text
members (1) ────< installment_plans (N)
    │
    └───────────< payments (N) ──── (0..1) proof object in R2
```

`ON DELETE CASCADE` is used from members to plans/payments. R2 cleanup is performed by the Worker after the D1 deletion succeeds.

## Migrated baseline

The supplied workbook was normalized into the schema above and validated for referential integrity, duplicate plan sequences, plan-vs-obligation consistency, and payment/member relationships. Exact production rows and totals are kept in the private migration package rather than this public repository.

## Feature mapping

| Feature | Migration result |
|---|---|
| Create / read / update / delete | Worker API + D1 |
| Payment proof upload | Worker API + private R2 bucket |
| View/delete payment proof | Worker streams/deletes R2 object |
| Excel export | Existing client-side SheetJS export retained |
| WhatsApp reminder | Existing client-side WhatsApp deep-link behavior retained |
| Digital receipt PNG | Existing client-side implementation retained |
| Login | Not added because the original application has no login |

## Security gate before production

The Worker API contains write operations. Do not expose the production application publicly without an access-control layer. The preferred design is Cloudflare Access in front of the application/custom domain and disabling unintended alternate public entry points. No Cloudflare API token, private key, credential, or payment-proof binary is committed to this repository.

## Proof migration

The payment-proof manifest is part of the separately delivered `private-migration/` package and is excluded by `.gitignore`. Binary proof files remain only in the original private application directory until they are uploaded to the private R2 bucket.

```bash
node scripts/upload-r2-proofs.mjs "/path/to/original/SwasembadaHotmix" --dry-run
node scripts/upload-r2-proofs.mjs "/path/to/original/SwasembadaHotmix"
```
