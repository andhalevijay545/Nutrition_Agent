# ============================================================
#  NUTRITION AGENT — Flask Backend
#  Powered by IBM Watsonx.ai + Granite Models
# ============================================================

import os
import json
import logging
import warnings
from datetime import datetime
from urllib.parse import urlparse
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from dotenv import load_dotenv

# Suppress Watsonx deprecation warnings (decoding_method, API version)
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", message=".*WatsonxAPIWarning.*")

# ── Load environment variables ──────────────────────────────
load_dotenv(override=True)

# ── Import agent configuration ──────────────────────────────
from agent_config import (
    SYSTEM_PROMPT,
    MODEL_PARAMS,
    SAFETY_CONFIG,
    FEATURES,
    AGENT_NAME,
    AGENT_EMOJI,
    INDIAN_FOOD_ENABLED,
    INDIAN_FOOD_CONFIG,
)

# ── Watsonx.ai SDK ──────────────────────────────────────────
from ibm_watsonx_ai import APIClient, Credentials
from ibm_watsonx_ai.foundation_models import ModelInference

# ──────────────────────────────────────────────────────────────
#  Flask App Setup
# ──────────────────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-key-change-in-prod")
CORS(app)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
#  Watsonx.ai Client Initialization
# ──────────────────────────────────────────────────────────────
def normalize_watsonx_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if not parsed.scheme:
        url = f"https://{url.strip()}"
        parsed = urlparse(url)

    if parsed.path and parsed.path not in ("/", ""):
        url = f"{parsed.scheme}://{parsed.netloc}"
        logger.warning(
            "Stripping path from WATSONX_URL and using base service URL: %s",
            url,
        )

    if parsed.hostname and parsed.hostname.endswith(".dai.cloud.ibm.com"):
        url = url.replace(".dai.cloud.ibm.com", ".ml.cloud.ibm.com")
        logger.warning(
            "Detected IBM AI Studio management host; switching WATSONX_URL to %s",
            url,
        )

    return url.rstrip("/")


def get_watsonx_model() -> ModelInference:
    """Initialize and return the Watsonx.ai Granite model."""
    api_key      = os.getenv("IBM_API_KEY")
    project_id   = os.getenv("WATSONX_PROJECT_ID")
    url          = normalize_watsonx_url(
        os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
    )
    model_id     = os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-3-8b-instruct")
    version      = os.getenv("WATSONX_VERSION")
    auth_url     = os.getenv("WATSONX_AUTH_URL")
    instance_id  = os.getenv("WATSONX_INSTANCE_ID")

    if not api_key or not project_id:
        raise ValueError(
            "IBM_API_KEY and WATSONX_PROJECT_ID must be set in your .env file"
        )

    credentials_kwargs = {
        "url": url,
        "api_key": api_key,
    }
    if version:
        credentials_kwargs["version"] = version
    if auth_url:
        credentials_kwargs["auth_url"] = auth_url
    if instance_id:
        credentials_kwargs["instance_id"] = instance_id

    credentials = Credentials(**credentials_kwargs)
    client      = APIClient(credentials=credentials)

    model = ModelInference(
        model_id   = model_id,
        api_client = client,
        project_id = project_id,
        params     = {
            "max_new_tokens":     MODEL_PARAMS["max_new_tokens"],
            "min_new_tokens":     MODEL_PARAMS["min_new_tokens"],
            "temperature":        MODEL_PARAMS["temperature"],
            "top_p":              MODEL_PARAMS["top_p"],
            "top_k":              MODEL_PARAMS["top_k"],
            "repetition_penalty": MODEL_PARAMS["repetition_penalty"],
            # Note: decoding_method is auto-set by the API for newer models
        },
    )
    return model


# ──────────────────────────────────────────────────────────────
#  Conversation History Helpers
# ──────────────────────────────────────────────────────────────
def get_conversation_history() -> list:
    return session.get("conversation_history", [])

def save_conversation_history(history: list):
    session["conversation_history"] = history[-20:]  # Keep last 20 turns

def format_conversation_for_prompt(history: list, user_message: str,
                                   profile: dict | None = None) -> str:
    """Build the full prompt — auto-selects Llama-3 or Granite chat template."""
    model_id = os.getenv("WATSONX_MODEL_ID", "")
    is_llama = "llama" in model_id.lower()

    profile_context = ""
    if profile:
        profile_context = f"\n\nACTIVE USER PROFILE:\n{json.dumps(profile, indent=2)}\n"

    system_text = SYSTEM_PROMPT + profile_context

    if is_llama:
        # Llama-3 chat template
        prompt = f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n{system_text}<|eot_id|>\n"
        for turn in history:
            role    = turn.get("role", "user")
            content = turn.get("content", "")
            prompt += f"<|start_header_id|>{role}<|end_header_id|>\n{content}<|eot_id|>\n"
        prompt += f"<|start_header_id|>user<|end_header_id|>\n{user_message}<|eot_id|>\n<|start_header_id|>assistant<|end_header_id|>\n"
    else:
        # Granite chat template
        prompt = f"<|system|>\n{system_text}\n<|end|>\n"
        for turn in history:
            role    = turn.get("role", "user")
            content = turn.get("content", "")
            prompt += f"<|{role}|>\n{content}\n<|end|>\n"
        prompt += f"<|user|>\n{user_message}\n<|end|>\n<|assistant|>\n"

    return prompt


# ──────────────────────────────────────────────────────────────
#  Safety Filter
# ──────────────────────────────────────────────────────────────
def is_out_of_scope(message: str) -> bool:
    """Check if the user message touches forbidden topics."""
    lower = message.lower()
    for topic in SAFETY_CONFIG["out_of_scope_topics"]:
        if topic.lower() in lower:
            return True
    return False


# ──────────────────────────────────────────────────────────────
#  BMI Calculator Logic
# ──────────────────────────────────────────────────────────────
def calculate_bmi(weight_kg: float, height_cm: float) -> dict:
    height_m = height_cm / 100
    bmi      = round(weight_kg / (height_m ** 2), 1)

    if bmi < 18.5:
        category, color, advice = "Underweight", "#f59e0b", "Consider a calorie-surplus plan with nutrient-dense foods."
    elif bmi < 25:
        category, color, advice = "Normal Weight", "#10b981", "Great work! Focus on maintaining a balanced diet."
    elif bmi < 30:
        category, color, advice = "Overweight", "#f97316", "A moderate calorie deficit with regular activity is recommended."
    else:
        category, color, advice = "Obese", "#ef4444", "Please consult a dietitian for a supervised weight-loss program."

    # Healthy weight range
    min_healthy = round(18.5 * (height_m ** 2), 1)
    max_healthy = round(24.9 * (height_m ** 2), 1)

    return {
        "bmi":           bmi,
        "category":      category,
        "color":         color,
        "advice":        advice,
        "healthy_range": f"{min_healthy} – {max_healthy} kg",
    }


# ──────────────────────────────────────────────────────────────
#  Daily Calorie Estimator (Mifflin-St Jeor + PAL)
# ──────────────────────────────────────────────────────────────
def calculate_tdee(weight_kg: float, height_cm: float, age: int,
                   gender: str, activity: str) -> dict:
    if gender.lower() == "male":
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    else:
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161

    pal_map = {
        "sedentary":   1.2,
        "light":       1.375,
        "moderate":    1.55,
        "active":      1.725,
        "very_active": 1.9,
    }
    pal  = pal_map.get(activity.lower(), 1.55)
    tdee = round(bmr * pal)

    return {
        "bmr":          round(bmr),
        "tdee":         tdee,
        "weight_loss":  max(tdee - 500, SAFETY_CONFIG["min_daily_calories"]),
        "weight_gain":  tdee + 500,
        "maintenance":  tdee,
    }


# ──────────────────────────────────────────────────────────────
#  Water Intake Estimator
# ──────────────────────────────────────────────────────────────
def calculate_water_intake(weight_kg: float, activity: str) -> dict:
    base_ml     = weight_kg * 35
    activity_add = {"sedentary": 0, "light": 200, "moderate": 400,
                    "active": 600, "very_active": 800}
    total_ml    = base_ml + activity_add.get(activity.lower(), 0)
    return {
        "total_ml":     round(total_ml),
        "total_liters": round(total_ml / 1000, 1),
        "glasses_8oz":  round(total_ml / 240),
    }


# ──────────────────────────────────────────────────────────────
#  Quick Nutrition Facts (static lookup — extend as needed)
# ──────────────────────────────────────────────────────────────
NUTRITION_DB = {
    "rice (1 cup cooked)":   {"calories": 206, "protein": 4, "carbs": 45, "fat": 0.4},
    "dal (1 cup cooked)":    {"calories": 230, "protein": 18, "carbs": 40, "fat": 1},
    "chapati (1 medium)":    {"calories": 104, "protein": 3, "carbs": 18, "fat": 3},
    "paneer (100g)":         {"calories": 265, "protein": 18, "carbs": 1.2, "fat": 21},
    "chicken breast (100g)": {"calories": 165, "protein": 31, "carbs": 0, "fat": 3.6},
    "egg (1 whole)":         {"calories": 78,  "protein": 6, "carbs": 0.6, "fat": 5},
    "banana (1 medium)":     {"calories": 89,  "protein": 1.1, "carbs": 23, "fat": 0.3},
    "apple (1 medium)":      {"calories": 95,  "protein": 0.5, "carbs": 25, "fat": 0.3},
    "milk (1 cup)":          {"calories": 149, "protein": 8, "carbs": 12, "fat": 8},
    "curd (1 cup)":          {"calories": 154, "protein": 8.5, "carbs": 12, "fat": 8},
    "oats (100g dry)":       {"calories": 389, "protein": 17, "carbs": 66, "fat": 7},
    "almonds (1 oz)":        {"calories": 164, "protein": 6, "carbs": 6, "fat": 14},
}


# ──────────────────────────────────────────────────────────────
#  ROUTES
# ──────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html",
                           agent_name=AGENT_NAME,
                           agent_emoji=AGENT_EMOJI,
                           features=FEATURES)


@app.route("/api/chat", methods=["POST"])
def chat():
    """Main chat endpoint — calls Watsonx.ai Granite model."""
    data    = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    profile = data.get("profile")   # optional family profile

    if not message:
        return jsonify({"error": "Message cannot be empty"}), 400

    # Safety filter
    if is_out_of_scope(message):
        return jsonify({
            "response": SAFETY_CONFIG["out_of_scope_redirect"],
            "timestamp": datetime.now().strftime("%H:%M"),
        })

    try:
        history = get_conversation_history()
        prompt  = format_conversation_for_prompt(history, message, profile)

        model    = get_watsonx_model()
        response = model.generate_text(prompt=prompt)

        reply = response.strip() if isinstance(response, str) else str(response)

        # Append medical disclaimer if health-topic keywords present
        health_keywords = ["diabetes", "blood pressure", "cholesterol",
                           "thyroid", "heart", "kidney", "liver", "cancer",
                           "pregnancy", "medication", "supplement"]
        if (SAFETY_CONFIG["append_medical_disclaimer"]
                and any(kw in message.lower() for kw in health_keywords)):
            reply += SAFETY_CONFIG["medical_disclaimer"]

        # Save to session history
        history.append({"role": "user",      "content": message})
        history.append({"role": "assistant", "content": reply})
        save_conversation_history(history)

        return jsonify({
            "response":  reply,
            "timestamp": datetime.now().strftime("%H:%M"),
        })

    except ValueError as e:
        logger.error(f"Config error: {e}")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Watsonx error: {e}")
        return jsonify({
            "error": "I'm having trouble connecting to the AI service. "
                     "Please check your IBM credentials and try again."
        }), 500


@app.route("/api/bmi", methods=["POST"])
def bmi():
    """BMI & calorie calculator endpoint."""
    data = request.get_json(silent=True) or {}
    try:
        weight   = float(data["weight"])
        height   = float(data["height"])
        age      = int(data.get("age", 25))
        gender   = data.get("gender", "male")
        activity = data.get("activity", "moderate")

        bmi_result  = calculate_bmi(weight, height)
        tdee_result = calculate_tdee(weight, height, age, gender, activity)
        water_result= calculate_water_intake(weight, activity)

        return jsonify({
            "bmi":   bmi_result,
            "tdee":  tdee_result,
            "water": water_result,
        })
    except (KeyError, ValueError, ZeroDivisionError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400


@app.route("/api/nutrition-lookup", methods=["GET"])
def nutrition_lookup():
    """Return quick nutrition facts for common Indian foods."""
    query = request.args.get("q", "").lower()
    if not query:
        return jsonify({"items": list(NUTRITION_DB.keys())})

    matches = {k: v for k, v in NUTRITION_DB.items() if query in k.lower()}
    return jsonify({"results": matches})


@app.route("/api/meal-plan", methods=["POST"])
def meal_plan():
    """Generate a 7-day meal plan via Watsonx.ai."""
    data = request.get_json(silent=True) or {}
    goal        = data.get("goal",        "balanced diet")
    calories    = data.get("calories",    2000)
    preferences = data.get("preferences", "vegetarian")
    days        = data.get("days",        7)
    family      = data.get("family",      [])  # list of family member dicts

    family_str = ""
    if family:
        family_str = "\n\nFamily Members:\n" + "\n".join(
            f"- {m.get('name','Member')}, {m.get('age','?')} yrs, "
            f"{m.get('goal','healthy eating')}, restrictions: {m.get('restrictions','none')}"
            for m in family
        )

    prompt_text = (
        f"Create a detailed {days}-day meal plan for someone with the following requirements:\n"
        f"- Calorie target: {calories} kcal/day\n"
        f"- Dietary goal: {goal}\n"
        f"- Food preference: {preferences}\n"
        f"- Include breakfast, lunch, dinner, and 2 snacks per day\n"
        f"- Include calorie counts and macros for each meal\n"
        f"- Prefer Indian foods where possible\n"
        f"{family_str}\n\n"
        f"Format as a clean, structured meal plan."
    )

    try:
        full_prompt = format_conversation_for_prompt([], prompt_text)
        model       = get_watsonx_model()
        response    = model.generate_text(prompt=full_prompt)
        plan        = response.strip() if isinstance(response, str) else str(response)
        return jsonify({"plan": plan, "timestamp": datetime.now().isoformat()})
    except Exception as e:
        logger.error(f"Meal plan error: {e}")
        return jsonify({"error": "Failed to generate meal plan. Check AI credentials."}), 500


@app.route("/api/clear-chat", methods=["POST"])
def clear_chat():
    """Clear conversation history from session."""
    session.pop("conversation_history", None)
    return jsonify({"status": "cleared"})


@app.route("/api/status", methods=["GET"])
def status():
    """Health-check endpoint — verifies Watsonx credentials."""
    try:
        api_key    = os.getenv("IBM_API_KEY", "")
        project_id = os.getenv("WATSONX_PROJECT_ID", "")
        model_id   = os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-3-8b-instruct")
        configured = bool(api_key and project_id
                          and api_key != "your_ibm_cloud_api_key_here")
        return jsonify({
            "status":     "ready" if configured else "not_configured",
            "model":      model_id,
            "agent_name": AGENT_NAME,
            "features":   FEATURES,
            "indian_food":INDIAN_FOOD_ENABLED,
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ──────────────────────────────────────────────────────────────
#  Entry Point
# ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    logger.info(f"🥗 {AGENT_NAME} starting on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
