import pytest

from app.services.otp_service import normalize_phone


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("09171234567", "+639171234567"),
        (" 09171234567 ", "+639171234567"),
        ("9171234567", "+639171234567"),
        ("+63 917 123 4567", "+639171234567"),
        ("63-917-123-4567", "+639171234567"),
    ],
)
def test_normalize_phone_ph_mobile(raw, expected):
    assert normalize_phone(raw) == expected


def test_normalize_phone_rejects_short():
    assert normalize_phone("917123456") is None
    assert normalize_phone("") is None


def test_normalize_phone_int_coercion():
    assert normalize_phone(9171234567) == "+639171234567"
