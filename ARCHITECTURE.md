# Postly Architecture & Design

I built Postly to be a system that takes an idea and turns it into posts for different social media sites. It uses a Telegram bot for the interface, an Express API to do the heavy lifting, and a background queue to actually send the posts out even if the user closes the app.

---

## System Overview

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
    +-----> [ Redis ] (Sessions, Mappings, Job Queues)
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

One thing that surprised me was how much I ended up using Redis for. It's doing three different jobs right now—holding bot sessions, mapping Telegram IDs to my database users, and running the BullMQ queues. I know it probably feels a bit overloaded to have one service doing all that, but I decided to keep it this way because adding another service like RabbitMQ would have made the Docker setup way more complicated for a 4-day project.

---

## Post Flow (End-to-End)

The way a post goes from an idea to being published is a mix of stuff happening right away and stuff happening in the background:

1.  **Initiation**: User sends `/post` to the Telegram Bot.
2.  **Session Loop**: Bot stores progress in **Redis** (`bot:session:{chatId}`). Steps: *Type -> Platforms -> Tone -> Model -> Idea*.
3.  **Content Synthesis**: On idea collection, the bot calls `/api/content/generate`. The **AI Engine** picks the model and generates the JSON. *Note: This step is synchronous, so it blocks the bot response until the AI is done. The idea of making it async with a callback came up, but I think the UX of "wait here" is better for a bot than sending a message later saying it's done.*
4.  **User Review**: The generated content is previewed in Telegram. The user clicks **✅ Post Now**.
5.  **Persistence**: The bot calls `/api/posts/publish`. The API uses a transaction to create the `Post` and `PlatformPost` records.
6.  **Queuing**: Jobs are added to BullMQ.
7.  **Execution**: The worker picks up jobs and sends them to the platforms.
8.  **Status Sync**: The worker updates the status in the DB.

---

## Redis Usage

Redis is the heart of the bot state:

*   **Conversation State**: `bot:session:{chatId}` stores the pending post. I set a 30-minute timeout so I don't fill up memory with old conversations.
*   **Identity Mapping**: `bot:user:{chatId}` maps Telegram IDs to my internal UUIDs.
*   **Job Orchestration**: BullMQ uses Redis to manage the job states and retries.

---

## Schema Design Decisions

*   **Stateful RefreshTokens**: I'm storing refresh tokens in the DB so I can revoke them if a user logs out.
*   **At-Rest Encryption**: I'm using AES-256-CBC to encrypt all the social media tokens. If someone gets access to my database, they won't be able to just steal the keys and post as everyone.
*   **Granular Platform Tracking**: Each platform has its own record. This means if Twitter fails but LinkedIn works, I can just retry the Twitter part later.

---

## Partial Failure Handling

I spent a lot of time thinking about what happens when things break:

*   **Independent Statuses**: Each platform is tracked separately.
*   **Targeted Retries**: You can retry just the failed platforms via the API.
*   **Automated Backoff**: BullMQ retries failed jobs 3 times with a delay.
*   **Missing Case**: One edge case I haven't fully handled — if the BullMQ job is added but then Redis crashes before the job is processed, the job is lost. The DB record says QUEUED but nothing will ever pick it up. The retry endpoint exists for this but requires manual intervention. A proper fix would be transactional outbox pattern but that was out of scope for 4 days.

---

## Technical Trade-offs

| Decision | Selection | Reasoning |
| :--- | :--- | :--- |
| **Communication** | **Webhooks** | I used webhooks because it's faster than polling, though it was harder to test locally. |
| **ORM** | **Prisma** | I like the type safety it gives me, it saved me from a lot of stupid mistakes. |
| **Queue** | **BullMQ** | It has better retry features than just using regular Redis lists. |
| **Anthropic Billing**| **Groq fallback** | Anthropic billing wasn't active; Groq gives same JSON interface so swap is one line when funded. |
