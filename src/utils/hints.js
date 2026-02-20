/**
 * User-friendly hints for Clover API errors (401, 403, 404, etc.).
 */

function getHint(step, status, data) {
  if (status === 401) return 'Invalid or expired token. Check CLOVER_ACCESS_TOKEN and use the correct Clover environment (sandbox vs production).';
  if (status === 403) return 'Token does not have permission for this action. Check token scope in Clover Developer Dashboard.';
  if (status === 404) return 'Merchant or resource not found. If using sandbox, set CLOVER_BASE_URL=https://apisandbox.dev.clover.com in .env.';
  if (status === 422 && step === 'lock_order') return 'Try PATCH instead of POST for order update, or check request body.';
  // "Referenced order type does not exist" – merchant has no order types or wrong id (use id from GET /test-print/order-types, not the label)
  if (status === 400 && step === 'create_order' && data?.message && /order type/i.test(data.message)) {
    return 'This merchant has no order types (GET /test-print/order-types returns empty). Omit orderTypeId in the body and use POST /test-print with {} or { "tryAllDevices": true }. Or create order types in Clover Setup first.';
  }
  if (step === 'create_order') return 'Ensure token has order write permission and CLOVER_BASE_URL matches your merchant region (e.g. api.eu.clover.com for Europe).';
  return null;
}

module.exports = { getHint };
