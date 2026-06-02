<?php
include 'config.php';

// 1. Connect without database selected
$conn = new mysqli(DB_HOST, DB_USER, DB_PASS);
if ($conn->connect_error) {
    die("Failed to connect to MySQL: " . $conn->connect_error);
}

// 2. Create the database if it doesn't exist
$db_name = DB_NAME;
$sql_db = "CREATE DATABASE IF NOT EXISTS $db_name";
if ($conn->query($sql_db) !== TRUE) {
    die("Error creating database: " . $conn->error);
}

// 3. Select the database
$conn->select_db($db_name);

// 4. Initialize required tables
$sql_table_users = "CREATE TABLE IF NOT EXISTS users (
    id INT(11) AUTO_INCREMENT PRIMARY KEY,
    firstName VARCHAR(50) NOT NULL,
    lastName VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
)";
$conn->query($sql_table_users);

// bridge_tokens is created in bridge.php dynamically, but we can ensure it here too for safety
$sql_table_tokens = "CREATE TABLE IF NOT EXISTS bridge_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)";
$conn->query($sql_table_tokens);
?>