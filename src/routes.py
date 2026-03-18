"""
Routes: React app serving and episode search API.

To enable AI chat, set USE_LLM = True below. See llm_routes.py for AI code.
"""
import json
import os
from flask import send_from_directory, request, jsonify
from models import db, Episode, Review
import pandas as pd

# ── AI toggle ────────────────────────────────────────────────────────────────
USE_LLM = False
# USE_LLM = True
# ─────────────────────────────────────────────────────────────────────────────


def json_search(query):
    if not query or not query.strip():
        query = "Kardashian"
    results = db.session.query(Episode, Review).join(
        Review, Episode.id == Review.id
    ).filter(
        Episode.title.ilike(f'%{query}%')
    ).all()
    matches = []
    for episode, review in results:
        matches.append({
            'title': episode.title,
            'descr': episode.descr,
            'imdb_rating': review.imdb_rating
        })
    return matches


def register_routes(app):
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        else:
            return send_from_directory(app.static_folder, 'index.html')

    @app.route("/api/config")
    def config():
        return jsonify({"use_llm": USE_LLM})

    @app.route("/api/episodes")
    def episodes_search():
        text = request.args.get("title", "")
        return jsonify(json_search(text))
    
    @app.route('/api/match', methods=['POST'])
    def match_dogs():
        user_traits = request.json  # dict: {trait: [values]}

        df = pd.read_csv('data/breed_data.csv')

        results = []

        for _, row in df.iterrows():
            breed_traits = set()

            if pd.notna(row['group']):
                breed_traits.add(row['group'])

            if pd.notna(row['grooming_frequency_category']):
                breed_traits.add(row['grooming_frequency_category'])

            if pd.notna(row['shedding_category']):
                breed_traits.add(row['shedding_category'])

            if pd.notna(row['energy_level_category']):
                breed_traits.add(row['energy_level_category'])

            if pd.notna(row['trainability_category']):
                breed_traits.add(row['trainability_category'])

            if pd.notna(row['demeanor_category']):
                breed_traits.add(row['demeanor_category'])

            user_set = set()
            for values in user_traits.values():
                user_set.update(values)

            intersection = len(breed_traits & user_set)
            union = len(breed_traits | user_set)

            score = intersection / union if union != 0 else 0

            results.append({
                "breed": row['breed'],
                "score": round(score, 3),
                "description": row['description'],
                "temperament": row['temperament'],
                "group": row['group'],
                "energy": row['energy_level_category'],
                "shedding": row['shedding_category'],
                "trainability": row['trainability_category'],
                "demeanor": row['demeanor_category']
            })

        results = sorted(results, key=lambda x: x['score'], reverse=True)

        filtered = [r for r in results if r['score'] > 0]

        return jsonify(filtered[:10])


    if USE_LLM:
        from llm_routes import register_chat_route
        register_chat_route(app, json_search)
