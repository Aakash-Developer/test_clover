/**
 * Clover Print Test – Minimal Node.js demo
 * Tests that reception + kitchen printers fire when an order is created and locked.
 *
 * --- HOW TO INSTALL DEPENDENCIES ---
 *   npm install
 *
 * --- HOW TO RUN THE SERVER ---
 *   1. Copy .env.example to .env (or edit the existing .env).
 *   2. Set in .env:
 *        CLOVER_MERCHANT_ID   – your Clover merchant ID
 *        CLOVER_ACCESS_TOKEN – Clover API token
 *        PORT                 – optional; default 3000
 *      (Dummy test items are created automatically; no item IDs needed.)
 *   3. Run:  npm start
 *
 * --- HOW TO TEST WITH POSTMAN ---
 *   1. Method: POST
 *   2. URL: http://localhost:3000/test-print  (change 3000 if you set PORT)
 *   3. Body: none (or leave as none)
 *   4. Click Send.
 *   5. Success: response body { "success": true, "orderId": "..." }
 *   6. Check server console for step-by-step logs and any Clover API errors.
 *   7. Confirm reception and kitchen printers printed automatically after lock.
 *
 * --- REMOTE CONFIRMATION (e.g. you're in India, printers in UAS) ---
 *   • Response includes full order details (state, lineItems) so you see the order
 *     was created and locked on Clover's side.
 *   • GET /test-print/verify/:orderId  – re-fetch that order anytime to confirm state.
 *   • Clover Dashboard: log in at dashboard.clover.com and check Orders for this orderId.
 *   • On-site: ask someone at the printer location to confirm they received the slip.
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
const ACCESS_TOKEN = process.env.CLOVER_ACCESS_TOKEN;
// Use sandbox (https://apisandbox.dev.clover.com) or regional (e.g. https://api.eu.clover.com) if needed.
const CLOVER_BASE_URL = process.env.CLOVER_BASE_URL || 'https://api.clover.com';

const clover = axios.create({
  baseURL: CLOVER_BASE_URL,
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

app.post('/test-print', async (req, res) => {
  let failedStep = '';
  const deviceId = req.body?.deviceId || null; // optional: target a specific device for print
  const tryAllDevices = req.body?.tryAllDevices === true; // send print to every Clover device (one may have your Star printer)
  try {
    if (!MERCHANT_ID || !ACCESS_TOKEN) {
      return res.status(400).json({
        success: false,
        error: 'Missing CLOVER_MERCHANT_ID or CLOVER_ACCESS_TOKEN in .env',
      });
    }
    console.log('[Config] Clover base URL:', CLOVER_BASE_URL, '| Merchant:', MERCHANT_ID, deviceId ? '| deviceId: ' + deviceId : '');

    // —— Step 1: Create 2 dummy test items ——
    failedStep = 'create_items';
    console.log('[Step 1] Creating dummy test items...');
    const item1Res = await clover.post(`/v3/merchants/${MERCHANT_ID}/items`, {
      name: 'Print Test Item 1',
      price: 100,
    });
    const item2Res = await clover.post(`/v3/merchants/${MERCHANT_ID}/items`, {
      name: 'Print Test Item 2',
      price: 100,
    });
    const itemId1 = item1Res.data?.id;
    const itemId2 = item2Res.data?.id;
    if (!itemId1 || !itemId2) {
      console.error('[Step 1] Item creation failed:', item1Res.data, item2Res.data);
      return res.status(500).json({ success: false, error: 'Dummy item creation returned no id' });
    }
    console.log('[Step 1] Dummy items created:', itemId1, itemId2);

    // —— Step 2: Create order ——
    failedStep = 'create_order';
    console.log('[Step 2] Creating Clover order...');
    const createRes = await clover.post(`/v3/merchants/${MERCHANT_ID}/orders`, {
      state: 'open',
    });
    const orderId = createRes.data?.id;
    if (!orderId) {
      console.error('[Step 2] No order id in response:', createRes.data);
      return res.status(500).json({ success: false, error: 'Order creation returned no id' });
    }
    console.log('[Step 2] Order created:', orderId);

    // —— Step 3: Add line items (2 dummy items) ——
    failedStep = 'add_line_items';
    console.log('[Step 3] Adding line items...');
    await clover.post(`/v3/merchants/${MERCHANT_ID}/orders/${orderId}/line_items`, {
      item: { id: itemId1 },
      quantity: 1,
    });
    await clover.post(`/v3/merchants/${MERCHANT_ID}/orders/${orderId}/line_items`, {
      item: { id: itemId2 },
      quantity: 1,
    });
    console.log('[Step 3] Line items added.');

    // —— Step 4: Lock order (triggers automatic reception + kitchen printing) ——
    failedStep = 'lock_order';
    console.log('[Step 4] Locking order to trigger printing...');
    await clover.post(`/v3/merchants/${MERCHANT_ID}/orders/${orderId}`, {
      state: 'locked',
    });
    console.log('[Step 4] Order locked.');

    // —— Step 5: Request print (default, one device, or try all devices) ——
    failedStep = 'print_event';
    let printEventResult = null;
    if (tryAllDevices) {
      const devRes = await clover.get(`/v3/merchants/${MERCHANT_ID}/devices`);
      const raw = devRes.data;
      const devices = Array.isArray(raw) ? raw : (raw?.elements ?? raw?.data ?? []);
      const list = Array.isArray(devices) ? devices : [];
      const results = [];
      for (const d of list) {
        const id = d.id;
        if (!id) continue;
        try {
          const printRes = await clover.post(`/v3/merchants/${MERCHANT_ID}/print_event`, {
            orderRef: { id: orderId },
            deviceRef: { id },
          });
          results.push({ deviceId: id, model: d.model, success: true, state: printRes.data?.state });
          console.log('[Step 5] Print sent to device', id, d.model);
        } catch (e) {
          results.push({ deviceId: id, model: d.model, success: false, error: e.response?.data?.message || e.message });
        }
      }
      printEventResult = { tryAllDevices: true, results };
      console.log('[Step 5] Full print results:', JSON.stringify(printEventResult, null, 2));
    } else {
      const printPayload = { orderRef: { id: orderId } };
      if (deviceId) printPayload.deviceRef = { id: deviceId };
      try {
        console.log('[Step 5] Sending print_event' + (deviceId ? ' to device ' + deviceId : ' to default order printer') + '...');
        const printRes = await clover.post(`/v3/merchants/${MERCHANT_ID}/print_event`, printPayload);
        printEventResult = printRes.data;
        console.log('[Step 5] Clover print_event response:', JSON.stringify(printEventResult, null, 2));
      } catch (printErr) {
        console.warn('[Step 5] print_event failed:', printErr.response?.status, printErr.response?.data || printErr.message);
        printEventResult = { error: printErr.response?.data?.message || printErr.message, cloverResponse: printErr.response?.data };
      }
    }

    // —— Step 6: Fetch order details for remote confirmation (you're not at printer location) ——
    failedStep = 'fetch_order';
    console.log('[Step 6] Fetching order details for confirmation...');
    const orderRes = await clover.get(
      `/v3/merchants/${MERCHANT_ID}/orders/${orderId}`,
      { params: { expand: 'lineItems' } }
    );
    const orderDetails = orderRes.data || {};
    console.log('[Step 6] Order state:', orderDetails.state, '| Line items:', orderDetails.lineItems?.elements?.length ?? 0);

    return res.json({
      success: true,
      orderId,
      printEvent: printEventResult,
      confirmation: {
        message: 'Order created, locked, and print requested.',
        orderState: orderDetails.state,
        lineItemCount: orderDetails.lineItems?.elements?.length ?? 0,
        orderDetails,
      },
      noPrintTroubleshooting: {
        step1: 'Try all devices: POST /test-print again with body { "tryAllDevices": true } so print is sent to every Clover device (one of them may have your Star printer).',
        step2: 'On Clover device: Open Printers app → set Order Printer to your Star SP700 or TSP100. Then Setup > Online Ordering > Settings → set "Remote firing device" to THIS device.',
        step3: 'Re-send print: POST /test-print/send-print with body { "orderId": "' + orderId + '", "tryAllDevices": true } or use "deviceId" from GET /test-print/devices.',
      },
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    const url = err.config?.url || err.config?.baseURL || '?';
    console.error('[Clover API error] Step:', failedStep, '| Status:', status, '| URL:', url);
    console.error('[Clover API error] Response:', JSON.stringify(data, null, 2) || err.message);
    return res.status(status >= 400 ? status : 500).json({
      success: false,
      failedStep: failedStep || 'unknown',
      error: data?.message || data?.error || err.message,
      cloverStatus: status,
      cloverResponse: data,
      hint: getHint(failedStep, status, data),
    });
  }
});

function getHint(step, status, data) {
  if (status === 401) return 'Invalid or expired token. Check CLOVER_ACCESS_TOKEN and use the correct Clover environment (sandbox vs production).';
  if (status === 403) return 'Token does not have permission for this action. Check token scope in Clover Developer Dashboard.';
  if (status === 404) return 'Merchant or resource not found. If using sandbox, set CLOVER_BASE_URL=https://apisandbox.dev.clover.com in .env.';
  if (status === 422 && step === 'lock_order') return 'Try PATCH instead of POST for order update, or check request body.';
  if (step === 'create_order') return 'Ensure token has order write permission and CLOVER_BASE_URL matches your merchant region (e.g. api.eu.clover.com for Europe).';
  return null;
}

// Re-send print for an existing order. Body: { orderId, deviceId? } or { orderId, tryAllDevices: true }.
app.post('/test-print/send-print', async (req, res) => {
  try {
    if (!MERCHANT_ID || !ACCESS_TOKEN) {
      return res.status(400).json({ success: false, error: 'Missing CLOVER_MERCHANT_ID or CLOVER_ACCESS_TOKEN in .env' });
    }
    const orderId = req.body?.orderId;
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Body must include orderId: { "orderId": "YOUR_ORDER_ID" }' });
    }
    const deviceId = req.body?.deviceId || null;
    const tryAllDevices = req.body?.tryAllDevices === true;
    if (tryAllDevices) {
      const devRes = await clover.get(`/v3/merchants/${MERCHANT_ID}/devices`);
      const raw = devRes.data;
      const devices = Array.isArray(raw) ? raw : (raw?.elements ?? raw?.data ?? []);
      const list = Array.isArray(devices) ? devices : [];
      const results = [];
      for (const d of list) {
        const id = d.id;
        if (!id) continue;
        try {
          const printRes = await clover.post(`/v3/merchants/${MERCHANT_ID}/print_event`, {
            orderRef: { id: orderId },
            deviceRef: { id },
          });
          results.push({ deviceId: id, model: d.model, success: true, state: printRes.data?.state });
        } catch (e) {
          results.push({ deviceId: id, model: d.model, success: false, error: e.response?.data?.message || e.message });
        }
      }
      return res.json({
        success: true,
        message: 'Print sent to all devices. Check which Clover device has your Star printer.',
        printEvent: { tryAllDevices: true, results },
      });
    }
    const printPayload = { orderRef: { id: orderId } };
    if (deviceId) printPayload.deviceRef = { id: deviceId };
    console.log('[Send-print] orderId:', orderId, deviceId ? '| deviceId: ' + deviceId : '');
    const printRes = await clover.post(`/v3/merchants/${MERCHANT_ID}/print_event`, printPayload);
    const data = printRes.data;
    return res.json({
      success: true,
      message: 'Print request sent.',
      printEvent: { id: data?.id, state: data?.state, deviceRef: data?.deviceRef },
      noPrintTroubleshooting: {
        step1: 'Set Default Firing Device: Setup > Online Ordering > Settings on Clover device.',
        step2: 'Try all devices: POST /test-print/send-print with body { "orderId": "' + orderId + '", "tryAllDevices": true }.',
      },
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    console.error('[Send-print] Error:', status, data || err.message);
    return res.status(status >= 400 ? status : 500).json({
      success: false,
      error: data?.message || data?.error || err.message,
      cloverStatus: status,
      cloverResponse: data,
    });
  }
});

// Debug why print is not coming. Body: { orderId (required), deviceId? } or { orderId, tryAllDevices: true }.
// Returns full Clover request/response and print event status (CREATED, PRINTING, FAILED, DONE).
app.post('/test-print/debug-print', async (req, res) => {
  try {
    if (!MERCHANT_ID || !ACCESS_TOKEN) {
      return res.status(400).json({ success: false, error: 'Missing CLOVER_MERCHANT_ID or CLOVER_ACCESS_TOKEN in .env' });
    }
    const orderId = req.body?.orderId;
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Body must include orderId. Example: { "orderId": "ABC123" }. Get an orderId from a previous POST /test-print response.',
      });
    }
    const deviceId = req.body?.deviceId || null;
    const tryAllDevices = req.body?.tryAllDevices === true;

    const diagnostic = {
      config: { baseURL: CLOVER_BASE_URL, merchantId: MERCHANT_ID },
      orderId,
      printRequests: [],
      statusChecks: [],
      whyNoPrint: [],
    };

    const doPrint = async (devId) => {
      const payload = { orderRef: { id: orderId } };
      if (devId) payload.deviceRef = { id: devId };
      diagnostic.printRequests.push({ sent: payload });
      const printRes = await clover.post(`/v3/merchants/${MERCHANT_ID}/print_event`, payload);
      const data = printRes.data;
      diagnostic.printRequests[diagnostic.printRequests.length - 1].cloverResponse = data;
      return data;
    };

    const checkStatus = (eventId) =>
      clover.get(`/v3/merchants/${MERCHANT_ID}/print_event/${eventId}`).then((r) => r.data).catch((e) => ({ error: e.response?.data || e.message }));

    if (tryAllDevices) {
      const devRes = await clover.get(`/v3/merchants/${MERCHANT_ID}/devices`);
      const raw = devRes.data;
      const devices = Array.isArray(raw) ? raw : (raw?.elements ?? raw?.data ?? []);
      const list = Array.isArray(devices) ? devices : [];
      for (const d of list) {
        if (!d.id) continue;
        try {
          const data = await doPrint(d.id);
          diagnostic.printRequests[diagnostic.printRequests.length - 1].deviceId = d.id;
          diagnostic.printRequests[diagnostic.printRequests.length - 1].deviceModel = d.model;
          if (data?.id) {
            const after = await new Promise((r) => setTimeout(r, 2500)).then(() => checkStatus(data.id));
            diagnostic.statusChecks.push({ eventId: data.id, deviceId: d.id, after2s: after });
            if (after.state) {
              if (after.state === 'FAILED') diagnostic.whyNoPrint.push(`Device ${d.id} (${d.model}): print event state FAILED – printer or device problem.`);
              else if (after.state === 'DONE') diagnostic.whyNoPrint.push(`Device ${d.id} (${d.model}): state DONE – job reached printer. If no paper, check Star printer connection.`);
              else diagnostic.whyNoPrint.push(`Device ${d.id} (${d.model}): state ${after.state} – job may still be processing or device offline.`);
            } else if (after.error) diagnostic.whyNoPrint.push(`Device ${d.id}: could not get status – ${JSON.stringify(after.error)}`);
          }
        } catch (e) {
          diagnostic.printRequests.push({
            deviceId: d.id,
            deviceModel: d.model,
            sent: { orderRef: { id: orderId }, deviceRef: { id: d.id } },
            cloverResponse: null,
            error: e.response?.data || e.message,
            httpStatus: e.response?.status,
          });
          diagnostic.whyNoPrint.push(`Device ${d.id} (${d.model}): print_event failed – ${e.response?.status || ''} ${JSON.stringify(e.response?.data || e.message)}`);
        }
      }
    } else {
      try {
        const data = await doPrint(deviceId);
        if (data?.id) {
          const after = await new Promise((r) => setTimeout(r, 2500)).then(() => checkStatus(data.id));
          diagnostic.statusChecks.push({ eventId: data.id, after2s: after });
          if (after.state === 'FAILED') diagnostic.whyNoPrint.push('Print event state FAILED – device or printer problem. Check Order Printer on that Clover device.');
          else if (after.state === 'DONE') diagnostic.whyNoPrint.push('State DONE – job sent to device. If no paper, Star printer may be disconnected or wrong device.');
          else if (after.state) diagnostic.whyNoPrint.push(`State ${after.state} – device may be offline or slow.`);
          else if (after.error) diagnostic.whyNoPrint.push('Could not get event status: ' + JSON.stringify(after.error));
        } else diagnostic.whyNoPrint.push('Clover did not return print event id. Response: ' + JSON.stringify(data));
      } catch (e) {
        diagnostic.printRequests[0].error = e.response?.data || e.message;
        diagnostic.printRequests[0].httpStatus = e.response?.status;
        diagnostic.whyNoPrint.push(`print_event failed: ${e.response?.status || ''} ${JSON.stringify(e.response?.data || e.message)}`);
      }
    }

    if (diagnostic.whyNoPrint.length === 0 && diagnostic.statusChecks.length > 0)
      diagnostic.whyNoPrint.push('No status or error captured. Check statusChecks and printRequests above.');

    return res.json({
      success: true,
      message: 'Debug run complete. See printRequests, statusChecks, and whyNoPrint.',
      diagnostic,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    console.error('[Debug-print]', status, data || err.message);
    return res.status(status >= 400 ? status : 500).json({
      success: false,
      error: data?.message || data?.error || err.message,
      cloverStatus: status,
      cloverResponse: data,
    });
  }
});

// Step-by-step guide to get print on your Star SP700 / TSP100.
app.get('/test-print/how-to-print', (req, res) => {
  res.json({
    title: 'How to get print on your Star printer',
    steps: [
      { step: 1, action: 'On the Clover device that is connected to your Star printer (same Wi‑Fi or network), open the Printers app.' },
      { step: 2, action: 'In Printers app: Add or select Order Printer (or Kitchen Printer) and choose your Star SP700 or Star TSP100 (Tandoor). Make sure it shows as connected.' },
      { step: 3, action: 'On the same Clover device: Go to Setup → Online Ordering → Settings. Set "Remote firing device for Clover online ordering" to THIS device. Save.' },
      { step: 4, action: 'Keep that Clover device powered on and connected to the internet.' },
      { step: 5, action: 'Send a test print: POST http://localhost:3000/test-print with body { "tryAllDevices": true }. This sends the print to every Clover device; the one that has your Star as Order Printer should print.' },
      { step: 6, action: 'If still no print: Call GET /test-print/devices, copy each device id, and try POST /test-print with body { "deviceId": "<paste-one-id>" } for each id until one prints.' },
    ],
    apiCalls: [
      'POST /test-print with body { "tryAllDevices": true }  →  sends print to all Clover devices',
      'POST /test-print with body { "deviceId": "<uuid>" }   →  sends print to one device',
      'POST /test-print/send-print with body { "orderId": "<id>", "tryAllDevices": true }  →  re-send print for existing order',
    ],
  });
});

// List active devices for the merchant (print jobs go to a device's order printer).
app.get('/test-print/devices', async (req, res) => {
  try {
    if (!MERCHANT_ID || !ACCESS_TOKEN) {
      return res.status(400).json({ success: false, error: 'Missing CLOVER_MERCHANT_ID or CLOVER_ACCESS_TOKEN in .env' });
    }
    const devRes = await clover.get(`/v3/merchants/${MERCHANT_ID}/devices`);
    const raw = devRes.data;
    const devices = Array.isArray(raw) ? raw : (raw?.elements ?? raw?.data ?? []);
    const list = Array.isArray(devices) ? devices : [];
    console.log('[Devices] Count:', list.length);
    return res.json({
      success: true,
      message: list.length === 0
        ? 'No devices found. Add a Clover device (Clover Flex, Mini, etc.) and set it as the order printer in Setup App.'
        : 'These are Clover POS devices (tablets/terminals). Your physical printers (e.g. Star SP700, TSP100) are connected to one of these.',
      deviceCount: list.length,
      devices: list.map((d) => ({
        id: d.id,
        name: d.name,
        model: d.model,
        serial: d.serial,
        deviceTypeName: d.deviceTypeName,
      })),
      note: 'API returns Clover devices (C406, C505, etc.), not your physical printers. Star SP700 / TSP100 are set in the Printers app ON a Clover device. Set "Default Firing Device" (Setup > Online Ordering > Settings) to the Clover device that has your Star printer as Order Printer.',
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    console.error('[Devices] Clover API error:', status, data || err.message);
    return res.status(status >= 400 ? status : 500).json({
      success: false,
      error: data?.message || data?.error || err.message,
      cloverStatus: status,
      cloverResponse: data,
    });
  }
});

// Quick check: verify token and base URL work before trying to create orders (GET /test-print/check).
app.get('/test-print/check', async (req, res) => {
  try {
    if (!MERCHANT_ID || !ACCESS_TOKEN) {
      return res.status(400).json({ success: false, error: 'Missing CLOVER_MERCHANT_ID or CLOVER_ACCESS_TOKEN in .env' });
    }
    const orderListRes = await clover.get(`/v3/merchants/${MERCHANT_ID}/orders`, { params: { limit: 1 } });
    const elements = orderListRes.data?.elements ?? [];
    return res.json({
      success: true,
      message: 'Clover API connection OK. You can POST /test-print to create an order.',
      baseURL: CLOVER_BASE_URL,
      merchantId: MERCHANT_ID,
      recentOrderCount: elements.length,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    console.error('[Check] Clover API error:', status, data || err.message);
    return res.status(status >= 400 ? status : 500).json({
      success: false,
      error: data?.message || data?.error || err.message,
      cloverStatus: status,
      cloverResponse: data,
      hint: getHint('create_order', status, data),
    });
  }
});

// Re-fetch order anytime for remote verification (e.g. from India when printers are in UAS).
app.get('/test-print/verify/:orderId', async (req, res) => {
  const { orderId } = req.params;
  try {
    if (!MERCHANT_ID || !ACCESS_TOKEN) {
      return res.status(400).json({
        success: false,
        error: 'Missing CLOVER_MERCHANT_ID or CLOVER_ACCESS_TOKEN in .env',
      });
    }
    console.log('[Verify] Fetching order:', orderId);
    const orderRes = await clover.get(
      `/v3/merchants/${MERCHANT_ID}/orders/${orderId}`,
      { params: { expand: 'lineItems' } }
    );
    const order = orderRes.data;
    return res.json({
      success: true,
      orderId,
      orderState: order?.state,
      lineItemCount: order?.lineItems?.elements?.length ?? 0,
      orderDetails: order,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    console.error('[Clover API error]', status, data || err.message);
    return res.status(status).json({
      success: false,
      error: data?.message || data?.error || err.message,
      details: data,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Clover print test server listening on http://localhost:${PORT}`);
  console.log('POST /test-print/debug-print   – debug why no print (body: { orderId, tryAllDevices: true }).');
  console.log('GET  /test-print/how-to-print   – step-by-step to get print on Star printer.');
  console.log('GET  /test-print/check         – verify Clover connection.');
  console.log('GET  /test-print/devices       – list Clover devices.');
  console.log('POST /test-print               – create order + print (body: { tryAllDevices: true } or { deviceId }).');
  console.log('POST /test-print/send-print    – re-send print (body: { orderId, tryAllDevices: true }).');
  console.log('GET  /test-print/verify/:orderId – re-check order.');
});
