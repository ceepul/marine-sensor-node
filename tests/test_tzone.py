"""Driver tests with a fake instrument: no hardware needed. Run: pytest"""
import minimalmodbus
import pytest
import serial

from sensor import tzone


class FakeInstrument:
    def __init__(self, *results):
        self.results = list(results)  # each item: register list, or an exception to raise
        self.serial = type("S", (), {"close": lambda self: None})()

    def read_registers(self, *_, **__):
        r = self.results.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def sensor_with(*results):
    s = tzone.TzoneSensor()
    s._inst = FakeInstrument(*results)
    return s


def test_scaling():
    r = sensor_with([223, 852]).read()
    assert (r.temp_c, r.rh_pct) == (22.3, 85.2)


def test_negative_temperature():
    assert sensor_with([65535 - 49, 500]).read().temp_c == -5.0  # 0xFFCE = -50 -> -5.0 C


def test_out_of_range_is_rejected():
    with pytest.raises(tzone.BadData):
        sensor_with([223, 1500]).read()  # 150 %RH is impossible


def test_one_dropped_frame_is_retried():
    assert sensor_with(minimalmodbus.NoResponseError("x"), [223, 500]).read().temp_c == 22.3


def test_silent_sensor():
    with pytest.raises(tzone.NoResponse):
        sensor_with(minimalmodbus.NoResponseError("x"), minimalmodbus.NoResponseError("x")).read()


def test_corrupt_frames():
    bad = minimalmodbus.InvalidResponseError("crc")
    with pytest.raises(tzone.BadData):
        sensor_with(bad, bad).read()


def test_unplugged_converter_closes_port():
    s = sensor_with(serial.SerialException("gone"))
    with pytest.raises(tzone.PortMissing):
        s.read()
    assert s._inst is None  # reopened on the next read
