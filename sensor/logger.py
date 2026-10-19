"""Service: read the sensor every 5 s and store readings locally. Never touches the network."""
import os
import signal
import sys
import time

from .notify import notify
from .store import Store
from .tzone import BadData, NoResponse, PortMissing, TzoneSensor

INTERVAL = 5.0  # the sensor only updates every 30 s; reading faster shows quickly that it's still answering
DB_PATH = os.path.join(os.environ.get("STATE_DIRECTORY", "."), "readings.db")  # systemd sets STATE_DIRECTORY


def clock_synced() -> bool:
    return os.path.exists("/run/systemd/timesync/synchronized")  # touched on each NTP sync this boot


def main():
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))  # clean exit on systemctl stop
    store = Store(DB_PATH)
    sensor = TzoneSensor(port=os.environ.get("SENSOR_PORT", "/dev/rs485"),
                         address=int(os.environ.get("SENSOR_ADDRESS", "27")))
    store.add_event("logger_started")
    notify("READY=1")
    state, next_tick, next_cleanup = None, time.monotonic(), 0.0
    try:
        while True:
            try:
                store.add_reading(sensor.read(), clock_synced())
                new = "ok"
            except PortMissing:
                new = "port_missing"    # converter/cable problem
            except NoResponse:
                new = "sensor_silent"   # sensor power/wiring problem
            except BadData as e:
                print(f"bad data: {e}")
                new = state             # one bad frame doesn't change the state
            if new != state:            # log changes, not every reading
                print(f"state: {state} -> {new}")
                store.add_event(new)
                state = new
            notify("WATCHDOG=1")
            if time.monotonic() >= next_cleanup:
                store.cleanup()
                next_cleanup = time.monotonic() + 3600
            now = time.monotonic()                     # monotonic: immune to clock jumps
            next_tick = max(next_tick + INTERVAL, now)  # steady rhythm, no catch-up bursts after a slow read
            time.sleep(next_tick - now)
    finally:
        sensor.close()


if __name__ == "__main__":
    main()
