const { body } = require('express-validator');

exports.validateComment = [
    body('content')
        .trim()
        .notEmpty().withMessage('Comment content is required')
        .isLength({ max: 1000 }).withMessage('Comment cannot exceed 1000 characters')
];