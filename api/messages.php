<?php
/**
 * POST /api/messages.php   (session-based; roles enforced)
 *   { action: 'send', body, subject?, user_id? }   user_id only for admin replies
 *   { action: 'mark_read', user_id? }
 * GET /api/messages.php
 *   ?action=list                                  -> user thread OR admin inbox
 *   ?action=thread&user_id=ID                     -> admin opens one thread
 */

require __DIR__ . '/_bootstrap.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$b      = ($method === 'POST') ? tti_body() : [];
$action = $b['action'] ?? ($_GET['action'] ?? 'list');

try {
    $pdo = tti_db($CONFIG);

    // ---------------- send / mark_read ----------------
    if ($method === 'POST' && $action === 'send') {
        $me      = tti_require_user();
        $body    = trim((string) ($b['body'] ?? ''));
        $subject = trim((string) ($b['subject'] ?? ''));
        if ($body === '') {
            tti_fail('message body is required');
        }
        if ($me['role'] === 'admin') {
            $uid    = (int) ($b['user_id'] ?? 0);
            $sender = 'admin';
            if ($uid <= 0) {
                tti_fail('user_id is required for admin replies');
            }
        } else {
            $uid    = (int) $me['id'];
            $sender = 'user';
        }
        $st = $pdo->prepare('INSERT INTO messages (user_id, sender, subject, body) VALUES (?, ?, ?, ?)');
        $st->execute([$uid, $sender, $subject, $body]);
        tti_respond(['ok' => true, 'id' => (int) $pdo->lastInsertId()]);
    }

    if ($method === 'POST' && $action === 'mark_read') {
        $me = tti_require_user();
        if ($me['role'] === 'admin') {
            $uid = (int) ($b['user_id'] ?? 0);
            $pdo->prepare("UPDATE messages SET is_read = 1 WHERE user_id = ? AND sender = 'user' AND is_read = 0")
                ->execute([$uid]);
        } else {
            $pdo->prepare("UPDATE messages SET is_read = 1 WHERE user_id = ? AND sender = 'admin' AND is_read = 0")
                ->execute([(int) $me['id']]);
        }
        tti_respond(['ok' => true]);
    }

    if ($method === 'POST') {
        tti_fail('unknown action');
    }

    // ---------------- list / thread (GET) ----------------
    if ($action === 'list') {
        $me = tti_require_user();
        if ($me['role'] === 'admin') {
            $rows = $pdo->query(
                "SELECT u.id AS user_id, u.full_name AS name, u.email, u.role,
                        (SELECT body       FROM messages m WHERE m.user_id = u.id ORDER BY m.id DESC LIMIT 1) AS last_body,
                        (SELECT created_at FROM messages m WHERE m.user_id = u.id ORDER BY m.id DESC LIMIT 1) AS last_at,
                        (SELECT COUNT(*)   FROM messages m WHERE m.user_id = u.id AND m.sender = 'user' AND m.is_read = 0) AS unread
                   FROM users u
                  WHERE EXISTS (SELECT 1 FROM messages m WHERE m.user_id = u.id)
                  ORDER BY last_at DESC"
            )->fetchAll();
            $totalUnread = 0;
            foreach ($rows as &$r) {
                $r['user_id'] = (int) $r['user_id'];
                $r['unread']  = (int) $r['unread'];
                $totalUnread += $r['unread'];
                $r['last_body'] = mb_strimwidth((string) $r['last_body'], 0, 90, '...');
            }
            unset($r);
            tti_respond(['ok' => true, 'inbox' => $rows, 'totalUnread' => $totalUnread]);
        }

        // student / user: their own conversation with the institute
        $st = $pdo->prepare(
            'SELECT id, sender, subject, body, is_read, created_at
               FROM messages WHERE user_id = ? ORDER BY id ASC'
        );
        $st->execute([(int) $me['id']]);
        $thread = $st->fetchAll();
        tti_respond(['ok' => true, 'thread' => $thread]);
    }

    if ($action === 'thread') {
        tti_require_role('admin');
        $uid = (int) ($_GET['user_id'] ?? 0);
        $u = $pdo->prepare('SELECT id, full_name, email, role FROM users WHERE id = ?');
        $u->execute([$uid]);
        $who = $u->fetch();
        if (!$who) {
            tti_fail('user not found', 404);
        }
        $st = $pdo->prepare(
            'SELECT id, sender, subject, body, is_read, created_at
               FROM messages WHERE user_id = ? ORDER BY id ASC'
        );
        $st->execute([$uid]);
        // Opening a thread marks the user's messages as read by admin.
        $pdo->prepare("UPDATE messages SET is_read = 1 WHERE user_id = ? AND sender = 'user' AND is_read = 0")
            ->execute([$uid]);
        tti_respond(['ok' => true, 'user' => $who, 'thread' => $st->fetchAll()]);
    }

    tti_fail('unknown action');
} catch (Throwable $e) {
    tti_fail('messages: ' . $e->getMessage(), 500);
}
