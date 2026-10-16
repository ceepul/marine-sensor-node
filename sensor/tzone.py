"""Driver for the Tzone RS485 temperature/humidity transmitter (Modbus RTU)."""
import time
from dataclasses import dataclass

import minimalmodbus
import serial

try:
    import termios  # Linux/macOS only
    _PORT_ERRORS = (serial.SerialException, OSError, termios.error)
except ImportError:  # Windows: keep the tests runnable
    _PORT_ERRORS = (serial.SerialException, OSError)

REG_TEMP, REG_RH = 0, 1     # register map (swap if the breath test disagrees)
TEMP_RANGE = (-40.0, 80.0)  # rated range: check against the manual
RH_RANGE = (0.0, 100.0)


@dataclass
class Reading:
    ts: float       # UTC seconds since 1970
    temp_c: float
    rh_pct: float


class SensorError(Exception): pass
class PortMissing(SensorError): pass   # converter unplugged
class NoResponse(SensorError): pass    # port fine, sensor silent (power/wiring)
class BadData(SensorError): pass       # corrupt frame or impossible values


def _signed(v: int) -> int:
    return v - 65536 if v > 32767 else v  # two's complement for sub-zero temps


class TzoneSensor:
    def __init__(self, port="/dev/rs485", address=27, baud=9600, timeout=0.5):
        self.port, self.address, self.baud, self.timeout = port, address, baud, timeout
        self._inst = None

    def _instrument(self):
        if self._inst is None:  # open lazily: a missing port is retried next call
            inst = minimalmodbus.Instrument(self.port, self.address)
            inst.serial.baudrate = self.baud
            inst.serial.timeout = self.timeout
            self._inst = inst
        return self._inst

    def close(self):
        if self._inst is not None:
            try:
                self._inst.serial.close()
            except Exception:
                pass  # port may already be gone
            self._inst = None

    def read(self) -> Reading:
        err = None
        for _ in range(2):  # one retry: a single dropped frame is normal
            try:
                regs = self._instrument().read_registers(0, 2, functioncode=3)
                return self._validate(regs)
            except minimalmodbus.NoResponseError as e:  # check Modbus errors first:
                err = NoResponse(str(e))                # they also subclass OSError
            except minimalmodbus.ModbusException as e:
                err = BadData(str(e))
            except _PORT_ERRORS as e:  # termios.error: device yanked while port open
                self.close()
                raise PortMissing(str(e)) from e  # no point retrying a missing port
        raise err

    def _validate(self, regs) -> Reading:
        temp = _signed(regs[REG_TEMP]) / 10
        rh = regs[REG_RH] / 10
        if not (TEMP_RANGE[0] <= temp <= TEMP_RANGE[1] and RH_RANGE[0] <= rh <= RH_RANGE[1]):
            raise BadData(f"out of range: {temp} C, {rh} %")  # impossible: never stored
        return Reading(time.time(), temp, rh)
