<?php
/**
 * POST /api/theory.php
 *   { name, course, finished: bool, progress: [indices] }
 * Upserts theory completion for a student+course. Also accepts a GET with
 * ?name=&course= to read a single record.
 */

require __DIR__ . '/_bootstrap.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

try {
    $pdo = tti_db($CONFIG);

    if ($method === 'GET') {
        $name   = trim((string) ($_GET['name'] ?? ''));
        $course = trim((string) ($_GET['course'] ?? ''));
        if ($name === '' || $course === '') {
            tti_fail('name and course query params required');
        }
        $st = $pdo->prepare('SELECT finished, progress FROM theory_status WHERE student_name = ? AND course = ?');
        $st->execute([$name, $course]);
        $row = $st->fetch();
        $prog = $row ? json_decode((string) ($row['progress'] ?: '[]'), true) : [];
        tti_respond([
            'ok'       => true,
            'finished' => $row ? (bool) $row['finished'] : false,
            'progress' => is_array($prog) ? $prog : [],
        ]);
    }

    if ($method === 'POST') {
        $b        = tti_body();
        $name     = trim((string) ($b['name'] ?? ''));
        $course   = trim((string) ($b['course'] ?? ''));
        $finished = !empty($b['finished']);
        $progress = $b['progress'] ?? [];
        if (!is_array($progress)) {
            $progress = [];
        }
        $progress = array_values(array_map('intval', $progress));
        if ($name === '' || $course === '') {
            tti_fail('name and course required');
        }

        $st = $pdo->prepare(
            'INSERT INTO theory_status (student_name, course, finished, progress)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE finished = VALUES(finished), progress = VALUES(progress)'
        );
        $st->execute([$name, $course, $finished ? 1 : 0, json_encode($progress)]);

        tti_respond(['ok' => true, 'name' => $name, 'course' => $course, 'finished' => $finished, 'progress' => $progress]);
    }

    tti_fail('unsupported method', 405);
} catch (Throwable $e) {
    tti_fail('theory: ' . $e->getMessage(), 500);
}
