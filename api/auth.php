<?php
/**
 * POST /api/auth.php   (session-based authentication)
 *   { action: 'register', name, email, phone, course, password, role }
 *   { action: 'login',    email, password }
 *   { action: 'logout' }
 *   { action: 'me' }            -> also accepts GET
 *   { action: 'forgot_password', email }        -> files an admin reset request
 *   { action: 'reset_requests' } -> GET, admin only
 *   { action: 'admin_reset_password', user_id, new_password }  -> admin only
 *   { action: 'dismiss_reset', request_id }     -> admin only
 *
 * Roles: 'student' and 'user' self-register. 'admin' is bootstrapped once from
 * the credentials in config.php and is never self-registrable here.
 */

require __DIR__ . '/_bootstrap.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$b      = ($method === 'POST') ? tti_body() : [];
$action = $b['action'] ?? ($_GET['action'] ?? 'me');

/** Strip a DB row down to the fields safe to keep in the session. */
function tti_public_user(array $u): array
{
    return [
        'id'    => (int) $u['id'],
        'name'  => $u['full_name'],
        'email' => $u['email'],
        'phone' => $u['phone'],
        'course'=> $u['course'],
        'role'  => $u['role'],
    ];
}

function tti_login_session(array $u): void
{
    session_regenerate_id(true);
    $_SESSION['tti_user'] = tti_public_user($u);
}

try {
    $pdo = tti_db($CONFIG);

    // ---------------- me ----------------
    if ($action === 'me') {
        tti_respond(['ok' => true, 'user' => tti_user()]);
    }

    // ---------------- reset_requests (admin, GET) ----------------
    if ($action === 'reset_requests') {
        tti_require_role('admin');
        $st = $pdo->query(
            "SELECT r.id, r.user_id, r.email, r.created_at,
                    u.full_name, u.phone, u.course, u.role
             FROM password_resets r
             LEFT JOIN users u ON u.id = r.user_id
             WHERE r.status = 'pending'
             ORDER BY r.created_at DESC"
        );
        $rows = $st->fetchAll();
        tti_respond(['ok' => true, 'requests' => $rows, 'count' => count($rows)]);
    }

    tti_require_method('POST');

    // ---------------- register ----------------
    if ($action === 'register') {
        $name     = trim((string) ($b['name'] ?? ''));
        $email    = strtolower(trim((string) ($b['email'] ?? '')));
        $phone    = trim((string) ($b['phone'] ?? ''));
        $course   = trim((string) ($b['course'] ?? ''));
        $password = (string) ($b['password'] ?? '');
        $role     = (string) ($b['role'] ?? 'user');

        if ($name === '' || $email === '') {
            tti_fail('name and email are required');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            tti_fail('enter a valid email address');
        }
        if (strlen($password) < 6) {
            tti_fail('password must be at least 6 characters');
        }
        if (!in_array($role, ['student', 'user'], true)) {
            tti_fail('account type must be student or user');
        }

        $chk = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $chk->execute([$email]);
        if ($chk->fetchColumn()) {
            tti_fail('an account with this email already exists');
        }

        $st = $pdo->prepare(
            'INSERT INTO users (full_name, email, phone, course, password_hash, role)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $st->execute([$name, $email, $phone, $course, password_hash($password, PASSWORD_DEFAULT), $role]);

        $row = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $row->execute([(int) $pdo->lastInsertId()]);
        $u = $row->fetch();
        tti_login_session($u);
        tti_respond(['ok' => true, 'user' => tti_user()]);
    }

    // ---------------- login ----------------
    if ($action === 'login') {
        $email    = strtolower(trim((string) ($b['email'] ?? '')));
        $password = (string) ($b['password'] ?? '');
        if ($email === '' || $password === '') {
            tti_fail('email and password are required');
        }

        $st  = $pdo->prepare('SELECT * FROM users WHERE email = ?');
        $st->execute([$email]);
        $u = $st->fetch();

        // Bootstrap the configured administrator on first login.
        $admin = $CONFIG['admin'];
        if (!$u && $email === strtolower(trim($admin['email'])) && hash_equals($admin['password'], $password)) {
            $ins = $pdo->prepare(
                'INSERT INTO users (full_name, email, phone, course, password_hash, role)
                 VALUES (?, ?, "", "", ?, "admin")'
            );
            $ins->execute([$admin['name'], $email, password_hash($admin['password'], PASSWORD_DEFAULT)]);
            $row = $pdo->prepare('SELECT * FROM users WHERE id = ?');
            $row->execute([(int) $pdo->lastInsertId()]);
            $u = $row->fetch();
        }

        if (!$u || !password_verify($password, (string) $u['password_hash'])) {
            tti_fail('invalid email or password', 401);
        }

        tti_login_session($u);
        tti_respond(['ok' => true, 'user' => tti_user()]);
    }

    // ---------------- logout ----------------
    if ($action === 'logout') {
        unset($_SESSION['tti_user']);
        session_destroy();
        tti_respond(['ok' => true, 'user' => null]);
    }

    // ---------------- forgot_password (public) ----------------
    // No mail server is configured, so this files a request for the admin to
    // fulfil from the dashboard. We answer the same whether or not the email
    // matches an account, so the form can't be used to enumerate users.
    if ($action === 'forgot_password') {
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            tti_fail('enter a valid email address');
        }
        $uid = null;
        $st  = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $st->execute([$email]);
        if ($found = $st->fetch()) {
            $uid = (int) $found['id'];
        }
        // Avoid stacking duplicate pending requests for the same email.
        $dup = $pdo->prepare("SELECT id FROM password_resets WHERE email = ? AND status = 'pending' LIMIT 1");
        $dup->execute([$email]);
        if (!$dup->fetchColumn()) {
            $ins = $pdo->prepare('INSERT INTO password_resets (user_id, email) VALUES (?, ?)');
            $ins->execute([$uid, $email]);
        }
        tti_respond(['ok' => true, 'message' => 'Your reset request has been sent to the administrator. They will update your password and contact you shortly.']);
    }

    // ---- admin-only password-reset desk ----
    if ($action === 'admin_reset_password') {
        tti_require_role('admin');
        $uid  = (int) ($b['user_id'] ?? 0);
        $newp = (string) ($b['new_password'] ?? '');
        if ($uid <= 0) {
            tti_fail('a user is required');
        }
        if (strlen($newp) < 6) {
            tti_fail('new password must be at least 6 characters');
        }
        $st = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $st->execute([$uid]);
        $target = $st->fetch();
        if (!$target) {
            tti_fail('account not found', 404);
        }
        if ($target['role'] === 'admin') {
            tti_fail('the administrator password is changed from the Settings page');
        }
        $up = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $up->execute([password_hash($newp, PASSWORD_DEFAULT), $uid]);
        // Close any pending request and notify the user in their message thread
        // (there is no email to deliver a temporary password through).
        $pdo->prepare("UPDATE password_resets SET status = 'done', resolved_at = NOW() WHERE user_id = ? AND status = 'pending'")
            ->execute([$uid]);
        $msg = $pdo->prepare("INSERT INTO messages (user_id, sender, subject, body) VALUES (?, 'admin', ?, ?)");
        $msg->execute([
            $uid,
            'Password reset',
            'The administrator has reset your password. You can now sign in with the new password and change it from My Account > Settings.',
        ]);
        tti_respond(['ok' => true, 'message' => 'Password reset for ' . $target['full_name'] . '.']);
    }

    if ($action === 'dismiss_reset') {
        tti_require_role('admin');
        $rid = (int) ($b['request_id'] ?? 0);
        if ($rid <= 0) {
            tti_fail('a request id is required');
        }
        $up = $pdo->prepare("UPDATE password_resets SET status = 'done', resolved_at = NOW() WHERE id = ?")
            ->execute([$rid]);
        tti_respond(['ok' => true]);
    }

    tti_fail('unknown action');
} catch (Throwable $e) {
    tti_fail('auth: ' . $e->getMessage(), 500);
}
