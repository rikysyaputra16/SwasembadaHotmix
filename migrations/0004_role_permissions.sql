PRAGMA foreign_keys = ON;

UPDATE app_roles SET display_name='Panitia', description='Akses operasional penuh seperti Admin, tanpa Users & Roles dan tanpa hak hapus data operasional.', updated_at=CURRENT_TIMESTAMP WHERE role_key='panitia01';
UPDATE app_roles SET description='Read-only. Dapat melihat data, bukti pembayaran, dan kwitansi tanpa melakukan perubahan data.', updated_at=CURRENT_TIMESTAMP WHERE role_key='viewer';

CREATE TABLE IF NOT EXISTS app_role_permissions (
 role_key TEXT NOT NULL,
 permission_key TEXT NOT NULL,
 allowed INTEGER NOT NULL DEFAULT 0 CHECK (allowed IN (0,1)),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (role_key, permission_key),
 FOREIGN KEY (role_key) REFERENCES app_roles(role_key) ON DELETE CASCADE
);

INSERT INTO app_role_permissions(role_key,permission_key,allowed) VALUES
('admin','dashboard.reminder',1),('admin','dashboard.collect',1),('admin','members.write',1),('admin','members.delete',1),('admin','plans.write',1),('admin','plans.delete',1),('admin','payments.write',1),('admin','payments.delete',1),('admin','payments.proof_view',1),('admin','payments.receipt',1),('admin','guide.update_pdf',1),('admin','users_roles.manage',1),
('panitia01','dashboard.reminder',1),('panitia01','dashboard.collect',1),('panitia01','members.write',1),('panitia01','members.delete',0),('panitia01','plans.write',1),('panitia01','plans.delete',0),('panitia01','payments.write',1),('panitia01','payments.delete',0),('panitia01','payments.proof_view',1),('panitia01','payments.receipt',1),('panitia01','guide.update_pdf',1),('panitia01','users_roles.manage',0),
('viewer','dashboard.reminder',0),('viewer','dashboard.collect',0),('viewer','members.write',0),('viewer','members.delete',0),('viewer','plans.write',0),('viewer','plans.delete',0),('viewer','payments.write',0),('viewer','payments.delete',0),('viewer','payments.proof_view',1),('viewer','payments.receipt',1),('viewer','guide.update_pdf',0),('viewer','users_roles.manage',0)
ON CONFLICT(role_key,permission_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON app_role_permissions(role_key);
