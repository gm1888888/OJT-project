<?php
// DMP41 PHP Auth System Configuration

// 1. Dynamic Host Detection
$protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http";
$host = $_SERVER['HTTP_HOST'];
$base_url = "$protocol://$host/php-auth-system";

// 2. Database Credentials
define('DB_HOST', 'localhost');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_NAME', 'login');

// 3. Node.js Engine Configuration
$node_engine_url = "http://localhost:3000";

// 3. SMTP Configuration (for password recovery)
define('SMTP_HOST', 'smtp.gmail.com');
define('SMTP_PORT', 587);
define('SMTP_USER', 'princessangel.cb@gmail.com');
define('SMTP_PASS', '16-SECRETPASS'); // RECOMMENDATION: Use App Password or move to .env
define('SMTP_FROM', 'princessangel.cb@gmail.com');
define('SMTP_FROM_NAME', 'DMP41 Calibration System');
?>
