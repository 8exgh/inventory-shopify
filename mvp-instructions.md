# Disc Golf Shopify Integration - Technical Specification

**Version:** 1.0  
**Date:** November 12, 2025  
**Architecture:** CQRS + Event Sourcing (Adam Dymitruk / Martin Dilger approach)

---

## 1. Executive Summary

This system enables disc golf store staff to rapidly add inventory to Shopify by capturing product photos, selecting product types, and entering weight information. Each disc is treated as a unique 1-of-1 item with its own photo, color, and weight variant.

---

## 2. System Architecture Overview

### 2.1 Components

1. **NextJS Web Application** (TypeScript)
    - User interface (responsive: phone/tablet)
    - Command handlers
    - Query endpoints
    - JWT-based authentication for users
    - API key authentication for background processor

2. **Background Processor** (Node.js with TypeScript)
    - Standalone process
    - Polls NextJS query endpoints
    - Processes color estimation
    - Creates Shopify variants
    - API key authentication

3. **Databases**
    - `system.db` - SQLite database for user accounts
    - `{user-uuid}.db` - Per-user SQLite write model databases (CQRS+ES)

4. **External Integration**
    - Shopify Admin API (REST or GraphQL)

### 2.2 Architecture Pattern: CQRS + Event Sourcing

**Write Model:**
- Commands modify state
- Commands emit events
- Events are stored in user-specific SQLite databases
- Each aggregate (product) has a unique UUID

**Read Model:**
- Queries compute state by replaying all events from beginning of time
- No optimized read models in MVP
- Full event replay for every query

**Event Store Schema (per user database):**
```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL, -- JSON
    photo_blob BLOB, -- Only populated for BeginProductCreated events
    timestamp INTEGER NOT NULL,
    version INTEGER NOT NULL
);

CREATE INDEX idx_aggregate_id ON events(aggregate_id);
CREATE INDEX idx_event_type ON events(event_type);
```

---

## 3. Database Schemas

### 3.1 System Database (`system.db`)

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY, -- UUID v4
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'restocker')),
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE(email)
);

-- First time setup: No users exist
-- System allows creation of first user (admin)
-- Admin can create restocker accounts
```

### 3.2 User Write Model Database (`{user-uuid}.db`)

```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT NOT NULL,
    photo_blob BLOB,
    timestamp INTEGER NOT NULL,
    version INTEGER NOT NULL
);

CREATE INDEX idx_aggregate_id ON events(aggregate_id);
CREATE INDEX idx_event_type ON events(event_type);
CREATE INDEX idx_timestamp ON events(timestamp);
```

---

## 4. Commands, Events, and Aggregates

### 4.1 Product Aggregate

**Aggregate ID:** UUID v4 (generated on Begin Create Product)

#### Commands

1. **BeginCreateProduct**
    - **Input:**
        - `aggregateId` (UUID v4, new)
        - `shopifyProductId` (string)
        - `shopifyProductTitle` (string)
        - `photoBlob` (binary data)
        - `photoMimeType` (string, e.g., "image/jpeg")
    - **Emits:** `BeginProductCreated`

2. **RecordProductColor**
    - **Input:**
        - `aggregateId` (UUID)
        - `color` (object: `{r: number, g: number, b: number}`)
    - **Emits:** `ColorEstimated`

3. **FinishCreateProduct**
    - **Input:**
        - `aggregateId` (UUID)
        - `weight` (string, user-entered text)
    - **Emits:**
        - `ProductWeightSet`
        - `ProductReadyToBeCreated`

4. **RecordProductCreatedInShopify**
    - **Input:**
        - `aggregateId` (UUID)
        - `shopifyVariantId` (string)
        - `createdAt` (timestamp)
    - **Emits:** `ProductCreated`

5. **RecordProductFailedInShopify**
    - **Input:**
        - `aggregateId` (UUID)
        - `errorMessage` (string)
        - `attemptNumber` (integer)
    - **Emits:** `ProductCreateFailed`

#### Events

1. **BeginProductCreated**
   ```json
   {
     "shopifyProductId": "string",
     "shopifyProductTitle": "string",
     "photoMimeType": "string"
   }
   ```
    - **Special:** `photo_blob` column populated

2. **ColorEstimated**
   ```json
   {
     "color": {"r": 0-255, "g": 0-255, "b": 0-255}
   }
   ```

3. **ProductWeightSet**
   ```json
   {
     "weight": "string"
   }
   ```

4. **ProductReadyToBeCreated**
   ```json
   {}
   ```

5. **ProductCreated**
   ```json
   {
     "shopifyVariantId": "string",
     "createdAt": 1234567890
   }
   ```

6. **ProductCreateFailed**
   ```json
   {
     "errorMessage": "string",
     "attemptNumber": 1-5
   }
   ```

---

## 5. API Endpoints

### 5.1 Authentication

**POST /api/auth/register** (First time only, no users exist)
- Creates first admin user
- Input: `{ email, password }`
- Output: `{ userId, token }`

**POST /api/auth/login**
- Input: `{ email, password }`
- Output: `{ userId, token, mustChangePassword }`

**POST /api/auth/change-password**
- Requires JWT
- Input: `{ oldPassword, newPassword }`
- Output: `{ success }`

**POST /api/admin/create-user** (Admin only)
- Requires JWT (admin role)
- Input: `{ email, password }`
- Output: `{ userId }`

### 5.2 Commands (Require JWT or API Key)

**POST /api/commands/begin-create-product**
- Auth: JWT (user's own data) or API Key
- Input: `{ userId, aggregateId, shopifyProductId, shopifyProductTitle, photoBlob (base64), photoMimeType }`
- Output: `{ success, aggregateId }`

**POST /api/commands/record-product-color**
- Auth: JWT or API Key
- Input: `{ userId, aggregateId, color: {r, g, b} }`
- Output: `{ success }`

**POST /api/commands/finish-create-product**
- Auth: JWT or API Key
- Input: `{ userId, aggregateId, weight }`
- Output: `{ success }`

**POST /api/commands/record-product-created-in-shopify**
- Auth: API Key only
- Input: `{ userId, aggregateId, shopifyVariantId, createdAt }`
- Output: `{ success }`

**POST /api/commands/record-product-failed-in-shopify**
- Auth: API Key only
- Input: `{ userId, aggregateId, errorMessage, attemptNumber }`
- Output: `{ success }`

### 5.3 Queries (Require JWT or API Key)

**GET /api/queries/shopify-products**
- Auth: JWT or API Key
- Output: `{ products: [{ id, title }] }`
- Calls Shopify Admin API to list products

**GET /api/queries/products-needing-color-estimation**
- Auth: API Key only
- Output: `{ tasks: [{ userId, aggregateId }] }`
- Logic: Finds all `BeginProductCreated` events without subsequent `ColorEstimated` events across all user databases

**GET /api/queries/product-image**
- Auth: JWT or API Key
- Query params: `userId`, `aggregateId`
- Output: Binary image data with appropriate Content-Type
- Logic: Read `photo_blob` from first event for aggregate

**GET /api/queries/products-to-create-in-shopify**
- Auth: API Key only
- Output: `{ tasks: [{ userId, aggregateId }] }`
- Logic: Finds all products with `ProductReadyToBeCreated` but no `ProductCreated` event, and fewer than 5 `ProductCreateFailed` events

**GET /api/queries/product-details-for-shopify**
- Auth: API Key only
- Query params: `userId`, `aggregateId`
- Output: `{ shopifyProductId, shopifyProductTitle, color: {r,g,b}, weight }`
- Logic: Replay events to build product state

**GET /api/queries/product-state**
- Auth: JWT or API Key
- Query params: `userId`, `aggregateId`
- Output: `{ status, shopifyProductId, shopifyProductTitle, color?, weight?, errorMessage? }`
- Status values: `data-entry`, `creating`, `created`, `failed`
- Logic: Replay events to determine current state

**GET /api/queries/user-products**
- Auth: JWT (user's own products) or API Key
- Query params: `userId`
- Output: `{ products: [{ aggregateId, status, shopifyProductTitle }] }`
- Logic: Replay all events for user to list all products

---

## 6. User Interface Flow

### 6.1 First Time Setup
1. System detects no users in `system.db`
2. Shows "Create Admin Account" form
3. User enters email/password
4. Admin account created

### 6.2 Admin Login
1. Admin logs in with email/password
2. Home screen shows:
    - "Create Product" button
    - "Create User" button (admin only)
    - List of all products with status

### 6.3 Create Restocker Account (Admin Only)
1. Admin clicks "Create User"
2. Admin enters email/password for new restocker
3. Restocker account created with `must_change_password = 1`

### 6.4 Restocker First Login
1. Restocker logs in with provided credentials
2. Forced to change password screen
3. After password change, redirected to home

### 6.5 Create Product Flow

**Step 1: Select Product**
- Click "Create Product" button
- Load Shopify products via `/api/queries/shopify-products`
- Display searchable/filterable list
- User selects product (e.g., "Destroyer Swirled Star Eveliina Salonen Signature Series")

**Step 2: Capture Photo**
- Show camera interface (HTML5 `<input type="file" capture="environment">`)
- User takes photo or uploads from gallery
- Generate new UUID for aggregate
- Call `/api/commands/begin-create-product` with photo
- Navigate to `/product/{aggregateId}`

**Step 3: Color Selection**
- Page polls `/api/queries/product-state` every 1 second
- Initially shows "Estimating color..." spinner
- When color estimated, dropdown appears with color pre-selected
- Color dropdown options: Red, Orange, Yellow, Green, Blue, Purple, Pink, White, Black, Gray, Brown, Multi-Color
- Color mapping logic (RGB to color name):
    - Find closest color by Euclidean distance in RGB space
- User can change color in dropdown
- On change, call `/api/commands/record-product-color` immediately

**Step 4: Enter Weight**
- Text input field for weight (e.g., "168G RED PRISM Foil")
- User enters weight as free text

**Step 5: Create**
- User clicks "Create" button
- Call `/api/commands/finish-create-product` with weight
- Status updates to "Creating in Shopify..."
- Continue polling `/api/queries/product-state`
- Eventually shows "Created in Shopify ✓" or "Failed to Create in Shopify ✗"

### 6.6 Home Screen Product List
- Displays all products for current user
- Columns: Product Title, Status, Aggregate ID (truncated)
- Statuses:
    - `data-entry`: In progress, not submitted
    - `creating`: Submitted, being created in Shopify
    - `created`: Successfully created in Shopify
    - `failed`: Failed to create in Shopify
- Clicking a row navigates to `/product/{aggregateId}`

---

## 7. Background Processor

### 7.1 Configuration

**Environment Variables:**
```
NEXTJS_API_URL=http://localhost:3000
NEXTJS_API_KEY=<generated-secure-key>
POLLING_INTERVAL_MS=5000
```

### 7.2 Job Loop Structure

```typescript
while (true) {
  await runColorEstimationJob();
  await runShopifyCreationJob();
  await sleep(POLLING_INTERVAL_MS);
}
```

### 7.3 Job 1: Color Estimation

**Steps:**
1. Call `/api/queries/products-needing-color-estimation`
2. For each `{ userId, aggregateId }`:
   a. Call `/api/queries/product-image?userId={}&aggregateId={}`
   b. Download image binary
   c. Run color estimation algorithm:
    - Load image using image processing library (e.g., `sharp` or `jimp`)
    - Resize to 100x100 for performance
    - Calculate average RGB values (or use k-means clustering for dominant color)
    - Return `{r, g, b}`
      d. Call `/api/commands/record-product-color` with color
      e. Handle errors gracefully (log and continue)

**Color Estimation Algorithm (Simple Heuristic):**
```typescript
function estimateColor(imageBuffer: Buffer): {r: number, g: number, b: number} {
  // Use sharp or jimp to load image
  // Resize to 100x100
  // Calculate average RGB across all pixels
  // Return {r, g, b}
  
  // Alternative: Use k-means clustering to find dominant color
  // For MVP, average RGB is sufficient
}
```

### 7.4 Job 2: Shopify Variant Creation

**Steps:**
1. Call `/api/queries/products-to-create-in-shopify`
2. For each `{ userId, aggregateId }`:
   a. Call `/api/queries/product-image?userId={}&aggregateId={}` to get image
   b. Call `/api/queries/product-details-for-shopify?userId={}&aggregateId={}` to get details
   c. Map color RGB to color name using same logic as UI
   d. Generate unique weight string:
    - Query existing variants for the Shopify product
    - Check if weight string exists
    - If exists, append " 2", " 3", etc. until unique
      e. Upload image to Shopify
      f. Create variant with:
    - Color: mapped color name
    - Weight: unique weight string
    - Inventory quantity: 1
    - Image: uploaded image ID
      g. On success: Call `/api/commands/record-product-created-in-shopify`
      h. On failure:
    - Determine attempt number (count `ProductCreateFailed` events + 1)
    - If attempt <= 5: Call `/api/commands/record-product-failed-in-shopify`
    - Log error details

**Shopify API Calls:**
```typescript
// Get existing variants to check for duplicate weights
GET /admin/api/2024-10/products/{productId}/variants.json

// Upload image
POST /admin/api/2024-10/products/{productId}/images.json
Body: { image: { attachment: base64String } }

// Create variant
POST /admin/api/2024-10/products/{productId}/variants.json
Body: {
  variant: {
    option1: colorName,
    option2: uniqueWeightString,
    inventory_quantity: 1,
    image_id: uploadedImageId
  }
}
```

---

## 8. Security

### 8.1 User Authentication (JWT)

**JWT Payload:**
```json
{
  "userId": "uuid",
  "role": "admin|restocker",
  "exp": 1234567890
}
```

**JWT Secret:** Environment variable `JWT_SECRET` (generated, secure)

**Token Expiration:** 7 days

**Endpoints Protected:**
- All `/api/commands/*` (except requires userId in request matches JWT userId, or API key)
- All `/api/queries/*` (except for userId-specific queries, must match JWT)
- `/api/admin/*` (requires admin role)

### 8.2 Background Processor Authentication (API Key)

**API Key:** Environment variable `BACKGROUND_PROCESSOR_API_KEY` (generated, secure, 32+ chars)

**Header:** `X-API-Key: <api-key>`

**Full Access:** API key grants access to all commands and queries for all users

### 8.3 Password Requirements

- Minimum 8 characters
- Must contain uppercase, lowercase, number
- Hashed using bcrypt (cost factor 10)

### 8.4 Network Security

- **NextJS ↔ Background Processor:** HTTP within LAN (no HTTPS needed)
- **User ↔ NextJS:** HTTPS via reverse proxy (reverse proxy terminates SSL)
- No exposed passwords in logs
- No sensitive data in JWT beyond userId/role

---

## 9. Technology Stack

### 9.1 NextJS Application

**Framework:** Next.js 14+ (App Router)

**Language:** TypeScript

**Key Libraries:**
- `jsonwebtoken` - JWT handling
- `bcrypt` - Password hashing
- `better-sqlite3` - SQLite driver (synchronous, fast)
- `uuid` - UUID generation
- `zod` - Request validation
- **Shopify API:** `@shopify/shopify-api` (official library)

**Minimal Libraries:** Avoid unnecessary dependencies

**File Structure:**
```
/app
  /api
    /auth
      login/route.ts
      register/route.ts
      change-password/route.ts
    /admin
      create-user/route.ts
    /commands
      begin-create-product/route.ts
      record-product-color/route.ts
      finish-create-product/route.ts
      record-product-created-in-shopify/route.ts
      record-product-failed-in-shopify/route.ts
    /queries
      shopify-products/route.ts
      products-needing-color-estimation/route.ts
      product-image/route.ts
      products-to-create-in-shopify/route.ts
      product-details-for-shopify/route.ts
      product-state/route.ts
      user-products/route.ts
  /product/[aggregateId]/page.tsx
  page.tsx (home)
  layout.tsx
/lib
  /db
    system.ts (system.db operations)
    user-db.ts (user write model db operations)
  /commands
    product-commands.ts
  /queries
    product-queries.ts
  /auth
    jwt.ts
    password.ts
  /shopify
    client.ts
/types
  events.ts
  commands.ts
  queries.ts
```

### 9.2 Background Processor

**Runtime:** Node.js 18+

**Language:** TypeScript

**Build:** `tsc` (TypeScript compiler)

**Key Libraries:**
- `node-fetch` or `axios` - HTTP requests
- `sharp` or `jimp` - Image processing
- **Minimal dependencies**

**File Structure:**
```
/src
  index.ts (main loop)
  /jobs
    color-estimation.ts
    shopify-creation.ts
  /utils
    api-client.ts
    color-estimation.ts
/dist (compiled JS)
```

**Execution:**
```bash
npm run build  # tsc
npm start      # node dist/index.js
```

### 9.3 Databases

**System Database:** `system.db` - Lives in project root or `/data` directory

**User Databases:** `{user-uuid}.db` - Lives in `/data/users/` directory

**SQLite Version:** 3.x (via better-sqlite3)

---

## 10. CQRS + Event Sourcing Implementation Details

### 10.1 Event Sourcing Principles (Adam Dymitruk / Martin Dilger)

**Key Concepts:**
1. **Events are facts:** Immutable, past tense, append-only
2. **Commands are intentions:** Can be rejected
3. **Aggregates are consistency boundaries:** Each product is an aggregate
4. **Event replay:** State is computed by replaying events
5. **No shortcuts:** Always replay from beginning in MVP (optimization later)

### 10.2 Command Handling Pattern

```typescript
function handleCommand(command: Command, userId: string): void {
  const db = openUserDatabase(userId);
  
  // 1. Load aggregate (replay events)
  const events = loadEvents(db, command.aggregateId);
  const state = replayEvents(events);
  
  // 2. Validate command against current state
  validateCommand(command, state);
  
  // 3. Generate events
  const newEvents = applyCommand(command, state);
  
  // 4. Persist events
  const currentVersion = events.length;
  for (const [index, event] of newEvents.entries()) {
    insertEvent(db, {
      aggregateId: command.aggregateId,
      eventType: event.type,
      eventData: JSON.stringify(event.data),
      photoBlob: event.photoBlob || null,
      timestamp: Date.now(),
      version: currentVersion + index + 1
    });
  }
}
```

### 10.3 Query Pattern

```typescript
function executeQuery(query: Query, userId: string): any {
  const db = openUserDatabase(userId);
  
  // Always replay all events from beginning
  const events = loadAllEvents(db, query.aggregateId);
  const state = replayEvents(events);
  
  // Return computed state
  return transformStateForQuery(state, query);
}
```

### 10.4 Event Replay Logic

```typescript
function replayEvents(events: Event[]): ProductState {
  let state: ProductState = { status: 'not-started' };
  
  for (const event of events) {
    switch (event.eventType) {
      case 'BeginProductCreated':
        state = {
          ...state,
          status: 'data-entry',
          shopifyProductId: event.data.shopifyProductId,
          shopifyProductTitle: event.data.shopifyProductTitle,
          photoMimeType: event.data.photoMimeType
        };
        break;
      
      case 'ColorEstimated':
        state = { ...state, color: event.data.color };
        break;
      
      case 'ProductWeightSet':
        state = { ...state, weight: event.data.weight };
        break;
      
      case 'ProductReadyToBeCreated':
        state = { ...state, status: 'creating' };
        break;
      
      case 'ProductCreated':
        state = {
          ...state,
          status: 'created',
          shopifyVariantId: event.data.shopifyVariantId
        };
        break;
      
      case 'ProductCreateFailed':
        state = {
          ...state,
          status: 'failed',
          errorMessage: event.data.errorMessage,
          failureCount: (state.failureCount || 0) + 1
        };
        break;
    }
  }
  
  return state;
}
```

---

## 11. Error Handling

### 11.1 Command Failures

**Invalid Command:**
- Return 400 Bad Request
- Include validation error message

**Business Rule Violation:**
- Return 409 Conflict
- Example: Cannot finish product that hasn't been started

**System Error:**
- Return 500 Internal Server Error
- Log error with stack trace
- Do not persist event

### 11.2 Query Failures

**Not Found:**
- Return 404 Not Found
- Example: User database doesn't exist

**System Error:**
- Return 500 Internal Server Error
- Log error

### 11.3 Background Processor Errors

**Transient Errors (Shopify API rate limit, network):**
- Log error
- Continue to next item
- Will retry on next polling cycle

**Permanent Errors (invalid product, authorization):**
- Call `record-product-failed-in-shopify` command
- After 5 failures, stop attempting (query excludes from list)

### 11.4 Logging

**Log Levels:** INFO, WARN, ERROR

**Log Format:**
```json
{
  "timestamp": "2025-11-12T10:30:00Z",
  "level": "ERROR",
  "component": "background-processor",
  "job": "shopify-creation",
  "userId": "uuid",
  "aggregateId": "uuid",
  "message": "Failed to create variant",
  "error": "..."
}
```

**Log Destinations:**
- Console (stdout/stderr)
- Optional: File rotation (future enhancement)

---

## 12. Configuration & Environment Variables

### 12.1 NextJS Application

```env
# Database
DATABASE_PATH=./data/system.db
USER_DATABASES_PATH=./data/users

# JWT
JWT_SECRET=<generated-secure-secret>
JWT_EXPIRATION=7d

# API Key
BACKGROUND_PROCESSOR_API_KEY=<generated-secure-key>

# Shopify
SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=<admin-api-token>
SHOPIFY_API_VERSION=2024-10

# Server
PORT=3000
```

### 12.2 Background Processor

```env
# NextJS API
NEXTJS_API_URL=http://localhost:3000
NEXTJS_API_KEY=<same-as-nextjs-BACKGROUND_PROCESSOR_API_KEY>

# Polling
POLLING_INTERVAL_MS=5000

# Shopify (for direct API calls)
SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=<admin-api-token>
SHOPIFY_API_VERSION=2024-10
```

---

## 13. Deployment & Setup

### 13.1 Initial Setup

1. **Clone/Create Project**
2. **Install Dependencies**
   ```bash
   cd nextjs-app && npm install
   cd ../background-processor && npm install
   ```

3. **Create Data Directories**
   ```bash
   mkdir -p data/users
   ```

4. **Generate Secrets**
   ```bash
   # JWT Secret
   openssl rand -base64 32
   
   # API Key
   openssl rand -base64 32
   ```

5. **Configure Environment Variables**
    - Copy `.env.example` to `.env`
    - Fill in Shopify credentials
    - Add generated secrets

6. **Initialize System Database**
    - On first run, NextJS app creates `system.db` if it doesn't exist

7. **Create Shopify Custom App**
    - Go to Shopify Admin → Settings → Apps and sales channels → Develop apps
    - Create new app
    - Configure Admin API scopes: `read_products`, `write_products`, `write_files`
    - Install app and copy access token

### 13.2 Running the System

**Development:**
```bash
# Terminal 1: NextJS
cd nextjs-app
npm run dev

# Terminal 2: Background Processor
cd background-processor
npm run dev
```

**Production:**
```bash
# NextJS (behind reverse proxy with HTTPS)
cd nextjs-app
npm run build
npm start

# Background Processor (as systemd service or similar)
cd background-processor
npm run build
npm start
```

### 13.3 Reverse Proxy Configuration (Example: nginx)

```nginx
server {
    listen 443 ssl;
    server_name discgolf.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 14. Testing Strategy

### 14.1 Unit Tests (Future Enhancement)

- Command handlers
- Query handlers
- Event replay logic
- Color estimation algorithm

### 14.2 Integration Tests (Future Enhancement)

- End-to-end product creation flow
- Shopify API integration
- Background processor jobs

### 14.3 Manual Testing Checklist (MVP)

**User Management:**
- [ ] First admin creation
- [ ] Admin login
- [ ] Admin creates restocker
- [ ] Restocker first login & password change
- [ ] Restocker login after password change

**Product Creation:**
- [ ] Select Shopify product
- [ ] Upload photo
- [ ] Color estimation completes
- [ ] Change color in dropdown
- [ ] Enter weight
- [ ] Submit product
- [ ] Verify created in Shopify with correct variant
- [ ] Verify unique weight numbering (2, 3, etc.)

**Error Scenarios:**
- [ ] Invalid credentials
- [ ] Photo upload failure
- [ ] Shopify API error
- [ ] Retry after failure (up to 5 times)

**UI:**
- [ ] Responsive on phone
- [ ] Responsive on tablet
- [ ] Product list shows correct statuses
- [ ] Polling updates UI in real-time

---

## 15. Future Enhancements (Out of Scope for MVP)

1. **Optimized Read Models**
    - Materialized views for queries
    - Projections updated on event insert

2. **Bulk Upload**
    - Upload multiple discs at once
    - CSV import

3. **Inventory Management**
    - Mark discs as sold
    - Remove from inventory

4. **Analytics Dashboard**
    - Products created per day
    - Most common colors/weights
    - Staff performance metrics

5. **Advanced Color Estimation**
    - Machine learning model
    - Multi-color detection

6. **Mobile Native App**
    - React Native or Flutter
    - Better camera integration

7. **Audit Log**
    - Track all user actions
    - Review history

8. **Product Editing**
    - Modify product after creation
    - Update photo, color, weight

---

## 16. Acceptance Criteria

### 16.1 Functional Requirements

✅ **User Management:**
- First time setup creates admin account
- Admin can create restocker accounts
- Restockers must change password on first login
- Secure authentication with JWT

✅ **Product Creation Workflow:**
- Select existing Shopify product
- Capture/upload photo
- Automatic color estimation
- Manual color override
- Free-text weight entry
- Unique weight variant generation (append 2, 3, etc.)
- Set quantity to 1
- Attach photo to variant

✅ **Background Processing:**
- Color estimation runs automatically
- Shopify variant creation runs automatically
- Retry up to 5 times on failure
- Proper error handling and logging

✅ **User Interface:**
- Responsive (phone/tablet)
- Real-time status updates (1 second polling)
- Home page product list with statuses
- Clear wizard-style flow

✅ **CQRS + Event Sourcing:**
- Commands emit events
- Events stored in per-user databases
- Queries replay events
- Proper aggregate boundaries

### 16.2 Non-Functional Requirements

✅ **Security:**
- JWT authentication for users
- API key authentication for background processor
- Password hashing with bcrypt
- HTTPS termination at reverse proxy

✅ **Performance:**
- Queries complete in < 1 second (MVP, small datasets)
- Background jobs process items continuously
- No bottlenecks for single-user usage

✅ **Reliability:**
- Graceful error handling
- Retry logic for transient failures
- Event log integrity (atomic writes)

✅ **Maintainability:**
- Clean separation of concerns
- Minimal dependencies
- Clear code structure
- TypeScript for type safety

---

## 17. Glossary

- **Aggregate:** A cluster of domain objects treated as a single unit (Product in this case)
- **Command:** An intention to perform an action (imperative, can be rejected)
- **Event:** A fact that something happened (past tense, immutable)
- **CQRS:** Command Query Responsibility Segregation (separate write and read models)
- **Event Sourcing:** Storing all changes as a sequence of events
- **Write Model:** The system that processes commands and emits events
- **Read Model:** The system that projects events into queryable views
- **JWT:** JSON Web Token (authentication mechanism)
- **API Key:** Secret key for service-to-service authentication
- **Shopify Admin API:** Shopify's API for managing store data
- **Variant:** A specific version of a product (in Shopify, products have variants for options like size, color)

---

## 18. Appendix A: Color Mapping Reference

### RGB to Color Name Mapping

```typescript
const COLOR_REFERENCES = {
  'Red': { r: 255, g: 0, b: 0 },
  'Orange': { r: 255, g: 165, b: 0 },
  'Yellow': { r: 255, g: 255, b: 0 },
  'Green': { r: 0, g: 255, b: 0 },
  'Blue': { r: 0, g: 0, b: 255 },
  'Purple': { r: 128, g: 0, b: 128 },
  'Pink': { r: 255, g: 192, b: 203 },
  'White': { r: 255, g: 255, b: 255 },
  'Black': { r: 0, g: 0, b: 0 },
  'Gray': { r: 128, g: 128, b: 128 },
  'Brown': { r: 139, g: 69, b: 19 },
  'Multi-Color': { r: 128, g: 128, b: 128 } // Default/fallback
};

function mapRgbToColorName(rgb: {r: number, g: number, b: number}): string {
  let minDistance = Infinity;
  let closestColor = 'Multi-Color';
  
  for (const [colorName, refRgb] of Object.entries(COLOR_REFERENCES)) {
    if (colorName === 'Multi-Color') continue; // Skip multi-color in matching
    
    const distance = Math.sqrt(
      Math.pow(rgb.r - refRgb.r, 2) +
      Math.pow(rgb.g - refRgb.g, 2) +
      Math.pow(rgb.b - refRgb.b, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = colorName;
    }
  }
  
  return closestColor;
}
```

---

## 19. Appendix B: Shopify Product Structure

### How Variants Work in Shopify

**Product:**
- Title: "Destroyer Swirled Star Eveliina Salonen Signature Series"
- Options: ["Color", "Weight"]

**Variants:**
- Variant 1: Green, 168G RED PRISM Foil
- Variant 2: Green, 168G RED PRISM Foil 2
- Variant 3: Blue, 175G BLUE Foil

Each variant has:
- Unique SKU (auto-generated or specified)
- Inventory quantity (always 1 for this system)
- Image (specific to this variant)
- Price (inherited from product or overridden)

### Ensuring Unique Variants

Since Shopify requires unique option value combinations, the system appends " 2", " 3", etc. to the weight option value to ensure uniqueness even when color and base weight are the same.

**Algorithm:**
1. Query existing variants for product
2. Extract all weight option values
3. Check if desired weight exists
4. If exists, append " 2" (or " 3", " 4", etc.) until unique
5. Create variant with unique weight value

---

## 20. Sign-off

This specification represents the complete architecture and implementation requirements for the Disc Golf Shopify Integration MVP. The system follows CQRS + Event Sourcing principles as defined by Adam Dymitruk and Martin Dilger, with per-user event stores and full event replay for all queries.

**Key Architectural Decisions:**
- Per-user SQLite databases for write models
- Event sourcing with full replay (no read model optimization in MVP)
- Separation of concerns: NextJS for web + commands/queries, Background processor for async jobs
- Minimal dependencies, TypeScript throughout
- JWT for users, API key for background processor
- No HTTPS between internal components (handled by reverse proxy)

**Implementation Notes:**
- Follow the command/event patterns strictly
- Always replay events from beginning for queries
- No shortcuts or optimizations in MVP
- Events are immutable and append-only
- Each aggregate (product) is independent

This specification should provide a senior software engineer with everything needed to implement the system without requiring additional clarification on architecture or requirements.

---

**End of Specification**