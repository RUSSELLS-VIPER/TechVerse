const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ErrorResponse = require('../utils/errorResponse');

const UPLOAD_BASE = path.join(__dirname, '..', 'public', 'uploads'); 


try {
    fs.mkdirSync(UPLOAD_BASE, { recursive: true });
    // console.log('Base upload directory verified at:', UPLOAD_BASE);
} catch (err) {
    console.error('Failed to initialize base upload directory in uploadMiddleware:', err);
}

const blogImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(UPLOAD_BASE, 'blogs');
        try {
            fs.mkdirSync(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (err) {
            console.error('Blog upload directory error:', err);
            cb(new Error('Failed to create blog upload directory'));
        }
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `blog-${Date.now()}${ext}`);
    }
});

const uploadBlogImage = multer({
    storage: blogImageStorage,
    limits: {
        fileSize: 1024 * 1024 * 10, // 5MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (!extname || !mimetype) {
            // console.error(`[Upload] Invalid file type attempted for blog: ${file.originalname}`);
            const error = new Error('Only images (JPEG/JPG/PNG/GIF) are allowed for blogs.');
            error.code = 'INVALID_FILE_TYPE';
            return cb(error);
        }
        cb(null, true);
    }
}).single('featuredImage');


const profileImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(UPLOAD_BASE, 'profile');
        try {
            fs.mkdirSync(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (err) {
            // console.error(`[Upload] Directory creation failed: ${uploadDir}`, err);
            cb(new Error('Failed to create upload directory for profiles'));
        }
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `profile-${req.user ? req.user.id : Date.now()}${ext}`;
        cb(null, filename);
    }
});


const uploadProfileImage = multer({
    storage: profileImageStorage,
    limits: {
        fileSize: 1024 * 1024 * 10, 
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/; 
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (!extname || !mimetype) {
            // console.error(`[Upload] Invalid file type attempted for profile: ${file.originalname}`);
            const error = new Error('Only JPEG/JPG/PNG images are allowed for profile pictures.');
            error.code = 'INVALID_FILE_TYPE';
            return cb(error);
        }
        cb(null, true);
    }
}).single('profilePicture'); 

const handleUploadErrors = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error('[Upload] Multer Error details:', {
            code: err.code,
            message: err.message
        });
        if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new ErrorResponse(`File size exceeds limit (${err.message.includes('blog') ? '5MB' : '2MB'})`, 400));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(new ErrorResponse(`Too many files uploaded or unexpected field name: ${err.field}`, 400));
        }
        return next(new ErrorResponse('File upload failed: ' + err.message, 500));
    } else if (err) {
        console.error('[Upload] General Error details:', {
            code: err.code,
            message: err.message,
            stack: err.stack
        });
        if (err.code === 'INVALID_FILE_TYPE') {
            return next(new ErrorResponse(err.message, 400));
        }
        if (err.message.includes('directory')) {
            return next(new ErrorResponse('Server upload directory error', 500));
        }
        return next(new ErrorResponse('File upload failed: ' + err.message, 500));
    }
    next();
};


module.exports = {
    uploadBlogImage,
    uploadProfileImage,
    handleUploadErrors
};