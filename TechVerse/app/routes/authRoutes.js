const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const AuthMiddleware = require('../middleware/authMiddleware');
const AuthValidator = require('../validations/authValidation');
const uploadMiddleware = require('../middleware/uploadMiddleware');


const registerValidationChain = AuthValidator.validateRegister();
const loginValidationChain = AuthValidator.validateLogin();

// console.log('AuthValidator.validateRegister() is array:', Array.isArray(registerValidationChain));
if (Array.isArray(registerValidationChain)) {
    registerValidationChain.forEach((handler, index) => {
        // console.log(`  validateRegister() handler ${index} type:`, typeof handler);
    });
}

// console.log('AuthValidator.validateLogin() is array:', Array.isArray(loginValidationChain));
if (Array.isArray(loginValidationChain)) {
    loginValidationChain.forEach((handler, index) => {
        // console.log(`  validateLogin() handler ${index} type:`, typeof handler);
    });
}



// POST Routes (API actions)
router.post('/register',uploadMiddleware.uploadProfileImage,...registerValidationChain, AuthController.register);
router.post('/verify-otp', AuthController.verifyOTP);
router.post('/login', ...loginValidationChain, AuthController.login);
router.get('/logout', AuthController.logout);
router.get('/me', AuthMiddleware.protect, AuthController.getMe);
router.post('/forgotpassword', AuthController.forgotPassword);
router.post('/resetpassword', AuthController.resetPassword);

// GET Routes (render pages)
router.get('/register', (req, res) => {
    res.render('auth/register', { errors: [], formData: {} });
});

router.get('/login', (req, res) => {
    // If csurf middleware is active, req.csrfToken() will be available
    // const csrfToken = req.csrfToken ? req.csrfToken() : ''; // Get the CSRF token

    res.render('auth/login', {
        errors: req.flash('error') || [],
        formData: {},
        // csrfToken: csrfToken // Pass the token to the template
    });
});

router.get('/verify-otp', (req, res) => {
    res.render('auth/verifyOtp', { email: req.query.email });
});

router.get('/forgotpassword', (req, res) => {
    res.render('auth/forgot-password');
});

router.get('/resetpassword', (req, res) => {
    res.render('auth/reset-password', { otp: req.query.otp });
});

module.exports = router;
