const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');
const blogController=require('../controllers/blogController')

// 🔐 Apply global protection and admin check
router.use(protect);
router.use(authorize('admin'));

// ✅ Redirect /admin to /admin/dashboard
router.get('/', (req, res) => {
    res.redirect('/admin/dashboard');
});

// User Management
// router.get('/users', adminController.getUsers);
router.delete('/users/:id', adminController.deleteUser);
router.put('/users/:id/role', adminController.updateUserRole);
router.get('/users/:id', adminController.getUserDetails);
router.get('/users', adminController.getAllUsers);


// Blog Management
router.put('/blogs/:id', adminController.updateBlog);
router.delete('/blogs/:id', adminController.deleteBlog);
router.put('/blogs/:id/moderate', adminController.moderateBlog);

// Comment Management
router.delete('/comments/:id', adminController.deleteComment);

// Dashboard & Statistics
router.get('/dashboard', adminController.getDashboardStats);
router.get('/stats/blogs-per-user', adminController.getBlogsPerUser);
router.get('/stats/comments-per-user', adminController.getCommentsPerUser);
router.get('/stats/comments-per-blog', adminController.getCommentsPerBlog);
router.get('/stats/blog-trends', adminController.getBlogTrends);
router.put('/blogs/:id/moderate', protect, authorize('admin'), adminController.approveBlog);
// Preview blog (admin only)
router.get('/blogs/:slugOrId', adminController.getBlogPreview);

router.get('/blogs', adminController.getAllBlogs);




module.exports = router;
