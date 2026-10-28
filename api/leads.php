<?php
/**
 * POST /api/leads.php
 *   { action: 'create', lead: { name, phone, course, branch } }
 *   { action: 'status', id, status }
 */

require __DIR__ . '/_bootstrap.php';
tti_require_method('POST');

$b      = tti_body();
$action = $b['action'] ?? 'create';

try {
    $pdo = tti_db($CONFIG);

    if ($action === 'create') {
        $d      = $b['lead'] ?? [];
        $name   = trim((string) ($d['name'] ?? ''));
        $phone  = trim((string) ($d['phone'] ?? ''));
        $course = trim((string) ($d['course'] ?? ''));
        $branch = trim((string) ($d['branch'] ?? ''));
        if ($name === '' || $phone === '') {
            tti_fail('name and phone are required');
        }
        $st = $pdo->prepare(
            'INSERT INTO students (full_name, phone, course, branch, status)
             VALUES (?, ?, ?, ?, "Pending")'
        );
        $st->execute([$name, $phone, $course, $branch]);
        $id = (int) $pdo->lastInsertId();
        tti_respond([
            'ok'   => true,
            'lead' => [
                'id' => $id, 'name' => $name, 'phone' => $phone,
                'course' => $course, 'branch' => $branch, 'status' => 'Pending',
            ],
        ]);
    }

    if ($action === 'status') {
        $id     = (int) ($b['id'] ?? 0);
        $status = (string) ($b['status'] ?? '');
        if (!in_array($status, ['Pending', 'Contacted', 'Enrolled'], true)) {
            tti_fail('invalid status');
        }
        $pdo->prepare('UPDATE students SET status = ? WHERE id = ?')->execute([$status, $id]);
        tti_respond(['ok' => true, 'id' => $id, 'status' => $status]);
    }

    tti_fail('unknown action');
} catch (Throwable $e) {
    tti_fail('leads: ' . $e->getMessage(), 500);
}
