"""Tiny systemd notify helper (READY=1, WATCHDOG=1)."""
import os
import socket


def notify(msg: str) -> None:
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return  # not running under systemd
    if addr.startswith("@"):
        addr = "\0" + addr[1:]  # abstract socket
    with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as s:
        s.connect(addr)
        s.sendall(msg.encode())
