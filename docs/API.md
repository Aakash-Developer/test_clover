# API Reference

All endpoints are relative to `http://localhost:3000` (or your `PORT`). Request/response bodies are JSON unless noted.

---

## GET /test-print/check

Verify Clover API connection (merchant ID, token, base URL).

**Response (200):**

```json
{
  "success": true,
  "message": "Clover API connection OK. You can POST /test-print to create an order.",
  "baseURL": "https://api.clover.com",
  "merchantId": "...",
  "recentOrderCount": 1
}
```

On error: `success: false`, `error`, `cloverStatus`, `cloverResponse`, optional `hint`.

---

## GET /test-print/order-types

List all order types for the merchant. Use an `id` (e.g. for “Online Order”, “Take Out”, “Delivery”) in `POST /test-print` as `orderTypeId` so your orders print like Uber Eats/DoorDash.

**Response (200):**

```json
{
  "success": true,
  "message": "Use orderTypeId from one of these...",
  "orderTypes": [
    {
      "id": "ABC123",
      "label": "Online Order",
      "labelKey": "...",
      "isDefault": false,
      "systemOrderTypeId": "..."
    }
  ],
  "usage": "POST /test-print with body { \"orderTypeId\": \"<id from above>\" }"
}
```

---

## GET /test-print/devices

List Clover POS devices. Physical printers (e.g. Star SP700) are configured on one of these devices in the Printers app. Use `id` as `deviceId` in `POST /test-print` to target a specific device.

**Response (200):**

```json
{
  "success": true,
  "message": "...",
  "deviceCount": 2,
  "devices": [
    {
      "id": "926766ca-5636-8598-e959-6e3c6fe047e1",
      "name": "...",
      "model": "C406",
      "serial": "...",
      "deviceTypeName": "..."
    }
  ],
  "note": "..."
}
```

---

## GET /test-print/how-to-print

Returns a step-by-step guide and API call summary for getting print on a Star printer.

**Response (200):** JSON with `title`, `steps`, `whyOurPrintsDontShow`, `apiCalls`.

---

## POST /test-print

Create a Clover order (2 dummy line items), lock it, and request a print. Order is created with optional `orderType` so it can route to the same printer as online/delivery orders.

**Request body (all optional):**

| Field | Type | Description |
|-------|------|-------------|
| `orderTypeId` | string | Order type ID from GET /test-print/order-types. Use same as Online Order/Delivery. |
| `deviceId` | string | Clover device UUID from GET /test-print/devices. Send print to this device only. |
| `tryAllDevices` | boolean | If `true`, send print to every Clover device. |

**Example bodies:**

```json
{}
```

```json
{ "orderTypeId": "ORDER_TYPE_ID" }
```

```json
{ "tryAllDevices": true }
```

```json
{ "orderTypeId": "ORDER_TYPE_ID", "tryAllDevices": true }
```

```json
{ "deviceId": "DEVICE_UUID" }
```

**Response (200):**

```json
{
  "success": true,
  "orderId": "Y8TNWGTYHVP7G",
  "printEvent": { "id": "...", "state": "CREATED", ... },
  "confirmation": {
    "message": "Order created, locked, and print requested.",
    "orderState": "locked",
    "lineItemCount": 2,
    "orderDetails": { ... }
  },
  "noPrintTroubleshooting": { ... }
}
```

On Clover API error: `success: false`, `failedStep`, `error`, `cloverStatus`, `cloverResponse`, `hint`.

---

## POST /test-print/send-print

Re-send a print request for an existing order.

**Request body:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `orderId` | Yes | string | Clover order ID. |
| `deviceId` | No | string | Target this device only. |
| `tryAllDevices` | No | boolean | If `true`, send to all devices. |

**Example:**

```json
{ "orderId": "Y8TNWGTYHVP7G", "tryAllDevices": true }
```

**Response (200):**

```json
{
  "success": true,
  "message": "Print request sent.",
  "printEvent": { "id": "...", "state": "...", "deviceRef": { ... } },
  "noPrintTroubleshooting": { ... }
}
```

---

## POST /test-print/debug-print

Run a diagnostic: send print to default or all devices, then check print event status after a short delay. Use when print doesn’t appear.

**Request body:**

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `orderId` | Yes | string | Clover order ID. |
| `deviceId` | No | string | Target this device only. |
| `tryAllDevices` | No | boolean | If `true`, try all devices. |

**Response (200):**

```json
{
  "success": true,
  "message": "Debug run complete. See printRequests, statusChecks, and whyNoPrint.",
  "diagnostic": {
    "config": { "baseURL": "...", "merchantId": "..." },
    "orderId": "...",
    "printRequests": [ ... ],
    "statusChecks": [ ... ],
    "whyNoPrint": [ ... ]
  }
}
```

---

## GET /test-print/verify/:orderId

Fetch full order details (state, line items) for an existing order. Useful for remote verification.

**Response (200):**

```json
{
  "success": true,
  "orderId": "...",
  "orderState": "locked",
  "lineItemCount": 2,
  "orderDetails": { ... }
}
```

---

## Clover print request format

The server calls Clover’s [Print API](https://docs.clover.com/dev/docs/printing-orders-rest-api#request-exampleprint-an-order):

- **Endpoint:** `POST /v3/merchants/{mId}/print_event`
- **Body:** `{ "orderRef": { "id": "<orderId>" } }` (optional `deviceRef: { "id": "<deviceId>" }`)
- Print is routed to the **firing device’s order printer** (or onboard printer if no order printer).
