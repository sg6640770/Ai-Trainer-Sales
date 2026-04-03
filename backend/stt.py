import httpx
import os


async def transcribe_audio(audio_bytes: bytes) -> str:
    """Transcribe audio using ElevenLabs Scribe v1"""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        return ""

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://api.elevenlabs.io/v1/speech-to-text",
                headers={"xi-api-key": api_key},
                files={"file": ("audio.webm", audio_bytes, "audio/webm")},
                data={
                    "model_id": "scribe_v1",
                    "language_code": "hi",
                    "tag_audio_events": "false",
                    "diarize": "false"
                }
            )
            if response.status_code != 200:
                print(f"STT Error: {response.status_code} {response.text}")
                return ""
            result = response.json()
            return result.get("text", "").strip()
    except Exception as e:
        print(f"STT exception: {e}")
        return ""