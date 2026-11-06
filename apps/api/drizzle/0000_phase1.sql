DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('employee', 'manager', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  display_name text NOT NULL,
  external_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_unique
  ON employees(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_system_internal boolean NOT NULL DEFAULT false,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_source_external_unique
  ON clients(source_system, external_id);

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  activity_id uuid NOT NULL REFERENCES activities(id),
  work_date date NOT NULL,
  duration_minutes integer NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'manual',
  source_system text,
  source_record_id text,
  is_current boolean NOT NULL DEFAULT true,
  superseded_by_entry_id uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_entries_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT time_entries_duration_cap CHECK (duration_minutes <= 1440)
);

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_current_source_unique
  ON time_entries(source_system, source_record_id)
  WHERE source_record_id IS NOT NULL AND deleted_at IS NULL AND is_current = true;

CREATE INDEX IF NOT EXISTS time_entries_employee_date_idx
  ON time_entries(employee_id, work_date);

CREATE INDEX IF NOT EXISTS time_entries_client_date_idx
  ON time_entries(client_id, work_date);

CREATE INDEX IF NOT EXISTS time_entries_work_date_idx
  ON time_entries(work_date);

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL UNIQUE,
  family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
