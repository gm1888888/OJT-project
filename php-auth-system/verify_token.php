<?php
// Set headers for JSON response and CORS (to allow Node.js to communicate)
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");

include_once 'connect.php';

if (isset($_GET['token'])) {
    $token = $conn->real_escape_string($_GET['token']);

    // Check if token exists and is valid (e.g., created within the last 60 seconds)
    // For SQLite compatibility on some setups, using TIMESTAMPDIFF is fine in MySQL.
    $checkSql = "SELECT * FROM bridge_tokens WHERE token='$token' AND TIMESTAMPDIFF(SECOND, created_at, NOW()) < 60";
    $result = $conn->query($checkSql);

    if ($result && $result->num_rows > 0) {
        $row = $result->fetch_assoc();
        $email = $row['email'];

        // Token is valid, so we consume (delete) it
        $deleteSql = "DELETE FROM bridge_tokens WHERE token='$token'";
        $conn->query($deleteSql);

        echo json_encode(["valid" => true, "email" => $email]);
    } else {
        // Delete expired tokens for cleanup
        $conn->query("DELETE FROM bridge_tokens WHERE token='$token' OR TIMESTAMPDIFF(SECOND, created_at, NOW()) >= 60");
        echo json_encode(["valid" => false, "error" => "Token invalid or expired."]);
    }
} else {
    echo json_encode(["valid" => false, "error" => "No token provided."]);
}
?>