from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from pydantic import BaseModel

from app.db.database import get_db

router = APIRouter(prefix="/api/targets", tags=["targets"])


def _ensure_table(db: Session) -> None:
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS sales_targets (
            id SERIAL PRIMARY KEY,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            company_no TEXT,
            scope TEXT NOT NULL DEFAULT 'all',
            target_tonnes NUMERIC(12,2) NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """))
    db.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS sales_targets_unique_idx
        ON sales_targets (year, month, COALESCE(company_no,''), COALESCE(scope,'all'))
    """))
    db.commit()


class TargetCreate(BaseModel):
    year: int
    month: int
    company_no: Optional[str] = None
    scope: str = "all"
    target_tonnes: float
    notes: Optional[str] = None


class TargetUpdate(BaseModel):
    target_tonnes: Optional[float] = None
    notes: Optional[str] = None


@router.get("")
def list_targets(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    _ensure_table(db)
    if year:
        rows = db.execute(
            text("SELECT * FROM sales_targets WHERE year = :year ORDER BY year, month, company_no"),
            {"year": year},
        ).mappings().fetchall()
    else:
        rows = db.execute(
            text("SELECT * FROM sales_targets ORDER BY year DESC, month, company_no")
        ).mappings().fetchall()
    return [dict(r) for r in rows]


@router.get("/period")
def get_period_target(
    year: int,
    month: int,
    company_no: Optional[str] = None,
    scope: str = "all",
    db: Session = Depends(get_db),
):
    _ensure_table(db)
    row = db.execute(text("""
        SELECT * FROM sales_targets
        WHERE year = :year AND month = :month
          AND COALESCE(company_no,'') = COALESCE(:company_no,'')
          AND scope = :scope
        LIMIT 1
    """), {"year": year, "month": month, "company_no": company_no or "", "scope": scope}
    ).mappings().fetchone()
    if not row:
        row = db.execute(text("""
            SELECT * FROM sales_targets
            WHERE year = :year AND month = :month AND company_no IS NULL AND scope = 'all'
            LIMIT 1
        """), {"year": year, "month": month}).mappings().fetchone()
    if not row:
        return None
    return dict(row)


@router.post("", status_code=201)
def create_target(body: TargetCreate, db: Session = Depends(get_db)):
    _ensure_table(db)
    try:
        row = db.execute(text("""
            INSERT INTO sales_targets (year, month, company_no, scope, target_tonnes, notes)
            VALUES (:year, :month, :company_no, :scope, :target_tonnes, :notes)
            ON CONFLICT (year, month, COALESCE(company_no,''), COALESCE(scope,'all'))
            DO UPDATE SET target_tonnes = EXCLUDED.target_tonnes,
                          notes = EXCLUDED.notes,
                          updated_at = NOW()
            RETURNING *
        """), body.model_dump()).mappings().fetchone()
        db.commit()
        return dict(row)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{target_id}")
def update_target(target_id: int, body: TargetUpdate, db: Session = Depends(get_db)):
    _ensure_table(db)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["target_id"] = target_id
    row = db.execute(
        text(f"UPDATE sales_targets SET {set_clause}, updated_at = NOW() WHERE id = :target_id RETURNING *"),
        updates,
    ).mappings().fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Target not found")
    db.commit()
    return dict(row)


@router.delete("/{target_id}", status_code=204)
def delete_target(target_id: int, db: Session = Depends(get_db)):
    _ensure_table(db)
    result = db.execute(
        text("DELETE FROM sales_targets WHERE id = :id"), {"id": target_id}
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Target not found")
