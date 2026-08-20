-- =====================================================================
-- OZO HCNS - Schema Supabase (PostgreSQL)
-- Chạy file này trong Supabase Dashboard > SQL Editor trước khi seed.
-- =====================================================================

-- Nhân viên
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text unique not null,
  full_name text not null,
  position text,
  department text,
  company text,
  join_date date,
  probation_end_date date,
  contract_start_date date,
  contract_type text,
  salary_grade text,
  salary_form text,
  email text,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employees_department on employees (department);
create index if not exists idx_employees_company on employees (company);

-- Bảng lương theo tháng (1 nhân viên có thể nhận lương ở nhiều công ty)
create table if not exists salary_records (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references employees (employee_code) on delete cascade,
  month text not null, -- 'YYYY-MM'
  company text not null default '',
  agreed_salary numeric,
  base_salary numeric,
  insurance_salary numeric,
  allowance_phone numeric,
  allowance_fuel numeric,
  allowance_attendance numeric,
  allowance_responsibility numeric,
  allowance_meal_per_day numeric,
  kpi_salary_target numeric,
  standard_workdays numeric,
  paid_workdays numeric,
  salary_by_workdays numeric,
  total_allowance numeric,
  kpi_percent numeric,
  kpi_salary_actual numeric,
  business_bonus numeric,
  incentive_bonus numeric,
  other_deduction numeric,
  total_bonus numeric,
  arrears numeric,
  arrears_note text,
  total_income numeric,
  social_insurance_total numeric,
  social_insurance_employee numeric,
  union_fee_employee numeric,
  personal_income_tax numeric,
  net_income numeric,
  advance_paid numeric,
  final_received numeric,
  company_cost numeric,
  created_at timestamptz not null default now(),
  unique (employee_code, month, company)
);

create index if not exists idx_salary_month on salary_records (month);

-- Chấm công chi tiết theo ngày (days: {"2026-07-01": "X", ...})
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references employees (employee_code) on delete cascade,
  month text not null,
  days jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (employee_code, month)
);

-- Tổng hợp chấm công tháng
create table if not exists attendance_summary (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references employees (employee_code) on delete cascade,
  month text not null,
  total_work_days numeric default 0,
  total_leave_days numeric default 0,
  unpaid_leave_days numeric default 0,
  late_days numeric default 0,
  meal_days numeric default 0,
  total_paid_days numeric default 0,
  created_at timestamptz not null default now(),
  unique (employee_code, month)
);

-- Trigger cập nhật updated_at
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_employees_updated on employees;
create trigger trg_employees_updated
  before update on employees
  for each row execute function set_updated_at();

-- Backend dùng service_role key nên bật RLS để chặn truy cập từ anon key
alter table employees enable row level security;
alter table salary_records enable row level security;
alter table attendance_records enable row level security;
alter table attendance_summary enable row level security;
