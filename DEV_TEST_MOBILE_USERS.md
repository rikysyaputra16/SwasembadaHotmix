# DEV Test - Mobile, Users/Roles, Profile

Branch: `feature-mobile-users-roles-profile-dev`

Use only local D1 during testing. Do not run `npm run deploy` and do not use `--remote`.

```powershell
git fetch origin
git switch feature-mobile-users-roles-profile-dev
git pull origin feature-mobile-users-roles-profile-dev
npm install

npx wrangler d1 migrations apply swasembada-hotmix --local --config wrangler.mobile-users-dev.jsonc

# Optional: load sanitized/current operational seed if this local file exists
npx wrangler d1 execute swasembada-hotmix --local --config wrangler.mobile-users-dev.jsonc --file=./private-migration/current-data.sql

$env:HOTMIX_DEV_PASSWORD="CHANGE-ME-Strong#123"
node scripts/dev-user-mobile.mjs admin-dev admin "Administrator DEV"
Remove-Item Env:HOTMIX_DEV_PASSWORD

npx wrangler dev --config wrangler.mobile-users-dev.jsonc
```

Open the localhost URL printed by Wrangler. For testing from Android/iOS, keep Wrangler running and press `t` to start a temporary HTTPS development tunnel, then open the printed `trycloudflare.com` URL on the phone.

Expected roles:
- `admin`: full operational access plus Users & Roles.
- `panitia01`: full operational access but no Users & Roles menu.
- `viewer`: operational data is read-only.

Stop DEV with `Ctrl+C`. Return to production source with `git switch main`.
