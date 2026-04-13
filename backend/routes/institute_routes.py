from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db import supabase
from auth import get_current_user_with_role

router = APIRouter(tags=["Institute"])


class InstituteRequest(BaseModel):
    institute_name: str
    manager_name: str
    manager_email: str


@router.post("/create-institute")
async def create_institute(req: InstituteRequest, current_user=Depends(get_current_user_with_role)):
    if current_user["role"] not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="Only managers can create institutes")
    try:
        result = supabase.table("institutes").insert({
            "institute_name": req.institute_name,
            "manager_name": req.manager_name,
            "manager_email": req.manager_email,
        }).execute()
        return {"message": "Institute created", "institute": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/institute/{id}")
async def get_institute(id: str, current_user=Depends(get_current_user_with_role)):
    try:
        result = supabase.table("institutes").select("*").eq("id", id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Institute not found")
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))