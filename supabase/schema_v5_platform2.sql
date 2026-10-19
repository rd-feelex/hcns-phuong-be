-- =====================================================================
-- Schema v5: file đính kèm, quỹ phép, phê duyệt Lark
-- =====================================================================

-- Tài liệu đính kèm hồ sơ nhân sự (hợp đồng, CV, bằng cấp...)
create table if not exists employee_files (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references employees (employee_code) on delete cascade,
  file_name text not null,   -- tên gốc hiển thị
  stored_name text not null, -- tên file trên đĩa
  mime text,
  size bigint,
  uploaded_by text,
  created_at timestamptz not null default now()
);
create index if not exists idx_employee_files_code on employee_files (employee_code);

-- Quỹ phép năm của từng nhân sự (phép đã dùng tự tính từ bảng chấm công)
create table if not exists leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references employees (employee_code) on delete cascade,
  year int not null,
  entitled numeric not null default 12, -- phép năm tiêu chuẩn
  adjusted numeric not null default 0,  -- cộng/trừ tay (thâm niên, thưởng phép...)
  note text,
  updated_at timestamptz not null default now(),
  unique (employee_code, year)
);

-- Yêu cầu phê duyệt liên kết từ Lark
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'lark',
  external_id text unique,  -- instance_code bên Lark
  type text,                -- Nghỉ phép / Tăng lương / ...
  title text,
  requester text,           -- người gửi yêu cầu
  employee_code text,
  status text not null default 'PENDING', -- PENDING / APPROVED / REJECTED / CANCELED
  detail jsonb not null default '{}',
  link_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_approvals_status on approvals (status);
