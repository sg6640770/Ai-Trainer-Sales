from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from db import supabase
from auth import get_current_user_with_role

router = APIRouter(tags=["Conversation"])


class AddMessageRequest(BaseModel):
    simulation_id: str
    sender: str
    message: str


@router.post("/add-message")
async def add_message(req: AddMessageRequest, current_user=Depends(get_current_user_with_role)):
    try:
        result = supabase.table("conversation_messages").insert({
            "simulation_id": req.simulation_id,
            "sender": req.sender,
            "message": req.message,
        }).execute()
        return {"message": "Message added", "data": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/messages/{simulation_id}")
async def get_messages(simulation_id: str, current_user=Depends(get_current_user_with_role)):
    try:
        result = supabase.table("conversation_messages").select("*").eq("simulation_id", simulation_id).order("created_at").execute()
        messages = result.data or []
        print(f"[API] get_messages for {simulation_id}: returned {len(messages)} messages")
        for msg in messages:
            print(f"  - sender: {msg.get('sender')}, text: {msg.get('message', '')[:50]}...")
        return {"messages": messages}
    except Exception as e:
        import traceback
        print(f"[API] get_messages error: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))