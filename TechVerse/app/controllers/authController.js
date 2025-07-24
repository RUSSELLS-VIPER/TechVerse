const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const sendEmail = require('../utils/emailSender');
const { generateOTP } = require('../utils/otpGenerator');
const { validationResult } = require('express-validator');


class AuthController {

    constructor() {
        this.register = this.register.bind(this);
        this.verifyOTP = this.verifyOTP.bind(this);
        this.login = this.login.bind(this);
        this.logout = this.logout.bind(this);
        this.getMe = this.getMe.bind(this);
        this.forgotPassword = this.forgotPassword.bind(this);
        this.resetPassword = this.resetPassword.bind(this);
        this.sendTokenResponse = this.sendTokenResponse.bind(this);
    };

    // Register new user and send OTP
    async register(req, res, next) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // return res.status(400).json({ errors: errors.array() });
            return res.status(400).render('auth/register', { errors: errors.array() });
        }
        const { name, email, password } = req.body;
        try {
            // Check if user exists
            let user = await User.findOne({ email });
            if (user) {
                return next(new ErrorResponse('User already exists', 400));
            }
            // Make sure image was uploaded
            if (!req.file) {
                return next(new ErrorResponse('Profile picture is required', 400));
            }
            const profilePicture = `/uploads/profile/${req.file.filename}`;
            // console.log('req.file:', req.file);

            // Create user
            user = await User.create({
                name,
                email,
                password,
                profilePicture,
            });
            // Generate OTP
            const otp = generateOTP();
            user.otp = otp;
            user.otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
            await user.save({ validateBeforeSave: false });
            // Send verification email
            const message = `TechVerse Account Verification
            Hello,
            Your verification code is:
            ${otp}
            This OTP will expire in 10 minutes. For your security, please do not share this code with anyone.
            If you didn't request this verification, please ignore this message or contact our support team immediately.
            Best regards,
            The TechVerse Team`;
            await sendEmail({
                email: user.email,
                subject: 'Email Verification OTP',
                message,
            });
            // res.status(201).json({
            //     success: true,
            //     data: 'OTP sent to email',
            // });
            res.render('auth/verifyOtp', { email: user.email });

        } catch (err) {
            next(err);
        }
    };


    // Verify OTP for account activation
    async verifyOTP(req, res, next) {
        let { email, otp } = req.body;
        email = email.toLowerCase().trim();
        otp = otp.toString().trim();

        try {
            const user = await User.findOne({
                email,
                otpExpire: { $gt: Date.now() },
            }).select('+otp');

            if (!user) {
                return next(new ErrorResponse('Invalid OTP or expired', 400));
            }

            if (user.otp?.toString().trim() !== otp) {
                return next(new ErrorResponse('Invalid OTP', 400));
            }

            user.isVerified = true;
            user.otp = undefined;
            user.otpExpire = undefined;
            await user.save();
            return res.redirect('/auth/login');

            // res.status(200).json({
            //     success: true,
            //     data: 'Email verified successfully',
            // });
        } catch (err) {
            next(err);
        }
    };


    // Login user
    async login(req, res, next) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            req.flash('error', errors.array()[0].msg);
            return res.redirect('/auth/login');
        }

        const { email, password } = req.body;

        try {
            const user = await User.findOne({ email }).select('+password');

            if (!user || !(await user.matchPassword(password))) {
                req.flash('error', 'Invalid credentials');
                return res.redirect('/auth/login');
            }


            // Retrieve the intended return URL from the session
            const redirectUrl = req.session.returnTo || '/'; // Default to homepage if no URL was stored
            delete req.session.returnTo; // Clean up the session variable after use

            // Call sendTokenResponse with the user, status, response, the calculated redirectUrl, and the request object
            this.sendTokenResponse(user, 200, res, redirectUrl, req);

        } catch (err) {
            console.error('Login error:', err);
            req.flash('error', 'Login failed. Please try again.');
            next(err);
        }
    };

    // Logout user
    logout = (req, res) => {
        res.clearCookie('token');
        res.redirect('/auth/login?logged_out=1');
    };



    // Get current logged-in user
    async getMe(req, res, next) {
        const user = await User.findById(req.user.id);
        res.status(200).json({
            success: true,
            data: user,
        });
    };


    // Forgot password - send OTP
    async forgotPassword(req, res, next) {
        const { email } = req.body;
        try {
            // Use aggregation to find user by email
            const userArr = await User.aggregate([
                { $match: { email: email } },
                { $limit: 1 }
            ]);
            if (userArr.length === 0) {
                return next(new ErrorResponse('No user with that email', 404));
            }
            // Get the user document
            const userDoc = await User.findById(userArr[0]._id);
            // Generate OTP
            const otp = generateOTP();
            userDoc.otp = otp;
            userDoc.otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
            await userDoc.save({ validateBeforeSave: false });
            // Send email
            const resetUrl = `${req.protocol}://${req.get('host')}/resetpassword/${otp}`;
            const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please use the following OTP to reset your password: ${otp}\n\nIf you did not request this, please ignore this email.`;
            await sendEmail({
                email: userDoc.email,
                subject: 'Password Reset OTP',
                message,
            });
            return res.redirect('/auth/resetpassword');
        } catch (err) {
            next(err);
        }
    };


    // Reset password using OTP
    async resetPassword(req, res, next) {
        const { otp, password } = req.body;
        try {

            const userArr = await User.aggregate([
                { $match: { otp: otp, otpExpire: { $gt: Date.now() } } },
                { $limit: 1 }
            ]);
            if (userArr.length === 0) {
                return next(new ErrorResponse('Invalid OTP or expired', 400));
            }
            // Get the user document
            const userDoc = await User.findById(userArr[0]._id);
            // Set new password
            userDoc.password = password;
            userDoc.otp = undefined;
            userDoc.otpExpire = undefined;
            await userDoc.save();
            this.sendTokenResponse(userDoc, 200, res);
            return res.redirect('/login');
        } catch (err) {
            next(err);
        }
    };


    // JWT Token Response
    sendTokenResponse(user, statusCode, res, redirectUrl = null, req = null) {
        const token = user.getSignedJwtToken();
        const options = {
            expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            path: '/',
        };

        const isApiRequest = req && req.get('Accept') === 'application/json';

        if (isApiRequest || !redirectUrl) {
            return res.status(statusCode)
                .cookie('token', token, options)
                .json({
                    success: true,
                    token,
                    user: {
                        id: user._id,
                        name: user.name,
                        email: user.email
                    }
                });
        }

        return res.status(statusCode)
            .cookie('token', token, options)
            .redirect(redirectUrl);
    };
};

module.exports = new AuthController();