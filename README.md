# marine-sensor-node

A Raspberry Pi reads an RS485 Modbus sensor, buffers the readings locally and uploads them to a live web dashboard.

- **Pi (`sensor/`).** `sensor-logger` reads the sensor every 5 s into SQLite. `sensor-uploader` posts unsent rows to the dashboard and only marks them as sent once the server confirms. Both run as systemd services, with restarts and a watchdog. They recover from a converter unplug, sensor power loss, internet outages and power cuts without losing data.
- **Web (`web/`).** A Next.js dashboard on Vercel with live node and sensor status, history charts and a log.

## Hardware

| Part | Notes |
| --- | --- |
| Raspberry Pi with Raspberry Pi OS Lite | Tested on a Pi 1 B+ |
| Waveshare USB to RS485 converter (FTDI) | Plugs into the Pi's USB |
| Tzone RS485 temperature/humidity transmitter | Modbus RTU, address 27, 9600 8N1 |
| DC power supply for the sensor |

## 1. Set up the Pi

Flash Raspberry Pi OS Lite with Raspberry Pi Imager (enable SSH, and set the user, hostname and Wi-Fi). Then SSH in:

```bash
sudo apt update && sudo apt install -y git sqlite3 mbpoll
git clone https://github.com/ceepul/marine-sensor-node.git ~/marine-sensor-node
cd ~/marine-sensor-node
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest -q
```

Give the converter a fixed name, `/dev/rs485`, so it stays the same after a replug or reboot. Replace `<SERIAL>` with the serial shown by `ls /dev/serial/by-id/`:

```bash
echo 'SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", ATTRS{serial}=="<SERIAL>", SYMLINK+="rs485"' \
  | sudo tee /etc/udev/rules.d/99-rs485.rules
sudo udevadm control --reload && sudo udevadm trigger
mbpoll -m rtu -0 -a 27 -b 9600 -P none -t 4 -r 0 -c 2 -1 /dev/rs485   # e.g. 223, 852 = 22.3 °C, 85.2 %RH
```

If your sensor uses a different address, add `Environment=SENSOR_ADDRESS=<n>` to `deploy/sensor-logger.service`.

## 2. Deploy the dashboard

1. Import this repo into Vercel and set **Root Directory** to `web`.
2. Add an environment variable `INGEST_TOKEN`. Any long random string works.
3. Add the **Turso** integration with the env prefix `DATABASE`. The tables are created on first use.
4. Set the node's location in `web/config/sites.ts`, keyed by its `DEVICE_ID`. The forecast and the time zone come from this.
5. Deploy.

## 3. Connect the Pi

```bash
sudo mkdir -p /etc/sensor
sudo nano /etc/sensor/uploader.env
```

```ini
INGEST_URL=https://<project>.vercel.app/api/ingest
INGEST_TOKEN=<same value as on Vercel>
DEVICE_ID=marine-node-01
```

```bash
sudo chmod 600 /etc/sensor/uploader.env
sudo cp deploy/sensor-logger.service deploy/sensor-uploader.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sensor-logger sensor-uploader
```

Readings appear on the dashboard within a few seconds.

## Without hardware

```bash
cd web
npm install
npm run dev        # http://localhost:3000, stores data in a local SQLite file
npm run simulate   # fake node: 24 h of history, then a live reading every 5 s
npm test
```

See [`web/README.md`](web/README.md) for the API, configuration, and how status and condensation risk are worked out.

## Layout

```
sensor/   tzone.py (Modbus driver), logger.py, uploader.py, store.py (SQLite buffer), notify.py (systemd)
deploy/   systemd units
tests/    driver tests with a fake sensor
web/      Next.js dashboard and ingest API
```
