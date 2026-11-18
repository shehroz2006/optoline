# OPTOLINE QA checklist

Run these checks on staging before public launch.

## Automated syntax
- `npm run check`

## Storefront
- [ ] Home page and mobile menu render on desktop/mobile.
- [ ] Product search/category filters work.
- [ ] Product detail loads from a valid ID and handles missing IDs.
- [ ] Add to bag, update quantity, remove item and empty-cart state work.
- [ ] Checkout validates customer details and submits order.
- [ ] Inventory decreases when an order is accepted.
- [ ] An order cannot exceed available stock.
- [ ] Cancelling an order restores stock.
- [ ] WhatsApp opens the configured business number.

## Admin
- [ ] Invalid credentials are rejected.
- [ ] Valid credentials create a session.
- [ ] Admin session survives a server restart.
- [ ] Admin can add a product and upload an image.
- [ ] Admin can edit product name, SKU, price, category, stock and image.
- [ ] Admin can delete a product.
- [ ] Admin can view orders and change order status.
- [ ] Admin can select a customer chat and reply.
- [ ] Unauthenticated users cannot access `/api/admin/*`.

## Privacy/security
- [ ] Production uses HTTPS and secure cookies.
- [ ] `.env` is not committed or publicly served.
- [ ] `private_uploads/` is not accessible through a browser URL.
- [ ] Prescription access, retention and deletion policy is implemented before handling live prescription data.
- [ ] Rate limits and backups are configured at hosting/CDN level.

## Payment
- [ ] Only payment methods that the business can actually fulfill are shown.
- [ ] Manual transfers are verified by staff.
- [ ] A payment gateway is not advertised as active until provider checkout and signed webhooks pass staging tests.
