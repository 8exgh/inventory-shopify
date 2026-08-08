# App Store submission package — Disc Golf Inventory

Everything needed to take the app from "code complete" to "submitted for review."
Code phases (GraphQL, embedded app, compliance webhooks, billing gate) are done;
what remains is CLI config deploy + dashboard work, which requires your logins.

## 0. One-time prerequisites (you)

1. **Distribution check**: dev.shopify.com/dashboard → the app → Distribution.
   - If custom distribution was already locked in (the disctopiaco fix), create a
     **new app** ("Disc Golf Inventory") and use its client id/secret everywhere
     below; update the two GitHub secrets (`SHOPIFY_SEAN_SHOPIFY_CLIENT_ID/SECRET`)
     and the `client_id` in `shopify.app.toml`, then redeploy.
   - If distribution is still unset, the existing app can be made public.
2. **Shopify CLI**: `npm i -g @shopify/cli` then, from the repo root:
   ```bash
   shopify auth login              # interactive, browser
   shopify app config link --client-id <client-id>   # adopt the dashboard app
   # review the diff it makes to shopify.app.toml, keep our version's values
   shopify app deploy              # pushes config: embedded, scopes, webhooks
   ```
   This activates **managed installation** (scopes granted at install, token
   exchange, no OAuth redirect) and registers the compliance webhooks.
3. **Partner API token** (billing enforcement): https://partners.shopify.com/191775751
   → Settings → Partner API clients → create client with `View financials`
   access. Org id is 191775751 and the app id is 407119855617. Set GitHub
   secrets in the devops repo: `SHOPIFY_SEAN_PARTNER_API_TOKEN`,
   `SHOPIFY_SEAN_PARTNER_ORG_ID` (number in your partner dashboard URL),
   `SHOPIFY_SEAN_PARTNER_APP_ID` (numeric app id). Until these are set the app
   treats every store as subscribed (dev-friendly default).

## 1. App Pricing plan (dashboard)

During submission (or under the app's Pricing section) create one plan:

| Field | Value |
|---|---|
| Plan name | Standard |
| Price | $9.00 USD / 30 days |
| Free trial | 14 days |

Shopify hosts plan selection/upgrades/cancellation; the app links merchants to
`https://admin.shopify.com/store/{store}/charges/disc-golf-inventory/pricing_plans`
and lands them on `/embedded/welcome` afterward.

## 2. Listing content (paste-ready)

- **App name**: `Disc Golf Inventory` (matches shopify.app.toml — required)
- **App introduction** (≤100 chars):
  `Photograph one-of-a-kind discs and list them as variants with color, weight and foil details.`
- **App details** (≤500 chars):
  `Built for disc golf stores selling one-of-one discs. Staff photograph each disc from a phone; the app centers the disc on a clean background, estimates its color, and creates a Shopify variant on the right product with weight, rim/foil description, SKU and quantity 1 — ready to sell in seconds. Sold-out uniqueness is handled automatically, weights and descriptions autocomplete from your existing listings, and your whole team can work in parallel with staff accounts.`
- **Feature bullets** (≤80 chars each):
  - `Phone photo to live variant in seconds — color estimated automatically`
  - `Clean, centered product images generated from quick phone photos`
  - `Weight + rim/foil descriptions autocomplete from your catalog`
  - `Quantity-1 variants with SKUs for one-of-a-kind inventory`
  - `Staff accounts for restockers — no Shopify admin access needed`
- **Search terms** (5): `disc golf`, `inventory`, `one of one`, `variants`, `product photos`
- **Categories**: Store management → Inventory management (adjust to available taxonomy)
- **Privacy policy URL**: `https://inventory-reload.fusenv.com/privacy`
- **Support**: `support@fusenv.com` (create this mailbox/alias before submitting)
- **Emergency developer contact**: your email + phone (Partner Dashboard field)

## 3. Media (you capture; specs below)

- **Icon**: `docs/app-store/icon-1200.png` (1200×1200, generated from the app logo)
- **Screenshots — DONE**: four 1600×900 captures ready in
  `docs/app-store/screenshots/` (dashboard, disc detail, add-disc, staff).
  Optional extra: capture the created variant on a real Shopify product page
  for a fifth "result" shot.
- **Demo screencast (required)**: 2–3 min, English: install → plan approval →
  add a disc (photo → color/weight → create) → variant appears in Shopify admin
  → staff account + phone capture. Loom/QuickTime is fine.

## 4. Demo store + reviewer test instructions

Use a fresh development store (not vbxsb1-cr) so reviewers see a clean install:

1. Create dev store; add 2–3 disc products with Color/Weight options and a few
   variants (so autocomplete has data).
2. Install the app from the dashboard onto it; approve the (test) plan.
3. Reviewer instructions text:
   `Open the app from the admin. Click "Add a disc", select a product, upload any round-object photo, wait ~30s for the image + color processing, pick a weight, click "Create in Shopify", then check the product in the admin — a new quantity-1 variant with image, SKU and price appears. Staff accounts (for phone photographers) are under "Staff accounts"; they log in at inventory-reload.fusenv.com.`
4. Test credentials — DONE: `reviewer@fusenv.com` / `DiscReview2026!` exists on
   the production vbxsb1-cr tenant (restocker; prompts for a password change on
   first login - mention that in the instructions).

## 5. Pre-submission checks

- Run Shopify's AI self-review: install the Shopify AI Toolkit
  (shopify.dev/docs/apps/build/ai-toolkit) and run `/shopify-app-store-review`.
- Manual pass: fresh install on the demo store → no OAuth screen (managed
  install), app opens embedded, works in Chrome incognito; uninstall/reinstall
  works; webhook endpoint returns 401 on garbage HMAC
  (`curl -X POST https://inventory-reload.fusenv.com/api/webhooks/shopify -H 'X-Shopify-Hmac-Sha256: bogus' -d '{}'`).
- **Protected customer data: opt OUT** on the submission page (the app is
  Level 0 — products/inventory only). This cannot be changed mid-review.

## 6. Submit

Everything app-level lives in the **Dev Dashboard** (this app is managed there,
so partners.shopify.com/apps/... paths 404 - the Partner Dashboard uses
different app ids):

- App home: https://dev.shopify.com/dashboard/191775751/apps/407119855617
  → **Distribution** → **Public** → App Store listing (content above) → run
  automated checks → **Submit for review**.
- Org-level only (payouts, business details, Partner API client for the
  billing token): https://partners.shopify.com/191775751

Distribution choice is one-time and irreversible - pick Public.
Review responses arrive in the dashboard (post-April-2026 flow); expect possible
revision rounds. Production is unaffected while in review.
