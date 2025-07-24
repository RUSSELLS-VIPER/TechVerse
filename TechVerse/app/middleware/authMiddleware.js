const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');

class AuthMiddleware {

    protect = async (req, res, next) => {
        let token;

        // Check session user first (this fixes your issue)
        if (req.session && req.session.user) {
            req.user = req.session.user;
            return next();
        }

        // Then try JWT token
        if (req.headers.authorization?.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies?.token) {
            token = req.cookies.token;
        } else if (req.query?.token) {
            token = req.query.token;
        }

        if (!token) {
            console.error('No token found in request');

            const isAjax = req.xhr || req.headers.accept?.includes('application/json');

            if (isAjax) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required to perform this action.'
                });
            } else {
                req.flash('error', 'Please log in to access this resource.');
                req.session.returnTo = req.originalUrl;
                return res.redirect('/auth/login');
            }
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id);
            if (!user) {
                return next(new ErrorResponse('User not found with this token', 401));
            }

            req.user = user;
            next();
        } catch (err) {
            console.error('Token verification error:', err);
            if (req.accepts('html')) {
                req.flash('error', 'Session expired or invalid. Please log in again.');
                req.session.returnTo = req.originalUrl;
                return res.redirect('/auth/login');
            }
            return next(new ErrorResponse('Not authorized - token failed', 401));
        }
    };
    

    authorize = (roles = []) => {
        return (req, res, next) => {
            if (!req.user || !req.user.role) {
                return next(new ErrorResponse('Not authorized: User role information is missing.', 403));
            }
            if (roles.length > 0 && !roles.includes(req.user.role)) {
                return next(new ErrorResponse(`User role '${req.user.role}' is not authorized to access this route.`, 403));
            }
            next();
        };
    };

    checkOwnership = (model) => {
        return async (req, res, next) => {
            const resourceParam = req.params.blogSlug || req.params.slug || req.params.id || req.params.slugOrId;

            let resource = await model.findOne({ slug: resourceParam });

            if (!resource && mongoose.Types.ObjectId.isValid(resourceParam)) {
                resource = await model.findById(resourceParam);
            }


            // let resource;

            try {
                resource = await model.findOne({
                    $or: [
                        { slug: resourceParam },
                        { _id: mongoose.Types.ObjectId.isValid(resourceParam) ? resourceParam : null }
                    ]
                });


                if (!resource) {
                    return next(new ErrorResponse(`Resource not found with id or slug: ${resourceParam}`, 404));
                }

                // Authorization check
                if (
                    resource.author &&
                    resource.author.toString() !== req.user.id &&
                    req.user.role !== 'admin'
                ) {
                    return next(new ErrorResponse(`User ${req.user.id} is not authorized to modify this resource`, 403));
                }

                req.resource = resource;
                next();
            } catch (err) {
                console.error('Error in checkOwnership:', err);
                return next(new ErrorResponse('Server error during ownership check', 500));
            }
        };
    };
}

module.exports = new AuthMiddleware();
