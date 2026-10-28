<?php
/**
 * GET /api/bootstrap.php
 * Returns all portal state in one call so the client can render synchronously:
 *   { ok, leads[], payments[], theory{} }
 * theory is a flat map: { "<name||course>": finishedBool, "progress_<key>": [indices] }
 */

require __DIR__ . '/_bootstrap.php';

try {
    $pdo = tti_db($CONFIG);

    $leads = $pdo->query(
        'SELECT id, full_name AS name, phone, course, branch, status
           FROM students ORDER BY id DESC'
    )->fetchAll();

    $payments = $pdo->query(
        "SELECT id, student_name AS name, course, amount, method,
                reference AS ref, status, DATE_FORMAT(created_at, '%Y-%m-%d') AS date
           FROM payments ORDER BY id DESC"
    )->fetchAll();
    foreach ($payments as &$p) {
        $p['amount'] = (float) $p['amount'];
        $p['id']     = (int) $p['id'];
    }
    unset($p);

    $theory = [];
    foreach ($pdo->query('SELECT student_name, course, finished, progress FROM theory_status') as $t) {
        $key = strtolower($t['student_name'] . '||' . $t['course']);
        $theory[$key] = (bool) $t['finished'];
        $prog = json_decode((string) ($t['progress'] ?: '[]'), true);
        $theory['progress_' . $key] = is_array($prog) ? array_values($prog) : [];
    }

    tti_respond([
        'ok'       => true,
        'server'   => true,
        'leads'    => $leads,
        'payments' => $payments,
        'theory'   => $theory,
    ]);
} catch (Throwable $e) {
    tti_fail('bootstrap: ' . $e->getMessage(), 500);
}
