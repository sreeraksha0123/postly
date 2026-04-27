# Postly — Multi-Platform AI Content Publishing Engine

## Live API

[https://web-production-06a30.up.railway.app](https://web-production-06a30.up.railway.app/)

### Health Check

https://web-production-06a30.up.railway.app/health

---

## Telegram Bot

[https://t.me/postlypub_bot](https://t.me/postlypub_bot)

Postly is an AI-driven content publishing engine designed to help you manage your social media across multiple platforms at once. You give it an idea, it generates the right content for each platform, and then it queues it up to be published in the background.

---

## Tech Stack

| Layer | Technology | Why |
| :--- | :--- | :--- |
| **Runtime** | Node.js 18 | It's what I'm most comfortable with for backend work. |
| **Framework**| Express.js | Easy to set up and has tons of middleware. |
| **Database** | PostgreSQL 15 | Good for keeping my post states and user data organized. |
| **Caching**   | Redis 7 | Used for bot sessions and the job queue. |
| **Queue**    | BullMQ | Handles the background work and retries when APIs fail. |
| **ORM**      | Prisma | Helpful for keeping the database schema in sync. |
| **AI Engine** | OpenAI & Claude 3.5 | Swappable models for generating content. |
| **Interface** | Grammy (Telegram) | Fast way to build a mobile interface without an app store. |

---

## Architecture

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

## Quick Start (Local)

0. **Make sure Docker Desktop is running before step 3**

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

## How to link your Telegram account

This is 100% required if you want to use the bot. Without linking, the bot won't know who you are and `/post` will fail.

1. Register or login through the API (use the Postman collection).
2. Copy the `accessToken` from the response.
3. Open the Telegram bot and send `/login <your_access_token>`.
4. The bot will confirm you're linked, and then you can start posting.

---

## Billing Note

Both OpenAI and Anthropic integrations are fully wired. OpenAI works with a funded key. Anthropic routing goes through Groq during development — see `src/services/anthropic.js` for the commented production block. Adding a funded `ANTHROPIC_API_KEY` to Railway env vars switches it on with no code changes.

---

## Environment Variables

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

## API Documentation

Postly uses a standardized JSON response envelope. For testing and exploration, import the provided Postman collection.

*   **Postman Collection**: [postman_collection.json](./postman_collection.json)
*   **Base URL**: `https://web-production-2e4e19.up.railway.app`

---

## Testing

I wrote a bunch of tests to make sure the core logic works.
```bash
npm test
```
The tests cover Auth, Content generation, and the Queue.

---

## 🧪 Development Notes

This project involved multiple iterations to resolve real-world deployment issues, including:

- Docker + Alpine compatibility (OpenSSL, bcrypt)
- Railway healthcheck failures due to async startup
- Redis TLS and connection handling
- Prisma engine compatibility in containerized environments

Each issue was debugged and resolved to ensure a stable production deployment.

## AI Model Architecture

Postly supports two model options throughout the API: `openai` and `anthropic`.

| Model param | Production target | Current status |
|-------------|-------------------|----------------|
| `openai`    | GPT-4o (OpenAI)   | ✅ Live        |
| `anthropic` | Claude Sonnet (Anthropic) | ⚠️ Fallback active |

---

## Known Limitations

*   **Platform Stubs**: The platform worker logs what it would post but doesn't actually hit Twitter/LinkedIn APIs — I didn't want to spam real accounts during testing and getting OAuth approved takes longer than 4 days. The publishing pipeline, queue, retry logic, and status tracking all work correctly end to end — the last mile API call is stubbed.
*   **OAuth**: Right now account linking uses manual tokens; I didn't have time to finish the full OAuth redirect flow.
*   **Rate Limits**: I added some basic rate limiting but it's not ready for massive scale yet.

---

## Demo Walkthrough Checklist

1.  **Mobile Flow**: Open Telegram and send `/post`.
1.5 **Link Account**: Send `/login <your_access_token>` to link your account — without this, `/post` will return an error. Get the token from step 6 of the register flow.
2.  **Selection**: Walk through the picker steps (Type -> Platforms -> Tone -> Model).
3.  **Input**: Send a creative idea text.
4.  **Generation**: Showcase the generated Markdown preview in the bot.
5.  **Confirmation**: Click `✅ Post Now` and show the "Queued" confirmation.
6.  **Persistence**: Switch to Postman and hit `GET /api/posts` to show the new campaign in the DB.
7.  **Analytics**: Hit `GET /api/dashboard/stats` to show the updated success counts.
8.  **Ops**: Show the Railway deployment logs and the background worker processing the jobs.
