import httpx
import os


async def synthesize_speech(text: str) -> bytes:
    """Convert text to MP3 audio using ElevenLabs Turbo"""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    voice_id = os.getenv("ELEVENLABS_VOICE_ID")
    model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")

    if not api_key or not voice_id:
        return b""

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": api_key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg"
                },
                json={
                    "text": text,
                    "model_id": model_id,
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                        "style": 0.2,
                        "use_speaker_boost": True
                    },
                    "output_format": "mp3_44100_128"
                }
            )
            if response.status_code != 200:
                print(f"TTS Error: {response.status_code} {response.text}")
                return b""
            return response.content
    except Exception as e:
        print(f"TTS exception: {e}")
        return b""