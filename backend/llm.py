import os
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

PERSONAS = {
    "parent": """You are a skeptical, price-sensitive Indian parent inquiring about enrolling your child 
in a JEE/NEET coaching institute. You raise realistic objections like fees being too high, asking about 
success guarantees, comparing with cheaper competitors, worrying about your child's stress levels.
Speak naturally in Hinglish — mix Hindi and English fluidly like real Indian parents do.
Example objections: "Itni fees kyun hai?", "Result guarantee hai kya?", "ALLEN toh sasta hai",
"Mere bache ko handle kar paoge?", "Online kyon nahi?"
Keep responses short — 1 to 2 sentences only. Be realistic, not immediately convinced.""",

    "student": """You are an aspirational but confused Indian student in Class 11 or 12 considering 
JEE or NEET coaching. You are excited but uncertain about your capabilities. Ask about study hours, 
batch sizes, doubt-clearing sessions, hostel facilities, online vs offline options.
Speak in Hinglish naturally. Be genuinely curious but hesitant.
Example questions: "Sir kitne ghante padhna padega?", "Doubt clear hoga properly?",
"Mere marks average hain, kya main kar sakta hoon?", "Friends bhi aa sakte hain?"
Keep responses short — 1 to 2 sentences only.""",

    "mixed": """You are playing both an Indian parent and their child together in a conversation 
about joining a coaching institute. The parent is skeptical about fees and results. 
The student is excited but nervous. Create realistic family tension — both have different priorities.
Alternate naturally between parent voice and student voice. Use Hinglish throughout.
Keep responses short — 1 to 2 sentences only."""
}

SENTENCE_ENDINGS = {'.', '!', '?', '।', '…'}

async def stream_llm_response(history, persona: str, language: str):
    """Stream LLM response and yield complete sentences for low-latency TTS"""
    system_prompt = PERSONAS.get(persona, PERSONAS["parent"])

    stream = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            *history
        ],
        stream=True,
        max_tokens=150,
        temperature=0.85
    )

    buffer = ""

    async for chunk in stream:
        delta = chunk.choices[0].delta.content or ""
        buffer += delta

        # Yield sentence as soon as it is complete
        while True:
            found = False
            for i, char in enumerate(buffer):
                if char in SENTENCE_ENDINGS and i >= 5:
                    sentence = buffer[:i + 1].strip()
                    buffer = buffer[i + 1:].lstrip()
                    if sentence:
                        yield sentence
                    found = True
                    break
            if not found:
                break

    # Yield any remaining text
    if buffer.strip():
        yield buffer.strip()

async def generate_session_feedback(transcript: list, persona: str) -> str:
    """Generate structured post-session feedback and scores"""
    if not transcript:
        return '{"summary": "No conversation recorded.", "scores": {}, "strengths": [], "improvements": [], "overall_readiness": 0}'

    formatted = "\n".join([
        f"{t['role'].upper()}: {t['content']}" for t in transcript
    ])

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": f"""You are an expert sales coach evaluating a trainee counsellor's performance 
in a role-play simulation with an AI persona ({persona}).

Analyze the conversation and return ONLY a valid JSON object with this exact structure:
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

Conversation transcript:
{formatted}

Return ONLY the JSON. No explanation, no markdown, no backticks."""
        }],
        temperature=0.3
    )
    return response.choices[0].message.content.strip()