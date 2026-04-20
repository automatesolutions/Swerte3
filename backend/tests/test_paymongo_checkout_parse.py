"""Regression: PayMongo GET checkout session returns payments without JSON:API ``data`` wrapper."""
from app.services.paymongo import extract_paid_payment_from_checkout_session_data


def test_extract_payment_flat_shape_from_docs():
    """Matches developers.paymongo.com Checkout Session Resource example."""
    session = {
        "id": "cs_test",
        "type": "checkout_session",
        "attributes": {
            "payments": [
                {
                    "id": "pay_gPSJ6SB24SVEa5hH8LrXBtd4",
                    "type": "payment",
                    "attributes": {
                        "amount": 180000,
                        "status": "paid",
                        "currency": "PHP",
                    },
                }
            ]
        },
    }
    row = extract_paid_payment_from_checkout_session_data(session)
    assert row is not None
    pid, centavos, st = row
    assert pid == "pay_gPSJ6SB24SVEa5hH8LrXBtd4"
    assert centavos == 180000
    assert st == "paid"


def test_extract_payment_webhook_wrapped_shape():
    session = {
        "id": "cs_test",
        "type": "checkout_session",
        "attributes": {
            "payments": [
                {
                    "data": {
                        "id": "pay_wrapped",
                        "type": "payment",
                        "attributes": {"amount": 2000, "status": "paid"},
                    }
                }
            ]
        },
    }
    row = extract_paid_payment_from_checkout_session_data(session)
    assert row is not None
    assert row[0] == "pay_wrapped"
    assert row[1] == 2000


def test_extract_prefers_paid_in_list():
    session = {
        "id": "cs_test",
        "type": "checkout_session",
        "attributes": {
            "payments": [
                {"id": "pay_a", "type": "payment", "attributes": {"amount": 2000, "status": "pending"}},
                {"id": "pay_b", "type": "payment", "attributes": {"amount": 2000, "status": "paid"}},
            ]
        },
    }
    row = extract_paid_payment_from_checkout_session_data(session)
    assert row is not None
    assert row[0] == "pay_b"
