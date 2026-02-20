# What data we send to what API (for testing)

Quick reference: **our endpoints** and **Clover APIs** we call, with request bodies.

---

## 1. Our server (test with curl / Postman)

Base URL: `http://localhost:3000` (or your `PORT`).  
Headers: `Content-Type: application/json` for POST.

| What to test | Method | Our endpoint | Body we accept |
|--------------|--------|--------------|----------------|
| Connection | GET | `/test-print/check` | — |
| Order types | GET | `/test-print/order-types` | — |
| Devices | GET | `/test-print/devices` | — |
| Create order + print | POST | `/test-print` | `{}` or `{"orderTypeId":"<id>"}` or `{"tryAllDevices":true}` or `{"deviceId":"..."}` — use orderTypeId only if GET /test-print/order-types returns types; otherwise omit it. |
| Re-send print | POST | `/test-print/send-print` | `{"orderId":"<id>"}` or `{"orderId":"<id>","tryAllDevices":true}` |
| Debug print | POST | `/test-print/debug-print` | `{"orderId":"<id>"}` or `{"orderId":"<id>","tryAllDevices":true}` |
| Verify order | GET | `/test-print/verify/:orderId` | — |

---

## 2. Clover APIs we call (what we send)

Use `.env`: `CLOVER_BASE_URL`, `CLOVER_MERCHANT_ID`, `CLOVER_ACCESS_TOKEN`.  
Sandbox: `CLOVER_BASE_URL=https://apisandbox.dev.clover.com`.

| Purpose | Clover API | Method | Body we send |
|---------|------------|--------|--------------|
| Check connection | `{base}/v3/merchants/{mId}/orders?limit=1` | GET | — |
| Order types | `{base}/v3/merchants/{mId}/order_types` | GET | — |
| Devices | `{base}/v3/merchants/{mId}/devices` | GET | — |
| Create item | `{base}/v3/merchants/{mId}/items` | POST | `{"name":"...","price":100}` |
| Create order | `{base}/v3/merchants/{mId}/orders` | POST | `{"state":"open"}` or `{"state":"open","orderType":{"id":"..."}}` |
| Add line item | `{base}/v3/merchants/{mId}/orders/{orderId}/line_items` | POST | `{"item":{"id":"<itemId>"},"quantity":1}` |
| Lock order | `{base}/v3/merchants/{mId}/orders/{orderId}` | POST | `{"state":"locked"}` |
| **Print (default)** | `{base}/v3/merchants/{mId}/print_event` | POST | `{"orderRef":{"id":"<orderId>"}}` |
| **Print (one device)** | `{base}/v3/merchants/{mId}/print_event` | POST | `{"orderRef":{"id":"<orderId>"},"deviceRef":{"id":"<deviceId>"}}` |
| Get order | `{base}/v3/merchants/{mId}/orders/{orderId}?expand=lineItems` | GET | — |
| Get print event | `{base}/v3/merchants/{mId}/print_event/{eventId}` | GET | — |

`{base}` = `CLOVER_BASE_URL`, `{mId}` = `CLOVER_MERCHANT_ID`.  
All Clover requests use header: `Authorization: Bearer {CLOVER_ACCESS_TOKEN}`, `Content-Type: application/json`.
