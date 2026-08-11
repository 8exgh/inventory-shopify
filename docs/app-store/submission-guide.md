# App Store submission — DiscReload

State of the submission, and where each thing lives. The app is **public
distribution, listing in draft**, pending Shopify's automated embedded-app
check before it can be submitted.

## Where things live

Shopify splits this app across two dashboards, under **different org numbers**:

| Surface | URL | Owns |
|---|---|---|
| Dev Dashboard | `dev.shopify.com/dashboard/230024716/apps/408006295553` | config, versions, credentials, API health, logs |
| Partner Dashboard | `partners.shopify.com/5102592/apps/408006295553` | distribution, App Store listing, submission, payouts |

`partners.shopify.com/230024716` 404s — the Partner org is **5102592**. The
link that always resolves is `partners.shopify.com/org/230024716/org_apps`.

Submission checklist: `partners.shopify.com/5102592/apps/408006295553/distribution/app-store`

## Identity

- App: `DiscReload`, client id `7d64b85443b93189f1911020e5163b01`, app id `408006295553`
- Org: 8Examples Inc. (Dev `230024716` / Partner `5102592`)
- App handle: `inventory-reload` (the segment in `admin.shopify.com/store/<shop>/apps/<handle>`)
- Hosted at `https://inventory-reload.fusenv.com`
- Dev store for testing: `discreload-demo.myshopify.com` (Basic dev plan, seeded test data)

The listing name and the `name` in `shopify.app.toml` must stay identical —
Shopify's listing check fails the submission when they drift.

## Billing

**Shopify App Pricing is enabled** — Shopify hosts plan selection, charging,
upgrades and cancellation, so the app creates no charges of its own.

| Plan | Price | Trial |
|---|---|---|
| `base-plan` ("Standard", public) | $9/month or $45/year | 14 days |
| `shopify-test` (private) | $0 | — |

The app reads status from the shop's own Admin API
(`currentAppInstallation.activeSubscriptions`) — no Partner API token. Gate it
with `SHOPIFY_BILLING_ENFORCED=true`; unset means "treat everyone as
subscribed" for local development. Unsubscribed merchants get a plan screen
linking to `admin.shopify.com/store/{store}/charges/inventory-reload/pricing_plans`.

## Access tokens

Offline tokens **expire** (1h access token, 90d refresh token). Non-expiring
tokens are rejected outright by the Admin API — a shop on one gets
`403 [API] Non-expiring access tokens are no longer accepted`. Token exchange
sends `expiring: '1'`; `lib/shopify/token.ts` renews through the
`refresh_token` grant before handing a token to any caller, including the
background processor (which re-reads connections every poll).

## Done

Distribution → Public · listing created (name, icon, 3 screenshots + alt text,
feature video, category, 5 search terms) · pricing plan · support email ·
privacy policy `https://inventory-reload.fusenv.com/privacy` · emergency
contact · protected customer data opted **out** (Level 0 — products and
inventory only) · app capabilities: embedded · AI self-review ·
supported API versions · automated error checks.

## Outstanding

1. **Embedded app checks** — Shopify re-scans session data every 2 hours and
   confirms App Bridge is loaded from its CDN and session tokens are used.
   Needs a real install being used on a dev store; that traffic exists.
   `Submit for review` stays disabled until this flips.
2. **Payouts** — Partner Dashboard notification "Your payouts are paused until
   you provide a valid address". Business details look complete; re-save
   Partner settings or you won't get paid.
3. **Listing AI check** — last complaint ("name doesn't match the app
   configuration") predates the DiscReload rename on both sides; it is advisory,
   not a submit blocker.

## Reviewer notes

Reviewers install from the listing and land in the embedded app. The private
`shopify-test` plan lets them subscribe without being charged. No account is
required — the embedded surface authenticates with session tokens. Staff
accounts (for phone photographers) are created under "Staff accounts" and log
in at `inventory-reload.fusenv.com`.

Testing instructions currently on the listing: pick a product that supports
variants, photograph an item, continue, wait for the colour estimate and
background removal, choose a weight and description, then create — a
quantity-1 variant appears on that product with image, SKU and price.

## Verifying a deploy

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://inventory-reload.fusenv.com/privacy   # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://inventory-reload.fusenv.com/api/webhooks/shopify \
  -H 'X-Shopify-Hmac-Sha256: bogus' -d '{}'                                            # 401
```

Config changes ship with `shopify app deploy --allow-updates` (releases a new
app version); code ships by pushing to `main`, which builds the images and
dispatches the devops deploy workflow.
