import asyncio
import json
import os
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from elevenlabs_agent import ElevenLabsAgentSession
from groq import AsyncGroq
from db import supabase
from routes.auth_routes import router as auth_router
from routes.institute_routes import router as institute_router
from routes.trainee_routes import router as trainee_router
from routes.simulation_routes import router as simulation_router
from routes.conversation_routes import router as conversation_router
from routes.feedback_routes import router as feedback_router
from routes.dashboard_routes import router as dashboard_router

load_dotenv()

print("=== ENV CHECK ===")
print(f"ELEVENLABS_API_KEY: {os.getenv('ELEVENLABS_API_KEY')[:10] if os.getenv('ELEVENLABS_API_KEY') else 'MISSING'}")
print(f"ELEVENLABS_AGENT_ID: {os.getenv('ELEVENLABS_AGENT_ID') or 'MISSING'}")
print(f"GROQ_API_KEY: {'SET' if os.getenv('GROQ_API_KEY') else 'MISSING'}")
print(f"SIMLI_API_KEY: {'SET' if os.getenv('SIMLI_API_KEY') else 'MISSING'}")
print(f"SUPABASE_URL: {'SET' if os.getenv('SUPABASE_URL') else 'MISSING'}")
print("=================")

app = FastAPI(title="AI Sales Trainer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,         prefix="/api")
app.include_router(institute_router,    prefix="/api")
app.include_router(trainee_router,      prefix="/api")
app.include_router(simulation_router,   prefix="/api")
app.include_router(conversation_router, prefix="/api")
app.include_router(feedback_router,     prefix="/api")
app.include_router(dashboard_router,    prefix="/api")


async def safe_send(ws: WebSocket, data: dict):
    try:
        await ws.send_json(data)
    except Exception:
        pass


# ── Direct Supabase helpers (no auth needed — called internally) ──────────────

def db_start_simulation(trainee_id: str, institute_id: str, persona: str, language: str) -> str | None:
    """Insert a simulation row and return its id."""
    try:
        result = supabase.table("simulations").insert({
            "trainee_id": trainee_id,
            "institute_id": institute_id,
            "persona": persona,
            "language": language,
        }).execute()
        if result.data:
            sim_id = result.data[0]["id"]
            print(f"[DB] Simulation started: {sim_id}")
            return sim_id
    except Exception as e:
        print(f"[DB] start_simulation error: {e}")
    return None


def db_add_message(simulation_id: str, sender: str, message: str):
    """Insert a conversation message row."""
    print(f"[DB] add_message called: sender={sender}, message_len={len(message)}, sim_id={simulation_id}")
    
    normalized = (sender or "").strip().lower()
    if normalized in ("assistant", "agent", "bot", "ai", "ai persona"):
        sender = "assistant"
    elif normalized == "user":
        sender = "user"
    else:
        print(f"[DB] Unknown sender role: {sender}, treating as assistant")
        sender = "assistant"
    
    try:
        result = supabase.table("conversation_messages").insert({
            "simulation_id": simulation_id,
            "sender": sender,
            "message": message,
        }).execute()
        print(f"[DB] Message saved successfully: sender={sender}, count={len(result.data) if result.data else 0}")
    except Exception as e:
        import traceback
        print(f"[DB] add_message error: {e}")
        print(traceback.format_exc())


def db_end_simulation(simulation_id: str):
    """Stamp ended_at on the simulation row."""
    try:
        supabase.table("simulations").update({
            "ended_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", simulation_id).execute()
    except Exception as e:
        print(f"[DB] end_simulation error: {e}")


def db_add_feedback(simulation_id: str, feedback: dict):
    """Insert feedback row and update progress_tracking."""
    try:
        scores = feedback.get("scores", {})
        overall = feedback.get("overall_readiness", 0)
        strengths = feedback.get("strengths", [])
        improvements = feedback.get("improvements", [])
        summary = feedback.get("summary", "")

        result = supabase.table("feedback").insert({
            "simulation_id": simulation_id,
            "soft_skills_score":          int(round(scores.get("empathy_rapport", 0))) if scores.get("empathy_rapport") is not None else None,
            "product_knowledge_score":    int(round(scores.get("product_knowledge", 0))) if scores.get("product_knowledge") is not None else None,
            "objection_handling_score":   int(round(scores.get("objection_handling", 0))) if scores.get("objection_handling") is not None else None,
            "communication_clarity_score": int(round(scores.get("communication_clarity", 0))) if scores.get("communication_clarity") is not None else None,
            "closing_technique_score":    int(round(scores.get("closing_technique", 0))) if scores.get("closing_technique") is not None else None,
            "overall_score":              int(round(overall)) if overall is not None else None,
            "strengths":                  strengths,
            "improvements":               improvements,
            "summary":                    summary,
        }).execute()
        print(f"[DB] Feedback saved for simulation: {simulation_id}")

        # ── Update progress_tracking ─────────────────────────────────────────
        sim = supabase.table("simulations").select("trainee_id").eq("id", simulation_id).single().execute()
        if sim.data:
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
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"[DB] add_feedback error: {e}")
    return None


# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/simli-config")
async def simli_config():
    return {
        "apiKey": os.getenv("SIMLI_API_KEY", ""),
        "faceId": os.getenv("SIMLI_FACE_ID", "")
    }


@app.websocket("/ws/session")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    session: ElevenLabsAgentSession | None = None
    transcript = []
    simulation_id: str | None = None

    try:
        # Step 1 — receive config
        raw_config = await asyncio.wait_for(ws.receive_text(), timeout=10)
        config = json.loads(raw_config)
        persona      = config.get("persona", "parent")
        language     = config.get("language", "hinglish")
        trainee_id   = config.get("trainee_id")    # frontend must send this
        institute_id = config.get("institute_id")  # frontend must send this

        print(f"New session → persona={persona}, language={language}, trainee={trainee_id}")
        await safe_send(ws, {"type": "status", "message": "Connecting to AI agent..."})

        # ── Save simulation start ─────────────────────────────────────────────
        if trainee_id and institute_id:
            simulation_id = db_start_simulation(trainee_id, institute_id, persona, language)
            if simulation_id:
                await safe_send(ws, {"type": "simulation_id", "simulation_id": simulation_id})
        else:
            print("[WARN] trainee_id or institute_id missing — simulation NOT saved to DB")

        # Step 2 — create ElevenLabs session
        loop = asyncio.get_event_loop()

        def on_audio(audio_b64):
            asyncio.run_coroutine_threadsafe(
                safe_send(ws, {"type": "agent_audio", "audio": audio_b64}),
                loop
            )

        def on_transcript(role, text):
            print(f"[TRANSCRIPT] role={role}, text={text[:60]}...")
            transcript.append({"role": role, "content": text})
            asyncio.run_coroutine_threadsafe(
                safe_send(ws, {"type": "transcript", "role": role, "text": text}),
                loop
            )
            # ── Save each message to DB ───────────────────────────────────────
            if simulation_id:
                print(f"[DB] Saving message to DB for simulation {simulation_id}")
                db_add_message(simulation_id, role, text)
            else:
                print(f"[DB] WARNING: simulation_id is None, cannot save message")

        def on_status(msg):
            asyncio.run_coroutine_threadsafe(
                safe_send(ws, {"type": "status", "message": msg}),
                loop
            )

        session = ElevenLabsAgentSession(
            on_agent_audio=on_audio,
            on_transcript=on_transcript,
            on_status=on_status
        )

        await session.connect()

        # Step 3 — notify frontend ready
        await safe_send(ws, {
            "type": "session_ready",
            "message": "Ready — please speak first"
        })

        # Step 4 — main message loop
        while True:
            msg = await ws.receive()

            if msg["type"] == "websocket.disconnect":
                print("Client disconnected")
                break

            # Binary audio from mic — forward to ElevenLabs as PCM
            if "bytes" in msg and msg["bytes"]:
                await session.send_audio(msg["bytes"])

            # Text control commands
            elif "text" in msg and msg["text"]:
                try:
                    data = json.loads(msg["text"])
                    cmd = data.get("type", "")

                    if cmd == "interrupt":
                        await session.interrupt()

                    elif cmd == "end_session":
                        await safe_send(ws, {
                            "type": "status",
                            "message": "Generating feedback..."
                        })
                        feedback = await generate_feedback(transcript, persona)

                        # ── Save feedback + close simulation in DB ────────────
                        if simulation_id:
                            db_add_feedback(simulation_id, feedback)
                            db_end_simulation(simulation_id)

                        await safe_send(ws, {
                            "type": "session_feedback",
                            "feedback": feedback
                        })
                        break

                    elif cmd == "ping":
                        await safe_send(ws, {"type": "pong"})

                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        print("WebSocket disconnected")
        # ── Still close simulation if client disconnects mid-session ──────────
        if simulation_id:
            db_end_simulation(simulation_id)
    except asyncio.TimeoutError:
        await safe_send(ws, {"type": "error", "message": "Connection timeout"})
    except Exception as e:
        import traceback
        print(f"Session error: {e}")
        print(traceback.format_exc())
        await safe_send(ws, {"type": "error", "message": str(e)})
    finally:
        if session:
            await session.close()
        print("Session cleaned up")


async def generate_feedback(transcript: list, persona: str) -> dict:
    """Generate post-session feedback using Groq"""
    if not transcript:
        return {
            "scores": {},
            "strengths": [],
            "improvements": [],
            "overall_readiness": 0,
            "summary": "No conversation recorded."
        }
    try:
        client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
        formatted = "\n".join([
            f"{t['role'].upper()}: {t['content']}"
            for t in transcript
        ])
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=1024,
            temperature=0.3,
            messages=[{
                "role": "user",
                "content": f"""You are an expert sales coach. Evaluate this trainee counsellor 
conversation with an AI persona ({persona}).

Return ONLY valid JSON, no explanation, no markdown, no backticks:
{{
  "scores": {{
    "objection_handling": <0-10>,
    "product_knowledge": <0-10>,
    "empathy_rapport": <0-10>,
    "communication_clarity": <0-10>,
    "closing_technique": <0-10>
  }},
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "key_moments": ["moment 1", "moment 2"],
  "overall_readiness": <0-10>,
  "summary": "2-3 sentence summary of performance"
}}

Transcript:
{formatted}"""
            }]
        )
        raw = response.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception as e:
        import traceback
        print(f"Feedback error: {e}")
        print(traceback.format_exc())
        return {
            "scores": {},
            "strengths": [],
            "improvements": [],
            "overall_readiness": 0,
            "summary": "Could not generate feedback."
        }


FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("ws/") or full_path == "health":
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))