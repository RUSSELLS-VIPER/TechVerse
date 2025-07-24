const { body, check, validationResult } = require('express-validator');

class AuthValidator {
    static handleValidationErrors(req, res, next) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const errorMessages = errors.array().map(err => err.msg);
            const error = new Error(errorMessages.join(', '));
            error.status = 400;
            error.errors = errors.array();

            // Check if the request expects an HTML response
            if (req.accepts('html')) {
                let renderPage = 'error'; 
                if (req.path === '/register') {
                    renderPage = 'auth/register';
                } else if (req.path === '/login') {
                    renderPage = 'auth/login';
                }
                // Render the page with errors and original form data
                return res.status(400).render(renderPage, {
                    errors: errors.array(),
                    formData: req.body
                });
            }
            // If not HTML, send a JSON response
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        next();
    }

    validateRegister() {
        return [
            
            body('name', 'Name is required').notEmpty().trim(),
            
            body('email', 'Please include a valid email').isEmail().normalizeEmail(),
            
            body(
                'password',
                'Please enter a password with 6 or more characters'
            ).isLength({ min: 6 }),
           
            AuthValidator.handleValidationErrors
        ];
    }
    validateLogin() {
        return [
            
            body('email', 'Please include a valid email').isEmail().normalizeEmail(),
          
            body('password', 'Password is required').exists(),
           
            AuthValidator.handleValidationErrors
        ];
    }
}

module.exports = new AuthValidator();
