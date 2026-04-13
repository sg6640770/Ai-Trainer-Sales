from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from db import supabase

router = APIRouter(tags=["Auth"])


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str = "trainee"
    institute_id: Optional[str] = None
    institute_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/signup")
async def signup(req: SignupRequest):
    auth_user_id = None
    institute_id = req.institute_id

    try:
        existing = supabase.table("users").select("id").eq("email", req.email).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="User already registered")

        auth_resp = supabase.auth.sign_up({"email": req.email, "password": req.password})

        if not auth_resp.user:
            raise HTTPException(status_code=400, detail="Signup failed")

        if auth_resp.user.identities is not None and len(auth_resp.user.identities) == 0:
            raise HTTPException(status_code=400, detail="User already registered")

        auth_user_id = auth_resp.user.id

        if req.role == "manager" and req.institute_name:
            inst = supabase.table("institutes").insert({
                "institute_name": req.institute_name,
                "manager_name": req.name,
                "manager_email": req.email,
            }).execute()
            if not inst.data:
                raise Exception("Failed to create institute")
            institute_id = inst.data[0]["id"]

        user_data = {
            "auth_id": auth_user_id,
            "email": req.email,
            "name": req.name,
            "role": req.role,
            "institute_id": institute_id,
        }
        result = supabase.table("users").insert(user_data).execute()
        if not result.data:
            raise Exception("Failed to insert user record")

        trainee_id = None
        if req.role == "trainee" and institute_id:
            trainee_result = supabase.table("trainees").insert({
                "user_id": result.data[0]["id"],
                "institute_id": institute_id
            }).execute()
            if trainee_result.data:
                trainee_id = trainee_result.data[0]["id"]

        user_out = result.data[0]
        user_out["trainee_id"] = trainee_id

        return {
            "message": "Signup successful",
            "user": user_out,
            "session": auth_resp.session.model_dump() if auth_resp.session else None
        }

    except HTTPException:
        if auth_user_id:
            try:
                supabase.auth.admin.delete_user(auth_user_id)
            except Exception:
                pass
        raise

    except Exception as e:
        if auth_user_id:
            try:
                supabase.auth.admin.delete_user(auth_user_id)
            except Exception:
                pass
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login(req: LoginRequest):
    try:
        auth_resp = supabase.auth.sign_in_with_password({"email": req.email, "password": req.password})
        if not auth_resp.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        user_result = supabase.table("users").select("*").eq("auth_id", auth_resp.user.id).single().execute()
        if not user_result.data:
            raise HTTPException(status_code=404, detail="User profile not found")

        user_data = user_result.data

        # Fetch trainee_id if role is trainee
        trainee_id = None
        if user_data.get("role") == "trainee":
            trainee_result = supabase.table("trainees").select("id").eq("user_id", user_data["id"]).execute()
            if trainee_result.data:
                trainee_id = trainee_result.data[0]["id"]

        user_data["trainee_id"] = trainee_id

        return {
            "message": "Login successful",
            "user": user_data,
            "session": auth_resp.session.model_dump() if auth_resp.session else None,
            "access_token": auth_resp.session.access_token if auth_resp.session else None
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))