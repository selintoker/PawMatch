"""
Routes: React app serving and episode search API.

To enable AI chat, set USE_LLM = True below. See llm_routes.py for AI code.
"""
import json
import os
import re
import unicodedata
import numpy as np
from flask import send_from_directory, request, jsonify
from models import db, Episode, Review
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.metrics.pairwise import cosine_similarity
from infosci_spark_client import LLMClient

# ── AI toggle ────────────────────────────────────────────────────────────────
USE_LLM = True
# ─────────────────────────────────────────────────────────────────────────────

def structured_to_text(trait_input):
    terms = []

    for trait, values in trait_input.items():
        for v in as_list(values):
            v_str = str(v).strip()

            # make it natural language-ish
            if trait == "Energy Level":
                terms.append(f"{v_str.lower()} energy")
            elif trait == "Shedding":
                terms.append(f"{v_str.lower()} shedding")
            elif trait == "Grooming Frequency":
                terms.append(f"{v_str.lower()} grooming")
            elif trait == "Trainability":
                terms.append(f"{v_str.lower()} trainability")
            elif trait == "Demeanor":
                terms.append(v_str.lower())
            elif trait == "Group":
                terms.append(v_str.lower())
            else:
                terms.append(v_str.lower())

    return ", ".join(terms)

def rewrite_query_with_llm(query, trait_input, allow_trait_expansion):
    api_key = os.getenv("SPARK_API_KEY")
    if not api_key:
        return query, trait_input

    client = LLMClient(api_key=api_key)

    messages = [
        {
            "role": "system",
            "content": (
                "You are a query rewriting system for a dog breed recommendation engine.\n\n"

                "Your job has TWO parts:\n"
                "1. Convert user text into structured traits\n"
                "2. Generate high-quality keyword phrases for search\n\n"

                "You MUST handle BOTH directions:\n"
                "- Text → traits (e.g. 'small' → size info)\n"
                "- Traits → keywords (even if user gave NO text)\n\n"

                "OUTPUT STRICT JSON:\n"
                "{\n"
                '  "traits": {\n'
                '    "Energy Level": ["Couch Potato" | "Calm" | "Regular Exercise" | "Energetic" | "Needs Lots of Activity"],\n'
                '    "Shedding": ["Infrequent" | "Occasional" | "Seasonal" | "Regularly" | "Frequent"],\n'
                '    "Grooming Frequency": ["Occasional Bath/Brush" | "Weekly Brushing" | "2-3 Times a Week Brushing" | "Daily Brushing" | "Professional Only"],\n'
                '    "Trainability": ["Easy Training" | "Eager to Please" | "Agreeable" | "Independent" | "May be Stubborn"],\n'
                '    "Demeanor": ["Friendly" | "Outgoing" | "Alert/Responsive" | "Reserved with Strangers" | "Aloof/Wary"],\n'
                '    "Group": ["Fondation Stock Service", "Herding Group", "Hound Group", "Miscellaneous Class", "Non-Sporting Group", "Terrier Group", "Toy Group"],\n'
                '    "Height": ["low-high range"],\n'
                '    "Weight": ["low-high range"]\n'
                "  },\n"
                '  "keywords": ["phrase1", "phrase2", ...]\n'
                "}\n\n"

                "KEYWORD RULES (STRICT):\n"
                "- Use short phrases (1–3 words)\n"
                "- NO filler words: dog, dogs, breed, a, the, an, for\n"
                "- NO duplicates or repeated concepts\n"
                "- Each keyword must add new meaning\n"
                "- Max 10 keywords\n\n"

                "SIZE MAPPING RULES (STRICT):\n"
                "- Map size words to BOTH height AND weight using these exact ranges:\n\n"

                "HEIGHT RANGES:\n"
                "- small → 0-30\n"
                "- medium → 30-55\n"
                "- large → 55-75\n"
                "- giant → 75+\n\n"

                "WEIGHT RANGES:\n"
                "- toy → 0-7\n"
                "- small → 7-15\n"
                "- medium → 15-30\n"
                "- large → 30-50\n"
                "- giant → 50+\n\n"

                "MAPPING RULES:\n"
                "- 'tiny', 'toy', 'petite' → Weight: 0-7, Height: 0-30\n"
                "- 'small' → Height: 0-30, Weight: 7-15\n"
                "- 'medium' → Height: 30-55, Weight: 15-30\n"
                "- 'large' → Height: 55-75, Weight: 30-50\n"
                "- 'giant', 'very large', 'huge' → Height: 75+, Weight: 50+\n\n"

                "NOTES:\n"
                "- Always output ranges as strings like '0-30' or '75+'\n"
                "- If ambiguous (e.g. 'small dog'), prefer BOTH height and weight mappings\n"
                "- Never invent ranges outside these buckets\n\n"

                "SIZE KEYWORDS:\n"
                "- small → tiny, petite, compact, toy breed, low weight, short height\n"
                "- medium → mid-sized, moderate build, medium height\n"
                "- large → large breed, tall, heavy, high weight\n\n"

                "TRAIT → KEYWORD RULE:\n"
                "- If traits exist, ALWAYS generate supporting keywords\n"
                "- Example: Low Shedding → 'low shedding', 'minimal shedding'\n"
                "- Example: Calm → 'calm', 'low energy', 'relaxed'\n\n"

                "EXAMPLES:\n\n"

                "Input: small\n"
                "Output:\n"
                "{\n"
                '  "traits": {\n'
                '    "Group": ["Toy Group"],\n'
                '    "Height": ["0-30"],\n'
                '    "Weight": ["0-10"]\n'
                "  },\n"
                '  "keywords": ["tiny", "petite", "compact", "toy breed", "low weight", "short height"]\n'
                "}\n\n"

                "Input: (no text, traits = Low Shedding + Calm)\n"
                "Output:\n"
                "{\n"
                '  "traits": {\n'
                '    "Energy Level": ["Calm"],\n'
                '    "Shedding": ["Low"]\n'
                "  },\n"
                '  "keywords": ["calm", "low energy", "quiet", "low shedding", "minimal shedding"]\n'
                "}\n\n"

                "CRITICAL:\n"
                "- NEVER return empty keywords\n"
                "- NEVER include useless words\n"
                "- ALWAYS enrich the query\n"
                "- Output ONLY JSON\n"
            )
        },
        {
            "role": "user",
            "content": json.dumps({
                "query": query,
                "traits": trait_input
            })
        }
    ]

    try:
        response = client.chat(messages)
        content = (response.get("content") or "").strip()

        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1:
            return query, trait_input

        parsed = json.loads(content[start:end+1])

        llm_traits = parsed.get("traits", {})
        llm_keywords = parsed.get("keywords", [])

        if allow_trait_expansion:
            updated_trait_input = {k: list(v) for k, v in trait_input.items()}

            for trait, values in llm_traits.items():
                if trait not in updated_trait_input:
                    updated_trait_input[trait] = []
                for v in values:
                    if v not in updated_trait_input[trait]:
                        updated_trait_input[trait].append(v)
        else:
            updated_trait_input = trait_input.copy()

        final_terms = set(llm_keywords)

        if not final_terms:
            final_terms = set(extract_terms(query))

        return ", ".join(final_terms), updated_trait_input

    except Exception as e:
        return query, trait_input

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

current_directory = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_directory)

DATA_PATH = os.path.join(project_root, 'src', 'data', 'breed_data.csv')
PICTURE_PATH = os.path.join(project_root, 'src', 'data', 'breed_pictures.csv')

RANGE_COLUMN_MAP = {
    "Height": "avg_height",
    "Weight": "avg_weight",
    "Life Expectancy": "avg_expectancy",
}

CATEGORY_COLUMN_MAP = {
    "Group": "group",
    "Grooming Frequency": "grooming_frequency_category",
    "Shedding": "shedding_category",
    "Energy Level": "energy_level_category",
    "Trainability": "trainability_category",
    "Demeanor": "demeanor_category",
}

STOPWORDS = set([
    "the", "a", "an", "dog", "dogs", "puppy", "puppies",
    "for", "and", "or", "with", "to", "of", "in", "on",
    "i", "want", "looking", "like", "need"
])

def extract_terms(query):
    if not query:
        return []

    # normalize
    query = query.lower()

    # split on commas AND spaces
    tokens = re.split(r"[,\s]+", query)

    cleaned = []
    for t in tokens:
        t = t.strip()
        if not t or t in STOPWORDS:
            continue
        cleaned.append(t)

    # prioritize longer phrases later if needed
    return cleaned

def as_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def parse_range(range_str):
    try:
        low, high = str(range_str).split("-")
        return float(low), float(high)
    except Exception:
        return None


def safe(val):
    return None if pd.isna(val) else val


def normalize_breed_name(name):
    if pd.isna(name):
        return ""

    name = str(name)
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    name = name.lower()
    name = name.replace("&", "and")
    name = re.sub(r"[^a-z0-9]+", " ", name)
    return " ".join(name.split())


def load_breed_dataframe():
    df = pd.read_csv(DATA_PATH)
    picture_df = pd.read_csv(PICTURE_PATH)

    df["breed_key"] = df["breed"].apply(normalize_breed_name)
    picture_df["breed_key"] = picture_df["breed"].apply(normalize_breed_name)

    df = df.merge(
        picture_df[["breed_key", "picture_name"]],
        on="breed_key",
        how="left"
    )

    df["search_document"] = (
        df["description"].fillna("") + " " +
        df["temperament"].fillna("") + " " +
        df["group"].fillna("") + " " +
        df["grooming_frequency_category"].fillna("") + " " +
        df["shedding_category"].fillna("") + " " +
        df["energy_level_category"].fillna("") + " " +
        df["trainability_category"].fillna("") + " " +
        df["demeanor_category"].fillna("")
    )

    return df


def compute_structured_jaccard(row, trait_input):
    range_score_total = 0
    range_count = 0

    for trait, col in RANGE_COLUMN_MAP.items():
        selected_values = as_list(trait_input.get(trait, []))
        if not selected_values:
            continue

        row_value = row.get(col, None)
        if pd.isna(row_value):
            continue

        row_value = float(row_value)

        for selected in selected_values:
            parsed = parse_range(selected)
            if parsed is None:
                continue

            low, high = parsed
            mid = (low + high) / 2
            range_width = (high - low) if (high - low) != 0 else 1

            distance = abs(row_value - mid)
            similarity = max(0, 1 - (distance / range_width))

            range_score_total += similarity
            range_count += 1

    cat_user_tokens = set()
    cat_breed_tokens = set()

    for trait, col in CATEGORY_COLUMN_MAP.items():
        selected_values = as_list(trait_input.get(trait, []))
        if not selected_values:
            continue

        row_value = "" if pd.isna(row.get(col)) else str(row[col]).lower()

        for selected in selected_values:
            selected_clean = str(selected).strip().lower()
            token = f"{trait}::{selected_clean}"

            cat_user_tokens.add(token)

            if selected_clean in row_value:
                cat_breed_tokens.add(token)

    if cat_user_tokens:
        intersection = len(cat_user_tokens & cat_breed_tokens)
        union = len(cat_user_tokens | cat_breed_tokens)
        cat_score = intersection / union if union != 0 else 0
    else:
        cat_score = 0

    range_score = (range_score_total / range_count) if range_count > 0 else 0

    if range_count > 0 and cat_user_tokens:
        return 0.5 * range_score + 0.5 * cat_score
    elif range_count > 0:
        return range_score
    else:
        return cat_score


def build_tfidf_bundle(df, query):
    query = (query or "").strip()
    if query == "":
        return None

    vectorizer = TfidfVectorizer(stop_words="english")
    tfidf_matrix = vectorizer.fit_transform(df["search_document"].fillna(""))
    query_vector = vectorizer.transform([query])

    baseline_scores = cosine_similarity(query_vector, tfidf_matrix).flatten()

    return {
        "vectorizer": vectorizer,
        "tfidf_matrix": tfidf_matrix,
        "query_vector": query_vector,
        "baseline_scores": baseline_scores
    }


def build_svd_bundle(tfidf_bundle, n_components=8):
    if tfidf_bundle is None:
        return None

    tfidf_matrix = tfidf_bundle["tfidf_matrix"]
    query_vector = tfidf_bundle["query_vector"]
    vectorizer = tfidf_bundle["vectorizer"]

    max_components = min(
        n_components,
        tfidf_matrix.shape[0] - 1,
        tfidf_matrix.shape[1] - 1
    )

    if max_components < 1:
        return None

    svd = TruncatedSVD(n_components=max_components, random_state=42)
    doc_latent = svd.fit_transform(tfidf_matrix)
    query_latent = svd.transform(query_vector)

    svd_cosine_raw = cosine_similarity(query_latent, doc_latent).flatten()
    svd_scores = (svd_cosine_raw + 1.0) / 2.0

    feature_names = np.array(vectorizer.get_feature_names_out())
    dimension_summaries = []

    for i, component in enumerate(svd.components_):
        pos_idx = np.argsort(component)[-5:][::-1]
        neg_idx = np.argsort(component)[:5]

        positive_terms = feature_names[pos_idx].tolist()
        negative_terms = feature_names[neg_idx].tolist()

        dimension_summaries.append({
            "dimension": i + 1,
            "positive_terms": positive_terms,
            "negative_terms": negative_terms,
            "positive_label": ", ".join(positive_terms[:3]),
            "negative_label": ", ".join(negative_terms[:3])
        })

    return {
        "svd": svd,
        "doc_latent": doc_latent,
        "query_latent": query_latent[0],
        "svd_scores": svd_scores,
        "dimension_summaries": dimension_summaries
    }


def explain_svd_match(query_latent, doc_latent_vec, dimension_summaries):
    positive_matches = []
    negative_matches = []

    for i, (qv, dv) in enumerate(zip(query_latent, doc_latent_vec)):
        contribution = float(qv * dv)

        if contribution <= 0:
            continue

        if qv > 0 and dv > 0:
            positive_matches.append({
                "dimension": i + 1,
                "sign": "positive",
                "contribution": round(contribution, 3),
                "terms": dimension_summaries[i]["positive_terms"][:3]
            })

        elif qv < 0 and dv < 0:
            negative_matches.append({
                "dimension": i + 1,
                "sign": "negative",
                "contribution": round(contribution, 3),
                "terms": dimension_summaries[i]["negative_terms"][:3]
            })

    positive_matches.sort(key=lambda x: x["contribution"], reverse=True)
    negative_matches.sort(key=lambda x: x["contribution"], reverse=True)

    return positive_matches[:3], negative_matches[:3]


def get_matching_traits(row, trait_input):
    matching_traits = []

    for trait, col in CATEGORY_COLUMN_MAP.items():
        selected_values = as_list(trait_input.get(trait, []))
        if not selected_values:
            continue

        row_value = "" if pd.isna(row.get(col)) else str(row[col]).lower()

        for selected in selected_values:
            selected_clean = str(selected).strip()
            if selected_clean.lower() in row_value:
                matching_traits.append(selected_clean)

    return list(dict.fromkeys(matching_traits))


def get_matching_words(row, rewritten_query):
    if not rewritten_query:
        return []

    terms = extract_terms(rewritten_query)

    doc_text = f"{safe(row['description']) or ''} {safe(row['temperament']) or ''}".lower()

    matches = []
    for term in terms:
        # exact phrase match only
        if re.search(rf"\b{re.escape(term)}\b", doc_text):
            matches.append(term)

    return matches[:6]


def build_result_payload(row, score, structured_score=None, text_score=None,
                         matching_traits=None, matching_words=None,
                         positive_dimensions=None, negative_dimensions=None):
    return {
        "breed": safe(row["breed"]),
        "score": round(float(score), 3),
        "structured_score": round(float(structured_score), 3) if structured_score is not None else None,
        "text_score": round(float(text_score), 3) if text_score is not None else None,
        "description": safe(row["description"]),
        "temperament": safe(row["temperament"]),
        "group": safe(row["group"]),
        "grooming": safe(row["grooming_frequency_category"]),
        "energy": safe(row["energy_level_category"]),
        "shedding": safe(row["shedding_category"]),
        "trainability": safe(row["trainability_category"]),
        "demeanor": safe(row["demeanor_category"]),
        "picture_name": safe(row.get("picture_name", None)),
        "min_height": safe(row["min_height"]),
        "max_height": safe(row["max_height"]),
        "avg_height": safe(row["avg_height"]),
        "min_weight": safe(row["min_weight"]),
        "max_weight": safe(row["max_weight"]),
        "avg_weight": safe(row["avg_weight"]),
        "min_expectancy": safe(row["min_expectancy"]),
        "max_expectancy": safe(row["max_expectancy"]),
        "avg_expectancy": safe(row["avg_expectancy"]),
        "matching_traits": matching_traits or [],
        "matching_words": matching_words or [],
        "positive_dimensions": positive_dimensions or [],
        "negative_dimensions": negative_dimensions or []
    }


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
    
    @app.route("/api/ai-help", methods=["POST"])
    def ai_help():
        data = request.get_json() or {}
        message = (data.get("message") or "").strip()

        if not message:
            return jsonify({"response": "Please describe your lifestyle or preferences."})

        api_key = os.getenv("SPARK_API_KEY")
        if not api_key:
            return jsonify({"error": "SPARK_API_KEY not set"}), 500

        client = LLMClient(api_key=api_key)

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a helpful assistant that helps users choose dog traits "
                    "for a filtering system.\n\n"

                    "Your job:\n"
                    "- Translate a user's lifestyle or preferences into EXACT selectable trait values\n"
                    "- ONLY use the allowed options below\n"
                    "- Present your answer as clean bullet points\n\n"

                    "AVAILABLE TRAITS AND OPTIONS:\n"
                    "- Energy Level: Couch Potato, Calm, Regular Exercise, Energetic, Needs Lots of Activity\n"
                    "- Shedding: Infrequent, Occasional, Seasonal, Regularly, Frequent\n"
                    "- Grooming Frequency: Occasional Bath/Brush, Weekly Brushing, 2-3 Times a Week Brushing, Daily Brushing, Professional Only\n"
                    "- Trainability: Easy Training, Eager to Please, Agreeable, Independent, May be Stubborn\n"
                    "- Demeanor: Friendly, Outgoing, Alert/Responsive, Reserved with Strangers, Aloof/Wary\n"
                    "- Group: Toy Group, Sporting Group, Working Group, Herding Group, Hound Group, Terrier Group, Non-Sporting Group, Miscellaneous Class, Foundation Stock Service\n\n"

                    "RESPONSE FORMAT (STRICT):\n"
                    "- Start with a friendly explanation of 2-3 sentences. Then, use bullet points for the traits\n"
                    "- Use bullet points * for the traits and values\n"
                    "- Each bullet must follow this format:\n"
                    "  Trait: Value\n"
                    "- Only include traits that are relevant\n"
                    "- Do NOT invent new values\n"
                    "- Do NOT explain too much\n\n"

                    "EXAMPLE OUTPUT:\n"
                    "- Energy Level: Low\n"
                    "- Shedding: Low\n"
                    "- Trainability: Agreeable\n"
                    "- Demeanor: Friendly\n\n"

                    "GUIDELINES:\n"
                    "- Infer traits from lifestyle (e.g., apartment → Low energy)\n"
                    "- Prefer 3–6 traits total\n"
                    "- Be concise and clear\n"
                )
            },
            {
                "role": "user",
                "content": message,
            },
        ]

        try:
            response = client.chat(messages)
            return jsonify({"response": response.get("content", "")})
        except Exception as e:
            logger.error(f"AI HELP error: {e}")
            return jsonify({"error": "AI help failed"}), 500

    @app.route('/api/match', methods=['POST'])
    def match_dogs():
        payload = request.get_json(silent=True) or {}

        trait_input = payload.get("traitInput", {})
        write_in = payload.get("writeIn", "").strip()
        use_llm_flag = payload.get("useLlm", False)
        
        has_structured = any(len(as_list(v)) > 0 for v in trait_input.values())
        has_text = write_in != ""
        has_only_structured = has_structured and not has_text

        structured_text = structured_to_text(trait_input)

        # combine BOTH sources
        base_query_parts = []

        if write_in:
            base_query_parts.append(write_in)

        if structured_text:
            base_query_parts.append(structured_text)

        base_query = ", ".join(base_query_parts).strip()

        rewritten_query = base_query
        enriched_traits = trait_input
        if USE_LLM and use_llm_flag and base_query:
            rewritten_query, enriched_traits = rewrite_query_with_llm(base_query, trait_input, allow_trait_expansion=not has_only_structured)

        has_structured = any(len(as_list(v)) > 0 for v in trait_input.values())
        has_text = write_in != ""

        if not has_structured and not has_text:
            return jsonify({
                "baseline_matches": [],
                "svd_matches": [],
                "svd_dimensions": []
            })

        df = load_breed_dataframe()

        tfidf_bundle = build_tfidf_bundle(df, rewritten_query or base_query) if (rewritten_query or base_query) else None
        svd_bundle = build_svd_bundle(tfidf_bundle, n_components=8) if tfidf_bundle else None

        baseline_matches = []
        svd_matches = []

        for idx, row in df.iterrows():
            structured_score = compute_structured_jaccard(row, enriched_traits)
            baseline_text_score = float(tfidf_bundle["baseline_scores"][idx]) if tfidf_bundle is not None else None
            svd_text_score = float(svd_bundle["svd_scores"][idx]) if svd_bundle is not None else None

            if has_structured and has_text:
                baseline_final = 0.6 * baseline_text_score + 0.4 * structured_score
                svd_final = 0.6 * svd_text_score + 0.4 * structured_score
            elif has_text:
                baseline_final = baseline_text_score
                svd_final = svd_text_score
            else:
                baseline_final = structured_score
                svd_final = structured_score

            matching_traits = get_matching_traits(row, enriched_traits)
            matching_words = get_matching_words(row, rewritten_query or base_query)

            if svd_bundle is not None:
                positive_dims, negative_dims = explain_svd_match(
                    svd_bundle["query_latent"],
                    svd_bundle["doc_latent"][idx],
                    svd_bundle["dimension_summaries"]
                )
            else:
                positive_dims, negative_dims = [], []

            baseline_matches.append(
                build_result_payload(
                    row=row,
                    score=baseline_final,
                    structured_score=structured_score if has_structured else None,
                    text_score=baseline_text_score if has_text else None,
                    matching_traits=matching_traits,
                    matching_words=matching_words
                )
            )

            svd_matches.append(
                build_result_payload(
                    row=row,
                    score=svd_final,
                    structured_score=structured_score if has_structured else None,
                    text_score=svd_text_score if has_text else None,
                    matching_traits=matching_traits,
                    matching_words=matching_words,
                    positive_dimensions=positive_dims,
                    negative_dimensions=negative_dims
                )
            )

        baseline_matches.sort(key=lambda x: x["score"], reverse=True)
        svd_matches.sort(key=lambda x: x["score"], reverse=True)

        baseline_matches = [m for m in baseline_matches if m["score"] > 0][:10]
        svd_matches = [m for m in svd_matches if m["score"] > 0][:10]

        return jsonify({
            "baseline_matches": baseline_matches,
            "svd_matches": svd_matches,
            "svd_dimensions": svd_bundle["dimension_summaries"] if svd_bundle is not None else [],
            "rewritten_query": rewritten_query,
            "original_query": base_query,
            "enriched_traits": enriched_traits   # ✅ ADD THIS
        })

    if USE_LLM:
        from llm_routes import register_chat_route
        register_chat_route(app, json_search)