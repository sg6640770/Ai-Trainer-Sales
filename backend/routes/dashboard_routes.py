from fastapi import APIRouter, HTTPException, Depends
from db import supabase
from auth import get_current_user_with_role

router = APIRouter(tags=["Dashboard"])


def compute_trainee_progress(trainee_id: str):
    sim_rows = supabase.table("simulations").select("id").eq("trainee_id", trainee_id).execute()
    sim_ids = [row["id"] for row in (sim_rows.data or []) if row.get("id")]
    if not sim_ids:
        return {"average_score": 0, "total_sessions": 0}
    feedback_rows = supabase.table("feedback").select("overall_score").in_("simulation_id", sim_ids).execute()
    scores = [row["overall_score"] for row in (feedback_rows.data or []) if row.get("overall_score") is not None]
    if not scores:
        return {"average_score": 0, "total_sessions": 0}
    return {"average_score": round(sum(scores) / len(scores), 2), "total_sessions": len(scores)}


@router.get("/trainee-dashboard/{trainee_id}")
async def trainee_dashboard(
    trainee_id: str,
    page: int = 1,
    limit: int = 10,
    current_user=Depends(get_current_user_with_role)
):
    try:
        page = max(page, 1)
        offset = (page - 1) * limit

        count_res = supabase.table("simulations").select("id", count="exact").eq("trainee_id", trainee_id).execute()
        total_sessions = count_res.count or 0
        simulations = supabase.table("simulations").select("*").eq("trainee_id", trainee_id).order("started_at", desc=True).range(offset, offset + limit - 1).execute()
        sim_ids = [s["id"] for s in (simulations.data or []) if s.get("id")]

        feedback_list = []
        for sid in sim_ids:
            fb = supabase.table("feedback").select("*").eq("simulation_id", sid).execute()
            if fb.data:
                feedback_list.append(fb.data[0])

        progress = supabase.table("progress_tracking").select("*").eq("trainee_id", trainee_id).execute()
        prog = progress.data[0] if progress.data else None
        if not prog or (prog.get("total_sessions", 0) == 0 and total_sessions > 0):
            prog = compute_trainee_progress(trainee_id)
        prog["total_sessions"] = total_sessions

        return {
            "simulations": simulations.data or [],
            "feedback": feedback_list,
            "progress": prog,
            "total_sessions": total_sessions,
            "page": page,
            "total_pages": (total_sessions + limit - 1) // limit
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/manager-dashboard/{institute_id}")
async def manager_dashboard(
    institute_id: str,
    trainee_page: int = 1,
    session_page: int = 1,
    limit: int = 5,
    current_user=Depends(get_current_user_with_role)
):
    if current_user["role"] not in ("manager", "admin") and current_user.get("institute_id") != institute_id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        trainee_page = max(trainee_page, 1)
        session_page = max(session_page, 1)
        trainee_offset = (trainee_page - 1) * limit
        session_offset = (session_page - 1) * limit

        trainees_res = supabase.table("trainees").select("*, users(id, name, email)", count="exact").eq("institute_id", institute_id).order("created_at", desc=True).range(trainee_offset, trainee_offset + limit - 1).execute()
        trainee_ids = [t["id"] for t in (trainees_res.data or [])]
        total_trainees = trainees_res.count or 0

        trainee_stats = []
        for t in (trainees_res.data or []):
            progress = supabase.table("progress_tracking").select("*").eq("trainee_id", t["id"]).execute()
            session_count = supabase.table("simulations").select("id", count="exact").eq("trainee_id", t["id"]).execute()
            actual_total_sessions = session_count.count or 0
            prog = progress.data[0] if progress.data else None
            if not prog or (prog.get("total_sessions", 0) == 0 and actual_total_sessions > 0):
                prog = compute_trainee_progress(t["id"])
            prog["total_sessions"] = actual_total_sessions
            trainee_stats.append({
                "trainee": t,
                "progress": prog
            })

        sessions = []
        total_sessions = 0
        if trainee_ids:
            sim_count = supabase.table("simulations").select("id", count="exact").in_("trainee_id", trainee_ids).execute()
            total_sessions = sim_count.count or 0
            sim_result = supabase.table("simulations").select("*").in_("trainee_id", trainee_ids).order("started_at", desc=True).range(session_offset, session_offset + limit - 1).execute()
            sessions = sim_result.data or []

        feedback_by_sim = {}
        if sessions:
            sim_ids = [s["id"] for s in sessions]
            fb_result = supabase.table("feedback").select("*").in_("simulation_id", sim_ids).execute()
            for fb in fb_result.data or []:
                feedback_by_sim[fb["simulation_id"]] = fb

        sessions = [
            {
                **s,
                "feedback": feedback_by_sim.get(s["id"]),
                "trainee": next((t for t in (trainees_res.data or []) if t["id"] == s["trainee_id"]), None)
            }
            for s in sessions
        ]

        institute = supabase.table("institutes").select("*").eq("id", institute_id).single().execute()

        return {
            "institute": institute.data,
            "trainees": trainee_stats,
            "sessions": sessions,
            "total_trainees": total_trainees,
            "trainee_page": trainee_page,
            "trainee_total_pages": (total_trainees + limit - 1) // limit,
            "total_sessions": total_sessions,
            "session_page": session_page,
            "session_total_pages": (total_sessions + limit - 1) // limit
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))