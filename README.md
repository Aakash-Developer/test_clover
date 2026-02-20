# Clover Print Test

Minimal Node.js server to test **Clover order creation and printing** via the REST API. Creates dummy orders, locks them, and sends print requests to the merchant’s firing device (reception/kitchen printer).

Use this to verify that **your** API-created orders print the same way as Uber Eats and DoorDash orders.

---

## Quick start

```bash
npm install
cp .env.example .env   # or edit existing .env
# Set CLOVER_MERCHANT_ID and CLOVER_ACCESS_TOKEN in .env
npm start
```

Then:

```bash
curl http://localhost:3000/test-print/check
curl -X POST http://localhost:3000/test-print -H "Content-Type: application/json" -d "{\"tryAllDevices\": true}"
```

---

## Environment

| Variable | Required | Description |
|--------|----------|-------------|
| `CLOVER_MERCHANT_ID` | Yes | Your Clover merchant ID |
| `CLOVER_ACCESS_TOKEN` | Yes | Clover API token (with orders read/write) |
| `PORT` | No | Server port (default `3000`) |
| `CLOVER_BASE_URL` | No | `https://api.clover.com` or `https://apisandbox.dev.clover.com` (sandbox) |

Copy `.env.example` to `.env` and fill in your values.

---

## Project structure

Code is split so it's easy to read and extend:

| Path | Purpose |
|------|--------|
| `server.js` | Entry point: Express app, mount routes, listen. |
| `src/config.js` | Env vars (PORT, MERCHANT_ID, etc.) and Clover axios client. |
| `src/constants.js` | Static copy: dummy items, how-to steps, troubleshooting text. |
| `src/utils/normalize.js` | `toList(raw)` – normalize Clover API list responses. |
| `src/utils/hints.js` | `getHint(step, status, data)` – user-facing error hints. |
| `src/services/cloverService.js` | All Clover REST calls: items, orders, print, devices, order types. Add new API calls here. |
| `src/routes/testPrint.js` | `/test-print` routes; handlers call the service and return JSON. Add new endpoints here. |

To scale: add new routes in `src/routes/`, new Clover operations in `src/services/cloverService.js`, and new env in `src/config.js`.

---

## Why Uber Eats/DoorDash print but “our” orders don’t

- **Uber Eats / DoorDash** orders use Clover **Online Ordering** and an **order type** (e.g. “Online Order”, “Take Out”) that Clover routes to the **Remote firing device** (Setup → Online Ordering → Settings).
- **API-created orders** without an order type don’t use that path, so they may not hit the same printer.

**Fix:** Create orders with the **same order type** as delivery (use `orderTypeId` in `POST /test-print`). See [Order types](#order-types) and [Troubleshooting](#troubleshooting).

---

## API reference

Base URL: `http://localhost:3000` (or your `PORT`).

### Health & config

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/test-print/check` | Verify Clover connection (token, merchant) |
| GET | `/test-print/how-to-print` | Step-by-step guide for Star printer setup |
| GET | `/test-print/order-types` | List merchant order types (for `orderTypeId`) |
| GET | `/test-print/devices` | List Clover devices (for `deviceId`) |

### Create order and print

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/test-print` | See below | Create order (2 dummy items), lock it, send print |

**POST `/test-print` body (all optional):**

```json
{
  "orderTypeId": "ORDER_TYPE_ID",
  "deviceId": "DEVICE_UUID",
  "tryAllDevices": true
}
```

- **`orderTypeId`** – Use same as Online Order / Take Out / Delivery so print routes like Uber Eats/DoorDash. Get IDs from `GET /test-print/order-types`.
- **`deviceId`** – Send print to this Clover device only. Get IDs from `GET /test-print/devices`.
- **`tryAllDevices`** – Send print to every Clover device (useful when you’re not sure which one has the printer).

### Re-print and debug

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/test-print/send-print` | `{ "orderId": "...", "tryAllDevices": true }` | Re-send print for an existing order |
| POST | `/test-print/debug-print` | `{ "orderId": "...", "tryAllDevices": true }` | Diagnose why print didn’t fire |
| GET | `/test-print/verify/:orderId` | — | Fetch order details (state, line items) |

---

## Testing

### 1. Check connection

```bash
curl http://localhost:3000/test-print/check
```

Expect `"success": true` and `"message": "Clover API connection OK..."`.

### 2. Get order type (optional)

```bash
curl http://localhost:3000/test-print/order-types
```

Pick the `id` for “Online Order”, “Take Out”, or “Delivery” and use it as `orderTypeId`.

### 3. Create order and print

**Default (Clover’s default firing device):**

```bash
curl -X POST http://localhost:3000/test-print -H "Content-Type: application/json" -d "{}"
```

**With order type (like Uber Eats/DoorDash):**

```bash
curl -X POST http://localhost:3000/test-print -H "Content-Type: application/json" -d "{\"orderTypeId\": \"YOUR_ORDER_TYPE_ID\"}"
```

**Send to all devices:**

```bash
curl -X POST http://localhost:3000/test-print -H "Content-Type: application/json" -d "{\"tryAllDevices\": true}"
```

**Order type + all devices:**

```bash
curl -X POST http://localhost:3000/test-print -H "Content-Type: application/json" -d "{\"orderTypeId\": \"YOUR_ID\", \"tryAllDevices\": true}"
```

Success response includes `"success": true`, `orderId`, and `printEvent` (and optionally `confirmation`, `noPrintTroubleshooting`).

### 4. Re-send print for an order

```bash
curl -X POST http://localhost:3000/test-print/send-print -H "Content-Type: application/json" -d "{\"orderId\": \"ORDER_ID\", \"tryAllDevices\": true}"
```

### 5. Verify order

```bash
curl http://localhost:3000/test-print/verify/ORDER_ID
```

### 6. Debug no print

```bash
curl -X POST http://localhost:3000/test-print/debug-print -H "Content-Type: application/json" -d "{\"orderId\": \"ORDER_ID\", \"tryAllDevices\": true}"
```

---

## Troubleshooting

1. **Use the same order type as delivery**  
   `GET /test-print/order-types` → pick “Online Order” / “Take Out” / “Delivery” → `POST /test-print` with `"orderTypeId": "<id>"`.

2. **Send to all devices**  
   `POST /test-print` with `"tryAllDevices": true` so the print goes to every Clover device; the one with your Star printer should print.

3. **Set Remote firing device on Clover**  
   On the Clover device: **Setup → Online Ordering → Settings** → set **“Remote firing device for Clover online ordering”** to the device that has your Star printer.

4. **Assign Order Printer on Clover**  
   **Printers app** → set **Order Printer** to your Star SP700 or TSP100.

5. **Re-send print**  
   Use `POST /test-print/send-print` with `orderId` and `tryAllDevices: true`.

6. **Run debug**  
   `POST /test-print/debug-print` with `orderId` and `tryAllDevices: true` to see print event status and errors.

---

## Clover docs

- [Print orders with the REST API](https://docs.clover.com/dev/docs/printing-orders-rest-api#request-exampleprint-an-order) – request example: `{ "orderRef": { "id": "<orderId>" } }`, routed to firing device’s order printer.
- [Submit a print request (Create Print Event)](https://docs.clover.com/dev/reference/ordercreateprintevent-3)

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run server (`node server.js`) |
| `npm run dev` | Run with nodemon (auto-reload) |



https://docs.clover.com/dev/reference/ordercreateprintevent-3