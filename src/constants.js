/**
 * Static content: dummy items, how-to steps, troubleshooting messages.
 * Change these to adjust test data or copy without touching route logic.
 */

const DUMMY_ITEMS = [
  { name: 'Print Test Item 1', price: 100 },
  { name: 'Print Test Item 2', price: 100 },
];

const HOW_TO_PRINT = {
  title: 'How to get print on your Star printer',
  steps: [
    { step: 1, action: 'On the Clover device that is connected to your Star printer (same Wi‑Fi or network), open the Printers app.' },
    { step: 2, action: 'In Printers app: Add or select Order Printer (or Kitchen Printer) and choose your Star SP700 or Star TSP100 (Tandoor). Make sure it shows as connected.' },
    { step: 3, action: 'On the same Clover device: Go to Setup → Online Ordering → Settings. Set "Remote firing device for Clover online ordering" to THIS device. Save.' },
    { step: 4, action: 'Keep that Clover device powered on and connected to the internet.' },
    { step: 5, action: 'Send a test print: POST /test-print with body { "tryAllDevices": true }. This sends the print to every Clover device; the one that has your Star as Order Printer should print.' },
    { step: 6, action: 'If still no print: Call GET /test-print/devices, copy each device id, and try POST /test-print with body { "deviceId": "<paste-one-id>" } for each id until one prints.' },
  ],
  whyOurPrintsDontShow: 'Uber Eats and DoorDash use Clover Online Ordering; their orders have an order type that routes to the Remote firing device. Our API-created orders need the same order type.',
  apiCalls: [
    'GET /test-print/order-types  →  list order types; pick the one used for Online Order / Delivery',
    'POST /test-print with body { "orderTypeId": "<id from order-types>" }  →  create order like delivery so print routes same',
    'POST /test-print with body { "tryAllDevices": true }  →  send print to all Clover devices',
    'POST /test-print with body { "deviceId": "<uuid>" }   →  send print to one device',
    'POST /test-print/send-print with body { "orderId": "<id>", "tryAllDevices": true }  →  re-send print for existing order',
  ],
};

function buildTroubleshooting(orderId) {
  return {
    whyThirdPartyWorks: 'Uber Eats and DoorDash orders use Clover Online Ordering and print to the "Remote firing device" (Setup > Online Ordering > Settings). Our API-created orders must use the same path.',
    step1: 'Use same order type as delivery: GET /test-print/order-types, then POST /test-print with body { "orderTypeId": "<id of Online Order / Take Out / Delivery>" } so prints route like Uber Eats/DoorDash.',
    step2: 'Try all devices: POST /test-print with body { "tryAllDevices": true } to send print to every Clover device (one has your Star printer).',
    step3: 'On Clover device: Printers app → set Order Printer to Star SP700/TSP100. Setup > Online Ordering > Settings → set "Remote firing device" to THIS device.',
    step4: `Re-send print: POST /test-print/send-print with body { "orderId": "${orderId}", "tryAllDevices": true } or use deviceId from GET /test-print/devices.`,
  };
}

function buildSendPrintTroubleshooting(orderId) {
  return {
    step1: 'Set Default Firing Device: Setup > Online Ordering > Settings on Clover device.',
    step2: `Try all devices: POST /test-print/send-print with body { "orderId": "${orderId}", "tryAllDevices": true }.`,
  };
}

module.exports = {
  DUMMY_ITEMS,
  HOW_TO_PRINT,
  buildTroubleshooting,
  buildSendPrintTroubleshooting,
};
