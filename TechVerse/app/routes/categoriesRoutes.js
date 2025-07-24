const express = require('express');
const router = express.Router();
const CategoryController = require('../controllers/categoryController'); // Adjust path if needed

// Example API route for getting categories
router.get('/', CategoryController.getCategories); // This will handle GET /categories

// Add other routes for creating/updating/deleting categories if you want them to be API endpoints
// router.post('/', protect, CategoryController.createCategory);

module.exports = router;
