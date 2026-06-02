<?php
session_start();
include("connect.php");

if(!isset($_SESSION['email'])){
    header("Location: index.php");
    exit();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Homepage</title>
</head>
<body style="background-color: wheat; font-family: 'poppins', sans-serif;">
    <div style="text-align:center; padding:15%; background-color: white; width: 450px; margin: 50px auto; border-radius: 10px; box-shadow: 0 20px 35px black;">
        <p style="font-size:30px; font-weight:bold; color: green;">
        Hello,  
        <?php 
        if(isset($_SESSION['email'])){
            $email = $_SESSION['email'];
            $query = mysqli_query($conn, "SELECT users.* FROM users WHERE users.email='$email'");
            while($row = mysqli_fetch_array($query)){
                echo $row['firstName'] . ' ' . $row['lastName'];
            }
        }
        ?>!
        </p>
        <p>You have successfully logged in.</p>
        <br><br>
        <a href="bridge.php" style="background: #0033a0; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: block; margin-bottom: 20px;">Launch Calibration System</a>
        <a href="logout.php" style="background: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Logout</a>
    </div>
</body>
</html>