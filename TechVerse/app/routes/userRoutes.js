const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

const authMiddleware = require('../middleware/authMiddleware'); 

const uploadMiddleware = require('../middleware/uploadMiddleware');
const { validateUserUpdate } = require('../validations/userValidation');

// All routes use instance methods
router.get('/edit', protect, userController.renderEditProfile);
router.get('/profile', authMiddleware.protect, userController.renderProfile); 
router.get('/public/all', userController.getPublicUsers);
router.get('/:id', userController.getUser);


router.put('/:id',
    uploadMiddleware.uploadProfileImage,
    uploadMiddleware.handleUploadErrors,
    validateUserUpdate,
    userController.updateUser
);
router.get('/:id/dashboard',
    authMiddleware.protect, 
    userController.getDashboard
);
router.put('/:id/deactivate',
    userController.deactivateUser
);
router.get('/:id/category-stats',
    authMiddleware.protect, 
    userController.getBlogStatsByCategory
);

// Render edit profile form
router.get('/:id/edit', protect, userController.renderEditProfile);

// Handle profile update
// router.put('/:id', protect, userController.updateUser);

module.exports = router;