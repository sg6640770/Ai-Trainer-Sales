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
        self._receive_task = None

    async def connect(self):
        api_key = os.getenv("ELEVENLABS_API_KEY")
        agent_id = os.getenv("ELEVENLABS_AGENT_ID")

        if not api_key or not agent_id:
            raise Exception("Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID in .env")

        print(f"Getting signed URL for agent: {agent_id}")

        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id={agent_id}",
                headers={"xi-api-key": api_key}
            )
            data = res.json()
            if "signed_url" not in data:
                raise Exception(f"ElevenLabs error: {data}")
            signed_url = data["signed_url"]

        print("Connecting to ElevenLabs WebSocket...")
        self.ws = await websockets.connect(
            signed_url,
            extra_headers={"xi-api-key": api_key},
            ping_interval=20,
            ping_timeout=10
        )
        print("WebSocket connected")

        # Send minimal init — no overrides, no first message
        # User speaks first — agent waits
        await self.ws.send(json.dumps({
            "type": "conversation_initiation_client_data",
            "conversation_config_override": {
                "agent": {
                    "first_message": ""
                }
            }
        }))

        self._receive_task = asyncio.create_task(self._receive_loop())
        print("ElevenLabs session ready — waiting for user to speak first")

    async def _receive_loop(self):
        try:
            async for raw in self.ws:
                if self._closed:
                    break
                try:
                    data = json.loads(raw)
                    msg_type = data.get("type", "")

                    if msg_type == "audio":
                        audio_b64 = data.get("audio_event", {}).get("audio_base_64", "")
                        if audio_b64:
                            self.on_agent_audio(audio_b64)

                    elif msg_type == "agent_response":
                        text = data.get("agent_response_event", {}).get("agent_response", "")
                        if text:
                            print(f"Agent: {text[:80]}")
                            self.on_transcript("assistant", text)

                    elif msg_type == "user_transcript":
                        text = data.get("user_transcription_event", {}).get("user_transcript", "")
                        if text:
                            print(f"User: {text[:80]}")
                            self.on_transcript("user", text)

                    elif msg_type == "interruption":
                        self.on_status("interrupted")

                    elif msg_type == "ping":
                        await self.ws.send(json.dumps({
                            "type": "pong",
                            "event_id": data.get("ping_event", {}).get("event_id", 0)
                        }))

                    elif msg_type == "conversation_initiation_metadata":
                        meta = data.get("conversation_initiation_metadata_event", {})
                        print(f"Session metadata: {meta}")
                        # Confirm expected audio format
                        print(f"Agent output format: {meta.get('agent_output_audio_format')}")
                        print(f"User input format: {meta.get('user_input_audio_format')}")

                    elif msg_type == "agent_response_correction":
                        pass  # ignore corrections silently

                    else:
                        print(f"Unknown message type: {msg_type}")

                except json.JSONDecodeError:
                    pass

        except websockets.exceptions.ConnectionClosed as e:
            print(f"ElevenLabs WS closed: {e}")
            if not self._closed:
                self.on_status("disconnected")
        except Exception as e:
            print(f"Receive loop error: {e}")

    async def send_audio(self, audio_bytes: bytes):
        """
        Send PCM 16000Hz mono 16-bit audio to ElevenLabs.
        Frontend sends this format directly via AudioWorklet.
        """
        if not self.ws or self._closed:
            return
        try:
            if self.ws.closed:
                return
            encoded = base64.b64encode(audio_bytes).decode("utf-8")
            await self.ws.send(json.dumps({
                "user_audio_chunk": encoded
            }))
        except websockets.exceptions.ConnectionClosed:
            print("Cannot send audio — connection closed")
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
        if self._receive_task:
            self._receive_task.cancel()
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
        print("ElevenLabs session closed")