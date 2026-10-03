"""GCash return URLs: app schemes, https, and http only for the local web dev server."""
from app.routers.payments import _client_return_url_allowed


def test_allows_app_and_https_schemes():
    assert _client_return_url_allowed("swerte3://checkout-done")
    assert _client_return_url_allowed("https://swerte3.app/checkout-done")


def test_allows_http_only_for_localhost():
    assert _client_return_url_allowed("http://localhost:5173/checkout-done")
    assert _client_return_url_allowed("http://127.0.0.1:5173/checkout-done?status=cancelled")
    assert not _client_return_url_allowed("http://evil.example.com/checkout-done")
    assert not _client_return_url_allowed("javascript:alert(1)")
