/**
 * Clover REST API operations.
 * All Clover v3 calls live here so routes stay thin and logic is easy to test or reuse.
 */

const { toList } = require('../utils/normalize');

const PRINT_EVENT_DELAY_MS = 2500;

/**
 * GET /v3/merchants/:mId/devices → list of devices.
 */
async function getDevices(clover, merchantId) {
  const res = await clover.get(`/v3/merchants/${merchantId}/devices`);
  return toList(res.data);
}

/**
 * GET /v3/merchants/:mId/order_types → list of order types.
 */
async function getOrderTypes(clover, merchantId) {
  const res = await clover.get(`/v3/merchants/${merchantId}/order_types`);
  return toList(res.data);
}

/**
 * Create one item. Returns { id }.
 */
async function createItem(clover, merchantId, item) {
  const res = await clover.post(`/v3/merchants/${merchantId}/items`, item);
  return res.data;
}

/**
 * Create order (state: open, optional orderType). Returns { id }.
 */
async function createOrder(clover, merchantId, options = {}) {
  const body = { state: 'open' };
  if (options.orderTypeId) body.orderType = { id: options.orderTypeId };
  const res = await clover.post(`/v3/merchants/${merchantId}/orders`, body);
  return res.data;
}

/**
 * Add a line item to an order.
 */
async function addLineItem(clover, merchantId, orderId, itemId, quantity = 1) {
  await clover.post(`/v3/merchants/${merchantId}/orders/${orderId}/line_items`, {
    item: { id: itemId },
    quantity,
  });
}

/**
 * Lock an order (state: locked).
 */
async function lockOrder(clover, merchantId, orderId) {
  await clover.post(`/v3/merchants/${merchantId}/orders/${orderId}`, {
    state: 'locked',
  });
}

/**
 * Request print for an order. Optional deviceId; if omitted, uses default firing device.
 * Returns Clover print_event response or { error, cloverResponse } on failure.
 */
async function requestPrint(clover, merchantId, orderId, deviceId = null) {
  const payload = { orderRef: { id: orderId } };
  if (deviceId) payload.deviceRef = { id: deviceId };
  try {
    const res = await clover.post(`/v3/merchants/${merchantId}/print_event`, payload);
    return res.data;
  } catch (err) {
    return {
      error: err.response?.data?.message || err.message,
      cloverResponse: err.response?.data,
    };
  }
}

/**
 * Request print to every device. Returns { tryAllDevices: true, results: [...] }.
 */
async function requestPrintAllDevices(clover, merchantId, orderId) {
  const devices = await getDevices(clover, merchantId);
  const results = [];
  for (const d of devices) {
    if (!d.id) continue;
    const printResult = await requestPrint(clover, merchantId, orderId, d.id);
    const success = !printResult.error;
    results.push({
      deviceId: d.id,
      model: d.model,
      success,
      ...(success ? { state: printResult.state } : { error: printResult.error }),
    });
  }
  return { tryAllDevices: true, results };
}

/**
 * GET /v3/merchants/:mId/orders/:orderId with expand=lineItems.
 */
async function getOrder(clover, merchantId, orderId) {
  const res = await clover.get(`/v3/merchants/${merchantId}/orders/${orderId}`, {
    params: { expand: 'lineItems' },
  });
  return res.data;
}

/**
 * GET /v3/merchants/:mId/print_event/:eventId.
 */
async function getPrintEventStatus(clover, merchantId, eventId) {
  try {
    const res = await clover.get(`/v3/merchants/${merchantId}/print_event/${eventId}`);
    return res.data;
  } catch (e) {
    return { error: e.response?.data || e.message };
  }
}

/**
 * Check orders list (limit 1) to verify connection.
 */
async function checkConnection(clover, merchantId) {
  const res = await clover.get(`/v3/merchants/${merchantId}/orders`, { params: { limit: 1 } });
  const elements = res.data?.elements ?? [];
  return { recentOrderCount: elements.length };
}

/**
 * Full flow: create dummy items, create order (optional orderType), add line items, lock.
 * Returns { orderId, itemIds }.
 * Use when building a test order for print.
 */
async function createTestOrderWithItemsAndLock(clover, merchantId, dummyItems, options = {}) {
  const itemIds = [];
  for (const item of dummyItems) {
    const created = await createItem(clover, merchantId, item);
    if (!created?.id) throw new Error('Item creation returned no id');
    itemIds.push(created.id);
  }
  const orderData = await createOrder(clover, merchantId, { orderTypeId: options.orderTypeId });
  const orderId = orderData?.id;
  if (!orderId) throw new Error('Order creation returned no id');
  for (const itemId of itemIds) {
    await addLineItem(clover, merchantId, orderId, itemId, 1);
  }
  await lockOrder(clover, merchantId, orderId);
  return { orderId, itemIds };
}

module.exports = {
  getDevices,
  getOrderTypes,
  createItem,
  createOrder,
  addLineItem,
  lockOrder,
  requestPrint,
  requestPrintAllDevices,
  getOrder,
  getPrintEventStatus,
  checkConnection,
  createTestOrderWithItemsAndLock,
  PRINT_EVENT_DELAY_MS,
};
