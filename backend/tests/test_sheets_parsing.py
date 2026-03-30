from datetime import datetime, timezone

from app.models.draw import DrawSession
from app.services.sheets_ingest import parse_draw_date, parse_result_cell, row_hash, session_for_tab
from app.config import Settings


def test_parse_result_cell_variants():
    assert parse_result_cell("1-2-3") == (1, 2, 3)
    assert parse_result_cell("123") == (1, 2, 3)
    assert parse_result_cell("0-0-0") == (0, 0, 0)
    assert parse_result_cell("12") is None
    assert parse_result_cell(123) == (1, 2, 3)


def test_parse_draw_date():
    dt = parse_draw_date("01/15/2024")
    assert dt is not None
    assert dt.year == 2024 and dt.month == 1 and dt.day == 15


def test_row_hash_stable():
    d = datetime(2024, 1, 1, tzinfo=timezone.utc)
    h1 = row_hash(DrawSession.nine_am, d, 1, 2, 3)
    h2 = row_hash(DrawSession.nine_am, d, 1, 2, 3)
    assert h1 == h2
    assert h1 != row_hash(DrawSession.four_pm, d, 1, 2, 3)


def test_session_for_tab_mapping():
    s = Settings(sheet_tab_9am="Nine AM", sheet_tab_4pm="4pm", sheet_tab_9pm="9PM")
    assert session_for_tab(s, "nine am") == DrawSession.nine_am
    assert session_for_tab(s, "4PM") == DrawSession.four_pm
