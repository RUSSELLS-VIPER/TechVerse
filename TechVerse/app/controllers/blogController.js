const Blog = require('../models/Blog')
const Category = require('../models/Category')
const Comment = require('../models/Comment')
const User = require('../models/User')
const ErrorResponse = require('../utils/errorResponse')
const { validationResult } = require('express-validator')
const path = require('path')
const fs = require('fs')
const marked = require('marked')
const mongoose = require('mongoose')
const sanitizeHtml = require('sanitize-html')

class BlogController {

    async processCategories(categories) {
        if (!categories || !Array.isArray(categories)) return [];

        return await Promise.all(categories.map(async item => {

            if (mongoose.Types.ObjectId.isValid(item) &&
                (new mongoose.Types.ObjectId(item)).toString() === item) {
                return item;
            }

         
            let category = await Category.findOne({ name: item.toLowerCase().trim() });
            if (!category) {
                const name = item.toLowerCase().trim();
                category = await Category.create({
                    name,
                    slug: name.replace(/\s+/g, '-').replace(/[^\w-]/g, '')
                });
            }
            return category._id;
        }));
    }

    renderCreateBlog = async (req, res) => {

        
        try {
            const categories = await Category.find().sort({ name: 1 });

            res.render('blog/create', {
                title: 'Create New Blog',
                categories,
                blog: null,
                formData: req.body || {},
                messages: req.flash('error') 
                
            });
            

        } catch (err) {
            console.error('Error rendering create blog form:', err);
            req.flash('error', 'Could not load blog creation form.');
            res.redirect('/blogs');
        }
    };
    

    getBlogs = async (req, res, next) => {
        try {
            const reqQuery = { ...req.query };
            const removeFields = ['select', 'sort', 'page', 'limit', 'search'];
            removeFields.forEach(param => delete reqQuery[param]);

            // Handle categories filter
            if (reqQuery.categories) {
                reqQuery.categories = {
                    $in: await this.processCategories(
                        Array.isArray(reqQuery.categories)
                            ? reqQuery.categories
                            : [reqQuery.categories]
                    )
                };
            }

            // Build match stage
            let matchStage = {};
            Object.keys(reqQuery).forEach(key => {
                matchStage[key] = reqQuery[key];
            });

            // Search filter
            if (req.query.search) {
                matchStage.$or = [
                    { title: { $regex: req.query.search, $options: 'i' } },
                    { content: { $regex: req.query.search, $options: 'i' } }
                ];
            }

            // Select fields
            let projectStage = {};
            if (req.query.select) {
                req.query.select.split(',').forEach(field => {
                    projectStage[field.trim()] = 1;
                });
            }

            // Sorting
            let sortStage = {};
            if (req.query.sort) {
                req.query.sort.split(',').forEach(field => {
                    const trimmed = field.trim();
                    if (trimmed.startsWith('-')) {
                        sortStage[trimmed.substring(1)] = -1;
                    } else {
                        sortStage[trimmed] = 1;
                    }
                });
            } else {
                sortStage = { createdAt: -1 };
            }

            // Pagination
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 10;
            const skip = (page - 1) * limit;

            // Aggregation pipeline
            const pipeline = [
                { $match: matchStage },
                { $sort: sortStage },
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
            ];

            if (Object.keys(projectStage).length > 0) {
                projectStage.author = { _id: 1, name: 1, profilePicture: 1 };
                projectStage.categories = { _id: 1, name: 1 };
                pipeline.push({ $project: projectStage });
            }

            // Facet for pagination and total count
            pipeline.push({
                $facet: {
                    blogs: [
                        { $skip: skip },
                        { $limit: limit }
                    ],
                    totalCount: [
                        { $count: 'count' }
                    ]
                }
            });

            const result = await Blog.aggregate(pipeline);
            const blogs = result[0].blogs;
            const total = result[0].totalCount[0]?.count || 0;

            const endIndex = page * limit;
            const pagination = {};
            if (endIndex < total) {
                pagination.next = { page: page + 1, limit };
            }
            if (skip > 0) {
                pagination.prev = { page: page - 1, limit };
            }

            res.status(200).json({
                success: true,
                count: blogs.length,
                pagination,
                data: blogs
            });
        } catch (err) {
            next(err);
        }
    }

     

    singleBlog = async (req, res, next) => {
        try {
            const { slugOrId } = req.params;
            const isValidObjectId = mongoose.Types.ObjectId.isValid(slugOrId);

            // ✅ Increment views
            if (isValidObjectId) {
                await Blog.updateOne(
                    { _id: new mongoose.Types.ObjectId(slugOrId) },
                    { $inc: { views: 1 } }
                );
            } else {
                await Blog.updateOne(
                    { slug: slugOrId },
                    { $inc: { views: 1 } }
                );
            }

            // ✅ Continue with aggregation
            const matchStage = isValidObjectId
                ? { $match: { _id: new mongoose.Types.ObjectId(slugOrId) } }
                : { $match: { slug: slugOrId } };

            const blogAggregation = await Blog.aggregate([
                matchStage,
                {
                    $lookup: {
                        from: 'users',
                        localField: 'author',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                { $unwind: '$author' },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'categories',
                        foreignField: '_id',
                        as: 'categories'
                    }
                },
                {
                    $lookup: {
                        from: 'comments',
                        localField: '_id',
                        foreignField: 'blog',
                        as: 'comments'
                    }
                },
                {
                    $addFields: {
                        commentsCount: { $size: '$comments' }
                    }
                },
                {
                    $project: {
                        title: 1,
                        content: 1,
                        slug: 1,
                        excerpt: 1,
                        featuredImage: 1,
                        createdAt: 1,
                        views: 1,
                        readingTime: 1,
                        tags: 1,
                        categories: { _id: 1, name: 1 },
                        author: { _id: 1, name: 1, profilePicture: 1 },
                        comments: 1,
                        commentsCount: 1,
                        likes: 1
                    }
                }
            ]);

            const blog = blogAggregation[0];
            if (!blog) return next(new ErrorResponse('Blog not found', 404));

            // ✅ Check if the current user has liked the blog
            const userId = req.user?._id?.toString();
            const isLiked = userId && blog.likes?.some(id => id.toString() === userId);

            // ✅ Fetch related blogs
            const relatedBlogs = await Blog.find({
                _id: { $ne: blog._id },
                categories: { $in: blog.categories.map(cat => cat._id) },
                status: 'published'
            })
                .sort({ createdAt: -1 })
                .limit(3)
                .select('title slug excerpt featuredImage')
                .lean();

            const allComments = blog.comments;

            // Step 1: Separate comments and replies
            const topLevelComments = [];
            const commentMap = {};

            allComments.forEach(comment => {
                comment.replies = []; // Initialize replies array
                commentMap[comment._id.toString()] = comment;

                if (!comment.parentComment) {
                    topLevelComments.push(comment);
                }
            });

            // Step 2: Attach replies to their parent
            allComments.forEach(comment => {
                if (comment.parentComment) {
                    const parent = commentMap[comment.parentComment.toString()];
                    if (parent) {
                        parent.replies.push(comment);
                    }
                }
            });
                
            
            // ✅ Render page
            res.render('blog/single', {
                blog,
                isLiked,
                relatedBlogs,
                comments: topLevelComments,
                user: req.user
            });

        } catch (err) {
            next(err);
        }
    };
    
    
    createBlog = async (req, res, next) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                req.flash('error', errors.array());
                // Prepare categories for form repopulation
                req.body.categories = [
                    ...(req.body.existingCategories ?
                        (Array.isArray(req.body.existingCategories) ?
                            req.body.existingCategories :
                            [req.body.existingCategories]) :
                        []),
                    ...(req.body.newCategories ? req.body.newCategories.split(',').map(c => c.trim()) : [])
                ];
                return this.renderCreateBlog(req, res);
            }

            const { title, excerpt, content, newCategories, existingCategories, tags } = req.body;
            const status = 'pending'; 

            const author = req.user._id;

            // Process categories - handle both array and single string cases
            const existingCatsArray = existingCategories ?
                (Array.isArray(existingCategories) ? existingCategories : [existingCategories]) :
                [];

            const categoryIds = await this.processCategories([
                ...existingCatsArray,
                ...(newCategories ? newCategories.split(',').map(c => c.trim()) : [])
            ]);

            // Handle file upload
            let featuredImage = '';
            if (req.file) {
                featuredImage = `/uploads/blogs/${req.file.filename}`;
                console.log('Featured image uploaded:', featuredImage);
            }

            // Create slug
            const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

            // console.log('Creating blog with data:', {
            //     title, excerpt, slug, categoryIds, tags, author, featuredImage
            // });

            const blog = new Blog({
                title,
                excerpt,
                content: sanitizeHtml(content, {
                    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
                        'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
                        'pre', 'code', 'p', 'ul', 'ol', 'li', 'b', 'i', 'strong',
                        'em', 'a', 'del', 's', 'sub', 'sup', 'figure', 'figcaption',
                        'span', 'div', 'br', 'hr', 'source', 'video', 'audio'
                    ]),
                    allowedAttributes: {
                        a: ['href', 'name', 'target', 'rel'],
                        img: ['src', 'alt', 'width', 'height', 'loading'],
                        video: ['controls', 'src', 'width', 'height'],
                        audio: ['controls', 'src'],
                        source: ['src', 'type'],
                        '*': ['class', 'id', 'style']
                    }
                }),
                categories: categoryIds,
                tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
                status,
                author,
                featuredImage,
                slug
            });

            // console.log("Created blog:", blog);
            // console.log("Redirecting to /blogs/" + blog.slug);
            

            const savedBlog = await blog.save();
            // console.log('Blog created successfully:', savedBlog._id);

            req.flash('success_msg', 'Blog created successfully!');
            res.redirect(`/blogs/${blog.slug}`);

        } catch (err) {
            console.error('Error creating blog:', err);
            req.flash('error_msg', 'Failed to create blog. Please try again.');
            res.redirect('/blogs/new');

            // Prepare categories for form repopulation
            req.body.categories = [
                ...(req.body.existingCategories ?
                    (Array.isArray(req.body.existingCategories) ?
                        req.body.existingCategories :
                        [req.body.existingCategories]) :
                    []),
                ...(req.body.newCategories ? req.body.newCategories.split(',').map(c => c.trim()) : [])
            ];

            if (err.code === 11000) { 
                req.flash('error_msg', 'A blog with this title already exists.');
            } else {
                req.flash('error_msg', 'Failed to create blog. Please try again.');
            }
            next(err);
        }
    };

    updateBlog = async (req, res, next) => {
        try {
            const { slugOrId } = req.params;
            const { title, excerpt, content, existingCategories, tags, status, deleteFeaturedImage } = req.body;

            console.log(`Attempting to update blog with identifier: ${slugOrId}`);

            const matchCondition = mongoose.Types.ObjectId.isValid(slugOrId)
                ? { $or: [{ _id: new mongoose.Types.ObjectId(slugOrId) }, { slug: slugOrId }] }
                : { slug: slugOrId };

            const blogData = await Blog.aggregate([
                { $match: matchCondition },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'author',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                { $unwind: '$author' },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'categories',
                        foreignField: '_id',
                        as: 'categories'
                    }
                },
                {
                    $limit: 1
                }
            ]);

            if (!blogData.length) {
                return next(new ErrorResponse('Blog not found', 404));
            }

            const blog = await Blog.findById(blogData[0]._id); 

            if (!blog) {
                return next(new ErrorResponse('Blog not found for update', 404));
            }

            // Authorization check
            if (blog.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
                return next(new ErrorResponse('Not authorized to update this blog', 403));
            }

            // Update fields
            blog.title = title;
            blog.excerpt = excerpt;
            blog.content = content;
            blog.status = status;

            blog.categories = Array.isArray(existingCategories)
                ? existingCategories
                : [existingCategories].filter(Boolean);

            blog.tags = tags ? tags.split(',').map(tag => tag.trim()) : [];

            // Generate new slug if title changed
            if (blog.isModified('title')) {
                blog.slug = title.toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^\w-]/g, '');
            }

            // Handle image updates
            if (req.file) {
                if (blog.featuredImage) {
                    const oldPath = path.join(__dirname, '../public', blog.featuredImage);
                    fs.unlink(oldPath, err => err && console.error('Error deleting old image:', err));
                }
                blog.featuredImage = `/uploads/blogs/${req.file.filename}`;
            } else if (deleteFeaturedImage === 'true') {
                if (blog.featuredImage) {
                    const oldPath = path.join(__dirname, '../public', blog.featuredImage);
                    fs.unlink(oldPath, err => err && console.error('Error deleting old image:', err));
                }
                blog.featuredImage = undefined;
            }

            await blog.save();

            req.flash('success_msg', 'Blog updated successfully');
            res.redirect(`/blogs/${blog.slug}`);

        } catch (err) {
            console.error('Error updating blog:', err);
            req.flash('error_msg', 'Failed to update blog');
            next(err);
        }
    };
    
    showEditForm = async (req, res, next) => {
        try {
            const blogId = req.params.id;

            // Get blog with category info using aggregation
            const blogWithCategory = await Blog.aggregate([
                { $match: { _id: new mongoose.Types.ObjectId(blogId) } },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'category',
                        foreignField: '_id',
                        as: 'category'
                    }
                },
                {
                    $unwind: {
                        path: '$category',
                        preserveNullAndEmptyArrays: true
                    }
                }
            ]);

            const blog = blogWithCategory[0];

            if (!blog) {
                return next(new ErrorResponse('Blog not found', 404));
            }

            const categories = await Category.find().sort({ name: 1 }).lean();

            res.render('blogs/create', {
                title: 'Edit Blog Post',
                blog,
                categories,
                errors: req.flash('error'),
                success_msg: req.flash('success_msg')
            });

        } catch (error) {
            console.error('Error rendering edit form:', error);
            next(error);
        }
    };
    

    deleteBlog = async (req, res, next) => {
        try {
            const blogSlug = req.params.slugOrId;
            let blog;

            console.log('Trying to delete blog:', blogSlug);

            if (mongoose.Types.ObjectId.isValid(blogSlug)) {
                blog = await Blog.findById(blogSlug);
            } else {
                blog = await Blog.findOne({ slug: blogSlug });
            }

            if (!blog) {
                console.log('Blog not found');
                req.flash('error_msg', 'Blog not found.');
                return req.user.role === 'admin' ? res.redirect('/admin/dashboard') : res.redirect('/blogs');
            }

            console.log('Blog found:', blog.title);

            if (blog.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
                console.log('Unauthorized user:', req.user._id);
                req.flash('error_msg', 'Unauthorized.');
                return req.user.role === 'admin' ? res.redirect('/admin/dashboard') : res.redirect('/blogs');
            }

            if (blog.featuredImage) {
                const imagePath = path.join(__dirname, '..', 'public', blog.featuredImage);
                if (fs.existsSync(imagePath)) {
                    console.log('Deleting image:', imagePath);
                    fs.unlinkSync(imagePath);
                }
            }

            console.log('Deleting blog...');
            await Blog.findByIdAndDelete(blog._id);

            req.flash('success_msg', 'Blog deleted successfully.');
            return req.user.role === 'admin' ? res.redirect('/admin/dashboard') : res.redirect('/blogs');

        } catch (err) {
            console.error('Delete error:', err);
            req.flash('error_msg', 'Deletion failed.');
            next(err);
        }
    };
    
    
    listBlogs = async (req, res) => {
        const { category, tag, page = 1 } = req.query;
        const perPage = 6;

        let matchStage = {};
        let categoryName = null;
        let tagName = null;

        // Handle category by slug
        if (category) {
            const categoryDoc = await Category.findOne({ slug: category });
            if (categoryDoc) {
                matchStage.categories = categoryDoc._id;
                categoryName = categoryDoc.name;
            }
        }

        // Handle tag by name (string)
        if (tag) {
            matchStage.tags = tag;
            tagName = tag;
        }

        // Aggregation Pipeline
        const pipeline = [
            { $match: matchStage },
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    blogs: [
                        { $skip: (parseInt(page) - 1) * perPage },
                        { $limit: perPage },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'author',
                                foreignField: '_id',
                                as: 'author',
                            },
                        },
                        { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
                        {
                            $lookup: {
                                from: 'categories',
                                localField: 'categories',
                                foreignField: '_id',
                                as: 'categories',
                            },
                        },
                    ],
                    totalCount: [
                        { $count: 'count' }
                    ]
                }
            }
        ];

        const result = await Blog.aggregate(pipeline);

        const blogs = result[0].blogs;
        const total = result[0].totalCount[0]?.count || 0;

        res.render('blog/list', {
            blogs,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / perPage),
            categoryName,
            tagName,
        });
      };

    likeBlog = async (req, res, next) => {
        try {
            const blogId = req.params.id;
            const userId = req.user.id;

            // Try to like the blog
            let blog = await Blog.findOneAndUpdate(
                { _id: blogId, likes: { $ne: userId } },
                { $addToSet: { likes: userId } },
                { new: true }
            ).lean();

            let isLiked;

            // If not liked, try to unlike
            if (!blog) {
                blog = await Blog.findOneAndUpdate(
                    { _id: blogId, likes: userId },
                    { $pull: { likes: userId } },
                    { new: true }
                ).lean();

                if (!blog) {
                    return next(new ErrorResponse('Blog not found', 404));
                }

                isLiked = false;
            } else {
                isLiked = true;
            }

            res.status(200).json({
                success: true,
                data: {
                    _id: blog._id,
                    title: blog.title,
                    likes: blog.likes, 
                    totalLikes: blog.likes.length
                },
                isLiked
            });

        } catch (err) {
            next(err);
        }
    };
    

    renderEditBlog = async (req, res, next) => {
        try {
            const slugOrId = req.params.slugOrId;
            const blog = await Blog.findOne({ slug: slugOrId }) ||
                (mongoose.Types.ObjectId.isValid(slugOrId) && await Blog.findById(slugOrId));
            if (!blog) {
                return next(new ErrorResponse('Blog not found', 404));
            }
            const categories = await Category.find().sort({ name: 1 });
            res.render('blog/edit', {
                title: 'Edit Blog',
                blog,
                categories,
                error: req.flash('error'),
                success_msg: req.flash('success_msg')
            });
        } catch (err) {
            console.error('Error rendering edit blog form:', err);
            req.flash('error_msg', 'Could not load blog edit form.');
            res.redirect('/blogs');
        }
    };

    getBlogsWithPagination = async (req, res, next) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            // Total blog count
            const total = await Blog.countDocuments({ status: 'published' });
            const totalPages = Math.ceil(total / limit);

            // Paginated blogs
            const blogs = await Blog.aggregate([
                { $match: { status: 'published' } },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'author',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                { $unwind: '$author' },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'categories',
                        foreignField: '_id',
                        as: 'categories'
                    }
                }
            ]);

            // Sidebar filters
            const categories = await Category.find().sort('name');
            const tags = await Blog.distinct('tags', { status: 'published' });

            // Featured blogs
            const featuredBlogs = await Blog.aggregate([
                { $match: { status: 'published' } },
                { $sort: { createdAt: -1 } },
                { $limit: 3 },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'author',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                { $unwind: '$author' },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'categories',
                        foreignField: '_id',
                        as: 'categories'
                    }
                }
            ]);

            // Trending blogs
            const trendingBlogs = await Blog.aggregate([
                { $match: { status: 'published' } },
                { $sort: { views: -1 } },
                { $limit: 6 },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'author',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                { $unwind: '$author' },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'categories',
                        foreignField: '_id',
                        as: 'categories'
                    }
                }
            ]);

            // Latest blogs (after featured)
            const latestBlogs = await Blog.aggregate([
                { $match: { status: 'published' } },
                { $sort: { createdAt: -1 } },
                { $skip: 3 },
                { $limit: 6 },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'author',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                { $unwind: '$author' },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'categories',
                        foreignField: '_id',
                        as: 'categories'
                    }
                }
            ]);

            // Recent posts (for footer/sidebar)
            const recentPosts = await Blog.find({ status: 'published' })
                .sort('-createdAt')
                .limit(5)
                .select('title slug createdAt');

            const blogsByCategory = await Category.aggregate([
                {
                    $lookup: {
                        from: 'blogs',
                        localField: '_id',
                        foreignField: 'categories',
                        as: 'blogs'
                    }
                },
                { $unwind: '$blogs' },
                { $match: { 'blogs.status': 'published' } },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'blogs.author',
                        foreignField: '_id',
                        as: 'blogs.author'
                    }
                },
                {
                    $unwind: {
                        path: '$blogs.author',
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $group: {
                        _id: '$_id',
                        categoryName: { $first: '$name' },
                        categorySlug: { $first: '$slug' },
                        blogs: {
                            $push: {
                                _id: '$blogs._id',
                                title: '$blogs.title',
                                slug: '$blogs.slug',
                                excerpt: '$blogs.excerpt',
                                content: '$blogs.content',
                                featuredImage: '$blogs.featuredImage',
                                createdAt: '$blogs.createdAt',
                                author: {
                                    _id: '$blogs.author._id',
                                    name: '$blogs.author.name'
                                }
                            }
                        }
                    }
                },
                {
                    $project: {
                        categoryName: 1,
                        categorySlug: 1,
                        blogs: { $slice: ['$blogs', 3] } 
                    }
                },
                { $limit: 5 }
            ]);
                

            const blogsByTag = await Blog.aggregate([
                { $match: { status: 'published' } },
                { $unwind: '$tags' },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'author',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                {
                    $unwind: {
                        path: '$author',
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $group: {
                        _id: '$tags',
                        blogs: {
                            $push: {
                                _id: '$_id',
                                title: '$title',
                                slug: '$slug',
                                excerpt: '$excerpt',
                                content: '$content',
                                featuredImage: '$featuredImage',
                                createdAt: '$createdAt',
                                author: {
                                    _id: '$author._id',
                                    name: '$author.name'
                                }
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        blogs: { $slice: ['$blogs', 3] } 
                    }
                },
                { $sort: { _id: 1 } },
                { $limit: 10 }
            ]);
              

            // Pagination object
            const pagination = {};
            if (skip > 0) pagination.prev = { page: page - 1, limit };
            if (page * limit < total) pagination.next = { page: page + 1, limit };

            // Render homepage
            res.render('homepage', {
                blogs,
                categories,
                tags,
                pagination,
                total,
                currentPage: page,
                totalPages,
                featuredBlogs,
                trendingBlogs,
                latestBlogs,
                recentPosts,
                blogsByCategory,
                blogsByTag 
            });

        } catch (err) {
            console.error('Error in getBlogsWithPagination:', err);
            next(err);
        }
    };

    getBlogsByTag = async (req, res, next) => {
        try {
            const tag = req.params.tag?.toLowerCase();
            if (!tag) {
                req.flash('error_msg', 'Tag not specified.');
                return res.redirect('/blogs');
            }

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 9;
            const skip = (page - 1) * limit;

            const totalBlogs = await Blog.countDocuments({
                tags: { $in: [tag] },
                status: 'published'
            });
            const totalPages = Math.ceil(totalBlogs / limit);

            const blogs = await Blog.aggregate([
                {
                    $match: {
                        tags: { $in: [tag] },
                        status: 'published'
                    }
                },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'author',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                {
                    $unwind: {
                        path: '$author',
                        preserveNullAndEmptyArrays: true
                    }
                },
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
                        title: 1,
                        slug: 1,
                        excerpt: 1,
                        content: 1,
                        featuredImage: 1,
                        createdAt: 1,
                        tags: 1,
                        author: {
                            _id: '$author._id',
                            name: '$author.name',
                            profilePicture: '$author.profilePicture'
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

            res.render('blog/list', {
                blogs,
                categoryName: null,
                tagName: tag,
                user: req.user,
                currentPage: page,
                totalPages
            });

        } catch (err) {
            console.error('Error in getBlogsByTag:', err);
            next(err);
        }
    };
    

    getRelatedBlogs = async (blogId) => {
        try {
            // 1. Get the blog with categories and tags
            const blog = await Blog.findById(blogId).lean();
            if (!blog) return [];

            const categoryIds = blog.categories?.filter(Boolean).map(id => id.toString()) || [];
            const tags = blog.tags || [];

            // 2. Aggregate related blogs
            const relatedBlogs = await Blog.aggregate([
                {
                    $match: {
                        _id: { $ne: blog._id },
                        status: 'published',
                        $or: [
                            {
                                categories: {
                                    $in: categoryIds.map(id => new mongoose.Types.ObjectId(id))
                            } },
                            { tags: { $in: tags } }
                        ]
                    }
                },
                {
                    $addFields: {
                        matchScore: {
                            $add: [
                                {
                                    $size: {
                                        $setIntersection: ['$categories', categoryIds.map(id => new mongoose.Types.ObjectId(id))
                                ] } },
                                { $size: { $setIntersection: ['$tags', tags] } }
                            ]
                        }
                    },
                },
                { $sort: { matchScore: -1, createdAt: -1 } },
                { $limit: 3 },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'author',
                        foreignField: '_id',
                        as: 'author',
                        pipeline: [
                            { $project: { name: 1, profilePicture: 1 } }
                        ]
                    }
                },
                { $unwind: '$author' },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'categories',
                        foreignField: '_id',
                        as: 'categories',
                        pipeline: [
                            { $project: { name: 1 } }
                        ]
                    }
                }
            ]);

            // 3. If not enough, fill with random published blogs
            if (relatedBlogs.length < 3) {
                const excludeIds = [blog._id, ...relatedBlogs.map(b => b._id)];
                const randomBlogs = await Blog.aggregate([
                    {
                        $match: {
                            _id: { $nin: excludeIds },
                            status: 'published'
                        }
                    },
                    { $sample: { size: 3 - relatedBlogs.length } },
                    {
                        $lookup: {
                            from: 'users',
                            localField: 'author',
                            foreignField: '_id',
                            as: 'author',
                            pipeline: [
                                { $project: { name: 1, profilePicture: 1 } }
                            ]
                        }
                    },
                    { $unwind: '$author' },
                    {
                        $lookup: {
                            from: 'categories',
                            localField: 'categories',
                            foreignField: '_id',
                            as: 'categories',
                            pipeline: [
                                { $project: { name: 1 } }
                            ]
                        }
                    }
                ]);
                relatedBlogs.push(...randomBlogs);
            }

            // 4. Deduplicate and limit to 3
            const seen = new Set();
            const uniqueBlogs = [];
            for (const b of relatedBlogs) {
                const id = b._id.toString();
                if (!seen.has(id) && uniqueBlogs.length < 3) {
                    seen.add(id);
                    uniqueBlogs.push(b);
                }
            }

            return uniqueBlogs;
        } catch (err) {
            console.error('Error in getRelatedBlogs:', err);
            return [];
        }
    };

    async toggleLike(req, res, next) {
        // console.log('User:', req.user?.id, 'BlogId:', req.params.blogId);
        if (!req.user) {
            console.warn('toggleLike: No user found in request');
        }


        try {
            if (!req.user) {
                if (req.xhr || req.headers.accept.includes('application/json')) {
                    return res.status(401).json({ success: false, error: 'Please log in to like a post.' });
                } else {
                    return res.redirect('/auth/login');
                }
            }

            const blogId = req.params.blogId;
            const userId = req.user._id;

            const blog = await Blog.findById(blogId);
            if (!blog) {
                return res.status(404).json({ success: false, error: 'Blog not found' });
            }

            const hasLiked = blog.likes.some(id => id.toString() === userId.toString());

            if (hasLiked) {
                blog.likes.pull(userId);
            } else {
                blog.likes.push(userId);
            }

            await blog.save();

            const isLiked = blog.likes.some(id => id.toString() === userId.toString());

            res.status(200).json({
                success: true,
                data: {
                    likes: blog.likes,
                    likeCount: blog.likes.length,
                    isLiked
                }
            });

        } catch (err) {
            console.error('Error toggling like:', err);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    }

    getBlogBySlug = async (req, res, next) => {
        try {
            const slug = req.params.blogSlug;

            // Aggregate blog, author, categories, and comments (with replies and authors)
            const blogData = await Blog.aggregate([
                { $match: { slug } },
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
                // Get top-level comments for this blog
                {
                    $lookup: {
                        from: 'comments',
                        let: { blogId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $and: [
                                { $eq: ['$blog', '$$blogId'] },
                                { $eq: ['$parentComment', null] }
                            ]}}},
                            { $sort: { createdAt: 1 } },
                            
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
                                    from: 'comments',
                                    let: { parentId: '$_id' },
                                    pipeline: [
                                        { $match: { $expr: { $eq: ['$parentComment', '$$parentId'] } } },
                                        { $sort: { createdAt: 1 } },
                                        {
                                            $lookup: {
                                                from: 'users',
                                                localField: 'author',
                                                foreignField: '_id',
                                                as: 'author'
                                            }
                                        },
                                        { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } }
                                    ],
                                    as: 'comments'
                                }
                            }
                        ],
                        as: 'comments'
                    }
                },
                {
                    $project: {
                        title: 1,
                        slug: 1,
                        excerpt: 1,
                        content: 1,
                        featuredImage: 1,
                        tags: 1,
                        views: 1,
                        likes: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        author: {
                            _id: '$author._id',
                            name: '$author.name',
                            profilePicture: '$author.profilePicture',
                            username: '$author.username',
                            profileImage: '$author.profileImage'
                        },
                        categories: {
                            _id: 1,
                            name: 1,
                            slug: 1
                        },
                        comments: 1
                    }
                }
            ]);

            if (!blogData.length) {
                return next(new ErrorResponse('Blog not found', 404));
            }

            const blog = blogData[0];

            // Get related blogs (can remain as is)
            const relatedBlogs = await this.getRelatedBlogs(blog._id);

            // Check if user liked this blog
            const userId = req.user ? req.user.id : null;
            const isLiked = userId && blog.likes.some(likeId => likeId.toString() === userId.toString());

            res.render('blog/single', {
                title: blog.title,
                blog,
                comments: blog.comments || [],
                relatedBlogs: relatedBlogs || [],
                user: req.user,
                isLiked
            });

    } catch (err) {
        next(err);
    }
}

     getBlogsByCategory = async (req, res, next) => {
        try {
            const { categorySlugOrId } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 9;
            const skip = (page - 1) * limit;

            // Find the category by slug or ObjectId
            let category;
            if (mongoose.Types.ObjectId.isValid(categorySlugOrId)) {
                category = await Category.findById(categorySlugOrId);
            } else {
                category = await Category.findOne({ slug: categorySlugOrId });
            }

            if (!category) {
                req.flash('error_msg', 'Category not found.');
                return res.redirect('/blogs');
            }

            const pipeline = [
                {
                    $match: {
                        categories: category._id,
                        status: 'published',
                    }
                },
                { $sort: { createdAt: -1 } },
                {
                    $facet: {
                        blogs: [
                            { $skip: skip },
                            { $limit: limit },
                            {
                                $lookup: {
                                    from: 'users',
                                    localField: 'author',
                                    foreignField: '_id',
                                    as: 'author'
                                }
                            },
                            {
                                $unwind: {
                                    path: '$author',
                                    preserveNullAndEmptyArrays: true
                                }
                            },
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
                                    title: 1,
                                    slug: 1,
                                    excerpt: 1,
                                    content: 1,
                                    featuredImage: 1,
                                    createdAt: 1,
                                    tags: 1,
                                    author: {
                                        _id: '$author._id',
                                        name: '$author.name',
                                        profilePicture: '$author.profilePicture'
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
                        ],
                        totalCount: [
                            { $count: 'count' }
                        ]
                    }
                }
            ];

            const result = await Blog.aggregate(pipeline);
            const blogs = result[0].blogs;
            const totalCount = result[0].totalCount[0]?.count || 0;
            const totalPages = Math.ceil(totalCount / limit);

            res.render('blog/list', {
                blogs,
                categoryName: category.name,
                tagName: null,
                user: req.user,
                currentPage: page,
                totalPages
            });

        } catch (err) {
            console.error('Error in getBlogsByCategory:', err);
            next(err);
        }
    };



    approveBlog = async (req, res, next) => {
        try {
            const blog = await Blog.findById(req.params.id);
            if (!blog) {
                return next(new ErrorResponse('Blog not found', 404));
            }

            blog.status = 'published';
            await blog.save();

            req.flash('success_msg', 'Blog approved and published successfully!');
            res.redirect('/admin/dashboard');
        } catch (err) {
            console.error('Error in approveBlog:', err);
            next(err);
        }
    };

    previewBlog = async (req, res, next) => {
        try {
            const blogData = await Blog.aggregate([
                { $match: { slug: req.params.slug } },
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
                        _id:1,
                        title: 1,
                        slug: 1,
                        content: 1,
                        status: 1,
                        createdAt: 1,
                        featuredImage: 1,
                        author: { _id: '$author._id', name: '$author.name' },
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

            if (!blogData.length) {
                req.flash('error_msg', 'Blog not found.');
                return res.redirect('/admin/dashboard');
            }

            const blog = blogData[0];
            console.log('Preview Blog:', blog);
            res.render('admin/blogPreview', { blog });

        } catch (err) {
            console.error('Error loading blog preview:', err);
            req.flash('error_msg', 'Could not load blog preview.');
            res.redirect('/admin/dashboard');
        }
    };
    
    
      
    
}


module.exports = new BlogController();
