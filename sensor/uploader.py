"""Service: send unsent rows to the cloud, oldest first. Being offline is just a state it waits out."""
import os
import signal
import sys
import time

import requests

from .notify import notify
from .store import Store

URL = os.environ["INGEST_URL"]
TOKEN = os.environ["INGEST_TOKEN"]
DEVICE_ID = os.environ["DEVICE_ID"]
DB_PATH = os.path.join(os.environ.get("STATE_DIRECTORY", "."), "readings.db")

BATCH = 200          # rows per request
SEND_EVERY = 5.0     # normal upload interval (s)
HEARTBEAT = 10.0     # post even with no data, so the server knows the Pi is alive
MIN_DELAY, MAX_DELAY = 5.0, 10.0  # retry backoff range (s)


def wait(seconds: float):
    """Sleep in short steps, still feeding the systemd watchdog."""
    end = time.monotonic() + seconds
    while (left := end - time.monotonic()) > 0:
        notify("WATCHDOG=1")
        time.sleep(min(5.0, left))


def main():
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    store = Store(DB_PATH)
    http = requests.Session()
    http.headers["Authorization"] = f"Bearer {TOKEN}"
    notify("READY=1")
    delay, last_post = MIN_DELAY, -HEARTBEAT

    while True:
        notify("WATCHDOG=1")
        readings, events = store.unsent("readings", BATCH), store.unsent("events", BATCH)
        if not readings and not events and time.monotonic() - last_post < HEARTBEAT:
            wait(SEND_EVERY)
            continue

        try:
            resp = http.post(URL, timeout=(5, 20),  # always time out: requests waits forever by default
                             json={"device_id": DEVICE_ID, "readings": readings, "events": events})
        except requests.RequestException as e:
            resp, why = None, type(e).__name__  # no network, DNS, TLS, timeout...

        if resp is not None and resp.ok:
            store.mark_uploaded("readings", [r["id"] for r in readings])  # only after the server confirms
            store.mark_uploaded("events", [e["id"] for e in events])
            if delay > MIN_DELAY:
                print("back online")
            delay, last_post = MIN_DELAY, time.monotonic()
            if len(readings) == BATCH:
                continue           # backlog: send the next batch straight away
            wait(SEND_EVERY)
        else:
            why = why if resp is None else f"HTTP {resp.status_code}"
            print(f"upload failed ({why}), retry in {delay:.0f} s")
            wait(delay)
            delay = min(delay * 2, MAX_DELAY)  # back off: 5 s, then every 10 s


if __name__ == "__main__":
    main()
