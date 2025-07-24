const Comment = require('../models/Comment');
const Blog = require('../models/Blog');
const ErrorResponse = require('../utils/errorResponse');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const util = require('util')

class CommentController {

    getComments = async (req, res, next) => {
        try {
            const blogId = req.params.blogId;

            if (!mongoose.Types.ObjectId.isValid(blogId)) {
                return next(new ErrorResponse('Invalid blog ID', 400));
            }

            const comments = await Comment.aggregate([
                {
                    $match: {
                        blog: new mongoose.Types.ObjectId(req.params.blogId),
                        parentComment: null
                    }
                },
                { $sort: { createdAt: -1 } },
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
                            { $unwind: '$author' },
                            { $addFields: { likeCount: { $size: '$likes' } } }
                        ],
                        as: 'replies'  // Changed from 'comments' to 'replies'
                    }
                },
                { $addFields: { likeCount: { $size: '$likes' } } }
            ]);
    

            console.log('Fetched comments with replies:', comments.length);

            res.status(200).json({
                success: true,
                count: comments.length,
                data: comments,
            });
        } catch (err) {
            console.error("Error fetching comments:", err);
            next(err);
        }
    }

    addComment = async (req, res, next) => {
        if (!req.body) {
            console.error('No request body received');
            return res.status(400).json({ success: false, error: 'Invalid request data' });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const errorMessage = errors.array().map(err => err.msg).join(', ');
            if (req.accepts('html')) {
                req.flash('error_msg', errorMessage);
                return res.redirect(req.get('referer') || '/blogs');
            }
            return res.status(400).json({ success: false, error: errorMessage });
        }

        const handleError = (message, statusCode) => {
            if (req.accepts('html')) {
                req.flash('error_msg', message);
                return res.redirect(req.get('referer') || '/blogs');
            }
            return next(new ErrorResponse(message, statusCode));
        };

        try {
            const slugOrId = req.params.slugOrId;
            const content = req.body.content?.trim();
            const parentCommentId = req.body.parentCommentId;

            if (!slugOrId) return handleError('Blog identifier is required', 400);
            if (!content) return handleError('Comment content is required', 400);
            if (!req.user?.id) return handleError('User not authenticated', 401);

            const blog = await Blog.findOne(
                mongoose.Types.ObjectId.isValid(slugOrId)
                    ? { $or: [{ _id: slugOrId }, { slug: slugOrId }] }
                    : { slug: slugOrId }
            ).select('_id slug');

            if (!blog) return handleError('Blog not found', 404);

            let comment;

            if (parentCommentId) {
                const parentComment = await Comment.findById(parentCommentId);
                if (!parentComment) return handleError('Parent comment not found', 404);

                comment = await Comment.create({
                    content,
                    blog: parentComment.blog,
                    author: req.user._id,
                    parentComment: parentComment._id
                });

                parentComment.replies.push(comment._id);
                await parentComment.save();

                req.flash('success_msg', 'Reply posted!');
                return res.redirect(`/blogs/${blog.slug}#comment-${comment._id}`);
            }

            // Add top-level comment
            comment = await Comment.create({
                content,
                blog: blog._id,
                author: req.user._id
            });

            await Blog.findByIdAndUpdate(blog._id, {
                $push: { comments: comment._id }
            });

            req.flash('success_msg', 'Comment posted!');
            return res.redirect(`/blogs/${blog.slug}#comment-${comment._id}`);

        } catch (err) {
            console.error("Error adding comment:", err);
            if (req.accepts('html')) {
                req.flash('error_msg', 'Failed to post comment');
                return res.redirect(req.get('referer') || '/blogs');
            }
            return next(new ErrorResponse('Server error', 500));
        }
    };
    

    deleteComment = async (req, res, next) => {
        try {
            const comment = await Comment.findById(req.params.id);

            if (!comment) {
                return next(new ErrorResponse(`Comment not found with id of ${req.params.id}`, 404));
            }

            if (
                comment.author.toString() !== req.user.id &&
                req.user.role !== 'admin'
            ) {
                return next(
                    new ErrorResponse(
                        `User ${req.user.id} is not authorized to delete this comment`,
                        401
                    )
                );
            }

            if (comment.parentComment) {
                await Comment.updateOne(
                    { _id: comment.parentComment },
                    { $pull: { comments: comment._id } }
                );
            } else {
                await Blog.updateOne(
                    { _id: comment.blog },
                    { $pull: { comments: comment._id } }
                );
            }

            await Comment.deleteMany({ parentComment: comment._id });
            await comment.remove();

            req.flash('success_msg', 'Comment deleted successfully!');
            res.status(200).json({
                success: true,
                data: {},
            });
        } catch (err) {
            console.error('Error deleting comment:', err);
            next(err);
        }
    }

    async toggleLike(req, res, next) {
        try {
            const commentId = req.params.id;
            const userId = new mongoose.Types.ObjectId(req.user._id);

            const comment = await Comment.findById(commentId);
            if (!comment) {
                return next(new ErrorResponse("Comment not found", 404));
            }

            const alreadyLiked = comment.likes.some(id => id.toString() === userId.toString());

            let updatedComment;
            let isNowLiked;

            if (alreadyLiked) {
                updatedComment = await Comment.findByIdAndUpdate(
                    commentId,
                    { $pull: { likes: userId } },
                    { new: true, runValidators: false }
                );
                isNowLiked = false;
            } else {
                updatedComment = await Comment.findByIdAndUpdate(
                    commentId,
                    { $addToSet: { likes: userId } },
                    { new: true, runValidators: false }
                );
                isNowLiked = true;
            }

            // console.log(`[toggleLike] Comment: ${commentId}, User: ${userId}, NowLiked: ${isNowLiked}, LikesCount: ${updatedComment.likes.length}`);

            res.status(200).json({
                success: true,
                isLiked: isNowLiked,
                likeCount: updatedComment.likes.length
            });
        } catch (err) {
            console.error('Toggle comment like failed:', err);
            next(err);
        }
    }
    
    
    
    
    
    
    
}

const commentController = new CommentController();
module.exports = commentController;