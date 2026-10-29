-- ============================================================
-- TOP TRAINING INSTITUTE - Portal schema (MySQL / MariaDB)
-- Database: top_training_center
-- Import via phpMyAdmin or: mysql -u root < database/schema.sql
-- Safe to re-run (uses IF NOT EXISTS). Does not drop existing data.
-- ============================================================

CREATE DATABASE IF NOT EXISTS `top_training_center`
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `top_training_center`;

-- Enrollment / admission leads (from the public Inquire & Enroll form)
CREATE TABLE IF NOT EXISTS `students` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `full_name`  VARCHAR(150) NOT NULL,
    `phone`      VARCHAR(20)  NOT NULL,
    `course`     VARCHAR(150) NOT NULL DEFAULT '',
    `branch`     VARCHAR(60)  NOT NULL DEFAULT '',
    `status`     ENUM('Pending','Contacted','Enrolled') NOT NULL DEFAULT 'Pending',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_students_phone` (`phone`),
    KEY `idx_students_name` (`full_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fee payments (TeleBirr + CBE), server-side source of truth
CREATE TABLE IF NOT EXISTS `payments` (
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `student_name`    VARCHAR(150) NOT NULL,
    `phone`           VARCHAR(20)  NOT NULL DEFAULT '',
    `course`          VARCHAR(150) NOT NULL DEFAULT '',
    `amount`          DECIMAL(10,2) NOT NULL DEFAULT 0,
    `method`          ENUM('telebirr','cbe') NOT NULL,
    `reference`       VARCHAR(90)  NOT NULL,          -- our ref / CBE trx no.
    `gateway_status`  VARCHAR(40)  NOT NULL DEFAULT '',
    `gateway_message` VARCHAR(255) NOT NULL DEFAULT '',
    `status`          ENUM('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending',
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_payments_reference` (`reference`),
    KEY `idx_payments_name` (`student_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Theory class completion per student+course (drives certificate unlock)
CREATE TABLE IF NOT EXISTS `theory_status` (
    `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `student_name` VARCHAR(150) NOT NULL,
    `course`       VARCHAR(150) NOT NULL,
    `finished`     TINYINT(1) NOT NULL DEFAULT 0,
    `progress`     JSON NULL,                 -- array of completed module indices
    `updated_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_theory_student_course` (`student_name`, `course`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Accounts: administrators, students and general users
CREATE TABLE IF NOT EXISTS `users` (
    `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `full_name`     VARCHAR(150) NOT NULL,
    `email`         VARCHAR(190) NOT NULL,
    `phone`         VARCHAR(20)  NOT NULL DEFAULT '',
    `course`        VARCHAR(150) NOT NULL DEFAULT '',
    `password_hash` VARCHAR(255) NOT NULL,
    `role`          ENUM('admin','student','user') NOT NULL DEFAULT 'user',
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_users_email` (`email`),
    KEY `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Messaging threads (user <-> admin). All messages of one conversation share
-- `user_id`; `sender` marks who wrote each message.
CREATE TABLE IF NOT EXISTS `messages` (
    `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`    INT UNSIGNED NOT NULL,
    `sender`     ENUM('user','admin') NOT NULL,
    `subject`    VARCHAR(190) NOT NULL DEFAULT '',
    `body`       TEXT NOT NULL,
    `is_read`    TINYINT(1) NOT NULL DEFAULT 0,     -- read by the recipient
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_messages_user` (`user_id`),
    KEY `idx_messages_unread` (`is_read`, `sender`),
    CONSTRAINT `fk_messages_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Simple key/value store for admin-editable site settings
CREATE TABLE IF NOT EXISTS `settings` (
    `k` VARCHAR(60)  NOT NULL,
    `v` VARCHAR(255) NOT NULL DEFAULT '',
    PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Password recovery requests. Because no mail server is configured, a
-- "Forgot password?" submission files a request here for the administrator to
-- fulfil manually from the dashboard (set a new password / dismiss). `user_id`
-- is NULL only if the email matched no account at submit time.
CREATE TABLE IF NOT EXISTS `password_resets` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`    INT UNSIGNED NULL,
    `email`      VARCHAR(190) NOT NULL,
    `status`     ENUM('pending','done') NOT NULL DEFAULT 'pending',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `resolved_at` TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_pwresets_status` (`status`),
    KEY `idx_pwresets_user` (`user_id`),
    CONSTRAINT `fk_pwresets_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
