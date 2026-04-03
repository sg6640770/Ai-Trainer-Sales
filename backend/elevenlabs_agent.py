import asyncio
import os
import json
import base64
import httpx
import websockets


class ElevenLabsAgentSession:
    def __init__(self, on_agent_audio, on_transcript, on_status):
        self.on_agent_audio = on_agent_audio
        self.on_transcript = on_transcript
        self.on_status = on_status
        self.ws = None
        self._closed = False

    async def connect(self):
        api_key = os.getenv("ELEVENLABS_API_KEY")
        agent_id = os.getenv("ELEVENLABS_AGENT_ID")

        print("API KEY:", api_key[:10] + "..." if api_key else "MISSING")
        print("AGENT ID:", agent_id)

        if not api_key or not agent_id:
            raise Exception("Missing ElevenLabs ENV variables")

        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id={agent_id}",
                headers={"xi-api-key": api_key}
            )
            data = res.json()
            print("Signed URL response status:", res.status_code)

            if "signed_url" not in data:
                raise Exception(f"Invalid ElevenLabs response: {data}")

            signed_url = data["signed_url"]

        self.ws = await websockets.connect(
            signed_url,
            extra_headers={"xi-api-key": api_key},
            ping_interval=20,
            ping_timeout=10
        )

        # ✅ Bare init — no overrides (agent config locks them)
        await self.ws.send(json.dumps({
            "type": "conversation_initiation_client_data"
        }))

        asyncio.create_task(self._receive_loop())

    async def _receive_loop(self):
        try:
            async for raw in self.ws:
                if self._closed:
                    break
                try:
                    data = json.loads(raw)
                    msg_type = data.get("type", "")

                    if msg_type == "audio":
                        audio_event = data.get("audio_event", {})
                        # ElevenLabs sends PCM 16000Hz base64 — forward as-is
                        audio_b64 = audio_event.get("audio_base_64", "")
                        if audio_b64:
                            self.on_agent_audio(audio_b64)

                    elif msg_type == "agent_response":
                        event = data.get("agent_response_event", {})
                        text = event.get("agent_response", "")
                        if text:
                            self.on_transcript("assistant", text)

                    elif msg_type == "user_transcript":
                        event = data.get("user_transcription_event", {})
                        text = event.get("user_transcript", "")
                        if text:
                            self.on_transcript("user", text)

                    elif msg_type == "interruption":
                        self.on_status("interrupted")

                    elif msg_type == "ping":
                        await self.ws.send(json.dumps({
                            "type": "pong",
                            "event_id": data.get("ping_event", {}).get("event_id", 0)
                        }))

                    elif msg_type == "conversation_initiation_metadata":
                        print("Session initiated:", data)

                except json.JSONDecodeError:
                    pass

        except websockets.exceptions.ConnectionClosed as e:
            print(f"ElevenLabs WS closed: {e}")
        except Exception as e:
            print(f"Receive loop error: {e}")

    async def send_audio(self, audio_bytes: bytes):
        """
        ElevenLabs expects raw PCM 16000Hz mono 16-bit audio, base64-encoded.
        The frontend must send PCM — not webm/opus.
        """
        if not self.ws or self._closed:
            return
        try:
            encoded = base64.b64encode(audio_bytes).decode("utf-8")
            await self.ws.send(json.dumps({
                "user_audio_chunk": encoded
            }))
        except Exception as e:
            print(f"Send audio error: {e}")

    async def interrupt(self):
        if not self.ws or self._closed:
            return
        try:
            await self.ws.send(json.dumps({"type": "user_activity"}))
        except Exception as e:
            print(f"Interrupt error: {e}")

    async def close(self):
        self._closed = True
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass