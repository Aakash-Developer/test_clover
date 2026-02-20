# Go-live: will /test-print actually print?

Yes. The same `/test-print` APIs work in production. When you go live, printing will work **if** the checklist below is satisfied.

---

## 1. Production .env

| Variable | Use for go-live |
|----------|------------------|
| `CLOVER_MERCHANT_ID` | Real (production) merchant ID |
| `CLOVER_ACCESS_TOKEN` | Production API token (with orders read + write) |
| `CLOVER_BASE_URL` | `https://api.clover.com` (US) or your region (e.g. `https://api.eu.clover.com`) |
| `PORT` | Optional; your server port |

No code change: the app uses these env vars and calls Clover’s production API.

---

## 2. Clover side (merchant setup)

For the print to come out on paper:

| Check | What to do |
|-------|------------|
| At least one Clover device | Merchant has a Clover device (Flex, Mini, Station, etc.) online. |
| Order printer set | On that device: **Printers** app → **Order Printer** set to the physical printer (e.g. Star SP700). |
| Firing device set | On the same (or chosen) device: **Setup → Online Ordering → Settings** → **“Remote firing device for Clover online ordering”** set to that device. |

If “default firing device” (or “remote firing device”) is not set, Clover may not send the job to any printer. Setting it fixes that.

---

## 3. Quick test when live

1. **Check connection**
   ```bash
   curl https://your-server.com/test-print/check
   ```
   Expect `"success": true`.

2. **Create order + print (default printer)**
   ```bash
   curl -X POST https://your-server.com/test-print -H "Content-Type: application/json" -d "{}"
   ```
   Expect `"success": true` and an `orderId`. Then confirm the slip printed on the order printer.

3. **If nothing printed – try all devices**
   ```bash
   curl -X POST https://your-server.com/test-print -H "Content-Type: application/json" -d "{\"tryAllDevices\": true}"
   ```
   Print is sent to every Clover device; the one with the order printer should print.

4. **Re-send print for an order**
   ```bash
   curl -X POST https://your-server.com/test-print/send-print -H "Content-Type: application/json" -d "{\"orderId\": \"<orderId from step 2>\", \"tryAllDevices\": true}"
   ```

---

## Summary

| Question | Answer |
|----------|--------|
| Will the same `/test-print` APIs work when I go live? | Yes. Same endpoints and logic. |
| Will it actually print? | Yes, if production .env is correct and the merchant has a Clover device with Order Printer set and “Remote firing device” (or default firing device) set in Setup → Online Ordering. |
| Do I need to change code for production? | No. Only .env (merchant id, token, base URL). |

So: **yes, when you’re go-live and use these APIs with production credentials and the merchant’s Clover/printer set up as above, it can print.**
