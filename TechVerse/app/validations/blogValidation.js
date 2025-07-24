const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Universal validation error handler
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg);
        const error = new Error(errorMessages.join(', '));
        error.status = 400;
        error.errors = errors.array();
        return next(error);
    }
    next();
};

module.exports = {
    validateBlog: () => [
        body('title')
            .trim()
            .notEmpty().withMessage('Title is required')
            .isLength({ max: 100 }).withMessage('Title cannot exceed 100 characters'),

        body('content')
            .trim()
            .notEmpty().withMessage('Content is required'),

        handleValidationErrors
    ],

    validateFeaturedImage: () => [
        (req, res, next) => {
            if (req.file) {
                const validTypes = ['image/jpeg', 'image/png'];
                if (!validTypes.includes(req.file.mimetype)) {
                    return next(new Error('Only JPEG and PNG images are allowed'));
                }
            }
            next();
        }
    ],

    validateBlogUpdate: () => [
        body('title')
            .optional()
            .trim()
            .isLength({ max: 100 }).withMessage('Title cannot exceed 100 characters'),

        handleValidationErrors
    ]
};