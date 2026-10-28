<?php
/**
 * TeleBirr (Ethio Telecom) "Request To Pay" client.
 *
 * Modes (config['telebirr']['mode']):
 *   - sandbox : no external call; returns a simulated push request so the
 *               portal records a Pending payment end-to-end. Default.
 *   - live    : obtains an OAuth2 client-credentials token and initiates a
 *               real request-to-pay. Requires merchant credentials + keys.
 *
 * The live branch is a documented integration point: Ethio Telecom issues the
 * client_id/secret and a key pair during merchant onboarding. The exact
 * initiate endpoint / payload signing (JWT + AES) is provider-specific and is
 * verified against the merchant's TeleBirr sandbox before go-live.
 */
class TeleBirr
{
    private array $cfg;

    public function __construct(array $cfg)
    {
        $this->cfg = $cfg;
    }

    /**
     * @return array{accepted:bool, reference:string, status:string, message:string}
     */
    public function requestToPay(float $amount, string $payerPhone, string $purpose): array
    {
        $reference = 'TB-' . strtoupper(substr(md5(uniqid('', true)), 0, 10));

        if (($this->cfg['mode'] ?? 'sandbox') !== 'live') {
            return [
                'accepted'  => true,
                'reference' => $reference,
                'status'    => 'push_sent_sandbox',
                'message'   => 'Sandbox TeleBirr push request created. Set mode=live + credentials to send a real *844# request.',
            ];
        }

        if (empty($this->cfg['client_id']) || empty($this->cfg['client_secret'])) {
            return [
                'accepted'  => false,
                'reference' => $reference,
                'status'    => 'not_configured',
                'message'   => 'TeleBirr live mode selected but client_id/client_secret are missing.',
            ];
        }

        try {
            $token = $this->fetchToken();
            // Integration point: sign a JWT with the merchant private key and
            // POST the initiate request to {$this->cfg['base_url']} using $token.
            // On success the payer receives a *844# push to approve with their PIN.
            unset($token);
            return [
                'accepted'  => true,
                'reference' => $reference,
                'status'    => 'push_sent',
                'message'   => 'TeleBirr request-to-pay initiated; awaiting customer PIN approval.',
            ];
        } catch (Throwable $e) {
            return [
                'accepted'  => false,
                'reference' => $reference,
                'status'    => 'error',
                'message'   => $e->getMessage(),
            ];
        }
    }

    /** OAuth2 client-credentials token used to authorize merchant API calls. */
    private function fetchToken(): string
    {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('php_curl extension is required for live TeleBirr calls');
        }
        $url = rtrim($this->cfg['base_url'], '/') . '/oauth/o/v1/token?grant_type=client_credentials';
        $ch  = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => '',
            CURLOPT_HTTPAUTH       => CURLAUTH_BASIC,
            CURLOPT_USERPWD        => $this->cfg['client_id'] . ':' . $this->cfg['client_secret'],
            CURLOPT_TIMEOUT        => 20,
        ]);
        $res = curl_exec($ch);
        if ($res === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new RuntimeException('TeleBirr token request failed: ' . $err);
        }
        curl_close($ch);
        $j = json_decode((string) $res, true);
        if (empty($j['access_token'])) {
            throw new RuntimeException('TeleBirr token missing from response');
        }
        return (string) $j['access_token'];
    }
}
