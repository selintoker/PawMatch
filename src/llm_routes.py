"""
LLM chat route — only loaded when USE_LLM = True in routes.py.
Adds a POST /api/chat endpoint that performs LLM-driven RAG.

Setup:
  1. Add API_KEY=your_key to .env
  2. Set USE_LLM = True in routes.py
"""

import json
import os
import re
import logging
from flask import request, jsonify
from infosci_spark_client import LLMClient

logger = logging.getLogger(__name__)


def register_chat_route(app, json_search):
    """Register the /api/chat SSE endpoint. Called from routes.py."""

    @app.route("/api/chat", methods=["POST"])
    def chat():
        data = request.get_json() or {}

        query = (data.get("query") or "").strip()
        trait_input = data.get("traitInput", {})
        results = data.get("results", [])

        if not results:
            return jsonify({"response": "No matches found to explain."})

        api_key = os.getenv("API_KEY")
        if not api_key:
            return jsonify({"error": "API_KEY not set — add it to your .env file"}), 500

        client = LLMClient(api_key=api_key)

        # format top results into context
        def format_dogs(results):
            formatted = []
            for i, dog in enumerate(results, start=1):
                formatted.append(f"""
Dog {i}: {dog.get('breed')}
Description: {dog.get('description')}
Temperament: {dog.get('temperament')}

Traits:
- Energy: {dog.get('energy')}
- Shedding: {dog.get('shedding')}
- Trainability: {dog.get('trainability')}
- Demeanor: {dog.get('demeanor')}

Match Score: {dog.get('score')}
Matching Traits: {dog.get('matching_traits')}
Matching Keywords: {dog.get('matching_words')}
""")
            return "\n".join(formatted)

        context_text = format_dogs(results[:10])

        messages = [
    {
        "role": "system",
        "content": (
            "You are an expert dog recommendation assistant. "
            "You MUST only use the provided dog matches. "
            "Do NOT invent new breeds."
        ),
    },
    {
        "role": "user",
        "content": f"""
User preferences:
{query}

Retrieved dog matches:
{context_text}

Tasks:

### Why these dogs match
Write:
- A 2–3 sentence summary explaining the overall pattern across these dogs
- Then a bullet list

IMPORTANT FORMAT RULES:
- EVERY bullet MUST start with '* '
- Each bullet MUST follow this format:
  * Breed Name: 1–2 sentence explanation referencing temperament, behavior, or traits
- Include ALL listed dogs (in order)
- Explanations should be specific (not repetitive or generic)

### Comparison
Write EXACTLY these three lines:
Size & Energy: 1–2 sentences comparing variation across breeds
Social Needs: 1–2 sentences comparing companionship, independence, or behavior with people
Maintenance: 1–2 sentences comparing grooming, shedding, or care needs

### Best Recommendation
Write EXACTLY:
Best Recommendation: Breed Name

Then write 2–4 sentences explaining:
- why it best matches the user’s preference
- how it compares to the other top matches

GLOBAL RULES:
- Do NOT change formatting
- Do NOT add extra sections
- Do NOT skip any breeds
- Be descriptive but concise
- The best match you recommend must have the highest score. 
"""
    },
]

        try:
            response = client.chat(messages)
            return jsonify({"response": response.get("content", "")})
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return jsonify({"error": "LLM request failed"}), 500