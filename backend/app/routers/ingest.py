from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import admin_guard
from app.services.sheets_ingest import run_full_ingest

router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/ingest")
def ingest_sheets(db: Session = Depends(get_db), _: None = Depends(admin_guard)):
    run = run_full_ingest(db)
    return {"ingestion_run_id": run.id, "inserted": run.rows_inserted, "skipped": run.rows_updated, "errors": run.errors}
