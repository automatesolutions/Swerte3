from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.services.sheets_ingest import run_full_ingest

router = APIRouter(prefix="/internal", tags=["internal"])


def admin_guard(x_admin_key: str | None = Header(None, alias="X-Admin-Key")):
    key = get_settings().admin_api_key
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ADMIN_API_KEY not configured",
        )
    if not x_admin_key or x_admin_key != key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.post("/ingest")
def ingest_sheets(db: Session = Depends(get_db), _: None = Depends(admin_guard)):
    run = run_full_ingest(db)
    return {"ingestion_run_id": run.id, "inserted": run.rows_inserted, "skipped": run.rows_updated, "errors": run.errors}
