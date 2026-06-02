<?php 
error_reporting(E_ALL);
ini_set('display_errors', 1);

include 'connect.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;
require 'vendor/autoload.php';

// register
if(isset($_POST['signUp'])){
    $firstName = $_POST['fName'];
    $lastName = $_POST['lName'];
    $email = $_POST['email'];
    $password = $_POST['password'];
    $confirmPassword = $_POST['confirmPassword'];

    // verification
    if($password !== $confirmPassword){
        echo "Error: Passwords do not match!";
        exit();
    }

    $hashedPassword = md5($password); 

    $checkEmail = "SELECT * FROM users WHERE email='$email'";
    $result = $conn->query($checkEmail);
    if($result->num_rows > 0){
        echo "Error: Email Address Already Exists!";
        exit();
    }
    else{
        $insertQuery = "INSERT INTO users (firstName, lastName, email, password) VALUES ('$firstName', '$lastName', '$email', '$hashedPassword')";

        if($conn->query($insertQuery) === TRUE){

            // Helper function to check internet connectivity
            function is_online() {
                $connected = @fsockopen("www.google.com", 80, $errno, $errstr, 3);
                if ($connected) {
                    fclose($connected);
                    return true;
                }
                return false;
            }

            if (is_online()) {
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
                    $mail->addAddress($email, $firstName); 

                    $mail->isHTML(true);
                    $mail->Subject = 'Account Activation Confirmation - DMP41 Calibration System';

                    if (file_exists('nmledited.png')) {
                        $mail->addEmbeddedImage('nmledited.png', 'nml_logo');
                    }

                    if (file_exists('headerbg.jpg')) {
                        $mail->addEmbeddedImage('headerbg.jpg', 'header_bg');
                    }

                    $mail->Body = "
                    <div style='background-color: #f4f6f9; padding: 40px 20px; font-family: Arial, sans-serif;'>
                        <div style='max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; box-shadow: 0 4px 6px rgba(0,0,0,0.05);'>

                            <div style='background: #0033a0 url(cid:header_bg) no-repeat center center; background-size: cover; color: #ffffff; padding: 25px 30px; text-align: center;'>
                                <img src='cid:nml_logo' style='max-width: 350px; margin-bottom: 5px;' alt='NML Logo'>
                                <h1 style='margin: 0 0 5px 0; font-size: 38px; color: #ffffff !important;'>DMP41 Calibration System</h1>
                                <p style='margin: 0; font-size: 16px; color: #e0e0e0; font-weight: bold;'>Account activation confirmation</p>
                            </div>

                            <div style='padding: 30px; color: #333333; font-size: 16px; line-height: 1.6;'>
                                <p style='margin-top: 0;'>Hello <b>$firstName</b>!</p>
                                <p>Your account has been successfully registered to the <b>DMP41 Calibration System</b>.</p>
                                <p>You may now log in and access your calibration records and system features.</p>

                                <div style='margin: 30px 0; border: 1px solid #dcdcdc; border-radius: 8px; background-color: #fafafa; overflow: hidden;'>
                                    <table style='width: 100%; border-collapse: collapse;'>
                                        <tr style='border-bottom: 1px solid #dcdcdc;'>
                                            <td style='padding: 15px; width: 40%; color: #666; font-size: 14px;'>Name</td>
                                            <td style='padding: 15px; color: #1a1a1a; font-weight: bold;'>$firstName $lastName</td>
                                        </tr>
                                        <tr style='border-bottom: 1px solid #dcdcdc;'>
                                            <td style='padding: 15px; color: #666; font-size: 14px;'>Registered email</td>
                                            <td style='padding: 15px; color: #0056b3; font-weight: bold;'><a href='mailto:$email' style='color: #0056b3; text-decoration: none;'>$email</a></td>
                                        </tr>
                                        <tr>
                                            <td style='padding: 15px; color: #666; font-size: 14px;'>Account status</td>
                                            <td style='padding: 15px; color: #1a1a1a; font-weight: bold;'>Active</td>
                                        </tr>
                                    </table>
                                </div>

                                <p style='color: #666; font-size: 14px;'>If you were not responsible for creating this account, please notify our support team immediately.</p>
                            </div>

                            <div style='background-color: #587d25; color: #ffffff; padding: 20px; text-align: center; font-size: 13px; font-style: italic;'>
                                <p style='margin: 0;'>Providing International Traceability to Measurements in the Philippines</p>
                                <p style='margin: 5px 0 0 0;'>This is an automated message. Please do not reply directly to this email.</p>
                            </div>

                        </div>
                    </div>
                    ";

                    $mail->send();
                    echo "Success";
                    exit();

                } catch (Exception $e) {
                    // Log the error for debugging, but still return "Success" to the UI
                    // because the user account was successfully created in the database.
                    error_log("Email could not be sent. Mailer Error: {$mail->ErrorInfo}");
                    echo "Success";
                    exit();
                }
            } else {
                // System is offline. Skip sending email but successfully register the user.
                echo "Success";
                exit();
            }
        }
        else{
            echo "Error: " . $conn->error;
            exit();
        }
    }
}

// sign in
if(isset($_POST['signIn'])){
    $email = $_POST['email'];
    $password = md5($_POST['password']);

    $sql = "SELECT * FROM users WHERE email='$email' AND password='$password'";
    $result = $conn->query($sql);
    
    if($result->num_rows > 0){
        session_start();
        $row = $result->fetch_assoc();
        $_SESSION['email'] = $row['email'];
        header("Location: homepage.php");
        exit();
    }
    else{
        header("Location: index.php?error=loginfailed");
        exit();
    }
}
?>