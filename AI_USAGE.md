# AI Usage Persistence & Validation — Postly Project

## Overview
AI tools were used as development accelerators to improve efficiency, catch edge cases, and explore alternative implementations. All core architecture, integrations, and production decisions were designed, validated, and manually tested.

**Tools used:**
*   **Claude** — structured reasoning, architecture validation, and schema planning
*   **ChatGPT** — debugging, test generation, and API integration reviews
*   **Gemini** — deployment troubleshooting and cross-checking alternative approaches

Final implementation decisions, refactors, and fixes were entirely human-validated.

---

## Auth System (JWT + Refresh Tokens)
**AI assistance:** Claude, ChatGPT

### AI-generated components:
*   Initial Express-based auth scaffolding
*   Token generation and middleware patterns

### Manual contributions:
*   Implemented refresh token persistence and rotation via PostgreSQL
*   Enforced short-lived (15 min) access and long-lived (7 days) refresh tokens
*   Integrated bcrypt (cost 12) for password hashing
*   Refined logout logic to properly invalidate refresh tokens

**Outcome:** A secure, production-grade JWT system consistent with the task specification.

---

## Database Schema (Prisma)
**AI assistance:** Claude

### AI-generated components:
*   Initial relational schema for users, posts, and accounts

### Manual contributions:
*   Split posts and platform_posts for per-platform job tracking
*   Defined indexes and foreign relations aligned with queue-based publishing
*   Embedded retry/failure tracking for platform-specific jobs
*   Validated schema alignment with actual API and queue flows

**Outcome:** A normalized, performance-conscious schema ready for real workloads.

---

## Telegram Bot Flow
**AI assistance:** ChatGPT, Claude

### AI-generated components:
*   Starter bot setup and basic command routing

### Manual contributions:
*   Designed full multi-step conversational flow (idea → tone → platform → AI → post)
*   Implemented Redis-based session state with 30-min expiry
*   Added extensive error handling for invalid or late user input
*   Integrated bot directly into backend APIs and the publishing queue

**Outcome:** A robust, stateful Telegram bot fully aligned with product requirements.

---

## AI Content Engine (OpenAI + Anthropic with Fallback)
**AI assistance:** Claude, ChatGPT

### AI-generated components:
*   API request/response templates for OpenAI and Claude integrations

### Manual contributions:
*   Implemented prompt architecture enforcing platform-specific rules (tone, length, hashtags)
*   Built a model management layer to dynamically switch between providers
*   Added fallback strategy (Anthropic → OpenAI → Groq)
*   Normalized AI responses by platform and aggregated token usage metrics

**Outcome:** A modular, extensible content engine that respects strict platform constraints.

---

## Queue & Publishing Pipeline (BullMQ)
**AI assistance:** ChatGPT

### AI-generated components:
*   BullMQ queue setup example

### Manual contributions:
*   Built one job per platform (fine-grained retry behavior)
*   Implemented retry with exponential backoff (1s → 5s → 25s)
*   Designed DB tracking for job attempts, errors, and publish timestamps
*   Created partial failure handling routines for independent platform posting

**Outcome:** Reliable queue infrastructure ensuring resilience and observability.

---

## Deployment (Docker + Railway)
**AI assistance:** ChatGPT, Gemini

### AI-generated components:
*   Initial Docker and Railway deployment configuration

### Manual contributions:
*   Corrected container startup order (DB/Redis ready checks)
*   Debugged environment variable mappings and network host issues
*   Verified live API endpoints and Telegram webhook functionality

**Outcome:** A clean, containerized deployment pipeline with reproducible setup through docker-compose.

---

## Debugging & Production Reliability
**AI assistance:** ChatGPT, Gemini

### AI-generated components:
*   General debugging strategies

### Manual contributions:
*   Fixed API token mismatch errors
*   Corrected invalid route mounts
*   Validated Redis session cleanup
*   Conducted end-to-end verification across bot → AI → queue → platform

**Outcome:** Fully functional, production-tested API and bot flow.

---

## Testing (Jest + Supertest)
**AI assistance:** ChatGPT

### AI-generated components:
*   Starter Jest/Supertest templates

### Manual contributions:
*   Tailored tests to actual API responses and schema
*   Added realistic test cases for:
    *   JWT auth and expiry handling
    *   Input validation for content generation
    *   Queue job creation and retrieval
    *   Post status tracking
    *   DB integration checks

**Outcome:** A meaningful test suite ensuring correctness and regression protection.

---

## Where AI Helped Most
*   Accelerating repetitive boilerplate generation (routes, configs)
*   Providing reference examples for API usage
*   Debugging complex async or networking issues

## Where Human Work Was Critical
*   Core architecture (bot → AI → queue → platform)
*   Schema design and query optimization
*   Fallback and retry logic
*   Secure token management and encryption handling
*   Production debugging and prompt fine-tuning

---

**Final Note**
All AI assistance served as a collaborative accelerator, not a code generator. Every section was reviewed, refactored, and verified through manual testing and reasoning. The final system functions cohesively, combining AI-assisted speed with human-level design rigor — aligned with Credes TechLabs’ emphasis on thoughtful engineering.
