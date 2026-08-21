-- =====================================================================
-- OZO HCNS - Schema v3: Nền tảng quản lý nhân sự đầy đủ
-- Chạy SAU schema.sql và schema_v2_payroll.sql trong Supabase SQL Editor.
-- =====================================================================

-- Phân loại nhân sự: staff (chính thức), ctv (cộng tác viên), intern (thực tập sinh)
alter table employees add column if not exists employee_type text not null default 'staff';
-- Số hợp đồng lao động (nhập tay)
alter table employees add column if not exists contract_number text;

-- Lương cộng tác viên (cơ chế tính khác nhân viên chính thức)
create table if not exists contractor_salaries (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references employees (employee_code) on delete cascade,
  month text not null,
  company text not null default '',
  salary_monthly numeric,
  salary_hourly numeric,
  standard_days numeric,
  work_days numeric,
  work_hours numeric,
  total_income numeric,
  other_plus numeric,
  advance_paid numeric,
  pre_tax_income numeric,
  personal_income_tax numeric,
  net_received numeric,
  company_cost numeric,
  note text,
  created_at timestamptz not null default now(),
  unique (employee_code, month, company)
);

-- Lịch sử biến động lương/nhân sự (có thể chứa nhân sự đã nghỉ -> không ràng buộc FK)
create table if not exists salary_changes (
  id uuid primary key default gen_random_uuid(),
  month text,
  employee_code text,
  full_name text,
  position text,
  department text,
  change_type text,
  note text,
  effective_date date,
  created_at timestamptz not null default now()
);
create index if not exists idx_salary_changes_code on salary_changes (employee_code);

-- Chi tiết truy thu / hỗ trợ theo tháng
create table if not exists arrears_details (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  employee_code text,
  full_name text,
  position text,
  department text,
  amount_shortage numeric default 0, -- truy thu thiếu (trừ vào lương)
  amount_excess numeric default 0,   -- truy thu thừa (trả lại)
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_arrears_code on arrears_details (employee_code);

-- Thưởng Ebitda / thâm niên
create table if not exists ebitda_bonuses (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  employee_code text,
  full_name text,
  position text,
  company text,
  department text,
  role text,
  join_date date,
  bonus numeric default 0,
  deduction numeric default 0,
  final_bonus numeric default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ebitda_code on ebitda_bonuses (employee_code);

-- Thang bảng lương + phụ cấp chuẩn theo ngạch/chức danh
create table if not exists salary_grades (
  id uuid primary key default gen_random_uuid(),
  grade text not null,
  group_name text,
  title text not null,
  steps jsonb not null default '{}', -- {"Bậc 1": 20000000, ...}
  allowance_phone numeric,
  allowance_fuel numeric,
  allowance_attendance numeric,
  allowance_meal_per_day numeric,
  allowance_responsibility numeric,
  created_at timestamptz not null default now(),
  unique (grade, title)
);

-- KPI chi tiết theo từng bảng chấm KPI (lưu dạng linh hoạt jsonb)
create table if not exists kpi_details (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  sheet text not null,
  employee_code text,
  full_name text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_kpi_details_code on kpi_details (employee_code);
create index if not exists idx_kpi_details_month on kpi_details (month);

alter table contractor_salaries enable row level security;
alter table salary_changes enable row level security;
alter table arrears_details enable row level security;
alter table ebitda_bonuses enable row level security;
alter table salary_grades enable row level security;
alter table kpi_details enable row level security;
