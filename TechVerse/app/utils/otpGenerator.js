const crypto = require('crypto');

// Generate random OTP
exports.generateOTP = () => {
    // Generate a 6-digit random number
    const otp = crypto.randomInt(100000, 999999).toString();
    return otp;
};

// Generate and hash OTP token
exports.getResetPasswordToken = () => {
    // Generate token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    const resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Set expire (10 minutes)
    const resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    return { resetToken, resetPasswordToken, resetPasswordExpire };
};