PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_roles (
  role_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_roles (role_key, display_name, description, sort_order, active)
VALUES
  ('admin', 'Admin', 'Full access termasuk Users & Roles, seluruh data operasional, penghapusan, dan pengaturan.', 10, 1),
  ('panitia01', 'Panitia01', 'Akses operasional penuh seperti Admin, tetapi tidak dapat membuka atau mengelola Users & Roles.', 20, 1),
  ('viewer', 'Viewer', 'Read-only. Dapat melihat data, bukti, kwitansi, laporan, dan profile tanpa menambah, mengubah, atau menghapus data operasional.', 30, 1)
ON CONFLICT(role_key) DO UPDATE SET
  display_name=excluded.display_name,
  description=excluded.description,
  sort_order=excluded.sort_order,
  active=excluded.active,
  updated_at=CURRENT_TIMESTAMP;

ALTER TABLE app_users ADD COLUMN role_key TEXT NOT NULL DEFAULT 'viewer';

UPDATE app_users
SET role_key = CASE
  WHEN role = 'Admin' THEN 'admin'
  WHEN role = 'Panitia' THEN 'panitia01'
  ELSE 'viewer'
END;

-- Panitia01 intentionally maps to legacy role Admin so the existing gateway grants
-- full operational access. Access to Users & Roles is enforced separately by role_key.
UPDATE app_users
SET role = 'Admin'
WHERE role_key = 'panitia01';

CREATE INDEX IF NOT EXISTS idx_app_users_role_key ON app_users(role_key);
