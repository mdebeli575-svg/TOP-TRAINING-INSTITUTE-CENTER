<?php
/**
 * Account + site settings (session-based).
 *
 * GET  /api/settings.php?action=profile      -> current user's profile (login required)
 * GET  /api/settings.php?action=site         -> public site settings (name, fees, currency)
 *
 * POST /api/settings.php
 *   { action: 'update_profile', name, email, phone, course }
 *   { action: 'change_password', current, new }
 *   { action: 'save_settings', institution_name, currency, registration_fee, certificate_fee }  (admin)
 */

require __DIR__ . '/_bootstrap.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$b      = ($method === 'POST') ? tti_body() : [];
$action = $b['action'] ?? ($_GET['action'] ?? 'site');

/** Read all settings and overlay them on the config defaults. */
function tti_site_settings(PDO $pdo, array $CONFIG): array
{
    $defaults = [
        'institution_name'  => $CONFIG['institution'] ?? 'TOP TRAINING INSTITUTE',
        'currency'          => $CONFIG['currency'] ?? 'ETB',
        'registration_fee'  => (int) ($CONFIG['fees']['registration'] ?? 500),
        'certificate_fee'   => (int) ($CONFIG['fees']['certificate'] ?? 200),
    ];
    $rows = $pdo->query('SELECT k, v FROM settings')->fetchAll();
    foreach ($rows as $r) {
        $defaults[$r['k']] = $r['v'];
    }
    $defaults['registration_fee'] = (int) $defaults['registration_fee'];
    $defaults['certificate_fee']  = (int) $defaults['certificate_fee'];
    return $defaults;
}

try {
    $pdo = tti_db($CONFIG);

    if ($method === 'GET') {
        if ($action === 'site') {
            tti_respond(['ok' => true, 'settings' => tti_site_settings($pdo, $CONFIG)]);
        }
        if ($action === 'profile') {
            $me  = tti_require_user();
            $st  = $pdo->prepare('SELECT id, full_name, email, phone, course, role FROM users WHERE id = ?');
            $st->execute([(int) $me['id']]);
            tti_respond(['ok' => true, 'profile' => $st->fetch()]);
        }
        tti_fail('unknown action');
    }

    tti_require_method('POST');

    if ($action === 'update_profile') {
        $me     = tti_require_user();
        $name   = trim((string) ($b['name'] ?? ''));
        $email  = strtolower(trim((string) ($b['email'] ?? '')));
        $phone  = trim((string) ($b['phone'] ?? ''));
        $course = trim((string) ($b['course'] ?? ''));
        if ($name === '' || $email === '') {
            tti_fail('name and email are required');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            tti_fail('enter a valid email address');
        }
        $chk = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id <> ?');
        $chk->execute([$email, (int) $me['id']]);
        if ($chk->fetchColumn()) {
            tti_fail('that email belongs to another account');
        }
        $pdo->prepare('UPDATE users SET full_name = ?, email = ?, phone = ?, course = ? WHERE id = ?')
            ->execute([$name, $email, $phone, $course, (int) $me['id']]);
        $_SESSION['tti_user']['name']   = $name;
        $_SESSION['tti_user']['email']  = $email;
        $_SESSION['tti_user']['phone']  = $phone;
        $_SESSION['tti_user']['course'] = $course;
        tti_respond(['ok' => true, 'user' => tti_user()]);
    }

    if ($action === 'change_password') {
        $me      = tti_require_user();
        $current = (string) ($b['current'] ?? '');
        $new     = (string) ($b['new'] ?? '');
        if (strlen($new) < 6) {
            tti_fail('new password must be at least 6 characters');
        }
        $st = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $st->execute([(int) $me['id']]);
        $hash = (string) $st->fetchColumn();
        if (!password_verify($current, $hash)) {
            tti_fail('current password is incorrect', 403);
        }
        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), (int) $me['id']]);
        tti_respond(['ok' => true]);
    }

    if ($action === 'save_settings') {
        tti_require_role('admin');
        $map = [
            'institution_name' => trim((string) ($b['institution_name'] ?? '')),
            'currency'         => strtoupper(trim((string) ($b['currency'] ?? ''))),
            'registration_fee' => (string) (int) ($b['registration_fee'] ?? 0),
            'certificate_fee'  => (string) (int) ($b['certificate_fee'] ?? 0),
        ];
        $up = $pdo->prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)');
        foreach ($map as $k => $v) {
            if ($v === '') {
                continue;
            }
            $up->execute([$k, $v]);
        }
        tti_respond(['ok' => true, 'settings' => tti_site_settings($pdo, $CONFIG)]);
    }

    tti_fail('unknown action');
} catch (Throwable $e) {
    tti_fail('settings: ' . $e->getMessage(), 500);
}
