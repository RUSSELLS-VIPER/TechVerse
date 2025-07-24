const mongoose = require('mongoose');

const BlogSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please add a title'],
        trim: true,
        maxlength: [100, 'Title cannot be more than 100 characters'],
    },
    content: {
        type: String,
        required: [true, 'Please add content'],
    },
    excerpt: {
        type: String,
        maxlength: [300, 'Excerpt cannot be more than 300 characters'],
    },
    featuredImage: {
        type: String,
    },
    categories: [
        {
            type: mongoose.Schema.ObjectId,
            ref: 'Category',
        },
    ],
    tags: [String],
    author: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true,
    },
    slug: {
        type: String,
        unique: true,
        required: true
    },
    status: {
        type: String,
        enum: ['draft', 'pending', 'published'],
        default: 'draft'
      },
    views: {
        type: Number,
        default: 0,
    },
    likes: [
        {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
        },
    ],
    // This is the correct, real path for comments. Keep this.
    comments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment'
    }],
    readingTime: {
        type: Number,
    },
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

// Calculate reading time before saving
BlogSchema.pre('save', function (next) {
    const wordsPerMinute = 200;
    const content = this.content;
    const textLength = content.split(' ').length;
    this.readingTime = Math.ceil(textLength / wordsPerMinute);
    next();
});

// Update the updatedAt field before updating
BlogSchema.pre('findOneAndUpdate', function (next) {
    this.set({ updatedAt: new Date() });
    next();
});

module.exports = mongoose.model('Blog', BlogSchema);