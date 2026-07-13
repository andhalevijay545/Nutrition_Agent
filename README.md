# 🥗 NutriBot — AI-Powered Nutrition Agent

> Personalized nutrition planning powered by **IBM Watsonx.ai** and **IBM Granite** models.
> Built with Python Flask, Bootstrap 5, and a fully responsive chat UI.

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 **AI Chat** | Real-time nutrition Q&A via IBM Granite LLM |
| 📊 **Nutrition Dashboard** | Macro rings, superfoods spotlight, quick lookup |
| 📅 **Meal Planner** | AI-generated 3/7/14-day Indian & global meal plans |
| ⚖️ **BMI Calculator** | BMI + TDEE + water intake with visual gauge |
| 👨‍👩‍👧 **Family Profiles** | Per-member health goals & group plan generation |
| 🌙 **Dark Mode** | System-aware theme toggle |
| 📱 **Mobile Ready** | Fully responsive with slide-in sidebar |
| 🔧 **Agent Config** | One file (`agent_config.py`) to customize all AI behavior |

---

## 🏗️ Project Structure

```
NUTRITION AGENT/
├── app.py                  ← Flask backend + API routes
├── agent_config.py         ← ⭐ AI agent customization hub
├── requirements.txt        ← Python dependencies
├── .env.example            ← Environment variable template
├── .env                    ← Your credentials (never commit!)
├── templates/
│   └── index.html          ← Main UI template
└── static/
    ├── css/
    │   └── style.css       ← Custom styles + dark mode
    └── js/
        └── main.js         ← Frontend logic
```

---

## 🚀 Quick Start

### 1. Prerequisites

- Python 3.9 or higher
- An [IBM Cloud account](https://cloud.ibm.com/registration)
- IBM Watsonx.ai project with Granite model access

### 2. Clone & Install

```bash
# Clone / download the project
cd "NUTRITION AGENT"

# Create virtual environment (recommended)
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Mac/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure IBM Credentials

```bash
# Copy the template
copy .env.example .env        # Windows
cp .env.example .env          # Mac/Linux
```

Edit `.env` and fill in your credentials:

```env
IBM_API_KEY=your_ibm_cloud_api_key_here
WATSONX_PROJECT_ID=438fcb20-0072-4268-b360-48d7545afcca
WATSONX_URL=https://au-syd.ml.cloud.ibm.com
WATSONX_VERSION=5.4
WATSONX_MODEL_ID=ibm/granite-3-3-8b-instruct
FLASK_SECRET_KEY=generate-a-random-32-char-string
```

> Project management URL: `https://au-syd.dai.cloud.ibm.com/projects/438fcb20-0072-4268-b360-48d7545afcca/manage/general?context=cpdaas`

> Important: Do not use the project management URL as `WATSONX_URL`. Use the service endpoint `https://au-syd.ml.cloud.ibm.com`.

> Important: Use the Watsonx service base URL only, not the IBM AI Studio project management URL.

#### How to get IBM credentials:

1. **IBM API Key**: Go to [IBM Cloud → Manage → Access (IAM) → API Keys](https://cloud.ibm.com/iam/apikeys) → Create API Key
2. **Project ID**: Open [IBM Watsonx.ai](https://dataplatform.cloud.ibm.com/), create a project, copy the Project ID from Settings
3. **Watsonx URL**: Use `https://us-south.ml.cloud.ibm.com` (Dallas) or your region endpoint

### 4. Run the Application

```bash
python app.py
```

Open your browser: **http://localhost:5000**

---

## 🔧 Customizing the AI Agent

All agent behavior is controlled from a single file: **`agent_config.py`**

### Change Agent Persona & Tone

```python
AGENT_NAME = "NutriBot"    # Change the agent's name
AGENT_TONE = "friendly"    # Options: "friendly", "professional", "motivational", "clinical"
```

### Enable/Disable Diet Specializations

```python
DIET_SPECIALIZATIONS = {
    "weight_management":   True,
    "diabetes_friendly":   True,
    "keto_low_carb":       True,   # Enable keto support
    "intermittent_fasting": True,  # Enable IF protocols
    # ... etc
}
```

### Customize Indian Food Preferences

```python
INDIAN_FOOD_CONFIG = {
    "preferred_regions": ["North Indian", "South Indian", "Pan-Indian"],
    "vegetarian_first":  True,   # Suggest veg options first
    "seasonal_meals":    True,   # Festival & seasonal suggestions
    # ...
}
```

### Adjust Safety Rules

```python
SAFETY_CONFIG = {
    "min_daily_calories": 1000,      # Never recommend below this
    "max_single_meal_calories": 1200,
    "append_medical_disclaimer": True,
}
```

### Tune AI Model Parameters

```python
MODEL_PARAMS = {
    "temperature": 0.7,    # Higher = more creative responses
    "max_new_tokens": 1024, # Longer = more detailed plans
    "top_p": 0.9,
}
```

### Change Response Language

```python
RESPONSE_FORMAT = {
    "response_language": "Hindi",   # or "Hinglish"
    "use_emoji": True,
}
```

---

## 🌐 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `GET /` | GET | Main web UI |
| `POST /api/chat` | POST | Chat with Granite AI |
| `POST /api/bmi` | POST | BMI + calorie calculator |
| `POST /api/meal-plan` | POST | Generate AI meal plan |
| `GET /api/nutrition-lookup` | GET | Nutrition DB search |
| `POST /api/clear-chat` | POST | Clear session history |
| `GET /api/status` | GET | Health check |

### Chat API Example

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Give me a diabetic-friendly Indian breakfast plan"}'
```

### BMI API Example

```bash
curl -X POST http://localhost:5000/api/bmi \
  -H "Content-Type: application/json" \
  -d '{"weight": 70, "height": 170, "age": 30, "gender": "female", "activity": "moderate"}'
```

---

## ☁️ Deployment

### Option 1: IBM Cloud Code Engine

```bash
# Build and push Docker image
docker build -t nutrition-agent .
docker tag nutrition-agent us.icr.io/<namespace>/nutrition-agent
docker push us.icr.io/<namespace>/nutrition-agent

# Deploy to Code Engine
ibmcloud ce application create \
  --name nutrition-agent \
  --image us.icr.io/<namespace>/nutrition-agent \
  --env-from-secret nutrition-secrets \
  --port 5000
```

### Option 2: Render / Railway / Fly.io

1. Push code to GitHub
2. Connect your repo to [Render](https://render.com) or [Railway](https://railway.app)
3. Set environment variables in the dashboard
4. Build command: `pip install -r requirements.txt`
5. Start command: `gunicorn app:app --bind 0.0.0.0:$PORT`

### Option 3: Docker (Local / VPS)

Create a `Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "--workers", "2"]
```

```bash
docker build -t nutrition-agent .
docker run -p 5000:5000 --env-file .env nutrition-agent
```

---

## 🔒 Security Notes

- **Never commit `.env`** to version control. It's already in `.gitignore`
- Rotate your IBM API key regularly
- Set a strong `FLASK_SECRET_KEY` in production
- Use HTTPS in production (Nginx / Render handles this automatically)

---

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| `IBM_API_KEY not set` | Copy `.env.example` to `.env` and fill credentials |
| `Authentication failed` | Check API key at [IBM IAM](https://cloud.ibm.com/iam/apikeys) |
| `Project not found` | Verify `WATSONX_PROJECT_ID` in Watsonx.ai settings |
| `Model not available` | Check model ID is correct and access is granted |
| Chat shows "Connection error" | Verify Flask is running and visit `/api/status` |

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| **AI / LLM** | IBM Watsonx.ai + IBM Granite 3.3 8B Instruct |
| **Backend** | Python 3.11, Flask 3.0, Flask-CORS |
| **Frontend** | Bootstrap 5.3, Vanilla JS (ES6+), Bootstrap Icons |
| **Fonts** | Inter, Poppins (Google Fonts) |
| **Deployment** | Gunicorn, Docker, IBM Cloud Code Engine |

---

## 📄 License

MIT License — Feel free to use, modify, and distribute.

---

*Made with ❤️ using IBM Watsonx.ai and IBM Granite models*
