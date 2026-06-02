const signUpButton = document.getElementById('signUpButton');
const signInButton = document.getElementById('signInButton');
const signInForm = document.getElementById('signIn');
const signUpForm = document.getElementById('signup');

signUpButton.addEventListener('click', function() {
    signInForm.style.display = "none";
    signUpForm.style.display = "block";
});

signInButton.addEventListener('click', function() {
    signInForm.style.display = "block";
    signUpForm.style.display = "none";
});

// register password toggle
const togglePassword = document.getElementById('togglePassword');
const password = document.getElementById('password');

togglePassword.addEventListener('click', function () {
    const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
    password.setAttribute('type', type);
    this.classList.toggle('fa-eye-slash');
});

// confirm password toggle
const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
const confirmPassword = document.getElementById('confirmPassword');

toggleConfirmPassword.addEventListener('click', function () {
    const type = confirmPassword.getAttribute('type') === 'password' ? 'text' : 'password';
    confirmPassword.setAttribute('type', type);
    this.classList.toggle('fa-eye-slash');
});

// sign in password toggle
const toggleSignInPassword = document.getElementById('toggleSignInPassword');
const signInPassword = document.getElementById('signInPassword');

toggleSignInPassword.addEventListener('click', function () {
    const type = signInPassword.getAttribute('type') === 'password' ? 'text' : 'password';
    signInPassword.setAttribute('type', type);
    this.classList.toggle('fa-eye-slash');
});

// NEW: NO-REFRESH REGISTRATION SUBMISSION
const registerForm = document.querySelector('#signUpFormEl');
const signInFormEl = document.querySelector('#signInFormEl');

function setButtonLoading(btn, isLoading, originalText) {
    if (isLoading) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size: 24px;"></i>';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.7';
    } else {
        btn.innerHTML = originalText;
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
    }
}

if (registerForm) {
    registerForm.addEventListener('submit', function(e) {
        e.preventDefault(); 
        
        const btn = document.getElementById('signUpBtn');
        const originalText = btn.innerHTML;
        setButtonLoading(btn, true, originalText);

        const formData = new FormData(this);
        const data = Object.fromEntries(formData.entries());

        fetch('/api/auth/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            setButtonLoading(btn, false, originalText);
            
            if(result.status === "success") {
                alert("Registration Complete! Please log in.");
                signInForm.style.display = "block";
                signUpForm.style.display = "none";
                registerForm.reset(); 
            } else {
                alert(result.error || "Registration failed"); 
            }
        })
        .catch(error => {
            setButtonLoading(btn, false, originalText);
            alert("Network error. Please try again.");
            console.error('Error:', error);
        });
    });
}

if (signInFormEl) {
    signInFormEl.addEventListener('submit', function(e) {
        e.preventDefault();

        const btn = document.getElementById('signInBtn');
        const originalText = btn.innerHTML;
        setButtonLoading(btn, true, originalText);

        const formData = new FormData(this);
        const data = Object.fromEntries(formData.entries());

        fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            if (result.status === "success") {
                window.location.href = '/'; 
            } else {
                setButtonLoading(btn, false, originalText);
                
                const pwdInput = document.getElementById('signInPassword');
                const errorMsg = document.getElementById('loginErrorMsg');
                
                pwdInput.style.borderBottom = '2px solid #d93025';
                pwdInput.style.color = '#d93025';
                errorMsg.style.display = 'block';
                
                pwdInput.addEventListener('input', function() {
                    this.style.borderBottom = '';
                    this.style.color = '';
                    errorMsg.style.display = 'none';
                });
            }
        })
        .catch(error => {
            setButtonLoading(btn, false, originalText);
            alert("Network error. Please try again.");
            console.error('Error:', error);
        });
    });
}