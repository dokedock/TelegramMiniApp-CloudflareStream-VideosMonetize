# Telegram Mini App Video Sales Development Flow

> Current implementation uses the Chinese development flow in `开发流程.md`.
> The project has moved to a full Node.js + TypeScript stack instead of the earlier Python FastAPI plan.

## 1. Project Goal

Build a Telegram Mini App for selling private video access.

The system uses:

- Telegram Mini App as the buyer-facing interface.
- Python FastAPI as the backend API.
- Cloudflare Stream as the video hosting and playback layer.
- Cloudflare Stream signed tokens to prevent public sharing of video links.
- Player-level watermarks only, without FFmpeg video re-rendering for the MVP.

The MVP protects content by combining account-based access, short-lived playback tokens, visible order watermarks, official branding watermarks, playback logs, and manual enforcement. It does not claim to fully prevent screen recording.

## 2. Core Security Position

The product should be designed around realistic protection:

- Prevent casual saving, forwarding, and link sharing.
- Make leaked recordings traceable through visible order watermarks.
- Increase the cost of resale by placing watermarks inside the playback area.
- Keep Cloudflare Stream video IDs and playback tokens short-lived and permission-controlled.
- Record enough playback evidence to investigate abuse.

Player-level watermarks are acceptable for the MVP because Telegram mobile Mini Apps are harder for normal users to inspect than normal browser pages. However, the frontend is still not a cryptographic security boundary. Advanced users may still hide DOM overlays, inspect network requests in controlled environments, or record externally.

## 3. Recommended MVP Architecture

```text
Telegram Bot
    |
    | opens WebApp button
    v
Telegram Mini App frontend
    |
    | sends Telegram initData
    v
FastAPI backend
    |
    | validates initData
    | checks order entitlement
    | creates play session
    | creates Cloudflare Stream signed token
    v
Cloudflare Stream Player
    |
    | renders video
    | overlays order watermark + official watermark
    v
Buyer watches video
```

## 4. Watermark Strategy

Watermarks are rendered in the player layer, not burned into the video.

### 4.1 Buyer Watermark

The buyer watermark should only include the order identifier.

Example:

```text
Order: A8K29Q7M
```

Reasoning:

- Avoid exposing Telegram user IDs or usernames in a way that may feel too invasive.
- Keep the watermark short enough to display cleanly on mobile.
- Make leaked footage traceable through the internal order record.

The backend must keep the mapping:

```text
order_id -> telegram_user_id -> video_id -> purchase_time
```

### 4.2 Official Watermark

Add a separate official watermark controlled by the platform.

Examples:

```text
Official
brand.example
```

The final text should be replaced with the actual brand name before launch.

### 4.3 Placement Rules

Use both static and dynamic placement:

- Official watermark can stay in a consistent corner.
- Order watermark should move every 8-15 seconds.
- Order watermark should sometimes appear near the center, not only at the edges.
- Keep opacity around 0.18-0.35 so it is visible but not overly disruptive.
- Use `pointer-events: none` so overlays do not block playback controls.
- Keep watermarks inside the video frame, not outside the player.

### 4.4 Minimum MVP Watermark Behavior

For the first version:

- Show official watermark at top-right.
- Show order watermark in a moving overlay.
- Reposition order watermark on an interval.
- Include session code as a hidden or tiny secondary marker only if it does not hurt UX.

## 5. Main User Flow

1. User opens Telegram bot.
2. Bot shows products or opens the Mini App.
3. User opens Mini App.
4. Mini App receives Telegram `initData`.
5. Frontend calls backend `/api/auth/telegram`.
6. Backend validates `initData` signature and `auth_date`.
7. Frontend fetches available videos.
8. User buys a video or opens an already purchased video.
9. Backend verifies entitlement.
10. Backend creates a play session.
11. Backend requests or generates a Cloudflare Stream signed token.
12. Frontend loads the Stream player.
13. Frontend overlays official watermark and order watermark.
14. Backend records playback events.

## 6. Backend Development Plan

### 6.1 Stack

- Python 3.12+
- FastAPI
- Uvicorn
- SQLAlchemy or SQLModel
- PostgreSQL for production
- SQLite allowed for local MVP
- Alembic for migrations
- Pydantic settings for configuration

### 6.2 Environment Variables

```text
APP_ENV=development
DATABASE_URL=sqlite:///./local.db
TELEGRAM_BOT_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_STREAM_SIGNING_KEY_ID=
CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY=
CLOUDFLARE_API_TOKEN=
TOKEN_TTL_SECONDS=900
OFFICIAL_WATERMARK_TEXT=Official
```

### 6.3 Data Model

Initial tables:

```text
users
- id
- telegram_user_id
- username
- first_name
- last_name
- language_code
- created_at
- updated_at

videos
- id
- title
- description
- cloudflare_video_uid
- price_cents
- currency
- status
- created_at
- updated_at

orders
- id
- order_code
- user_id
- video_id
- amount_cents
- currency
- status
- provider
- provider_payment_id
- paid_at
- created_at
- updated_at

entitlements
- id
- user_id
- video_id
- order_id
- starts_at
- expires_at
- revoked_at
- created_at

play_sessions
- id
- session_code
- user_id
- video_id
- order_id
- ip_address
- user_agent
- token_expires_at
- created_at
- last_seen_at

play_events
- id
- play_session_id
- event_type
- playback_position_seconds
- created_at
```

### 6.4 API Endpoints

```text
POST /api/auth/telegram
- Input: initData
- Output: user profile, session token

GET /api/videos
- Output: public video catalog

GET /api/videos/{video_id}
- Output: video details and purchase/access state

POST /api/videos/{video_id}/play
- Requires: authenticated Telegram user
- Checks: entitlement
- Creates: play_session
- Output: Cloudflare signed playback URL/token, order_code, official watermark text, session_code

POST /api/play-sessions/{session_code}/events
- Records: play, pause, seek, heartbeat, ended

POST /api/orders
- Creates pending order

POST /api/payments/webhook
- Verifies payment provider event
- Marks order paid
- Grants entitlement
```

### 6.5 Telegram Auth Validation

Backend must:

- Parse Telegram Mini App `initData`.
- Verify hash using the Telegram bot token.
- Reject stale `auth_date`.
- Upsert the Telegram user.
- Never trust user identity from frontend fields unless the hash is valid.

Recommended `auth_date` max age:

```text
86400 seconds for normal auth
300 seconds for sensitive operations
```

## 7. Cloudflare Stream Development Plan

### 7.1 Video Settings

Each protected video should have:

- `requireSignedURLs` enabled.
- No public direct download permission.
- Playback only through signed token.

### 7.2 Token Settings

Recommended MVP token policy:

```text
TTL: 5-15 minutes
downloadable: false
accessRules: optional later
```

The backend should generate a fresh playback token every time the user starts playback.

### 7.3 Upload Flow

Admin upload can be added later. For MVP:

1. Upload videos manually through Cloudflare Dashboard or API.
2. Store `cloudflare_video_uid` in the `videos` table.
3. Manage video metadata in an admin seed script or simple admin endpoint.

## 8. Frontend Development Plan

### 8.1 Stack

- Vite
- React
- TypeScript
- Telegram Mini Apps SDK or direct `window.Telegram.WebApp`
- Cloudflare Stream iframe/player embed

### 8.2 Screens

MVP screens:

- Catalog screen
- Video detail screen
- Purchase status screen
- Player screen
- Error/expired access screen

### 8.3 Player Screen Behavior

The player screen should:

- Request playback token only after access check.
- Render Cloudflare Stream player.
- Overlay official watermark.
- Overlay moving order watermark.
- Send playback heartbeat every 15-30 seconds.
- Re-request a playback token if the token expires during a valid session.
- Hide purchase/catalog UI while in full playback mode.

### 8.4 Watermark DOM Shape

Recommended frontend structure:

```text
player-shell
- stream-player
- official-watermark
- order-watermark
```

Important CSS:

```text
position: absolute
pointer-events: none
user-select: none
z-index above player
```

The order watermark position should be state-driven and updated by timer.

## 9. Payment Plan

For Telegram-native payment:

- Use Telegram Bot Payments if the target payment provider is available.
- Confirm provider support for the seller's country and currency.

For external payment:

- Use Stripe, crypto payment gateway, or another provider.
- Payment webhook must be verified server-side.
- Entitlement should only be granted from a verified webhook or trusted admin action.

Payment can be mocked in development with a manual `mark_paid` admin function.

## 10. Admin Plan

MVP admin can be minimal:

- Seed videos from a script.
- View orders in database.
- Manually revoke entitlement.
- Manually mark leaked order.

Later admin panel:

- Create/edit videos.
- Upload or map Cloudflare videos.
- View users and orders.
- Revoke access.
- See suspicious play sessions.

## 11. Abuse Detection

Track simple signals first:

- Too many play sessions in a short time.
- Many IP addresses for the same order.
- Many user agents for the same order.
- Long continuous playback loops.
- Multiple concurrent sessions.

Possible enforcement:

- Soft warning.
- Temporary playback cooldown.
- Revoke entitlement.
- Manual review.

## 12. Development Milestones

### Milestone 1: Project Scaffold

- Create backend FastAPI app.
- Create frontend Vite React app.
- Add shared development documentation.
- Add `.env.example`.
- Add local run scripts.

### Milestone 2: Telegram Authentication

- Implement Telegram `initData` validation.
- Add users table.
- Add frontend auth bootstrap.
- Show authenticated user state in Mini App.

### Milestone 3: Video Catalog

- Add videos table.
- Seed sample Cloudflare Stream video UID.
- Show catalog and video detail screen.

### Milestone 4: Entitlements and Orders

- Add orders and entitlements tables.
- Add mock purchase flow for local testing.
- Gate player access by entitlement.

### Milestone 5: Cloudflare Stream Playback

- Enable signed URL playback.
- Add backend playback-token endpoint.
- Render Cloudflare Stream player in frontend.
- Deny playback without entitlement.

### Milestone 6: Player Watermarks

- Add official watermark overlay.
- Add moving order-code watermark overlay.
- Add responsive mobile layout.
- Verify watermark stays inside video frame.

### Milestone 7: Playback Logging

- Add play sessions.
- Add playback events and heartbeat.
- Add basic suspicious activity flags.

### Milestone 8: Payment Integration

- Choose payment provider.
- Create order creation endpoint.
- Verify payment webhook.
- Grant entitlement after paid event.

### Milestone 9: Deployment

- Deploy backend.
- Deploy frontend.
- Configure Telegram bot WebApp URL.
- Configure Cloudflare Stream credentials.
- Configure production database.
- Run end-to-end purchase and playback test.

## 13. Local Development Commands

These commands will be finalized after scaffolding.

Expected structure:

```text
backend/
frontend/
docs/
.env.example
DEVELOPMENT_FLOW.md
```

Expected commands:

```text
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

cd frontend
npm install
npm run dev
```

## 14. MVP Acceptance Criteria

The MVP is acceptable when:

- A Telegram user can open the Mini App.
- Backend validates Telegram identity from `initData`.
- User can see video catalog.
- User can access only purchased videos.
- Backend creates short-lived Cloudflare Stream playback credentials.
- Video plays inside the Mini App.
- Official watermark appears in the player.
- Order-code watermark appears and moves inside the player.
- Playback events are logged.
- Expired or unauthorized users cannot request playback tokens.

## 15. Known Limits

The MVP cannot fully prevent:

- External camera recording.
- OS-level screen recording.
- Advanced client modification.
- Network capture by determined attackers.
- DOM/CSS manipulation in controlled browser environments.

The MVP can strongly reduce casual resale and make leaks traceable through order codes.

## 16. Later Hardening Options

Add these only after the MVP is selling:

- Burned-in per-order FFmpeg watermark for high-value videos.
- Device binding.
- Concurrent playback limits.
- IP/geolocation anomaly detection.
- Admin review dashboard.
- Automated entitlement suspension.
- Cloudflare access rules if needed.
- Separate preview videos and paid full videos.
