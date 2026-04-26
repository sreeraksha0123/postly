# Postly Architecture & Design

This document details the high-level architecture, data flows, and technical design decisions behind the Postly backend ecosystem.

---

## System Overview

Postly is built as a distributed, service-oriented system designed for high reliability and clean separation of concerns.

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

---

## Post Flow (End-to-End)

The lifecycle of a post involves multiple synchronous and asynchronous steps:

1.  **Initiation**: User sends `/post` to the Telegram Bot.
2.  **Session Loop**: Bot stores progress in **Redis** (`bot:session:{chatId}`). Steps: *Type -> Platforms -> Tone -> Model -> Idea*.
3.  **Content Synthesis**: On idea collection, the bot calls `/api/content/generate`. The **AI Engine** selects the designated model, applies platform-specific rules, and returns structured JSON content.
4.  **User Review**: The generated content is previewed in Telegram. The user clicks **✅ Post Now**.
5.  **Persistence**: The bot calls `/api/posts/publish`. The API uses a **Prisma Transaction** to atomically create:
    *   One `Post` record (status: `QUEUED`).
    *   Multiple `PlatformPost` records (one per selected platform).
6.  **Queuing**: `addPublishJobs()` is called, injecting unique jobs for each platform into the **BullMQ** `platform-publish` queue.
7.  **Execution**: The `platformWorker` picks up jobs, decrypts the user's social tokens, and transmits the content to platform APIs.
8.  **Status Sync**: Upon API response, the worker updates the `PlatformPost` status. The user can monitor progress via the `/status` command or the web dashboard.

---

## Redis Usage

Redis serves three critical roles in the Postly ecosystem:

*   **Conversation State**: `bot:session:{chatId}` stores the pending post configuration. TTL is set to **1800s (30m)** to ensure memory efficiency.
*   **Identity Mapping**: `bot:user:{chatId}` maps transient Telegram IDs to internal system `userIds` (UUIDs).
*   **Job Orchestration**: BullMQ utilizes Redis for its sorted sets and streams, enabling features like **Delayed Jobs** (for scheduling) and **Exponential Backoff**.

---

## Schema Design Decisions

*   **Stateful RefreshTokens**: Unlike stateless JWTs, `RefreshToken` records are stored in the database. This allows the server to implement **rotation and immediate revocation**, providing a crucial defense-over-depth layer.
*   **At-Rest Encryption**: All platform access/refresh tokens are stored as `ciphertext` using **AES-256-CBC**. This mitigates risk in the event of a database dump or read-only SQL injection.
*   **Granular Platform Tracking**: Each campaign (`Post`) is decomposed into individual `PlatformPost` records. This design allows for **per-platform retry logic** without re-generating AI content or multi-posting to already successful channels.
*   **Indexing Strategy**: 
    *   `userId` and `postId` are indexed across all tables to optimize lookup speed for the dashboard and list views.
    *   Composite unique index on `SocialAccount(userId, platform)` prevents duplicate integration issues.

---

## Partial Failure Handling

Publishing to 4 platforms simultaneously is prone to transient network failures. Postly handles this through:

*   **Independent Statuses**: If Twitter fails but LinkedIn succeeds, the system accurately marks the Twitter `PlatformPost` as `FAILED` while the LinkedIn record stays `PUBLISHED`.
*   **Campaign Integrity**: The master `Post` status represents the aggregate. It remains `PROCESSING` until all individual platform jobs reach a terminal state (`PUBLISHED` or `FAILED`).
*   **Targeted Retries**: The `/api/posts/:id/retry` endpoint only re-enqueues jobs for platforms that failed, preventing duplicate content deployment.
*   **Automated Backoff**: BullMQ retries every failed job up to **3 times** using an exponential backoff (1s, 5s, 25s) before marking it permanently dead.

---

## Technical Trade-offs

| Decision | Selection | Reasoning |
| :--- | :--- | :--- |
| **Communication** | **Webhooks** | Chose webhooks over polling for production to ensure instant message processing and better resource utilization under load. |
| **ORM** | **Prisma** | Selected for its strong type safety and robust migration tooling, which is essential for collaborative backend development. |
| **Web Server** | **Express** | Preferred over Fastify/Hapi due to the vast middleware ecosystem for security (Helmet, JWT) and its familiarity within the team. |
| **Queue** | **BullMQ** | Chosen over basic Redis Pub/Sub for its stateful job features, delayed scheduling, and native support for retries/concurrency. |
