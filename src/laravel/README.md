# CloverPrintService – Laravel usage

Copy `CloverPrintService.php` into your Laravel app (e.g. `app/Services/CloverPrintService.php`) and fix the namespace to match your app (e.g. `App\Services`).

**According to Clover docs:** One POST with body `{ "orderRef": { "id": "<orderId>" } }`. Optional `deviceRef` to target a specific device. Use `$copies = 2` for **double print** (e.g. kitchen + reception).

## Config

Use your existing Clover config (env or config file), e.g.:

- `CLOVER_URL` – e.g. `api.clover.com` or `apisandbox.dev.clover.com`
- `CLOVER_MERCHANT_ID`
- `CLOVER_ACCESS_TOKEN` (bearer token)

## 1. Single or double print (default firing device)

Send one or more print requests. Use 6th argument `$copies = 2` for double print. Clover routes it to the merchant’s default order printer (firing device).

```php
$service = app(CloverPrintService::class);
$result = $service->sendPrintEvent(
    $cloverOrderId,
    config('services.clover.url'),
    config('services.clover.merchant_id'),
    config('services.clover.access_token'),
    null,   // deviceId (optional)
    2       // copies: 1 = single, 2 = double print
);

if ($result['success']) {
    // $result['data'] has id, state, orderRef, deviceRef, etc.
} else {
    // $result['error'], $result['cloverResponse']
}

return response()->json($result);
```

## 2. Get deviceId dynamically

Call `getDevices()` to get the list of Clover devices at runtime. Each device has an `id` (UUID) – use that as `deviceId` when calling `sendPrintEvent()`.

```php
$service = app(CloverPrintService::class);

$devices = $service->getDevices($cloverUrl, $cloverMerchantId, $cloverBearerToken);
// $devices = [
//   [ 'id' => '926766ca-5636-8598-e959-6e3c6fe047e1', 'name' => '...', 'model' => 'C406', ... ],
//   [ 'id' => '...', ... ],
// ]

// Use first device, or pick by model/name
$deviceId = $devices[0]['id'] ?? null;
if ($deviceId) {
    $result = $service->sendPrintEvent($cloverOrderId, $cloverUrl, $cloverMerchantId, $cloverBearerToken, $deviceId);
}
```

## 3. Print to a specific device (when you have deviceId)

```php
$result = $service->sendPrintEvent(
    $cloverOrderId,
    $cloverUrl,
    $cloverMerchantId,
    $cloverBearerToken,
    $deviceId   // from getDevices() or stored config
);
```

## 4. Print to all devices (try all)

Use when the default firing device isn’t set or you’re not sure which device has the printer. Sends one print request per device.

```php
$result = $service->sendPrintToAllDevices(
    $cloverOrderId,
    $cloverUrl,
    $cloverMerchantId,
    $cloverBearerToken
);
// $result['success'] === true, $result['tryAllDevices'] === true
// $result['results'] = [ ['deviceId' => '...', 'model' => '...', 'success' => true/false, 'state' => '...', 'error' => '...' ], ... ]
```

## 5. List devices (same as “Get deviceId dynamically”)

```php
$devices = $service->getDevices($cloverUrl, $cloverMerchantId, $cloverBearerToken);
// array of [ 'id' => '...', 'name' => '...', 'model' => '...', ... ]
```

## Order type (so “our” orders print like Uber Eats/DoorDash)

Prints route to the same printer as Uber Eats/DoorDash when the **order** is created with the same **order type** (e.g. “Online Order”, “Take Out”). That happens when you create the order in Clover, not in the print call.

When creating the order via Clover API, include the order type:

- Get order types: `GET https://{base}/v3/merchants/{mId}/order_types`
- Pick the id for “Online Order” / “Take Out” / “Delivery”
- Create order with body: `{ "state": "open", "orderType": { "id": "<that id>" } }`

Then when you call `sendPrintEvent`, the order is already associated with that channel and will use the same firing device.

## Logging

The service uses `Log::channel('clover')`. Ensure you have a `clover` log channel in `config/logging.php`, or change the channel in the service to one you use (e.g. `stack` or `single`).
