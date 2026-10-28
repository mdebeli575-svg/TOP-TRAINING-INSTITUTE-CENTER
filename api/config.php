<?php
/**
 * TOP TRAINING INSTITUTE - Backend configuration
 * Single source of truth for DB + payment gateway credentials.
 * Mirrors config/config.json / config/config.yaml.
 *
 * SECURITY: keep real TeleBirr merchant keys out of version control.
 * Set telebirr.mode to 'live' only after filling the credentials below.
 */

return [
    'db' => [
        'host'    => '127.0.0.1',
        'port'    => 3306,
        'name'    => 'top_training_center',
        'user'    => 'root',
        'pass'    => '',            // XAMPP default is empty; set a strong password in production
        'charset' => 'utf8mb4',
    ],

    'currency' => 'ETB',
    'fees'     => [ 'registration' => 500, 'certificate' => 200 ],

    // Bootstrap administrator. On first admin login this account is created /
    // reconciled in the `users` table. Change the password from the Settings
    // page after going live; the hash (not this value) is what auth checks.
    'admin' => [
        'email'    => 'mesgebudebeli97@gmail.com',
        'password' => '@090304',
        'name'     => 'System Administrator',
    ],

    'telebirr' => [
        'enabled'          => true,
        'mode'             => 'sandbox',   // 'sandbox' records a pending push; 'live' calls Ethio Telecom
        'base_url'         => 'https://intb2b.telebirret.et/ttl/merchant/api/v1',
        'client_id'        => '',           // from Ethio Telecom merchant onboarding
        'client_secret'    => '',           // from Ethio Telecom merchant onboarding
        'merchant_key'     => '',           // merchant / account number
        'object_id'        => '',           // optional object id
        'private_key_path' => __DIR__ . '/keys/merchant_private_key.pem',
        'public_key_path'  => __DIR__ . '/keys/telebirr_public_key.pem',
        'shortcode'        => '*844#',
    ],

    'cbe' => [
        'enabled'        => true,
        'account_number' => '1000448547519',
        'account_name'   => 'TOP TRAINING INSTITUTE',
        'bank_code'      => '13',
    ],
];
