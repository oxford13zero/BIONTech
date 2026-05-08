-- ============================================================
-- BION Master Database Schema
-- Run this ONCE on your Azure PostgreSQL master database
-- This is the admin database — NOT client databases
-- ============================================================

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash VARCHAR(500) NOT NULL,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Companies (clients) table
CREATE TABLE IF NOT EXISTS companies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  industry            TEXT NOT NULL,
  country             TEXT NOT NULL DEFAULT 'Chile',
  contact_name        TEXT,
  contact_email       TEXT,
  contact_phone       TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active','inactive','pending','cancelled')),
  contract_status     TEXT NOT NULL DEFAULT 'pending' CHECK (contract_status IN ('active','pending','expired','cancelled')),
  -- Azure client database connection details
  azure_db_host       TEXT,
  azure_db_name       TEXT,
  azure_db_user       TEXT,
  azure_db_password   TEXT,
  azure_db_status     TEXT DEFAULT 'pending' CHECK (azure_db_status IN ('pending','provisioning','ready','error')),
  onboarded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users table (client users)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL DEFAULT 'company_user' CHECK (role IN ('company_admin','company_user','branch_manager')),
  password_hash VARCHAR(500) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory types table
CREATE TABLE IF NOT EXISTS inventory_types (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code      TEXT UNIQUE NOT NULL,
  label     TEXT NOT NULL,
  active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed inventory types
INSERT INTO inventory_types (code, label) VALUES
  ('mining',     'Mining'),
  ('healthcare', 'Healthcare'),
  ('forestry',   'Forestry'),
  ('finance',    'Finance / Banks'),
  ('retail',     'Retail')
ON CONFLICT (code) DO NOTHING;

-- Add password_hash to profiles if migrating from Supabase
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash VARCHAR(500);
