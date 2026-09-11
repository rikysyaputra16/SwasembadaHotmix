-- Swasembada Hotmix - Cloudflare D1 schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  house_no TEXT NOT NULL,
  phone TEXT,
  total_cost INTEGER NOT NULL CHECK (total_cost >= 0),
  installment_amount INTEGER NOT NULL DEFAULT 0 CHECK (installment_amount >= 0),
  installment_term TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('Tetap','Custom','Bayar Penuh')),
  installment_due TEXT NOT NULL DEFAULT '10',
  initial_note TEXT,
  officer TEXT NOT NULL DEFAULT 'Panitia',
  companion TEXT,
  active TEXT NOT NULL DEFAULT 'Ya' CHECK (active IN ('Ya','Tidak')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS installment_plans (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('Tetap','Custom','Bayar Penuh')),
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  due_month TEXT NOT NULL,
  due_label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE(member_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL DEFAULT 'Cicilan',
  method TEXT NOT NULL,
  period_label TEXT,
  payment_type TEXT,
  receiver TEXT NOT NULL,
  note TEXT,
  recorded_at TEXT NOT NULL,
  proof_name TEXT,
  proof_type TEXT,
  proof_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plans_member_sequence ON installment_plans(member_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_plans_due_month ON installment_plans(due_month);
CREATE INDEX IF NOT EXISTS idx_payments_member_date ON payments(member_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
