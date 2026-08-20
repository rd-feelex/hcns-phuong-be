-- =====================================================================
-- OZO HCNS - Schema v2: Engine tính lương
-- Chạy SAU schema.sql trong Supabase SQL Editor.
-- =====================================================================

-- Số người phụ thuộc (giảm trừ gia cảnh)
alter table employees add column if not exists num_dependents int not null default 0;

-- Nguồn bản ghi lương: 'excel' (import) hoặc 'computed' (hệ thống tự tính)
alter table salary_records add column if not exists source text not null default 'excel';

-- Đầu vào tính lương mỗi tháng (KPI %, thưởng, truy thu, tạm ứng)
create table if not exists payroll_inputs (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references employees (employee_code) on delete cascade,
  month text not null, -- 'YYYY-MM'
  kpi_percent numeric default 1,
  business_bonus numeric default 0,
  incentive_bonus numeric default 0,
  other_deduction numeric default 0,
  arrears numeric default 0,
  arrears_note text,
  advance_paid numeric default 0,
  created_at timestamptz not null default now(),
  unique (employee_code, month)
);

alter table payroll_inputs enable row level security;
