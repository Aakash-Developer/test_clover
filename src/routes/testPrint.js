/**
 * Routes for /test-print: create order, print, re-print, debug, list devices/order types, verify.
 */

const express = require('express');
const router = express.Router();
const { MERCHANT_ID, CLOVER_BASE_URL, clover, hasCloverConfig } = require('../config');
const { getHint } = require('../utils/hints');
const {
  getDevices,
  getOrderTypes,
  requestPrint,
  requestPrintAllDevices,
  getOrder,
  getPrintEventStatus,
  checkConnection,
  createTestOrderWithItemsAndLock,
  PRINT_EVENT_DELAY_MS,
} = require('../services/cloverService');
const {
  DUMMY_ITEMS,
  HOW_TO_PRINT,
  buildTroubleshooting,
  buildSendPrintTroubleshooting,
} = require('../constants');

function requireCloverConfig(req, res, next) {
  if (!hasCloverConfig()) {
    return res.status(400).json({ success: false, error: 'Missing CLOVER_MERCHANT_ID or CLOVER_ACCESS_TOKEN in .env' });
  }
  next();
}

function sendCloverError(res, step, err, defaultStatus = 500) {
  const status = err.response?.status || defaultStatus;
  const data = err.response?.data;
  const code = status >= 400 ? status : 500;
  res.status(code).json({
    success: false,
    failedStep: step || 'unknown',
    error: data?.message || data?.error || err.message,
    cloverStatus: status,
    cloverResponse: data,
    hint: getHint(step, status, data),
  });
}

// ----- POST /test-print: create order + print -----
router.post('/', requireCloverConfig, async (req, res) => {
  const { deviceId = null, tryAllDevices = false, orderTypeId = null } = req.body || {};
  let failedStep = '';

  try {
    console.log('[Config]', CLOVER_BASE_URL, '| Merchant:', MERCHANT_ID, deviceId ? '| deviceId: ' + deviceId : '', orderTypeId ? '| orderTypeId: ' + orderTypeId : '');

    failedStep = 'create_order';
    const { orderId } = await createTestOrderWithItemsAndLock(clover, MERCHANT_ID, DUMMY_ITEMS, { orderTypeId });
    if (orderTypeId) console.log('[Step 2] Using orderType:', orderTypeId);

    failedStep = 'print_event';
    const printEventResult = tryAllDevices
      ? await requestPrintAllDevices(clover, MERCHANT_ID, orderId)
      : await requestPrint(clover, MERCHANT_ID, orderId, deviceId || undefined);

    failedStep = 'fetch_order';
    const orderDetails = await getOrder(clover, MERCHANT_ID, orderId);
    const lineItemCount = orderDetails?.lineItems?.elements?.length ?? 0;
    console.log('[Order]', orderId, 'state:', orderDetails?.state, '| lineItems:', lineItemCount);

    return res.json({
      success: true,
      orderId,
      printEvent: printEventResult,
      confirmation: {
        message: 'Order created, locked, and print requested.',
        orderState: orderDetails?.state,
        lineItemCount,
        orderDetails,
      },
      noPrintTroubleshooting: buildTroubleshooting(orderId),
    });
  } catch (err) {
    console.error('[Clover API error] Step:', failedStep, err.response?.status, err.response?.data || err.message);
    sendCloverError(res, failedStep, err);
  }
});

// ----- POST /test-print/send-print: re-send print for existing order -----
router.post('/send-print', requireCloverConfig, async (req, res) => {
  const orderId = req.body?.orderId;
  if (!orderId) {
    return res.status(400).json({ success: false, error: 'Body must include orderId: { "orderId": "YOUR_ORDER_ID" }' });
  }
  const deviceId = req.body?.deviceId || null;
  const tryAllDevices = req.body?.tryAllDevices === true;

  try {
    if (tryAllDevices) {
      const result = await requestPrintAllDevices(clover, MERCHANT_ID, orderId);
      return res.json({
        success: true,
        message: 'Print sent to all devices. Check which Clover device has your Star printer.',
        printEvent: result,
      });
    }
    const data = await requestPrint(clover, MERCHANT_ID, orderId, deviceId || undefined);
    if (data?.error) {
      return res.status(500).json({
        success: false,
        message: 'Print request failed.',
        error: data.error,
        cloverResponse: data.cloverResponse,
        noPrintTroubleshooting: buildSendPrintTroubleshooting(orderId),
      });
    }
    return res.json({
      success: true,
      message: 'Print request sent.',
      printEvent: { id: data?.id, state: data?.state, deviceRef: data?.deviceRef },
      noPrintTroubleshooting: buildSendPrintTroubleshooting(orderId),
    });
  } catch (err) {
    console.error('[Send-print]', err.response?.status, err.response?.data || err.message);
    const status = err.response?.status || 500;
    const data = err.response?.data;
    return res.status(status >= 400 ? status : 500).json({
      success: false,
      error: data?.message || data?.error || err.message,
      cloverStatus: status,
      cloverResponse: data,
    });
  }
});

// ----- POST /test-print/debug-print: diagnose why print didn't fire -----
router.post('/debug-print', requireCloverConfig, async (req, res) => {
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
    try {
      const data = await requestPrint(clover, MERCHANT_ID, orderId, devId || undefined);
      diagnostic.printRequests[diagnostic.printRequests.length - 1].cloverResponse = data;
      return data;
    } catch (e) {
      diagnostic.printRequests[diagnostic.printRequests.length - 1].error = e.response?.data || e.message;
      diagnostic.printRequests[diagnostic.printRequests.length - 1].httpStatus = e.response?.status;
      throw e;
    }
  };

  const checkStatus = (eventId) => getPrintEventStatus(clover, MERCHANT_ID, eventId);

  try {
    if (tryAllDevices) {
      const devices = await getDevices(clover, MERCHANT_ID);
      for (const d of devices) {
        if (!d.id) continue;
        try {
          const data = await doPrint(d.id);
          diagnostic.printRequests[diagnostic.printRequests.length - 1].deviceId = d.id;
          diagnostic.printRequests[diagnostic.printRequests.length - 1].deviceModel = d.model;
          if (data?.id) {
            const after = await new Promise((r) => setTimeout(r, PRINT_EVENT_DELAY_MS)).then(() => checkStatus(data.id));
            diagnostic.statusChecks.push({ eventId: data.id, deviceId: d.id, after2s: after });
            if (after.state === 'FAILED') diagnostic.whyNoPrint.push(`Device ${d.id} (${d.model}): print event FAILED.`);
            else if (after.state === 'DONE') diagnostic.whyNoPrint.push(`Device ${d.id} (${d.model}): DONE – job reached printer.`);
            else if (after.state) diagnostic.whyNoPrint.push(`Device ${d.id} (${d.model}): state ${after.state}.`);
            else if (after.error) diagnostic.whyNoPrint.push(`Device ${d.id}: status error – ${JSON.stringify(after.error)}`);
          }
        } catch (e) {
          diagnostic.whyNoPrint.push(`Device ${d.id} (${d.model}): print_event failed – ${e.response?.status || ''} ${JSON.stringify(e.response?.data || e.message)}`);
        }
      }
    } else {
      try {
        const data = await doPrint(deviceId || undefined);
        if (data?.id) {
          const after = await new Promise((r) => setTimeout(r, PRINT_EVENT_DELAY_MS)).then(() => checkStatus(data.id));
          diagnostic.statusChecks.push({ eventId: data.id, after2s: after });
          if (after.state === 'FAILED') diagnostic.whyNoPrint.push('Print event FAILED – device or printer problem.');
          else if (after.state === 'DONE') diagnostic.whyNoPrint.push('State DONE – job sent to device.');
          else if (after.state) diagnostic.whyNoPrint.push(`State ${after.state}.`);
          else if (after.error) diagnostic.whyNoPrint.push('Status error: ' + JSON.stringify(after.error));
        } else diagnostic.whyNoPrint.push('No print event id. Response: ' + JSON.stringify(data));
      } catch (e) {
        diagnostic.whyNoPrint.push(`print_event failed: ${e.response?.status || ''} ${JSON.stringify(e.response?.data || e.message)}`);
      }
    }

    if (diagnostic.whyNoPrint.length === 0 && diagnostic.statusChecks.length > 0) {
      diagnostic.whyNoPrint.push('No status or error captured. Check statusChecks and printRequests.');
    }

    return res.json({ success: true, message: 'Debug run complete. See printRequests, statusChecks, and whyNoPrint.', diagnostic });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    return res.status(status >= 400 ? status : 500).json({
      success: false,
      error: data?.message || data?.error || err.message,
      cloverStatus: status,
      cloverResponse: data,
    });
  }
});

// ----- GET /test-print/how-to-print -----
router.get('/how-to-print', (req, res) => {
  res.json(HOW_TO_PRINT);
});

// ----- GET /test-print/order-types -----
router.get('/order-types', requireCloverConfig, async (req, res) => {
  try {
    const list = await getOrderTypes(clover, MERCHANT_ID);
    console.log('[Order types] Count:', list.length);
    const orderTypes = list.map((t) => ({ id: t.id, label: t.label, labelKey: t.labelKey, isDefault: t.isDefault, systemOrderTypeId: t.systemOrderTypeId }));
    const message = orderTypes.length === 0
      ? 'No order types returned from Clover. You can still use POST /test-print without orderTypeId. To get types: create them in Clover Setup (e.g. Register app → Order Types, or Setup App), or use a production merchant that has Online Order / Take Out already.'
      : 'Use orderTypeId from one of these (e.g. Online Order, Take Out, Delivery) in POST /test-print so our orders route to the same printer as Uber Eats/DoorDash.';
    return res.json({
      success: true,
      message,
      orderTypes,
      usage: orderTypes.length ? 'POST /test-print with body { "orderTypeId": "<id from above>" }' : 'POST /test-print with body {} or { "tryAllDevices": true }',
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    console.error('[Order types]', status, data || err.message);
    return res.status(status >= 400 ? status : 500).json({
      success: false,
      error: data?.message || data?.error || err.message,
      cloverStatus: status,
      cloverResponse: data,
    });
  }
});

// ----- GET /test-print/devices -----
router.get('/devices', requireCloverConfig, async (req, res) => {
  try {
    const list = await getDevices(clover, MERCHANT_ID);
    console.log('[Devices] Count:', list.length);
    return res.json({
      success: true,
      message: list.length === 0
        ? 'No devices found. Add a Clover device and set it as the order printer in Setup App.'
        : 'Clover POS devices. Physical printers (e.g. Star SP700) are connected to one of these.',
      deviceCount: list.length,
      devices: list.map((d) => ({ id: d.id, name: d.name, model: d.model, serial: d.serial, deviceTypeName: d.deviceTypeName })),
      note: 'Set "Default Firing Device" (Setup > Online Ordering > Settings) to the device that has your Star printer as Order Printer.',
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    console.error('[Devices]', status, data || err.message);
    return res.status(status >= 400 ? status : 500).json({
      success: false,
      error: data?.message || data?.error || err.message,
      cloverStatus: status,
      cloverResponse: data,
    });
  }
});

// ----- GET /test-print/check -----
router.get('/check', requireCloverConfig, async (req, res) => {
  try {
    const { recentOrderCount } = await checkConnection(clover, MERCHANT_ID);
    return res.json({
      success: true,
      message: 'Clover API connection OK. You can POST /test-print to create an order.',
      baseURL: CLOVER_BASE_URL,
      merchantId: MERCHANT_ID,
      recentOrderCount,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data;
    console.error('[Check]', status, data || err.message);
    return res.status(status >= 400 ? status : 500).json({
      success: false,
      error: data?.message || data?.error || err.message,
      cloverStatus: status,
      cloverResponse: data,
      hint: getHint('create_order', status, data),
    });
  }
});

// ----- GET /test-print/verify/:orderId -----
router.get('/verify/:orderId', requireCloverConfig, async (req, res) => {
  const { orderId } = req.params;
  try {
    const order = await getOrder(clover, MERCHANT_ID, orderId);
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
    return res.status(status).json({
      success: false,
      error: data?.message || data?.error || err.message,
      details: data,
    });
  }
});

module.exports = router;
