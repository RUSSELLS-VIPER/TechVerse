const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('connect-flash');
const jwt = require('jsonwebtoken');

const User = require('./app/models/User');

const app = express();

// 🔗 MongoDB Connection
const mongoURL = process.env.MONGO_URL;
if (!mongoURL) {
    console.error('❌ MONGO_URL not found in .env');
    process.exit(1);
}

mongoose.connect(mongoURL).then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// 🔧 View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 📂 Static files
app.use(express.static(path.join(__dirname, 'app', 'public')));
app.use('/uploads/profile', express.static(path.join(__dirname, 'app', 'public', 'uploads', 'profile')));

app.use('/.well-known', express.static(path.join(__dirname, 'app', 'public', '.well-known')));

app.use('/ckeditor', express.static(path.join(__dirname, 'public/ckeditor')));

// app.use('/users/:id', express.static(path.join(__dirname, 'app', 'public', 'uploads')));

// 📦 Core Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride('_method'));

// 🔐 Session + Flash Messages
app.use(session({
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: false,
}));
app.use(flash());

// 🛡️ JWT User Detection for EJS (sets req.user & res.locals.user)
app.use(async (req, res, next) => {
    const token = req.cookies?.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('name email role profilePicture');
            req.user = user;
            res.locals.user = user;
        } catch (err) {
            req.user = null;
            res.locals.user = null;
        }
    } else {
        req.user = null;
        res.locals.user = null;
    }
    next();
});

// 🌐 Global Template Variables
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    next();
});

// 🔁 Routes
const blogRoutes = require('./app/routes/blogRoutes');
const userRoutes = require('./app/routes/userRoutes');
const authRoutes = require('./app/routes/authRoutes');
const adminRoutes = require('./app/routes/adminRoutes');
const blogController = require('./app/controllers/blogController');

// 📚 Route Mounting
app.use('/blogs', blogRoutes);
app.get('/list', blogController.listBlogs);
app.use('/users', userRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// 🏠 Homepage
app.get('/', blogController.getBlogsWithPagination);

app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
    return res.status(204).end(); // No Content
});

// ❌ 404 Handler (send error message instead of rendering page)
app.use((req, res, next) => {
    const error = new Error(`Not Found: ${req.originalUrl}`);
    error.statusCode = 404;
    next(error);
});

// 🛠 Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Server Error'
    });
});


  


// 🚀 Server Start
const PORT = process.env.PORT || 8008;
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
