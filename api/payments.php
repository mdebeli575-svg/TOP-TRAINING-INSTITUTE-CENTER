<?php
/**
 * POST /api/payments.php
 *   { action: 'create', payment: { name, phone, course, amount, method, trx_ref } }
 *   { action: 'verify'|'reject', id }
 *
 * TeleBirr goes through the TeleBirr client (sandbox by default). CBE records a
 * bank-transfer reference for manual verification. Both persist to `payments`.
 */

require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/lib/TeleBirr.php';
tti_require_method('POST');

/** Guarantee a unique reference for the payments.reference UNIQUE key. */
function tti_unique_ref(PDO $pdo, string $ref): string
{
    $chk = $pdo->prepare('SELECT COUNT(*) FROM payments WHERE reference = ?');
    $chk->execute([$ref]);
    if ((int) $chk->fetchColumn() === 0) {
        return $ref;
    }
    return $ref . '-' . substr(str_replace('.', '', (string) microtime(true)), -6);
}

$b      = tti_body();
$action = $b['action'] ?? '';

try {
    $pdo = tti_db($CONFIG);

    if ($action === 'create') {
        $p      = $b['payment'] ?? [];
        $name   = trim((string) ($p['name'] ?? ''));
        $course = trim((string) ($p['course'] ?? ''));
        $phone  = trim((string) ($p['phone'] ?? ''));
        $trx    = trim((string) ($p['trx_ref'] ?? ''));
        $amount = (float) ($p['amount'] ?? 0);
        $method = strtolower((string) ($p['method'] ?? ''));

        if ($name === '' || $amount <= 0) {
            tti_fail('name and a positive amount are required');
        }
        if (!in_array($method, ['telebirr', 'cbe'], true)) {
            tti_fail('method must be telebirr or cbe');
        }

        if ($method === 'telebirr') {
            if (!preg_match('/^0[97][0-9]{8}$/', $phone)) {
                tti_fail('invalid TeleBirr number (expect 09/07 + 8 digits)');
            }
            $gw       = (new TeleBirr($CONFIG['telebirr']))->requestToPay($amount, $phone, 'TTI ' . $course);
            $ref      = $gw['reference'];
            $gwStatus = $gw['status'];
            $gwMsg    = $gw['message'];
        } else {
            if ($trx === '') {
                tti_fail('CBE transaction reference is required');
            }
            $ref      = $trx;
            $gwStatus = 'bank_transfer';
            $gwMsg    = 'Awaiting manual verification against the CBE statement';
        }

        $ref = tti_unique_ref($pdo, $ref);

        $st = $pdo->prepare(
            'INSERT INTO payments
                (student_name, phone, course, amount, method, reference, gateway_status, gateway_message, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, "Pending")'
        );
        $st->execute([$name, $phone, $course, $amount, $method, $ref, $gwStatus, $gwMsg]);
        $id = (int) $pdo->lastInsertId();

        tti_respond([
            'ok'       => true,
            'payment'  => [
                'id' => $id, 'name' => $name, 'course' => $course, 'amount' => $amount,
                'method' => $method, 'ref' => $ref, 'status' => 'Pending', 'date' => date('Y-m-d'),
            ],
            'gateway'  => ['status' => $gwStatus, 'message' => $gwMsg],
        ]);
    }

    if ($action === 'verify' || $action === 'reject') {
        $id     = (int) ($b['id'] ?? 0);
        $status = $action === 'verify' ? 'Verified' : 'Rejected';
        $st = $pdo->prepare('UPDATE payments SET status = ? WHERE id = ?');
        $st->execute([$status, $id]);
        if ($st->rowCount() === 0) {
            tti_fail('payment not found', 404);
        }
        tti_respond(['ok' => true, 'id' => $id, 'status' => $status]);
    }

    tti_fail('unknown action');
} catch (Throwable $e) {
    tti_fail('payments: ' . $e->getMessage(), 500);
}
