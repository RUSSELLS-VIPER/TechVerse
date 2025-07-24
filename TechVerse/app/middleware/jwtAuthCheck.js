const jwt = require('jsonwebtoken');
const User = require('../models/User'); 

const jwtAuthCheck = async (req, res, next) => {
    let token;

    // 1. Check for token in cookies (most common for web apps)
    if (req.cookies?.token) {
        token = req.cookies.token;
    }
    // 2. Fallback to Authorization header (for APIs, less common for web)
    else if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // 3. Fallback to query params (less secure, but sometimes used)
    else if (req.query?.token) {
        token = req.query.token;
    }

    if (!token) {
        return next();
    }

    try {
        // Verify the token using your JWT secret
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Find the user by the ID stored in the token
        req.user = await User.findById(decoded.id);

        // If user is not found (e.g., deleted account), clear token and proceed as guest
        if (!req.user) {
            res.clearCookie('token');
        }

        // Proceed to the next middleware/route handler
        next();
    } catch (error) {
        console.error('JWT authentication error:', error.message);
        res.clearCookie('token');
        next();
    }
};

module.exports = jwtAuthCheck;