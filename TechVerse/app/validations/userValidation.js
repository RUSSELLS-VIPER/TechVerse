const { check } = require('express-validator');

exports.validateUserUpdate = [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
];