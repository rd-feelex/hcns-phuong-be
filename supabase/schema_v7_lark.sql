-- =====================================================================
-- Schema v7: tích hợp Lark (đẩy giờ chấm lên Lark Attendance)
-- =====================================================================

-- user_id phía Lark (giải được từ email/điện thoại qua Contact API, cache lại)
alter table employees add column if not exists lark_user_id text;

-- Đánh dấu lượt chấm đã đẩy lên Lark chưa, tránh đẩy trùng
alter table attendance_daily add column if not exists lark_pushed boolean not null default false;
