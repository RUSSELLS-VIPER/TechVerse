const User = require('../models/User');
const Blog = require('../models/Blog');
const Comment = require('../models/Comment');
const ErrorResponse = require('../utils/errorResponse');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');

class UserController {

    async getUser(req, res, next) {
        try {
            const user = await User.findById(req.params.id).select('-password');
            if (!user) {
                return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
            }

            const blogs = await Blog.find({ author: user._id, status: 'published' })
                .select('_id slug title createdAt')
                .sort({ createdAt: -1 })
                .lean();

            const comments = await Comment.find({ author: user._id }).lean();

            res.render('admin/userProfile', {
                profileUser: user,
                user: req.user,
                blogs,
                comments,
                totalBlogs: blogs.length,
                totalComments: comments.length
            });

        } catch (err) {
            next(err);
        }
    }
    

    async updateUser(req, res, next) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            let user = await User.findById(req.params.id);
            if (!user) {
                return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
            }

            // Ensure user is updating their own profile or is admin
            if (user._id.toString() !== req.user.id && req.user.role !== 'admin') {
                return next(
                    new ErrorResponse(`User ${req.user.id} is not authorized to update this profile`, 401)
                );
            }

            // Update fields
            user.name = req.body.name || user.name;
            user.email = req.body.email || user.email;

            // Handle profile picture upload
            if (req.file) {
                if (user.profilePicture && user.profilePicture !== 'default.jpg') {
                    const imagePath = path.join(__dirname, '../public/uploads/profile', user.profilePicture);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                }
                user.profilePicture = req.file.filename;
            }

            // Optional password change
            if (req.body.password && req.body.confirmPassword) {
                if (req.body.password !== req.body.confirmPassword) {
                    return next(new ErrorResponse('Passwords do not match', 400));
                }
                user.password = req.body.password; 
            }

            await user.save(); 

            req.flash('success_msg', 'Profile updated successfully.');
            res.redirect(`/users/${user._id}/dashboard`); 

        } catch (err) {
            next(err);
        }
      }

    async getDashboard(req, res, next) {
        try {
            if (req.params.id !== req.user.id) {
                return next(new ErrorResponse('Unauthorized dashboard access', 401));
            }

            const blogs = await Blog.aggregate([
                { $match: { author: req.user._id } },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'categories',
                        foreignField: '_id',
                        as: 'categoryInfo'
                    }
                },
                { $sort: { createdAt: -1 } },
                {
                    $project: {
                        title: 1,
                        status: 1,
                        createdAt: 1,
                        featuredImage: 1,
                        categories: '$categoryInfo'
                    }
                }
            ]);

            const comments = await Comment.aggregate([
                { $match: { author: req.user._id } },
                {
                    $lookup: {
                        from: 'blogs',
                        localField: 'blog',
                        foreignField: '_id',
                        as: 'blogInfo'
                    }
                },
                { $unwind: '$blogInfo' },
                { $sort: { createdAt: -1 } },
                {
                    $project: {
                        content: 1,
                        createdAt: 1,
                        blogTitle: '$blogInfo.title'
                    }
                }
            ]);

            res.render('users/dashboard', {
                user: req.user,
                blogs,
                comments
            });
        } catch (err) {
            next(err);
        }
    }

    async renderProfile(req, res, next) {
        try {
            const user = await User.findById(req.user._id).lean();
            const blogs = await Blog.find({ author: req.user._id }).sort({ createdAt: -1 }).lean();
            res.render('users/dashboard', {
                user,
                blogs
            });
        } catch (err) {
            next(err);
        }
    }

    async getPublicUsers(req, res, next) {
        try {
            const users = await User.find().select('name email profilePicture role');
            res.status(200).json({ success: true, data: users });
        } catch (err) {
            next(err);
        }
    }

    async deactivateUser(req, res, next) {
        try {
            const user = await User.findByIdAndUpdate(
                req.params.id,
                { isActive: false },
                { new: true }
            );
            if (!user) {
                return next(new ErrorResponse('User not found', 404));
            }
            res.status(200).json({ success: true, data: user });
        } catch (err) {
            next(err);
        }
    }

    async renderEditProfile(req, res, next) {
        try {
            const userId = req.params.id || req.user._id; 

            const user = await User.findById(userId);
            if (!user) return next(new ErrorResponse('User not found', 404));

            // Only allow access if admin or the user themselves
            if (req.user.role !== 'admin' && user._id.toString() !== req.user.id) {
                return next(new ErrorResponse('Not authorized to edit this profile', 403));
            }

            res.render('users/edit', { user });
        } catch (err) {
            next(err);
        }
    }
    
      
    async getBlogStatsByCategory(req, res, next) {
        try {
            const stats = await Blog.aggregate([
                { $match: { author: req.user._id } },
                { $unwind: '$categories' },
                {
                    $group: {
                        _id: '$categories',
                        count: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: 'categories',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'categoryInfo'
                    }
                },
                { $unwind: '$categoryInfo' },
                {
                    $project: {
                        category: '$categoryInfo.name',
                        count: 1
                    }
                }
            ]);
            res.status(200).json({ success: true, data: stats });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new UserController();