const authMiddleware = (req, res, next) => {
    // 0. Skip authentication for health check or auth endpoints
    const publicPaths = [
        '/auth',
        '/api/hardware/status',
        '/api/auth/login',
        '/api/auth/signup',
        '/auth/index.html',
        '/auth/style.css',
        '/auth/script.js',
        '/auth/nmledited.png',
        '/auth/headerbg.jpg'
    ];

    if (publicPaths.some(path => req.path.includes(path))) {
        return next();
    }

    // 1. If the user already has a valid session, allow them in.
    if (req.session && req.session.user) {
        return next();
    }

    // 2. If no session, they are not authorized. 
    // If it's an API route (/api/*), return a 401.
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    // 3. For everything else (pages), redirect to the login page
    return res.redirect('/auth');
};

module.exports = authMiddleware;