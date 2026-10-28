<?php
/**
 * Shared bootstrap: config, JSON headers, CORS, DB connection and helpers.
 * Every endpoint in /api starts with: require __DIR__ . '/_bootstrap.php';
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0'); // never leak stack traces as HTML in a JSON API

$CONFIG = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ---- PHP session (same-origin auth). Cookie is HttpOnly + SameSite=Lax. ----
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/** Currently authenticated user row, or null. */
function tti_user(): ?array
{
    return $_SESSION['tti_user'] ?? null;
}

/** Require any logged-in account or fail with 401. */
function tti_require_user(): array
{
    $u = tti_user();
    if (!$u) {
        tti_fail('authentication required', 401);
    }
    return $u;
}

/** Require a specific role (e.g. 'admin') or fail with 403. */
function tti_require_role(string $role): array
{
    $u = tti_require_user();
    if (($u['role'] ?? '') !== $role) {
        tti_fail("$role access required", 403);
    }
    return $u;
}

/** Open a PDO connection using the configured credentials. */
function tti_db(array $cfg): PDO
{
    $d   = $cfg['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $d['host'],
        (int) $d['port'],
        $d['name'],
        $d['charset']
    );
    return new PDO($dsn, $d['user'], $d['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}

/** Decode the JSON request body into an array. */
function tti_body(): array
{
    $raw = file_get_contents('php://input');
    $j   = json_decode($raw !== false ? $raw : '[]', true);
    return is_array($j) ? $j : [];
}

/** Emit a JSON response and stop. */
function tti_respond($data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Emit a JSON error and stop. */
function tti_fail(string $msg, int $code = 400): void
{
    tti_respond(['ok' => false, 'error' => $msg], $code);
}

/** Require a specific HTTP method or fail with 405. */
function tti_require_method(string $method): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== strtoupper($method)) {
        tti_fail("$method required", 405);
    }
}
