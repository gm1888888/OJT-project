<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DMP41 Calibration System - Register & Log In</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="style.css">
</head>
<body>

    <div class="container" id="signup" style="display:none;">
        
        <div class="system-header">
            <img src="nmledited.png" alt="NML Logo" class="system-logo">
            <h1 class="main-system-title">DMP41 Calibration System</h1>
        </div>

        <h2 class="form-subtitle">Sign Up</h2>

        <form method="post" action="register.php" id="signUpFormEl">
            <div class="input-group">
                <i class="fas fa-user"></i>
                <input type="text" name="fName" id="fName" placeholder="First Name" required>
                <label for="fName">First Name</label>
            </div>

            <div class="input-group">
                <i class="fas fa-user"></i>
                <input type="text" name="lName" id="lName" placeholder="Last Name" required>
                <label for="lName">Last Name</label>
            </div>

            <div class="input-group">
                <i class="fas fa-envelope"></i>
                <input type="email" name="email" id="email" placeholder="Email" required>
                <label for="email">Email</label>
            </div>

            <div class="input-group">
                <i class="fas fa-lock"></i>
                <input type="password" name="password" id="password" placeholder="Password" required>
                <label for="password">Password</label>
                <i class="fas fa-eye toggle-password" id="togglePassword"></i>
            </div>

            <div class="input-group">
                <i class="fas fa-lock"></i>
                <input type="password" name="confirmPassword" id="confirmPassword" placeholder="Confirm Password" required>
                <label for="confirmPassword">Confirm Password</label>
                <i class="fas fa-eye toggle-password" id="toggleConfirmPassword"></i>
            </div>

            <input type="hidden" name="signUp" value="1">
            <button type="submit" class="btn" id="signUpBtn" style="display: flex; justify-content: center; align-items: center; width: 100%; height: 50px; font-size: 16px;">Sign Up</button>
        </form>


        <div class="links">
            <p>Already Have an account?</p>
            <button id="signInButton">Log In</button>
        </div>
    </div>

    <div class="container" id="signIn">
        
        <div class="system-header">
            <img src="nmledited.png" alt="NML Logo" class="system-logo">
            <h1 class="main-system-title">DMP41 Calibration System</h1>
        </div>

        <h2 class="form-subtitle">Log In</h2>

        <form method="post" action="register.php" id="signInFormEl">
            <div class="input-group">
                <i class="fas fa-envelope"></i>
                <input type="email" name="email" id="signInEmail" placeholder="Email" required>
                <label for="signInEmail">Email</label>
            </div>

            <div class="input-group" style="margin-bottom: 5px;">
                <i class="fas fa-lock"></i>
                <input type="password" name="password" id="signInPassword" placeholder="Password" required>
                <label for="signInPassword">Password</label>
                <i class="fas fa-eye toggle-password" id="toggleSignInPassword"></i>
            </div>
            
            <p id="loginErrorMsg" style="color: #d93025; font-size: 13px; margin: 0 0 15px 0; text-align: left; font-weight: bold; display: none;">
                <i class="fas fa-exclamation-circle"></i> Incorrect email or password
            </p>

            <p class="recover">
                <a href="forgot_password.php">Recover Password</a>
            </p>
            
            <input type="hidden" name="signIn" value="1">
            <button type="submit" class="btn" id="signInBtn" style="display: flex; justify-content: center; align-items: center; width: 100%; height: 50px; font-size: 16px;">Log In</button>
        </form>


        <div class="links">
            <p>Don't have an account yet?</p>
            <button id="signUpButton">Sign Up</button>
        </div>
    </div>
    
    <script src="script.js"></script>

    <script>
        window.onload = function() {
            const urlParams = new URLSearchParams(window.location.search);
            
            if (urlParams.get('error') === 'loginfailed') {
                
                document.getElementById('signup').style.display = 'none';
                document.getElementById('signIn').style.display = 'block';
                
                const pwdInput = document.getElementById('signInPassword');
                const errorMsg = document.getElementById('loginErrorMsg');
                
                pwdInput.style.borderBottom = '2px solid #d93025';
                pwdInput.style.color = '#d93025';
                errorMsg.style.display = 'block';
                
                pwdInput.addEventListener('input', function() {
                    this.style.borderBottom = ''; // Resets the line color
                    this.style.color = '';        // Resets the text color to default
                    errorMsg.style.display = 'none'; // Hides the incorrect password text
                });
                
                window.history.replaceState(null, null, window.location.pathname);
            }
        };
    </script>
</body>
</html>