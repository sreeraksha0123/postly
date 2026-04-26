# AI Usage Persistence & Validation - Postly Backend

This document outlines how AI tools were utilized during the development of the Postly backend. It highlights the collaborative process between myself and the AI, focusing on the engineering decisions, technical validations, and modifications I made to ensure the system meets production-grade standards.

---

## Section: Project Scaffold and Docker Setup
**Tool used**: Google Antigravity (Gemini Pro)  
**What I asked it to do**: Generate a multi-container `docker-compose.yml` for Node.js, PostgreSQL 15, and Redis 7, including a robust folder structure for a service-oriented Express app.  
**What it generated**: A basic compose file and a flat directory structure.  
**What I changed or validated**: 
- **Healthchecks**: I manually refined the Docker healthchecks to use `pg_isready` for Postgres and `redis-cli ping` for Redis, ensuring the application container only attempts to connect when dependencies are truly ready.
- **Node Engine**: I locked the Node.js version to `18-alpine` in the Dockerfile to ensure consistent behavior across development and deployment environments.
- **Service Isolation**: I validated the custom bridge network configuration to ensure services can communicate via container names while remaining isolated from the host's default bridge.

## Section: Prisma Schema Design
**Tool used**: Claude 3.5 Sonnet  
**What I asked it to do**: Design a schema for a multi-platform publishing app covering Users, Social Accounts, and Posts.  
**What it generated**: A standard relational schema with several tables.  
**What I changed or validated**: 
- **Unique Constraints**: I added a composite unique constraint `@@unique([userId, platform])` on the `SocialAccount` model. This prevents a single user from linking duplicate accounts for the same platform, which is critical for the publishing logic.
- **Enums**: I converted platform names and post statuses into `enum` types to leverage PostgreSQL's native type safety.
- **Cascading Deletes**: I reviewed and kept `onDelete: Cascade` on the `PlatformPost` relation to ensure that deleting a parent campaign correctly purges its platform-specific children, preventing orphaned data.

## Section: Auth System (JWT + Refresh Token Rotation)
**Tool used**: Claude 3.5 Sonnet  
**What I asked it to do**: Implement a secure login/register flow with JWT and refresh token rotation.  
**What it generated**: Basic login routes and token generation logic.  
**What I changed or validated**: 
- **Rotation Logic**: I implemented specific logic in the `refresh` service to mark the old refresh token as `isRevoked: true` immediately upon use. This prevents replay attacks if a refresh token is compromised.
- **Error Codes**: I introduced distinct error codes (`TOKEN_EXPIRED`, `NO_TOKEN`, `INVALID_TOKEN`) to the middleware, allowing the frontend to differentiate between a user who needs a background refresh and a user who must be logged out.

## Section: Encryption Service (AES-256)
**Tool used**: Google Antigravity (Gemini Pro)  
**What I asked it to do**: Build an encryption utility to protect social media tokens.  
**What it generated**: A basic script using `crypto-js`.  
**What I changed or validated**: 
- **Refactoring to Native Crypto**: I rejected the use of external libraries like `crypto-js` and insisted on using the built-in Node.js `crypto` module for better performance and security auditability.
- **IV Management**: I implemented a randomized IV (initialization vector) for every encryption operation, stored as `iv:encryptedContent`. This ensures that the same token encrypted twice results in different ciphertexts, significantly increasing security.

## Section: Telegram Bot Conversation Flow
**Tool used**: Claude 3.5 Sonnet  
**What I asked it to do**: Create a multi-step bot flow using `grammy`.  
**What it generated**: A series of command handlers.  
**What I changed or validated**: 
- **State Persistence**: I integrated Redis as the primary state store (`bot:session:{chatId}`) with a strict 30-minute TTL. This prevents memory leaks on the server while allowing users to resume conversations if they momentarily leave the app.
- **Mapping Logic**: I implemented a translation layer in Redis (`bot:user:{chatId}`) to safely map Telegram IDs to internal UUIDs without exposing database primary keys to the Telegram API.

## Section: AI Content Engine and Prompt Engineering
**Tool used**: Google Antigravity (Gemini Pro)  
**What I asked it to do**: Build a service to generate content for Twitter, LinkedIn, and Instagram.  
**What it generated**: Basic API calls to OpenAI and Anthropic.  
**What I changed or validated**: 
- **Prompt Strategy**: I heavily modified the system prompt to include strict platform-specific constraints (e.g., "Twitter: MAX 280 chars", "LinkedIn: No emojis in the first line"). I validated these outputs to ensure the AI follows the JSON structure strictly for automated parsing.
- **Key Fallback**: I implemented the tiered key resolution logic, where the system first tries the user's decrypted personal key before falling back to the platform's global key.

## Section: BullMQ Queue Architecture
**Tool used**: Claude 3.5 Sonnet  
**What I asked it to do**: Set up a background worker to handle publishing.  
**What it generated**: A basic worker setup.  
**What I changed or validated**: 
- **Backoff Strategy**: I defined an exponential backoff strategy (`delay: 1000`, `attempts: 3`). I calculated that this sequence (1s -> 5s -> 25s) is optimal for handling transient social media API rate limits.
- **Worker Concurrency**: I tuned the worker `concurrency` to 5 to balance processing speed against potential IP-based rate limiting on the platform's outgoing requests.

## Section: Publishing Pipeline
**Tool used**: Google Antigravity (Gemini Pro)  
**What I asked it to do**: Connect the AI engine to the publishing queue.  
**What it generated**: A linear function that generated content then called the queue.  
**What I changed or validated**: 
- **Atomicity with Transactions**: I wrapped the database operations (creating the `Post` and multiple `PlatformPost` records) in a `Prisma.$transaction`. This ensures that if the system fails to queue even one platform, no records are created, maintaining strict data integrity.

## Section: Test Suite
**Tool used**: Claude 3.5 Sonnet  
**What I asked it to do**: Write integration tests for auth and posts.  
**What it generated**: Basic Jest test skeletons.  
**What I changed or validated**: 
- **Mocking External Services**: I manually implemented `jest.mock` for the BullMQ and AI content services. This allows the integration tests to run without incurring AI costs or connecting to a live Redis cluster, focusing strictly on the application's logic.
- **Round-Trip Validation**: I added final database assertions where the test directly queries Prisma to ensure data was persisted exactly as expected, going beyond simple HTTP status code checks.

---

## Section: How I used AI responsibly

During the development of Postly, AI acted as a highly efficient pair programmer, but never as an autonomous decision-maker. 

1. **Review and Refactor**: Every block of code generated by AI was reviewed line-by-line. In several instances (such as the transition from `crypto-js` to the native `crypto` module), I rejected AI suggestions that were less secure or reliant on unnecessary dependencies.
2. **Deep Understanding**: I can explain the "why" behind every architecture choice, from why we use Redis for bot sessions to the reasoning behind the exponential backoff in the publishing queue. I did not commit any logic that I could not manually replicate or debug.
3. **Tool, Not Replacement**: AI was used to speed up boilerplate generation and edge-case discovery. However, the core business logic—specifically the security middleware and the atomic database transactions—was architected and finalized from my technical perspective to ensure reliability and scalability.
