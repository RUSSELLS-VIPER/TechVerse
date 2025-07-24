const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    secure: false, // true for 465, false for 587
});

module.exports = async function sendEmail({ email, subject, message }) {
    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject,
        text: message,
    });
};