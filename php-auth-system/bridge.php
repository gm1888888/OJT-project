<?php
session_start();
include_once 'connect.php';

// Ensure user is logged in
if (!isset($_SESSION['email'])) {
    header("Location: index.php");
    exit();
}

// Create the bridge_tokens table if it doesn't exist
$createTableSql = "CREATE TABLE IF NOT EXISTS bridge_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)";
$conn->query($createTableSql);

$email = $_SESSION['email'];
$token = bin2hex(random_bytes(32)); // Generate secure random token

// Store token in database
$insertToken = "INSERT INTO bridge_tokens (email, token) VALUES ('$email', '$token')";
if ($conn->query($insertToken) === TRUE) {
    // Redirect to the Node.js dashboard with the token
    header("Location: " . $node_engine_url . "/?auth_token=" . $token);
    exit();
} else {
    echo "Error generating bridge token: " . $conn->error;
}
?>