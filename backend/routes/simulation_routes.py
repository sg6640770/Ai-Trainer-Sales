from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db import supabase
from auth import get_current_user_with_role

router = APIRouter(tags=["Simulation"])


class StartSimulationRequest(BaseModel):
    persona: str
    language: str


class EndSimulationRequest(BaseModel):
    simulation_id: str


@router.post("/start-simulation")
async def start_simulation(req: StartSimulationRequest, current_user=Depends(get_current_user_with_role)):
    try:
        trainee = supabase.table("trainees").select("id").eq("user_id", current_user["id"]).single().execute()
        trainee_id = trainee.data["id"] if trainee.data else None

        result = supabase.table("simulations").insert({
            "trainee_id": trainee_id,
            "institute_id": current_user.get("institute_id"),
            "persona": req.persona,
            "language": req.language,
        }).execute()

        return {"message": "Simulation started", "simulation": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/end-simulation")
async def end_simulation(req: EndSimulationRequest, current_user=Depends(get_current_user_with_role)):
    try:
        from datetime import datetime, timezone
        result = supabase.table("simulations").update({
            "ended_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", req.simulation_id).execute()
        return {"message": "Simulation ended", "simulation": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/simulations/{trainee_id}")
async def get_simulations(trainee_id: str, current_user=Depends(get_current_user_with_role)):
    try:
        result = supabase.table("simulations").select("*").eq("trainee_id", trainee_id).order("started_at", desc=True).execute()
        return {"simulations": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))