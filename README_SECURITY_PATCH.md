# Security Patch - Swasembada Hotmix

Patch ini menambahkan login aplikasi dan proteksi seluruh halaman/API.

## Role
- Admin: baca/tulis/hapus, upload/ganti Petunjuk Teknis, administrasi operasional penuh.
- Panitia: baca, tambah, dan edit data operasional; tidak dapat menghapus data/bukti dan tidak dapat mengganti Petunjuk Teknis.
- Viewer: hanya baca, cetak/export, melihat bukti dan Petunjuk Teknis.

## Security
- PBKDF2-HMAC-SHA256 600,000 iterasi + random salt per user.
- Session random 256-bit, hanya hash session yang disimpan di D1.
- Cookie: HttpOnly, Secure, SameSite=Strict, __Host- prefix.
- CSRF token untuk seluruh request write.
- Login throttle per IP dan lockout account setelah percobaan gagal berulang.
- Session dicabut ketika password/role/status user berubah.
- Semua static assets dan API melewati auth gateway.

## Instalasi
1. Extract isi ZIP ini ke root repository dan replace file yang sama.
2. Jalankan `npm install` jika belum.
3. `npm run db:migrate:remote`
4. Buat Admin pertama, contoh:
   `node scripts/user-admin.mjs create admin Admin "Administrator RT"`
   Password diminta secara tersembunyi. Gunakan password unik minimal 12 karakter + huruf besar/kecil + angka + simbol.
5. Buat user lain sesuai kebutuhan, contoh:
   `node scripts/user-admin.mjs create panitia01 Panitia "Panitia 01"`
   `node scripts/user-admin.mjs create viewer01 Viewer "Warga Viewer"`
6. Upload PDF awal:
   `npx wrangler r2 object put "swasembada-hotmix-proofs/documents/petunjuk-teknis.pdf" --file "outputs/document/Petunjuk Teknis.pdf" --content-type "application/pdf" --remote`
7. `npm run deploy`
8. Buka website. User yang belum login akan dialihkan ke `/login.html`.

## Manajemen user
Reset password:
`node scripts/user-admin.mjs reset-password <username>`

Ubah role:
`node scripts/user-admin.mjs set-role <username> <Admin|Panitia|Viewer>`

Disable / enable:
`node scripts/user-admin.mjs disable <username>`
`node scripts/user-admin.mjs enable <username>`

## Petunjuk Teknis
- Semua user login dapat membuka tombol `Buka PDF Asli`.
- Admin mendapat tombol `Upload / Ganti PDF` pada halaman Petunjuk Teknis.
- File disimpan privat dengan key `documents/petunjuk-teknis.pdf`.

## Branding
UI menghilangkan teks provider dari tampilan aplikasi. Ini hanya menyembunyikan branding yang terlihat oleh pengguna biasa; operator jaringan yang melakukan inspeksi DNS/HTTP masih mungkin mengidentifikasi penyedia infrastrukturnya.
