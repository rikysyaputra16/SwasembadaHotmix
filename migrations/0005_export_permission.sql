PRAGMA foreign_keys = ON;

INSERT INTO app_role_permissions(role_key, permission_key, allowed, updated_at) VALUES
('admin','export.excel',1,CURRENT_TIMESTAMP),
('panitia01','export.excel',0,CURRENT_TIMESTAMP),
('viewer','export.excel',0,CURRENT_TIMESTAMP)
ON CONFLICT(role_key, permission_key) DO NOTHING;
