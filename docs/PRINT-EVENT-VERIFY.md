# Verify: Submit a print request to the merchant's default order printer

This doc maps the **Clover API spec** to our implementation so you can confirm the flow is correct.

---

## Spec (from Clover)

| Item | Spec | Our implementation |
|------|------|--------------------|
| **Method** | POST | POST ✓ |
| **Endpoint** | `/v3/merchants/{mId}/print_event` | Same path ✓ |
| **Base URL (production)** | `https://api.clover.com` | Set `CLOVER_BASE_URL` in .env ✓ |
| **Base URL (sandbox)** | `https://apisandbox.dev.clover.com` | Set `CLOVER_BASE_URL=https://apisandbox.dev.clover.com` ✓ |
| **Description** | Submits the Print request associated with the specific merchant id | We send one POST per print; merchant id is in the path ✓ |

**Note:** Use **apisandbox.dev.clover.com** (with `api` prefix) for sandbox, not `sandbox.dev.clover.com`.

---

## Body params (request)

| Param | Type | Required | Spec / Doc | We send |
|-------|------|----------|------------|--------|
| **orderRef** | object | Yes | Reference to the order to be printed | `orderRef: { id: "<orderId>" }` ✓ |
| orderRef.**id** | string | Yes | Order ID to print | We pass the Clover order ID ✓ |
| **deviceRef** | object | No | Target a specific device (UUID) | Optional; we add `deviceRef: { id: "<deviceId>" }` only when targeting a device ✓ |

We do **not** send `id` at the top level (that’s the print event id returned in the **response**).

---

## Headers

| Header | Required | We send |
|--------|----------|--------|
| Authorization | Yes | `Bearer {access_token}` ✓ |
| Content-Type | Yes | `application/json` ✓ |
| Accept | Optional | `application/json` ✓ |

---

## Full request example (matches spec)

**Sandbox:**

```http
POST https://apisandbox.dev.clover.com/v3/merchants/{mId}/print_event
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "orderRef": {
    "id": "Y8TNWGTYHVP7G"
  }
}
```

**Node.js** (cloverService.js) sends:

- URL: `baseURL + /v3/merchants/${merchantId}/print_event` → same path ✓  
- Body: `{ orderRef: { id: orderId } }` → same body ✓  

**Laravel** (CloverPrintService.php) sends:

- URL: `{baseUrl($cloverUrl)}/v3/merchants/{$cloverMerchantId}/print_event` → same path ✓  
- Body: `['orderRef' => ['id' => $cloverOrderId]]` → same body ✓  

---

## Response (200)

- **id** – print event id  
- **orderRef** – order reference  
- **deviceRef** – device that will print  
- **state** – e.g. CREATED, PRINTING, FAILED, DONE  

Our code returns this response in `data` (Node) or `result['data']` (Laravel).

---

## Quick checklist

- [x] POST to `/v3/merchants/{mId}/print_event`  
- [x] Merchant id in path (`{mId}`)  
- [x] Body: `orderRef: { id: orderId }` only (optional `deviceRef` for one device)  
- [x] Headers: Authorization Bearer, Content-Type application/json  
- [x] Sandbox base URL: `https://apisandbox.dev.clover.com`  

The flow matches the spec for **submit a print request to the merchant's default order printer**.
