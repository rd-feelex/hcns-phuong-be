# -*- coding: utf-8 -*-
"""SSH helper: python ssh.py "command" — chạy lệnh trên server binh@192.168.1.222"""
import sys, paramiko

HOST, USER, PASS = "192.168.1.222", "binh", "binh123"

def run(cmd, timeout=120):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=15)
    # sudo không cần tty: dùng -S đọc pass từ stdin nếu lệnh bắt đầu bằng sudo
    if "sudo " in cmd:
        cmd = cmd.replace("sudo ", f"echo '{PASS}' | sudo -S -p '' ")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    c.close()
    if out: print(out, end="")
    if err: print("[STDERR]", err, end="", file=sys.stderr)
    sys.exit(code)

if __name__ == "__main__":
    run(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 120)
