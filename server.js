/**
 * Clover Print Test – Entry point.
 * Mounts routes and starts the server. All logic lives under src/.
 *
 * Print API: https://docs.clover.com/dev/docs/printing-orders-rest-api#request-exampleprint-an-order
 */

const express = require('express');
const testPrintRouter = require('./src/routes/testPrint');
const { PORT } = require('./src/config');

const app = express();
app.use(express.json());

app.use('/test-print', testPrintRouter);

app.listen(PORT, () => {
  console.log(`Clover print test server listening on http://localhost:${PORT}`);
  console.log('POST /test-print               – create order + print (body: { orderTypeId, tryAllDevices: true } or { deviceId })');
  console.log('POST /test-print/send-print    – re-send print (body: { orderId, tryAllDevices: true })');
  console.log('POST /test-print/debug-print   – debug no print (body: { orderId, tryAllDevices: true })');
  console.log('GET  /test-print/check         – verify Clover connection');
  console.log('GET  /test-print/order-types   – list order types (use same as Uber Eats/DoorDash)');
  console.log('GET  /test-print/devices       – list Clover devices');
  console.log('GET  /test-print/how-to-print  – step-by-step Star printer setup');
  console.log('GET  /test-print/verify/:orderId – re-check order');
});
