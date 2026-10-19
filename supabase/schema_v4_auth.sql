-- =====================================================================
-- Schema v4: bảng tài khoản đăng nhập (thay Supabase Auth khi self-host)
-- =====================================================================

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  role text not null default 'user', -- 'admin' | 'user'
  full_name text,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
