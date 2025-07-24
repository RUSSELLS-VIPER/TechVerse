const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const CommentModel = require('../models/Comment');
const { protect, checkOwnership } = require('../middleware/authMiddleware');

router
    .route('/:id')
    .delete(protect, checkOwnership(CommentModel), commentController.deleteComment);

module.exports = router;