const User = require('../models/User');
const Blog = require('../models/Blog');
const Comment = require('../models/Comment');
const ErrorResponse = require('../utils/errorResponse');
const mongoose = require('mongoose');
const path = require('path')
const fs = require('fs')


class AdminController {

    // get all users
    async getUsers(req, res, next) {
        try {
            const users = await User.find().select('-password');
            res.status(200).json({
                success: true,
                count: users.length,
                data: users,
            });
        } catch (err) {
            next(err);

        };
    };

    // dashboard stats using aggregation
    getDashboardStats = async (req, res, next) => {
        try {
            const [
                usersCount,
                blogsCount,
                commentsCount,
                latestBlogs,
                pendingBlogs,
                totalViewsAgg,
                blogs
            ] = await Promise.all([
                User.countDocuments(),
                Blog.countDocuments(),
                Comment.countDocuments(),

                // Latest blogs with author and comment count
                Blog.aggregate([
                    { $sort: { createdAt: -1 } },
                    { $limit: 10 },
                    {
                        $lookup: {
                            from: "users",
                            localField: "author",
                            foreignField: "_id",
                            as: "author"
                        }
                    },
                    { $unwind: "$author" },
                    {
                        $lookup: {
                            from: "comments",
                            localField: "_id",
                            foreignField: "blog",
                            as: "comments"
                        }
                    },
                    {
                        $project: {
                            title: 1,
                            createdAt: 1,
                            status: 1,
                            views: 1,
                            likes: 1,
                            author: { _id: "$author._id", name: "$author.name" },
                            replies: "$comments",
                            commentsCount: { $size: "$comments" }
                        }
                    }
                ]),

                // Pending blogs
                Blog.aggregate([
                    { $match: { status: 'pending' } },
                    { $sort: { createdAt: -1 } },
                    {
                        $lookup: {
                            from: "users",
                            localField: "author",
                            foreignField: "_id",
                            as: "author"
                        }
                    },
                    { $unwind: "$author" },
                    {
                        $project: {
                            title: 1,
                            createdAt: 1,
                            status: 1,
                            author: { _id: "$author._id", name: "$author.name" }
                        }
                    }
                ]),

                // Total views
                Blog.aggregate([
                    {
                        $group: {
                            _id: null,
                            total: { $sum: "$views" }
                        }
                    }
                ]),

                // ✅ All blogs with author
                Blog.find().populate("author", "name").lean()
            ]);

            const viewsCount = totalViewsAgg[0]?.total || 0;

            res.render('admin/dashboard', {
                usersCount,
                blogsCount,
                commentsCount,
                latestBlogs,
                pendingBlogs,
                viewsCount,
                blogs
            });
        } catch (err) {
            next(err);
        }
    };



    getAllUsers = async (req, res, next) => {
        try {
            const users = await User.find().select('name email role createdAt').lean();
            res.render('admin/users', { users });
        } catch (err) {
            next(err);
        }
    };


    getAllBlogs = async (req, res, next) => {
        try {
            const blogs = await Blog.find().sort({ createdAt: -1 }).lean();
            // res.render('admin/blogPreview', { blogs });
        } catch (err) {
            next(err);
        }
    };

    getBlogPreview = async (req, res, next) => {
        try {
            const { slugOrId } = req.params;

            const isValidObjectId = mongoose.Types.ObjectId.isValid(slugOrId);
            const matchStage = isValidObjectId
                ? { $match: { _id: new mongoose.Types.ObjectId(slugOrId) } }
                : { $match: { slug: slugOrId } };

            const blogData = await Blog.aggregate([
                matchStage,
                {
                    $lookup: {
                        from: 'users',
                        localField: 'author',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'categories',
                        foreignField: '_id',
                        as: 'categories'
                    }
                },
                {
                    $project: {
                        _id: 1,
                        title: 1,
                        slug: 1,
                        content: 1,
                        status: 1,
                        createdAt: 1,
                        featuredImage: 1,
                        views: 1,
                        likes: 1,
                        comments: 1,
                        author: {
                            _id: '$author._id',
                            name: '$author.name'
                        },
                        categories: {
                            $map: {
                                input: '$categories',
                                as: 'cat',
                                in: {
                                    _id: '$$cat._id',
                                    name: '$$cat.name',
                                    slug: '$$cat.slug'
                                }
                            }
                        }
                    }
                }
            ]);

            const blog = blogData[0];
            if (!blog) return next(new ErrorResponse('Blog not found', 404));

            res.render('admin/blogPreview', { blog });

        } catch (err) {
            next(err);
        }
    };

    async deleteUser(req, res, next) {
        try {
            const user = await User.findById(req.params.id);
            if (!user) {
                return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
            }

            // Delete user's blogs
            await Blog.deleteMany({ author: user._id });

            // Delete user's comments
            await Comment.deleteMany({ author: user._id });

            // Delete user
            await user.deleteOne();

            // Fetch updated user list
            const users = await User.find().sort({ createdAt: -1 }).lean();

            // Render updated users.ejs
            res.render('admin/users', { users });

        } catch (err) {
            next(err);
        }
    }
    
    async updateUserRole(req, res, next) {
        try {
            const { role } = req.body;

            // Validate role
            if (!['admin', 'user'].includes(role)) {
                return next(new ErrorResponse('Invalid role provided', 400));
            }

            const user = await User.findById(req.params.id);
            if (!user) {
                return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
            }

            // Prevent admin from demoting themselves
            if (req.user.id === user.id && role === 'user') {
                return next(new ErrorResponse("You can't demote yourself", 400));
            }

            user.role = role;
            await user.save();

            // Redirect back to user list (for web UI use)
            req.flash('success_msg', `User role updated to ${role}`);
            res.redirect('/admin/users');

            // If you're using API mode instead:
            // res.status(200).json({ success: true, data: user });

        } catch (err) {
            next(err);
        }
    }


    // delete a specific comment
    async deleteComment(req, res, next) {
        try {
            const comment = await Comment.findById(req.params.id);
            if (!comment) {
                return next(new ErrorResponse(`Comment not found with id of ${req.params.id}`, 404));
            }

            await comment.remove();
            res.status(200).json({ success: true, message: 'Comment deleted successfully' });
        } catch (err) {
            next(err);
        }
    };

    // update a user's blog
    async updateBlog(req, res, next) {
        try {
            const blog = await Blog.findById(req.params.id);
            if (!blog) {
                return next(new ErrorResponse(`Blog not found with id of ${req.params.id}`, 404));
            }

            const { title, content } = req.body;
            blog.title = title || blog.title;
            blog.content = content || blog.content;

            await blog.save();

            res.status(200).json({ success: true, data: blog });
        } catch (err) {
            next(err);
        }
    };

    // delete a specific blog post
    async deleteBlog(req, res, next) {
        try {
            const blog = await Blog.findById(req.params.id);
            if (!blog) {
                return next(new ErrorResponse(`Blog not found with id of ${req.params.id}`, 404));
            }

            if (blog.featuredImage) {
                const imagePath = path.join(__dirname, '..', 'public', blog.featuredImage.replace(/^\/+/, ''));
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                    // console.log('✅ Deleted image:', imagePath);
                } else {
                    // console.warn('⚠️ Image not found:', imagePath);
                }
            }

            await Blog.findByIdAndDelete(blog._id);
            await Comment.deleteMany({ blog: blog._id });

            req.flash('success_msg', 'Blog and its comments deleted successfully.');
            res.redirect('/admin/dashboard');

        } catch (err) {
            next(err);
        }
    }

    // get a single user with their blog and comment count
    async getUserDetails(req, res, next) {
        try {
            const user = await User.findById(req.params.id).select('-password');
            if (!user) {
                return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
            }

            const blogs = await Blog.find({ author: user._id })
                .select('_id slug title createdAt') 
                .sort({ createdAt: -1 })
                .lean();

            const comments = await Comment.find({ author: user._id });

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
    };

    async getBlogsPerUser(req, res, next) {
        try {
            const blogsPerUser = await Blog.aggregate([
                {
                    $group: {
                        _id: '$author',
                        totalBlogs: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'authorInfo'
                    }
                },
                {
                    $unwind: '$authorInfo'
                },
                {
                    $project: {
                        _id: 0,
                        authorId: '$authorInfo._id',
                        name: '$authorInfo.name',
                        email: '$authorInfo.email',
                        totalBlogs: 1
                    }
                },
                { $sort: { totalBlogs: -1 } }
            ]);

            res.status(200).json({
                success: true,
                data: blogsPerUser
            });
        } catch (err) {
            next(err);
        }
    };

    async getCommentsPerBlog(req, res, next) {
        try {
            const commentsPerBlog = await Comment.aggregate([
                {
                    $group: {
                        _id: '$blog',
                        totalComments: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: 'blogs',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'blogInfo'
                    }
                },
                {
                    $unwind: '$blogInfo'
                },
                {
                    $project: {
                        _id: 0,
                        blogId: '$blogInfo._id',
                        title: '$blogInfo.title',
                        totalComments: 1
                    }
                },
                { $sort: { totalComments: -1 } }
            ]);

            res.status(200).json({
                success: true,
                data: commentsPerBlog
            });
        } catch (err) {
            next(err);
        }
    };

    async getCommentsPerUser(req, res, next) {
        try {
            const commentsPerUser = await Comment.aggregate([
                {
                    $group: {
                        _id: '$author',
                        totalComments: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'userInfo'
                    }
                },
                {
                    $unwind: '$userInfo'
                },
                {
                    $project: {
                        _id: 0,
                        userId: '$userInfo._id',
                        name: '$userInfo.name',
                        email: '$userInfo.email',
                        totalComments: 1
                    }
                },
                { $sort: { totalComments: -1 } }
            ]);

            res.status(200).json({
                success: true,
                data: commentsPerUser
            });
        } catch (err) {
            next(err);
        }
    };

    async getBlogTrends(req, res, next) {
        try {
            const trends = await Blog.aggregate([
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                        },
                        totalBlogs: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]);

            res.status(200).json({
                success: true,
                data: trends
            });
        } catch (err) {
            next(err);
        }
    };

    async moderateBlog(req, res, next) {
        try {
            const blog = await Blog.findById(req.params.id);
            if (!blog) return next(new ErrorResponse("Blog not found", 404));

            blog.status = req.body.status; // 'approved' or 'rejected'
            await blog.save();

            req.flash('success_msg', `Blog ${blog.status === 'published' ? 'approved and published' : blog.status}.`);
            res.redirect('/admin/dashboard');
        } catch (err) {
            next(err);
        }
    }

    approveBlog = async (req, res, next) => {
        try {
            const blog = await Blog.findById(req.params.id);
            if (!blog) return next(new ErrorResponse('Blog not found', 404));
            // console.log('approveBlog called from:', req.headers.accept);


            blog.status = 'published';
            await blog.save();

            req.flash('success_msg', 'Blog approved and published.');
            res.redirect('/admin/dashboard');
        } catch (err) {
            next(err);
        }
    };


};

module.exports = new AdminController()