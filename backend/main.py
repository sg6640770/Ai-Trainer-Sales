import asyncio
import json
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from elevenlabs_agent import ElevenLabsAgentSession

load_dotenv()

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

    try:
        # Step 1: Receive config
        raw_config = await asyncio.wait_for(ws.receive_text(), timeout=10)
        config = json.loads(raw_config)
        persona = config.get("persona", "parent")
        language = config.get("language", "hinglish")

        print(f"New session → persona={persona}, language={language}")

        await safe_send(ws, {"type": "status", "message": "Connecting to AI agent..."})

        # Step 2: Create ElevenLabs session
        loop = asyncio.get_event_loop()

        session = ElevenLabsAgentSession(
            on_agent_audio=lambda audio_b64: loop.call_soon_threadsafe(
                lambda: asyncio.ensure_future(
                    safe_send(ws, {"type": "agent_audio", "audio": audio_b64})
                )
            ),
            on_transcript=lambda role, text: loop.call_soon_threadsafe(
                lambda: asyncio.ensure_future(
                    safe_send(ws, {"type": "transcript", "role": role, "text": text})
                )
            ),
            on_status=lambda msg: loop.call_soon_threadsafe(
                lambda: asyncio.ensure_future(
                    safe_send(ws, {"type": "status", "message": msg})
                )
            )
        )

        await session.connect()
        print("ElevenLabs agent connected")

        # Step 3: Notify frontend session is ready
        await safe_send(ws, {"type": "session_ready", "message": "Session started"})

        # Step 4: Main message loop
        while True:
            msg = await ws.receive()

            if msg["type"] == "websocket.disconnect":
                print("Client disconnected")
                break

            # Binary = audio chunk from mic
            if "bytes" in msg and msg["bytes"]:
                chunk = msg["bytes"]
                # print(f"Audio chunk: {len(chunk)} bytes")  # debug
                await session.send_audio(chunk)

            # Text = control commands
            elif "text" in msg and msg["text"]:
                try:
                    data = json.loads(msg["text"])
                    cmd = data.get("type", "")

                    if cmd == "interrupt":
                        await session.interrupt()

                    elif cmd == "end_session":
                        await safe_send(ws, {"type": "status", "message": "Ending session..."})
                        await ws.close(code=1000, reason="Session ended by user")
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
        print(f"Session error: {e}")
        await safe_send(ws, {"type": "error", "message": str(e)})

    finally:
        if session:
            await session.close()
            print("Session cleaned up")