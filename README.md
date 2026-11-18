# OPTOLINE | Commercial E-commerce Foundation

A responsive multi-page optical retail storefront built with Node.js, Express and SQLite. This release hardens the earlier starter and adds persistent admin sessions, order/inventory handling, product management, customer chat and virtual try-on.

## Included
- Responsive customer storefront: home, shop, product detail, cart, checkout, about, contact, policies.
- Product catalogue with categories, search, featured items, SKU and stock quantity.
- Server-side price validation and stock reservation when an order is placed.
- Admin order management and status updates; cancelling an order restores reserved stock.
- Admin product create/edit/delete, photo upload, featured flag and stock management.
- Customer-to-owner inbox with saved conversations and owner replies.
- Built-in OPTOLINE FAQ assistant (rule-based; not a generative AI model).
- Virtual Try-On photo overlay with frame style, width, vertical position and rotation controls.
- SQLite-backed admin sessions that survive server restarts.
- Helmet security headers, request size limits, basic API rate limits, cross-origin write checks, input validation and secure cookies in production.
- Health endpoint at `/health`.

## Requirements
- Node.js 20 or later
- npm
- A persistent writable disk for `data/`, `private_uploads/` and `public/uploads/`

## Local setup
1. Extract the ZIP and open the `optoline` directory in a terminal.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. For local development, change `ADMIN_PASSWORD` and `SESSION_SECRET`.
5. Run `npm start`.
6. Open `http://localhost:3000`.
7. Admin: `http://localhost:3000/admin.html`.

Development-only initial login if not changed:
- Email: `admin@optoline.local`
- Password: `ChangeMe123!`

## Production configuration
Do not deploy with development credentials.

1. Set `NODE_ENV=production`.
2. Generate a long secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and set it as `SESSION_SECRET`.
3. Generate a bcrypt password hash: `node -e "require('bcryptjs').hash('YOUR-STRONG-PASSWORD',12).then(console.log)"`. Set the output as `ADMIN_PASSWORD_HASH`.
4. Set `ADMIN_EMAIL`, `STORE_NAME`, `WHATSAPP_NUMBER` (international digits, no plus), `STORE_PHONE`, `STORE_ADDRESS`, and `STORE_HOURS`.
5. Run behind HTTPS with a reverse proxy that forwards the original client IP and protocol.
6. Keep a persistent disk mounted for the SQLite database and uploads. Back up the database and uploads regularly.
7. Restrict access to `private_uploads/` and database files at operating-system level.

## Operational notes
- SQLite is suitable for a single application instance with persistent disk. For multi-instance/high-traffic commerce, migrate the database and session store to managed PostgreSQL/Redis.
- The included rate limiter is per process. Add a CDN/WAF or shared rate limiter for production.
- Admin login uses bcrypt hashes when `ADMIN_PASSWORD_HASH` is set. Production mode refuses to start without a strong session secret, admin email and password hash.
- Product images are public storefront assets. Prescription uploads are saved in `private_uploads/`, outside the public web root; an authenticated, audited staff-only document retrieval workflow must be implemented before staff can review those files in production.
- Chat messages and order records are stored in SQLite. Add a retention policy and privacy notice appropriate to your jurisdiction.

## Payment status — JazzCash/Easypaisa preparation only
The current checkout supports order placement with cash-on-delivery or manual bank-transfer confirmation. JazzCash and Easypaisa are shown as coming-soon methods only; neither currently processes payments. Do not enable them or advertise them as live until official merchant approval, server-side gateway integration, signed callback/webhook verification and sandbox/live testing are complete. This release does not process card, wallet or instant bank payments. To enable online payments, the business owner must open a merchant account with a supported provider (for example, a provider available to the business in Pakistan), supply merchant credentials and webhook configuration, and complete provider testing. Never collect raw card details on this website.

## AI status
The included assistant is a rule-based product/FAQ helper. It is not connected to a generative AI API. A real AI assistant requires a provider account, server-side API key, privacy controls and guardrails. Never expose private API keys in browser JavaScript.

## Virtual Try-On status
The try-on is an adjustable 2D frame overlay on a user-uploaded photo. It is not AI face tracking, augmented-reality landmark detection, facial measurement, prescription verification or guaranteed sizing. A true AR try-on requires a face-landmark/AR SDK and separate privacy and consent review.

## Before selling / public launch checklist
- Confirm ownership/licensing for the OPTOLINE brand, domain, fonts, product photos and all marketing copy.
- Replace demo products, prices, SKUs, images, descriptions and stock with real inventory.
- Add approved business address, hours, phone, delivery rates and service areas.
- Have privacy, terms, refund, exchange, shipping, warranty and prescription policies reviewed and approved.
- Confirm local tax/invoicing, consumer protection, data protection and optical retail requirements.
- Add payment gateway integration and verified server-side webhooks if online payment is required.
- Add transactional email/SMS/WhatsApp notifications and delivery tracking if required.
- Implement staff-only prescription attachment access, audit logging, encryption-at-rest and a deletion/retention workflow before handling real prescriptions.
- Add automated backups, uptime monitoring, error monitoring and a security review.
- Test on real Android/iOS devices, major browsers and the actual hosting environment.

## Project structure
```text
optoline/
  server.js
  package.json
  .env.example
  src/db.js
  data/              SQLite database (created on first run)
  private_uploads/   private prescription uploads (not web-accessible)
  public/
    index.html
    shop.html
    product.html
    try-on.html
    cart.html
    checkout.html
    about.html
    contact.html
    policies.html
    admin.html
    css/
    js/
    images/
    uploads/          public product photos
```

## Optional AI assistant
Set `OPENAI_API_KEY` in the server `.env` file and optionally set `OPENAI_MODEL` to enable the OpenAI Responses API. The key stays on the server and is never sent to the browser. If the key is blank or the provider is unavailable, the built-in FAQ assistant continues to work. AI responses are limited to store/product guidance and must not be used for eye diagnosis or prescriptions. API usage may incur charges.
