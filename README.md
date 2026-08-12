# Disc Golf Shopify Integration

## Live test results — 2026-08-11

Verified end-to-end against the running production app (`inventory-reload.fusenv.com`)
by installing on a fresh dev store (`discreload-demo.myshopify.com`).

| Check | Result |
|---|---|
| Fresh install on a dev store (managed install, no OAuth screen) | ✅ app opens embedded in Shopify admin |
| Admin API call with expiring offline token | ✅ 200 (previously 403 on non-expiring token) |
| Embedded surface loads products via session token | ✅ 18 products listed, no cookies/localStorage auth |
| Billing gate — unsubscribed shop | ✅ shows "Choose your plan" |
| Plan approval (Shopify App Pricing, test charge) | ✅ approves and returns to app |
| Billing gate — after subscribing | ✅ app opens (cache no longer serves stale "none") |
| Privacy policy URL | ✅ `https://inventory-reload.fusenv.com/privacy` → 200 |
| Webhook endpoint with invalid HMAC | ✅ 401 |
| Shopify AI self-review (`/shopify-app-store-review`) | ✅ no failing requirements |
| Shopify embedded app checks (App Bridge + session tokens) | ✅ passed |
| App Store submission | ✅ Submitted — awaiting reviewer |

Released app version: `discreload-6`. See `docs/app-store/submission-guide.md`
for the full submission state.

A complete CQRS + Event Sourcing system for managing disc golf inventory on Shopify. Built with Next.js, TypeScript, SQLite, and follows the Adam Dymitruk / Martin Dilger event sourcing approach.

## Screenshot

<p align="center">
  <img src="docs/screenshot-product-detail.png" alt="Product detail screen: the disc centered on a light blue canvas, the color estimated from the photo, and the weight ready for submission to Shopify" width="480">
</p>

The product detail screen after both background jobs have run: the disc has been
centered on the light blue canvas by the image processing job, and its color has
been estimated from the original photo and matched to an available Shopify color.
Once a weight is entered, the variant can be created.

> Screenshot taken against a throwaway database with sample data.

## Architecture Overview

### Components

1. **NextJS Web Application** - User interface and API endpoints
2. **Background Processor** - Async jobs for color estimation and Shopify integration
3. **SQLite Databases** - Event store per user + system database

### Key Features

- Event-sourced architecture with full event replay
- JWT-based authentication for users
- API key authentication for background processor
- Automatic color estimation from photos
- Unique variant generation with weight tracking
- Retry logic for failed Shopify operations (up to 5 attempts)

## Flows

### Install & authentication (managed install + token exchange)

A merchant installs from the Shopify App Store; there is no OAuth redirect and
no shop-domain prompt. The embedded page loads App Bridge, gets a session
token, and exchanges it for an **expiring** offline token. The tenant is the
shop, so a reinstall reattaches to existing data.

```mermaid
sequenceDiagram
    participant M as Merchant
    participant Admin as Shopify admin (iframe)
    participant AB as App Bridge
    participant App as Next.js app
    participant S as Shopify OAuth

    M->>Admin: Install / open DiscReload
    Admin->>App: load /embedded (iframe)
    App->>AB: app-bridge.js (first script)
    AB-->>App: window.shopify.idToken()
    App->>App: POST /api/auth/shopify/token-exchange (Bearer session token)
    App->>S: token exchange (expiring: 1)
    S-->>App: access_token (1h) + refresh_token (90d)
    App->>S: GraphQL locations query
    S-->>App: stocking location
    App->>App: provisionShopConnection (tenant = shop)
    App-->>Admin: dashboard renders
```

### Expiring offline token refresh

The Admin API rejects non-expiring tokens, so every caller — embedded queries
and the background processor alike — goes through `connectionWithFreshToken`,
which renews from the refresh token before the access token expires.

```mermaid
sequenceDiagram
    participant C as Caller (embedded query / processor)
    participant T as validAccessToken()
    participant DB as system.db
    participant S as Shopify OAuth

    C->>T: connectionWithFreshToken(tenantId)
    T->>DB: read connection
    alt token still valid
        T-->>C: cached access_token
    else expired (or within 5-min skew)
        T->>S: grant_type=refresh_token
        S-->>T: new access_token + refresh_token
        T->>DB: updateConnectionTokens
        T-->>C: fresh access_token
    end
```

### Add a disc → Shopify variant

Staff photograph a disc; two background phases run off the event store. Colour
estimation and image processing happen right after intake, and the Shopify
variant is created once a weight and description are submitted.

```mermaid
sequenceDiagram
    participant Staff
    participant App as Next.js app
    participant ES as Event store (tenant.db)
    participant BP as Background processor
    participant S as Shopify Admin API

    Staff->>App: POST begin-create-product (photo)
    App->>App: auth + subscription gate
    App->>ES: event (status: data-entry)

    Note over BP: poll cycle (~5s)
    BP->>S: estimate colour from photo
    BP->>BP: centre disc + remove background
    BP->>ES: photo processed, colour set

    Staff->>App: POST finish-create-product (weight + description)
    App->>ES: event (status: creating)

    Note over BP: next poll cycle
    BP->>App: GET shopify-connections (fresh tokens)
    BP->>S: productVariantsBulkCreate + media (qty 1)
    S-->>BP: variant created
    BP->>ES: event (status: created)
```

### Billing gate (Shopify App Pricing)

Shopify hosts plan selection and charging; the app only reads whether the shop
has an active subscription (the trial counts as active) from its own Admin API.
The blocking "none" answer is re-checked promptly so the gate opens as soon as
the merchant approves a plan.

```mermaid
sequenceDiagram
    participant M as Merchant
    participant App as Next.js app
    participant S as Shopify Admin API
    participant P as Shopify App Pricing (hosted)

    M->>App: open embedded app
    App->>S: currentAppInstallation.activeSubscriptions
    alt has active subscription
        S-->>App: ACTIVE
        App-->>M: dashboard
    else none
        S-->>App: (none)
        App-->>M: "Choose your plan"
        M->>P: select plan
        P-->>App: redirect back with charge_id
        App->>S: re-check (skip cache)
        S-->>App: ACTIVE
        App-->>M: dashboard
    end
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Shopify store with Admin API access

### 1. Shopify Setup

Legacy in-admin custom apps can no longer be created; the app is distributed as
a custom-distribution app owned by the operator:

1. Go to https://dev.shopify.com/dashboard and create an app ("Start from Dev Dashboard")
2. Create a version with these Admin API scopes:
   - `read_products`
   - `write_products`
   - `write_files`
   - `read_files`
   - `read_locations`
   - `write_inventory`
   - `read_inventory`
3. Set the Redirect URI to `https://{your-domain}/api/auth/shopify/callback`
   (add `http://localhost:3000/api/auth/shopify/callback` for local development)
4. Release the version and install the app on the client's store
   (custom distribution install link)
5. Copy the Client ID and Client Secret from the app's Settings page into
   `nextjs-app/.env`

The store's access token is NOT configured anywhere: after logging in, the
admin enters the store's `*.myshopify.com` domain on the dashboard and
approves the app. That produces a non-expiring offline token, stored with the
store's primary location in the system database. Until this happens, the app
is locked for everyone.

### 2. Generate Secrets

```bash
# JWT Secret
openssl rand -base64 32

# API Key for background processor
openssl rand -base64 32
```

### 3. Install Dependencies

```bash
# NextJS app
cd nextjs-app
npm install

# Background processor
cd ../background-processor
npm install
```

### 4. Configure Environment

**nextjs-app/.env**
```env
DATABASE_PATH=./data/system.db
TENANT_DATABASES_PATH=./data/tenants

JWT_SECRET=<your-generated-jwt-secret>
JWT_EXPIRATION=7d

# Required - the app refuses all requests if unset
BACKGROUND_PROCESSOR_API_KEY=<your-generated-api-key>

# From the Dev Dashboard app (see Shopify Setup). Shop domains and inventory
# locations are captured per tenant in the UI connect flow, not configured here.
SHOPIFY_CLIENT_ID=<your-app-client-id>
SHOPIFY_CLIENT_SECRET=<your-app-client-secret>
SHOPIFY_SCOPES=read_products,write_products,write_files,read_files,read_locations,write_inventory,read_inventory
SHOPIFY_REDIRECT_URI=https://{your-domain}/api/auth/shopify/callback
SHOPIFY_API_VERSION=2025-10

PORT=3000
```

**background-processor/.env**
```env
NEXTJS_API_URL=http://localhost:3000
NEXTJS_API_KEY=<same-api-key-as-above>

POLLING_INTERVAL_MS=5000

# Each tenant's offline token, shop domain and location come from the
# /api/queries/shopify-connections endpoint - only the API version is env
SHOPIFY_API_VERSION=2025-10

OPENAI_API_KEY=<your-openai-api-key>
OPENAI_IMAGE_MODEL=gpt-image-2
IMAGE_BACKGROUND_HEX=#ADD8E6
IMAGE_CANVAS_SIZE=1024
IMAGE_MARGIN_PX=48
```

### 5. Run the Applications

**Development:**

```bash
# Terminal 1: NextJS app
cd nextjs-app
npm run dev

# Terminal 2: Background processor
cd background-processor
npm run dev
```

**Production:**

```bash
# NextJS app
cd nextjs-app
npm run build
npm start

# Background processor
cd background-processor
npm run build
npm start
```

### 6. First Time Setup

The app is multi-tenant with open self-serve registration: each registration
creates a new tenant (a store and its staff) with its own event database.

1. Navigate to http://localhost:3000 and click "Register your store"
2. Register with email + password - you become the admin of a new tenant
3. On the dashboard, enter your store's `*.myshopify.com` domain and approve
   the app on Shopify (one-time; the offline token never expires). A store
   can be actively connected by only one tenant.
4. Invite your staff from "Manage Users" - they share your tenant's
   inventory and are blocked until step 3 is done.

Every tenant repeats the same flow independently; the background processor
serves all tenants from one process.

Dev reset: delete `nextjs-app/data/` (system + tenant databases) and clear
browser localStorage (old tokens are rejected).

### Migrating from per-user databases

Deployments that predate tenant databases can merge the old
`data/users/*.db` event databases into one tenant's database (register the
tenant first):

```bash
cd nextjs-app
node scripts/migrate-to-tenant-db.js --tenant <tenant-uuid>
```

Shopify token events are deliberately not migrated - the tenant's admin
simply re-connects the store from the dashboard.

## Usage

### Admin Workflow

1. **Create Restocker Accounts**
   - Login as admin
   - Click "Create User" (if implemented in UI)
   - Provide email and temporary password
   - Restocker must change password on first login

### Product Creation Workflow

1. **Select Product**
   - Click "Create Product"
   - Search/select Shopify product from dropdown

2. **Capture Photo**
   - Take photo or upload from gallery
   - Photo is stored in event store

3. **Color & Weight**
   - Background processor estimates color automatically
   - Review/adjust color in dropdown
   - Enter weight (e.g., "168G RED PRISM Foil")

4. **Create**
   - Click "Create in Shopify"
   - Background processor creates variant with:
     - Unique weight (appends 2, 3, etc. if duplicate)
     - Selected color
     - Uploaded photo
     - Inventory quantity: 1

## API Endpoints

### Authentication

- `POST /api/auth/register` - Create first admin (one-time)
- `POST /api/auth/login` - User login
- `POST /api/auth/change-password` - Change password
- `POST /api/admin/create-user` - Create restocker (admin only)

### Commands

- `POST /api/commands/begin-create-product`
- `POST /api/commands/record-product-color`
- `POST /api/commands/finish-create-product`
- `POST /api/commands/record-product-created-in-shopify` (API key only)
- `POST /api/commands/record-product-failed-in-shopify` (API key only)
- `POST /api/commands/record-product-image-processed` (API key only)
- `POST /api/commands/record-product-image-processing-failed` (API key only)

### Queries

- `GET /api/queries/shopify-products` - List Shopify products
- `GET /api/queries/user-products` - User's products
- `GET /api/queries/product-state` - Product status
- `GET /api/queries/product-image` - Product photo (`?variant=original|processed`, defaults to `original`)
- `GET /api/queries/products-needing-color-estimation` (API key only)
- `GET /api/queries/products-needing-image-processing` (API key only)
- `GET /api/queries/products-to-create-in-shopify` (API key only)
- `GET /api/queries/product-details-for-shopify` (API key only)

## Database Schema

### System Database (`data/system.db`)

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'restocker')),
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
```

### User Event Store (`data/users/{user-uuid}.db`)

```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL,  -- JSON
    photo_blob BLOB,            -- Only for BeginProductCreated
    timestamp INTEGER NOT NULL,
    version INTEGER NOT NULL
);
```

## Event Types

1. **BeginProductCreated** - Product creation started (carries the photo blob)
2. **ColorEstimated** - Color estimated by background processor
3. **ColorSetV2** - Estimated RGB matched to an available Shopify color name
4. **ProductWeightSet** - Weight entered by user
5. **ProductReadyToBeCreated** - Ready for Shopify creation
6. **ProductCreated** - Successfully created in Shopify
7. **ProductCreateFailed** - Failed to create (with retry count)
8. **ProductImageProcessed** - Disc centered on the light blue canvas (carries the processed blob)
9. **ProductImageProcessingFailed** - Image processing failed (with retry count)
10. **ShopifyTokenReceived** - OAuth token stored on the `shopify-auth` aggregate

## Product States

- `data-entry` - User is entering information
- `creating` - Being created in Shopify
- `created` - Successfully created
- `failed` - Failed after 5 attempts

## Background Processor Jobs

### Job 1: Color Estimation

1. Polls for products without color
2. Downloads product image
3. Resizes to 100x100
4. Calculates average RGB
5. Records color via command API

### Job 2: Image Processing

1. Polls for products with a photo but no processed image
2. Reads the **original** photo (never the processed one — Job 1 depends on it)
3. Sends it to OpenAI `images/edits` (`gpt-image-2`) to replace the surroundings with light blue
4. Uses `sharp` to trim to the disc's bounding box and re-center it on an exact
   `IMAGE_CANVAS_SIZE` canvas filled with `IMAGE_BACKGROUND_HEX`
5. Records `ProductImageProcessed` with the resulting PNG
6. Retries up to 5 times, recording `ProductImageProcessingFailed` each time

The generative step handles background replacement only; centering, canvas size,
margin, and the exact background color are done deterministically in `sharp`, so
they do not depend on how precisely the model framed the image.

### Job 3: Shopify Creation

1. Polls for products ready to create **and already image-processed**
2. Maps RGB to color name
3. Ensures unique weight variant
4. Uploads the **processed** image to Shopify
5. Creates variant with photo, color, weight
6. Records success/failure
7. Retries up to 5 times on failure

Note: because Shopify creation waits for the processed image, a product whose
image processing fails all 5 attempts stays in `data-entry` and is never created.
The product page surfaces this.

## Development Notes

### CQRS + Event Sourcing Principles

- **Commands modify state** → emit events
- **Events are immutable** → append-only log
- **Queries replay events** → compute current state
- **No read model optimization** → full replay every time (MVP)

### Event Replay Example

```typescript
function replayEvents(events: Event[]): ProductState {
  let state = { status: 'not-started' };
  for (const event of events) {
    switch (event.eventType) {
      case 'BeginProductCreated':
        state = { ...state, status: 'data-entry', ... };
        break;
      // ... handle other events
    }
  }
  return state;
}
```

## Troubleshooting

### Database Issues

- Databases are created automatically on first run
- Located in `nextjs-app/data/` directory
- One `system.db` + one `{uuid}.db` per user

### Shopify API Errors

- Check API token has correct scopes
- Verify product exists in Shopify
- Check rate limits (background processor will retry)

### Background Processor Not Running

- Ensure API key matches in both .env files
- Check NextJS app is running and accessible
- Verify NEXTJS_API_URL is correct

## Future Enhancements

- Optimized read models (projections)
- Bulk upload
- Inventory management (mark as sold)
- Analytics dashboard
- Mobile native app
- Advanced color detection (ML)

## Tech Stack

- **Frontend:** Next.js 14+, React, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Node.js
- **Database:** SQLite (better-sqlite3)
- **Authentication:** JWT, bcrypt
- **Image Processing:** Sharp
- **E-commerce:** Shopify Admin API

## License

MIT

## Support

For issues and questions, please refer to the original specification document.
