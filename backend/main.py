import asyncio
import json
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from elevenlabs_agent import ElevenLabsAgentSession
import anthropic

load_dotenv()

print("=== ENV CHECK ===")
print(f"ELEVENLABS_API_KEY: {os.getenv('ELEVENLABS_API_KEY')[:10] if os.getenv('ELEVENLABS_API_KEY') else 'MISSING'}")
print(f"ELEVENLABS_AGENT_ID: {os.getenv('ELEVENLABS_AGENT_ID') or 'MISSING'}")
print(f"ANTHROPIC_API_KEY: {'SET' if os.getenv('ANTHROPIC_API_KEY') else 'MISSING'}")
print(f"SIMLI_API_KEY: {'SET' if os.getenv('SIMLI_API_KEY') else 'MISSING'}")
print("=================")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def safe_send(ws: WebSocket, data: dict):
    try:
        await ws.send_json(data)
    except Exception:
        pass


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

    try:
        # Step 1 — receive config
        raw_config = await asyncio.wait_for(ws.receive_text(), timeout=10)
        config = json.loads(raw_config)
        persona = config.get("persona", "parent")
        language = config.get("language", "hinglish")

        print(f"New session → persona={persona}, language={language}")
        await safe_send(ws, {"type": "status", "message": "Connecting to AI agent..."})

        # Step 2 — create ElevenLabs session
        # Use asyncio.get_event_loop for thread-safe callbacks
        loop = asyncio.get_event_loop()

        def on_audio(audio_b64):
            asyncio.run_coroutine_threadsafe(
                safe_send(ws, {"type": "agent_audio", "audio": audio_b64}),
                loop
            )

        def on_transcript(role, text):
            transcript.append({"role": role, "content": text})
            asyncio.run_coroutine_threadsafe(
                safe_send(ws, {"type": "transcript", "role": role, "text": text}),
                loop
            )

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

        # Step 3 — notify frontend ready — user speaks first
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
    """Generate post-session feedback using Claude"""
    if not transcript:
        return {
            "scores": {},
            "strengths": [],
            "improvements": [],
            "overall_readiness": 0,
            "summary": "No conversation recorded."
        }
    try:
        client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )
        formatted = "\n".join([
            f"{t['role'].upper()}: {t['content']}"
            for t in transcript
        ])
        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
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
        raw = message.content[0].text.strip()
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