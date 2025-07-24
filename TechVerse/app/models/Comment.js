const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
    content: {
        type: String,
        required: [true, 'Please add a comment'],
        maxlength: [1000, 'Comment cannot be more than 1000 characters'],
    },
    blog: {
        type: mongoose.Schema.ObjectId,
        ref: 'Blog',
        required: true,
    },
    author: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true,
    },
    parentComment: {
        type: mongoose.Schema.ObjectId,
        ref: 'Comment',
        default: null
    },
    replies: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment'
    }],
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
    },
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// Indexes for better performance
CommentSchema.index({ blog: 1, createdAt: -1 });
CommentSchema.index({ parentComment: 1 });

// Virtual for reply count
CommentSchema.virtual('replyCount').get(function () {
    return this.replies?.length || 0;
});


// Update timestamp on save
CommentSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Validate parent comment exists and belongs to same blog
CommentSchema.path('parentComment').validate(async function (value) {
    if (!value) return true;
    const parent = await mongoose.model('Comment').findById(value);
    return parent && parent.blog.equals(this.blog);
}, 'Parent comment must belong to the same blog');

module.exports = mongoose.model('Comment', CommentSchema);