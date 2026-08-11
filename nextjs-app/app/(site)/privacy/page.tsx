// Privacy policy - required URL for the Shopify App Store listing
export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto p-6 prose-sm">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">DiscReload &mdash; last updated August 2026</p>

      <div className="space-y-6 text-gray-700 text-sm leading-6">
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">What we collect</h2>
          <p>
            DiscReload stores the minimum needed to run the app for your store:
            your store's domain, an API access token scoped to products, inventory, files
            and locations, the disc photos and product details your team submits, and the
            email addresses of staff accounts you create. We do not collect, access, or
            store any customer personal data from your store &mdash; no customer names,
            addresses, emails, orders, or payment information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">How we use it</h2>
          <p>
            Data is used solely to provide the service: creating product variants and
            images in your Shopify store, estimating disc colors from photos, and letting
            your staff photograph and submit discs. Disc photos are sent to OpenAI's image
            API to center the disc and standardize the background; they are not used to
            train models. We never sell or share your data with third parties for
            marketing.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Billing</h2>
          <p>
            Subscriptions are billed by Shopify through your Shopify invoice. We do not
            collect or store payment details.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Data retention and deletion</h2>
          <p>
            When you uninstall the app your access token is invalidated immediately and
            the app stops all activity for your store. Following Shopify's shop redaction
            notice (48 hours after uninstall), all data for your store &mdash; photos,
            product history, staff accounts, and settings &mdash; is permanently deleted.
            You can also request deletion at any time via the support contact below.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">GDPR / privacy requests</h2>
          <p>
            We respond to Shopify's mandatory privacy webhooks
            (customers/data_request, customers/redact, shop/redact). Because the app
            stores no customer personal data, customer data requests are satisfied with
            an empty disclosure, and customer redaction requests require no action.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Contact</h2>
          <p>
            Questions or requests: <a className="text-blue-600" href="mailto:support@fusenv.com">support@fusenv.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}
