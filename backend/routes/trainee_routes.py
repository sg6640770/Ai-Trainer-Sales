from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db import supabase
from auth import get_current_user_with_role

router = APIRouter(tags=["Trainee"])


class TraineeRequest(BaseModel):
    user_id: str
    institute_id: str


@router.post("/create-trainee")
async def create_trainee(req: TraineeRequest, current_user=Depends(get_current_user_with_role)):
    if current_user["role"] not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="Only managers can create trainees")
    try:
        result = supabase.table("trainees").insert({
            "user_id": req.user_id,
            "institute_id": req.institute_id,
        }).execute()
        return {"message": "Trainee created", "trainee": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trainees/{institute_id}")
async def get_trainees(institute_id: str, current_user=Depends(get_current_user_with_role)):
    if current_user["role"] not in ("manager", "admin") and current_user["institute_id"] != institute_id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        result = supabase.table("trainees").select("*, users(id, name, email, role)").eq("institute_id", institute_id).execute()
        return {"trainees": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))