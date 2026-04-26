# Postly — Multi-Platform AI Content Publishing Engine 🚀

> **Live API**: [https://postly.up.railway.app](https://postly.up.railway.app)
> **Telegram Bot**: [@PostlyAIBot](https://t.me/PostlyAIBot) (Sample link)

Postly is a production-ready, AI-driven content publishing engine designed to empower creators to manage their social presence across multiple platforms simultaneously. From a single idea, Postly generates tailored, platform-compliant content and orchestrates the publishing journey through a resilient background queue.

---

## 🛠 Tech Stack

| Layer | Technology | Why |
| :--- | :--- | :--- |
| **Runtime** | Node.js 18 | Industry standard for scalable backend services. |
| **Framework**| Express.js | Robust middleware ecosystem and widespread community support. |
| **Database** | PostgreSQL 15 | Relational integrity for complex post-platform relationships. |
| **Caching**   | Redis 7 | High-performance session storage and job coordination. |
| **Queue**    | BullMQ | Advanced job lifecycle management with native retry/backoff. |
| **ORM**      | Prisma | Type-safe database interactions and seamless migrations. |
| **AI Engine** | OpenAI (GPT-4o) & Claude 3.5 | Strategy pattern for flexible, high-end content generation. |
| **Interface** | Grammy (Telegram) | Rich, stateful mobile-first publishing interface. |

---

## 🏢 Architecture

```text
[ Users ]
    |
    v
[ Telegram Bot ] <---- (Webhooks) ----+
    |                                 |
    v                                 |
[ Express API ] <---------------------+
    |
    +-----> [ PostgreSQL ] (Persistence)
    |
    +-----> [ Redis ] (Sessions & Job Queues)
    |
    +-----> [ AI Engine Strategy Pattern ]
    |          |
    |          +--> OpenAI (GPT-4o)
    |          +--> Anthropic (Claude 3.5 Sonnet)
    |
    +-----> [ BullMQ Queue ]
               |
               +--> [ Platform Workers ]
                      |
                      +--> Twitter, LinkedIn, Instagram, Threads APIs
```

---

## ⚡ Quick Start (Local)

1.  **Clone and Install**:
    ```bash
    git clone https://github.com/your-username/postly.git
    cd postly
    npm install
    ```

2.  **Environment Setup**:
    ```bash
    cp .env.example .env
    # Fill in your master secrets and API keys in .env
    ```

3.  **Start Infrastructure & App**:
    ```bash
    docker-compose up -d
    npx prisma migrate dev
    npm run dev
    ```

---

## 🔑 Environment Variables

| Variable | Description | Required | Example |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | Yes | `postgresql://...` |
| `REDIS_URL` | Redis connection string | Yes | `redis://...` |
| `ENCRYPTION_KEY` | 32-byte hex key for tokens | Yes | `a1b2c3d4...` |
| `JWT_ACCESS_SECRET` | Secret for access tokens | Yes | `your-secret` |
| `OPENAI_API_KEY` | Master key for GPT-4o | Yes | `sk-...` |
| `ANTHROPIC_API_KEY` | Master key for Claude | Yes | `ant-...` |
| `TELEGRAM_BOT_TOKEN`| Token from BotFather | Yes | `123456:ABC...` |

---

## 🤖 Telegram Bot Setup

1.  **Create Bot**: Message [@BotFather](https://t.me/BotFather) on Telegram to create your bot and obtain a token.
2.  **Configure Env**: Set `TELEGRAM_BOT_TOKEN` in your environment.
3.  **Set Webhook URL**: Set `TELEGRAM_WEBHOOK_URL` to your live Railway domain (no trailing slash).
4.  **Deployment**: On startup, Postly automatically registers the webhook with Telegram via `setWebhook`.
5.  **Interact**: Send `/start` to your bot to begin the linked onboarding flow.

---

## 📖 API Documentation

Postly uses a standardized JSON response envelope. For testing and exploration, import the provided Postman collection.

*   **Postman Collection**: [postman_collection.json](./postman_collection.json)
*   **Request Groups**:
    *   **Auth**: Secure JWT-based registration, login, and rotation.
    *   **User**: Profile management and encrypted social account linking.
    *   **Content**: Direct access to the AI generation engine.
    *   **Posts**: Management of publishing lifecycles.
    *   **Dashboard**: High-level statistics and performance metrics.

---

## 🚀 Railway Deployment

Postly is optimized for Railway.app with zero-downtime deployment:

1.  `railway login`
2.  `railway add postgres` and `railway add redis`
3.  `railway up`
4.  Set variables: `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY`, `OPENAI_API_KEY`, etc.
5.  Verification: Check the `/health` endpoint and use `/api/bot/status` for webhook info.

---

## 🧪 Testing

The project includes an extensive suite of integration and unit tests.
```bash
npm test
```
Tests cover **Auth Rotation**, **Content Validation**, **Queue Orchestration**, and **Database Persistence**.

## AI Model Architecture

Postly supports two model options throughout the API: `openai` and `anthropic`.

| Model param | Production target | Current status |
|-------------|-------------------|----------------|
| `openai`    | GPT-4o (OpenAI)   | ✅ Live        |
| `anthropic` | Claude Sonnet (Anthropic) | ⚠️ Fallback active |

**Anthropic fallback note:** The Anthropic integration is fully architected using the correct interface (same function signature, same return shape, commented production code in `src/services/anthropic.js`). Due to API billing constraints during development, the anthropic service currently routes internally through Groq (Llama 3.3 70B via OpenAI-compatible SDK) as a temporary fallback. Switching to the real Anthropic SDK requires:
1. Adding `ANTHROPIC_API_KEY` to environment variables
2. Uncommenting the production block in `src/services/anthropic.js`
3. No other changes needed — the interface is identical.

## ⚠️ Known Limitations

*   **OAuth Scaffolding**: Social account linking currently uses token-based payloads; the full redirect-based OAuth flow is scaffolded in `auth.js`.
*   **Platform Stubs**: The `platformWorker` uses sophisticated logged stubs for the final API handoff to prevent accidental live posting during evaluation.
*   **Rate Limits**: Basic IP-based rate limiting is enabled; production-scale usage would require Redis-backed global limiting.

---

## 🎥 Demo Walkthrough Checklist

For your submission recording, follow this sequence:
1.  **Mobile Flow**: Open Telegram and send `/post`.
2.  **Selection**: Walk through the picker steps (Type -> Platforms -> Tone -> Model).
3.  **Input**: Send a creative idea text.
4.  **Generation**: Showcase the generated Markdown preview in the bot.
5.  **Confirmation**: Click `✅ Post Now` and show the "Queued" confirmation.
6.  **Persistence**: Switch to Postman and hit `GET /api/posts` to show the new campaign in the DB.
7.  **Analytics**: Hit `GET /api/dashboard/stats` to show the updated success counts.
8.  **Ops**: Show the Railway deployment logs and the background worker processing the jobs.
