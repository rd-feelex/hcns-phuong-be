-- =====================================================================
-- Schema v8: UserID Lark cho báo cáo timesheet (xác nhận công)
-- =====================================================================

-- UserID numeric của Lark (dùng trong file timesheet verification)
alter table employees add column if not exists lark_uid text;
alter table employees add column if not exists lark_dept text;
