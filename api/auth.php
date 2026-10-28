<?php
/**
 * POST /api/auth.php   (session-based authentication)
 *   { action: 'register', name, email, phone, course, password, role }
 *   { action: 'login',    email, password }
 *   { action: 'logout' }
 *   { action: 'me' }            -> also accepts GET
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

    tti_fail('unknown action');
} catch (Throwable $e) {
    tti_fail('auth: ' . $e->getMessage(), 500);
}
