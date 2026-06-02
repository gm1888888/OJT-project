<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
include_once 'connect.php';
$message = "";

if(isset($_GET['token'])){
    $token = $_GET['token'];
    
    $checkToken = "SELECT * FROM users WHERE reset_token='$token'";
    $result = $conn->query($checkToken);
    
    if($result->num_rows > 0){
        if(isset($_POST['reset'])){
            $newPassword = $_POST['newPassword'];
            $hashedPassword = md5($newPassword); // Hash the new password
            
            $updateQuery = "UPDATE users SET password='$hashedPassword', reset_token=NULL WHERE reset_token='$token'";
            
            if($conn->query($updateQuery) === TRUE){
                echo "<script>alert('Password updated successfully! You can now log in.'); window.location.href='index.php';</script>";
                exit();
            } else {
                $message = "<p style='color: red; text-align: center;'>Error updating password.</p>";
            }
        }
    } else {
        echo "<script>alert('Invalid or expired recovery link.'); window.location.href='index.php';</script>";
        exit();
    }
} else {
    header("Location: index.php");
    exit();
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Set New Password</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/css/all.min.css">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <div class="system-header">
            <img src="nmledited.png" alt="NML Logo" class="system-logo" style="max-width: 250px;">
            <h1 class="main-system-title">DMP41 Calibration System</h1>
        </div>
        
        <h2 class="form-subtitle">Set New Password</h2>
        
        <?php echo $message; ?>
        
        <form method="post" action="">
            <div class="input-group">
                <i class="fas fa-lock"></i>
                <input type="password" name="newPassword" id="newPassword" placeholder="Enter New Password" required>
                <label for="newPassword">New Password</label>
            </div>
            <input type="submit" class="btn" value="Reset Password" name="reset">
        </form>
    </div>
</body>
</html>