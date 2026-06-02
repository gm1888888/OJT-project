const axios = require('axios');

const authMiddleware = async (req, res, next) => {
    // Dynamically determine PHP Server URL to support network access
    // If process.env.PHP_AUTH_SERVER_URL is set (e.g. in .env), use it.
    // Otherwise, use the host from the request (e.g. 192.168.x.x)
    const requestHost = req.get('host').split(':')[0]; // Get hostname/IP without port
    const protocol = req.protocol;
    const currentPhpServerUrl = process.env.PHP_AUTH_SERVER_URL || `${protocol}://${requestHost}`;

    // 0. Skip authentication for health check endpoints
    if (req.originalUrl === '/api/hardware/status') {
        return next();
    }

    // 1. If the user already has a valid Node.js session, allow them in.
    if (req.session && req.session.userEmail) {
        return next();
    }

    // 2. If they don't have a session, check if they are arriving with a bridge token.
    const token = req.query.auth_token;

    if (token) {
        try {
            // 3. Make a backchannel call to PHP to verify the token
            const response = await axios.get(`${currentPhpServerUrl}/php-auth-system/verify_token.php?token=${token}`);
            
            if (response.data && response.data.valid) {
                // 4. Token is valid. Create a session for this user.
                req.session.userEmail = response.data.email;
                
                // 5. Redirect to the same path but without the token in the URL for cleanliness
                const cleanUrl = req.originalUrl.split('?')[0];
                return res.redirect(cleanUrl);
            }
        } catch (error) {
            console.error('Bridge token verification failed:', error.message);
            // Fall through to redirect
        }
    }

    // 6. If no session and no valid token, they are not authorized. 
    // Redirect them to the PHP login page.
    // If it's an API route (/api/*), return a 401 instead of a redirect.
    if (req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/calibration/')) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    // Redirect to PHP login
    return res.redirect(`${currentPhpServerUrl}/php-auth-system/index.php`);
};

module.exports = authMiddleware;