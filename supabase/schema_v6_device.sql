-- =====================================================================
-- Schema v6: Tích hợp máy chấm công khuôn mặt (ZK AI)
-- =====================================================================

-- Mã chấm công trên máy (enrollid) — map người máy ↔ hồ sơ web
alter table employees add column if not exists enroll_id integer;
create index if not exists idx_employees_enroll on employees (enroll_id);

-- Chi tiết chấm công theo ngày (từ máy chấm công hoặc phiếu Lark)
create table if not exists attendance_daily (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references employees (employee_code) on delete cascade,
  work_date date not null,
  check_in time,            -- giờ vào (lượt chấm sớm nhất)
  check_out time,           -- giờ ra (lượt chấm muộn nhất)
  worked_minutes integer,   -- số phút làm thực tế (ra - vào)
  diff_minutes integer,     -- so với 540: dương = thừa, âm = thiếu
  late boolean default false,      -- vào sau 08:30
  status text default 'X',  -- X / X/2 / P / KL / thiếu...
  source text default 'device',    -- device / lark / manual
  note text,
  punches jsonb default '[]',      -- toàn bộ lượt chấm trong ngày
  updated_at timestamptz not null default now(),
  unique (employee_code, work_date)
);
create index if not exists idx_att_daily_date on attendance_daily (work_date);

-- Mốc đồng bộ gần nhất với máy (để lần sau chỉ kéo bản ghi mới)
create table if not exists device_sync_state (
  device_sn text primary key,
  last_log_time timestamptz,
  last_synced_at timestamptz,
  total_synced integer default 0
);
