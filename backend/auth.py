from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from db import supabase

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = credentials.credentials
    try:
        response = supabase.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return response.user
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def get_current_user_with_role(user=Depends(get_current_user)):
    try:
        result = supabase.table("users").select("*").eq("auth_id", user.id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User profile not found")

        user_data = result.data

        # Attach trainee_id if role is trainee
        trainee_id = None
        if user_data.get("role") == "trainee":
            trainee_result = supabase.table("trainees").select("id").eq("user_id", user_data["id"]).execute()
            if trainee_result.data:
                trainee_id = trainee_result.data[0]["id"]
        user_data["trainee_id"] = trainee_id

        return user_data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))