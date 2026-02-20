<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Clover Print API – one print request per order (no double printing).
 *
 * According to Clover docs (Print an order to the default firing device):
 * https://docs.clover.com/dev/docs/printing-orders-rest-api#request-exampleprint-an-order
 *
 * - POST /v3/merchants/{mId}/print_event
 * - Headers: Authorization: Bearer {token}, Content-Type: application/json
 * - Body: { "orderRef": { "id": "<orderId>" } }  only (optional "deviceRef": { "id": "<deviceId>" })
 * - One request = one print; routed to firing device's order printer (or onboard printer).
 *
 * Double print: call sendPrintEvent(..., $deviceId, 2) to send two identical print requests.
 */
class CloverPrintService
{
    /**
     * Send print event for a Clover order. Use $copies = 2 for double print.
     *
     * @param string      $cloverOrderId      Clover order ID
     * @param string      $cloverUrl          Clover API host (e.g. api.clover.com or apisandbox.dev.clover.com)
     * @param string      $cloverMerchantId   Merchant ID
     * @param string      $cloverBearerToken  API token
     * @param string|null $deviceId          Optional. If set, print is sent to this device only (UUID).
     * @param int         $copies             Number of print requests to send (1 = single, 2 = double print).
     * @return array{success: bool, copies: int, results: array, data?: array, error?: string, cloverResponse?: array}
     */
    public function sendPrintEvent(
        string $cloverOrderId,
        string $cloverUrl,
        string $cloverMerchantId,
        string $cloverBearerToken,
        ?string $deviceId = null,
        int $copies = 1
    ): array {
        $copies = max(1, $copies);
        $results = [];

        for ($i = 0; $i < $copies; $i++) {
            $result = $this->sendPrintEventOnce(
                $cloverOrderId,
                $cloverUrl,
                $cloverMerchantId,
                $cloverBearerToken,
                $deviceId
            );
            $results[] = $result;
            if (!$result['success']) {
                return [
                    'success'       => false,
                    'copies'        => $copies,
                    'results'       => $results,
                    'error'         => $result['error'] ?? 'Print request failed',
                    'cloverResponse' => $result['cloverResponse'] ?? null,
                ];
            }
        }

        return [
            'success' => true,
            'copies'  => $copies,
            'results' => $results,
            'data'    => $results[0]['data'] ?? null,
        ];
    }

    /**
     * Single print request (per Clover doc). Used internally; call sendPrintEvent() with $copies for double print.
     *
     * @return array{success: bool, data?: array, error?: string, cloverResponse?: array}
     */
    private function sendPrintEventOnce(
        string $cloverOrderId,
        string $cloverUrl,
        string $cloverMerchantId,
        string $cloverBearerToken,
        ?string $deviceId = null
    ): array {
        $url = $this->baseUrl($cloverUrl) . "/v3/merchants/{$cloverMerchantId}/print_event";

        // Doc: request body is orderRef only; optional deviceRef to target a device (no type/category).
        $payload = [
            'orderRef' => [
                'id' => $cloverOrderId,
            ],
        ];
        if ($deviceId !== null && $deviceId !== '') {
            $payload['deviceRef'] = ['id' => $deviceId];
        }

        try {
            $response = Http::withHeaders([
                'Accept'        => 'application/json',
                'Authorization' => "Bearer {$cloverBearerToken}",
                'Content-Type'  => 'application/json',
            ])->post($url, $payload);

            $body = $response->json();

            if (!$response->successful()) {
                $message = $body['message'] ?? $body['error'] ?? $response->reason();
                $this->logPrintError($cloverOrderId, $message, $body);
                return [
                    'success'        => false,
                    'error'          => $message,
                    'cloverResponse' => $body,
                ];
            }

            $this->logPrintSuccess($cloverOrderId, $body);
            return [
                'success' => true,
                'data'    => $body,
            ];
        } catch (\Throwable $e) {
            Log::channel('clover')->error('Clover Print Event Exception', [
                'order_id' => $cloverOrderId,
                'message'  => $e->getMessage(),
            ]);
            return [
                'success' => false,
                'error'   => $e->getMessage(),
            ];
        }
    }

    /**
     * Send print to every Clover device (use when default firing device is not set or unknown).
     * One of the devices usually has the order printer (e.g. Star SP700).
     *
     * @return array{success: bool, tryAllDevices: true, results: array<int, array{deviceId: string, model: ?string, success: bool, state?: string, error?: string}>}
     */
    public function sendPrintToAllDevices(
        string $cloverOrderId,
        string $cloverUrl,
        string $cloverMerchantId,
        string $cloverBearerToken
    ): array {
        $devices = $this->getDevices($cloverUrl, $cloverMerchantId, $cloverBearerToken);
        $results = [];

        foreach ($devices as $device) {
            $id = $device['id'] ?? null;
            if (!$id) {
                continue;
            }
            $result = $this->sendPrintEventOnce($cloverOrderId, $cloverUrl, $cloverMerchantId, $cloverBearerToken, $id);
            $results[] = [
                'deviceId' => $id,
                'model'    => $device['model'] ?? null,
                'success'  => $result['success'],
                'state'    => $result['data']['state'] ?? null,
                'error'    => $result['error'] ?? null,
            ];
        }

        return [
            'success'       => true,
            'tryAllDevices' => true,
            'results'       => $results,
        ];
    }

    /**
     * Get all Clover devices for the merchant (dynamic – call this to get deviceId at runtime).
     * GET /v3/merchants/:mId/devices
     *
     * @return array<int, array{id: string, name?: string, model?: string, serial?: string, deviceTypeName?: string, ...}>
     */
    public function getDevices(string $cloverUrl, string $cloverMerchantId, string $cloverBearerToken): array
    {
        $url = $this->baseUrl($cloverUrl) . "/v3/merchants/{$cloverMerchantId}/devices";

        try {
            $response = Http::withHeaders([
                'Accept'        => 'application/json',
                'Authorization' => "Bearer {$cloverBearerToken}",
            ])->get($url);

            if (!$response->successful()) {
                return [];
            }
            $data = $response->json();
            if (is_array($data)) {
                return $data;
            }
            return $data['elements'] ?? $data['data'] ?? [];
        } catch (\Throwable $e) {
            Log::channel('clover')->error('Clover getDevices failed', ['message' => $e->getMessage()]);
            return [];
        }
    }

    /**
     * Normalize base URL (ensure https).
     */
    private function baseUrl(string $cloverUrl): string
    {
        $cloverUrl = trim($cloverUrl);
        if (strpos($cloverUrl, 'http') !== 0) {
            return 'https://' . $cloverUrl;
        }
        return $cloverUrl;
    }

    private function logPrintSuccess(string $orderId, array $body): void
    {
        Log::channel('clover')->info('Clover Print Event Sent', [
            'order_id' => $orderId,
            'event_id' => $body['id'] ?? null,
            'state'    => $body['state'] ?? null,
        ]);
    }

    private function logPrintError(string $orderId, string $message, array $body): void
    {
        Log::channel('clover')->error('Clover Print Event Failed', [
            'order_id'  => $orderId,
            'message'   => $message,
            'response'  => $body,
        ]);
    }
}
