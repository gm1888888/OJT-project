<?php
session_start();
session_unset(); 
header("Location: index.html");
header("Location: index.php");
exit(); 
?>