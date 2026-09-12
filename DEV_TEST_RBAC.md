# DEV Test - RBAC Viewer / Panitia / Admin

Branch: `feature-mobile-users-roles-profile-dev`

## 1. Update branch

```powershell
git fetch origin
git switch feature-mobile-users-roles-profile-dev
git pull origin feature-mobile-users-roles-profile-dev
```

## 2. Apply local D1 migrations

```powershell
npx wrangler d1 migrations apply swasembada-hotmix --local --config wrangler.rbac-dev.jsonc
```

Migration `0004_role_permissions.sql` menambahkan permission matrix dan mengganti label Panitia01 menjadi Panitia.

## 3. Start DEV

```powershell
npx wrangler dev --config wrangler.rbac-dev.jsonc
```

Buka `http://127.0.0.1:8787`.

## Expected default access

### Admin
- Full operational access.
- Can delete member, plan, and payment.
- Can replace Petunjuk Teknis PDF.
- Can open Users & Roles.
- Can edit role permission checkboxes.

### Panitia
- Can add/edit member, plan, and payment.
- Can send reminders and record payment.
- Can replace Petunjuk Teknis PDF.
- Cannot delete member, plan, or payment.
- Cannot open Users & Roles.

### Viewer
- Read-only operational access.
- Can view payment proof.
- Can send/view receipt.
- Cannot send reminder or record payment.
- Cannot add/edit/delete member, plan, or payment.
- Cannot replace Petunjuk Teknis PDF.
- Cannot open Users & Roles.

## Permission editor

Login as Admin, open `Users & Roles`, then edit the checklist on each role card and click `Simpan Hak Akses`.

`Users & Roles` permission is intentionally locked to Admin only. Other operational permissions can be changed by Admin.

After changing a role, refresh or login again as the target user to refresh the frontend permission state. Backend permission checks are evaluated on every request.
