const express = require('express');
const router = express.Router();

const blogController = require('../controllers/blogController');
const authMiddleware = require('../middleware/authMiddleware');
const { uploadBlogImage } = require('../middleware/uploadMiddleware');
const CommentController = require('../controllers/commentController')

const Blog = require('../models/Blog');
const checkBlogOwnership = authMiddleware.checkOwnership(Blog);

// Public Routes
router.get('/', blogController.getBlogsWithPagination);
router.get('/tags/:tag', blogController.getBlogsByTag);
router.get('/categories/:categorySlugOrId', blogController.getBlogsByCategory);

router.get('/create',
    authMiddleware.protect,
    blogController.renderCreateBlog
);

// View single blog (must come AFTER /create)
router.get('/:slugOrId', blogController.singleBlog);

// Protected Routes
router.post(
    '/',
    authMiddleware.protect,
    uploadBlogImage,
    blogController.createBlog
);

router.get('/:slugOrId/edit',
    authMiddleware.protect,
    authMiddleware.checkOwnership(Blog),
    blogController.renderEditBlog
);

router.put('/:slugOrId',
    authMiddleware.protect,
    authMiddleware.checkOwnership(Blog),
    uploadBlogImage,
    blogController.updateBlog
);

router.delete('/:slugOrId',
    authMiddleware.protect,
    authMiddleware.checkOwnership(Blog), 
    blogController.deleteBlog
);


router.put(
    '/:blogId/like',
    authMiddleware.protect,
    blogController.toggleLike
);

// Admin Action
router.put(
    '/:id/approve',
    authMiddleware.protect,
    blogController.approveBlog
);

// Comments
router.post('/:slugOrId/comments',
    authMiddleware.protect,
    CommentController.addComment
);

// Comment like route

router.put('/comments/:id/like', authMiddleware.protect, CommentController.toggleLike);


router.get('/list', blogController.listBlogs);


module.exports = router;
