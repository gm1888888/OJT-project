<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

include 'connect.php';
include 'config.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;
require 'vendor/autoload.php';

$message = "";

if(isset($_POST['recover'])){
    $email = $_POST['email'];
    
    $checkEmail = "SELECT * FROM users WHERE email='$email'";
    $result = $conn->query($checkEmail);
    
    if($result->num_rows > 0){
        $token = bin2hex(random_bytes(50));
        
        $updateToken = "UPDATE users SET reset_token='$token' WHERE email='$email'";
        $conn->query($updateToken);
        
        // email
        $mail = new PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host       = SMTP_HOST; 
            $mail->SMTPAuth   = true;
            $mail->Username   = SMTP_USER; 
            $mail->Password   = SMTP_PASS; 
            
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port       = SMTP_PORT;

            $mail->setFrom(SMTP_FROM, SMTP_FROM_NAME); 
            $mail->addAddress($email); 

            $mail->isHTML(true);
            $mail->Subject = 'Password Recovery - DMP41 Calibration System';
            
            // reset link
            $resetLink = "$base_url/reset_password.php?token=" . $token;

            $mail->Body = "
            <div style='font-family: Arial, sans-serif; padding: 20px; color: #333;'>
                <h2>Password Reset Request</h2>
                <p>We received a request to reset your password for the DMP41 Calibration System.</p>
                <p>Click the link below to set a new password:</p>
                <p><a href='$resetLink' style='background-color: #0033a0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;'>Reset Password</a></p>
                <p>If you did not request this, please ignore this email.</p>
            </div>";

            $mail->send();
            $message = "<div style='margin-bottom: 20px; padding: 12px; background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; border-radius: 5px; text-align: center; font-weight: bold;'>A recovery link has been sent to your email. <i class='fas fa-check-circle'></i></div>";
        } catch (Exception $e) {
            $message = "<div style='margin-bottom: 20px; padding: 12px; background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 5px; text-align: center; font-weight: bold;'>Message could not be sent. Mailer Error: {$mail->ErrorInfo}</div>";
        }
    } else {
        $message = "<div style='margin-bottom: 20px; padding: 12px; background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 5px; text-align: center; font-weight: bold;'><i class='fas fa-exclamation-circle'></i> No account found with that email address.</div>";
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recover Password</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <div class="system-header">
            <img src="nmledited.png" alt="NML Logo" class="system-logo" style="max-width: 250px;">
            <h1 class="main-system-title">DMP41 Calibration System</h1>
        </div>
        
        <h2 class="form-subtitle">Recover Password</h2>
        
        <?php echo $message; ?>
        
        <form method="post" action="forgot_password.php" id="recoveryForm">
            <div class="input-group">
                <i class="fas fa-envelope"></i>
                <input type="email" name="email" id="email" placeholder="Enter your registered email" required>
                <label for="email">Email</label>
            </div>
            
            <input type="hidden" name="recover" value="1">
            
            <button type="submit" class="btn" id="recoverBtn" style="display: flex; justify-content: center; align-items: center; width: 100%; height: 50px; font-size: 16px; margin-top: 15px;">Send Recovery Link</button>
        </form>
        
        <div class="links" style="margin-top: 25px; text-align: center;">
            <a href="index.php" style="text-decoration: none; color: #0033a0; font-weight: bold;">Back to Log In</a>
        </div>
    </div>

    <script>
        document.getElementById('recoveryForm').addEventListener('submit', function() {
            const btn = document.getElementById('recoverBtn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i>'; 
            btn.style.pointerEvents = 'none'; 
            btn.style.opacity = '0.7';
        });
    </script>
</body>
</html>