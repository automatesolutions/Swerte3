"""Google Sheets CSV ingest for Swertres draws."""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from io import StringIO
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import httpx
import pandas as pd

from app.config import Settings, get_settings
from app.models.draw import Draw, DrawSession, IngestionRun
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

def _normalize_tab_key(tab: str) -> str:
    return tab.strip().upper().replace(" ", "")


def session_for_tab(settings: Settings, tab_name: str) -> Optional[DrawSession]:
    """Map configured tab names to DrawSession."""
    n = _normalize_tab_key(tab_name)
    m = {
        _normalize_tab_key(settings.sheet_tab_9am): DrawSession.nine_am,
        _normalize_tab_key(settings.sheet_tab_4pm): DrawSession.four_pm,
        _normalize_tab_key(settings.sheet_tab_9pm): DrawSession.nine_pm,
    }
    return m.get(n)


def sheet_csv_url(sheet_id: str, tab: str) -> str:
    return (
        f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={quote(tab, safe='')}"
    )


def parse_result_cell(value: str) -> Optional[Tuple[int, int, int]]:
    """Parse values like '1-2-3', '123', '1,2,3' into three digits 0-9."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if float(value).is_integer() and 0 <= int(value) <= 999:
            s = f"{int(value):03d}"
        else:
            s = str(value).strip()
    else:
        s = str(value).strip()
    if not s:
        return None
    digits = []
    if re.fullmatch(r"\d{3}", s):
        return int(s[0]), int(s[1]), int(s[2])
    for part in re.split(r"[-,\s]+", s):
        part = part.strip()
        if not part:
            continue
        if len(part) == 1 and part.isdigit():
            digits.append(int(part))
        elif len(part) == 3 and part.isdigit():
            digits.extend(int(c) for c in part)
        else:
            try:
                digits.append(int(part))
            except ValueError:
                continue
        if len(digits) >= 3:
            break
    if len(digits) != 3:
        return None
    for d in digits:
        if d < 0 or d > 9:
            return None
    return digits[0], digits[1], digits[2]


def parse_draw_date(value: Any) -> Optional[datetime]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=value.tzinfo or timezone.utc)
    s = str(value).strip()
    if not s:
        return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        return pd.to_datetime(s, utc=True).to_pydatetime()
    except Exception:
        logger.warning("Could not parse date: %s", s)
        return None


def row_hash(session: DrawSession, draw_at: datetime, d1: int, d2: int, d3: int) -> str:
    raw = f"{session.value}|{draw_at.isoformat()}|{d1}{d2}{d3}"
    return hashlib.sha256(raw.encode()).hexdigest()


def fetch_sheet_dataframe(settings: Settings, tab: str) -> pd.DataFrame:
    url = sheet_csv_url(settings.google_sheet_id, tab)
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
    return pd.read_csv(StringIO(r.text))


def ingest_tab(
    db: Session,
    settings: Settings,
    tab_name: str,
) -> Tuple[int, int, List[str]]:
    """Returns (inserted, skipped_or_seen, errors)."""
    session = session_for_tab(settings, tab_name)
    if not session:
        return 0, 0, [f"Unknown tab mapping for {tab_name!r}"]

    try:
        df = fetch_sheet_dataframe(settings, tab_name)
    except Exception as e:
        logger.exception("Sheet fetch failed for %s", tab_name)
        return 0, 0, [str(e)]

    date_col = settings.sheet_col_date
    res_col = settings.sheet_col_result
    if date_col not in df.columns or res_col not in df.columns:
        return 0, 0, [f"Missing columns need {date_col!r} and {res_col!r}; got {list(df.columns)}"]

    inserted = 0
    skipped = 0
    for _, row in df.iterrows():
        triple = parse_result_cell(row.get(res_col))
        draw_at = parse_draw_date(row.get(date_col))
        if not triple or not draw_at:
            skipped += 1
            continue
        d1, d2, d3 = triple
        h = row_hash(session, draw_at, d1, d2, d3)
        exists = db.query(Draw).filter(Draw.source_row_hash == h).first()
        if exists:
            skipped += 1
            continue
        db.add(
            Draw(
                session=session,
                draw_at=draw_at,
                digit_1=d1,
                digit_2=d2,
                digit_3=d3,
                source_row_hash=h,
                raw_result=str(row.get(res_col)),
            )
        )
        inserted += 1
    return inserted, skipped, []


def run_full_ingest(db: Session, settings: Optional[Settings] = None) -> IngestionRun:
    settings = settings or get_settings()
    run = IngestionRun()
    db.add(run)
    db.flush()
    errs: List[str] = []
    for tab in (settings.sheet_tab_9am, settings.sheet_tab_4pm, settings.sheet_tab_9pm):
        ins, skip, e = ingest_tab(db, settings, tab)
        run.rows_inserted += ins
        run.rows_updated += skip
        errs.extend(e)
    run.finished_at = datetime.now(timezone.utc)
    if errs:
        run.errors = "; ".join(errs)[:4000]
    db.commit()
    db.refresh(run)
    return run