from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from db import supabase
from auth import get_current_user_with_role

router = APIRouter(tags=["Feedback"])


class AddFeedbackRequest(BaseModel):
    simulation_id: str
    soft_skills_score: Optional[float] = None
    product_knowledge_score: Optional[float] = None
    objection_handling_score: Optional[float] = None
    overall_score: Optional[float] = None
    strengths: Optional[List[str]] = []
    improvements: Optional[List[str]] = []


@router.post("/add-feedback")
async def add_feedback(req: AddFeedbackRequest, current_user=Depends(get_current_user_with_role)):
    try:
        result = supabase.table("feedback").insert({
            "simulation_id": req.simulation_id,
            "soft_skills_score": req.soft_skills_score,
            "product_knowledge_score": req.product_knowledge_score,
            "objection_handling_score": req.objection_handling_score,
            "overall_score": req.overall_score,
            "strengths": req.strengths,
            "improvements": req.improvements,
        }).execute()

        if result.data:
            sim = supabase.table("simulations").select("trainee_id").eq("id", req.simulation_id).single().execute()
            if sim.data and req.overall_score is not None:
                trainee_id = sim.data["trainee_id"]
                sim_rows = supabase.table("simulations").select("id").eq("trainee_id", trainee_id).execute()
                sim_ids = [row["id"] for row in (sim_rows.data or []) if row.get("id")]
                if sim_ids:
                    feedback_rows = supabase.table("feedback").select("overall_score").in_("simulation_id", sim_ids).execute()
                    scores = [row["overall_score"] for row in (feedback_rows.data or []) if row.get("overall_score") is not None]
                    if scores:
                        avg = sum(scores) / len(scores)
                        existing = supabase.table("progress_tracking").select("*").eq("trainee_id", trainee_id).execute()
                        if existing.data:
                            supabase.table("progress_tracking").update({
                                "average_score": round(avg, 2),
                                "total_sessions": len(scores)
                            }).eq("trainee_id", trainee_id).execute()
                        else:
                            supabase.table("progress_tracking").insert({
                                "trainee_id": trainee_id,
                                "average_score": round(avg, 2),
                                "total_sessions": len(scores)
                            }).execute()

        return {"message": "Feedback added", "feedback": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/feedback/{simulation_id}")
async def get_feedback(simulation_id: str, current_user=Depends(get_current_user_with_role)):
    try:
        result = supabase.table("feedback").select("*").eq("simulation_id", simulation_id).execute()
        return {"feedback": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))