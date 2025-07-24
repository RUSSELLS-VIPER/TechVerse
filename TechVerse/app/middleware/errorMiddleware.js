const ErrorResponse = require('../utils/errorResponse');
function errorHandler(err, req, res, next) {
    let error = { ...err }; 
    
    error.message = err.message;
    error.statusCode = err.statusCode || 500;

    if (error.stack) {
        console.error(error.stack);
    } else {
        console.error(error); 
    }


    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = `Resource not found with id of ${err.value}`;
        error = new ErrorResponse(message, 404);
    }
    // Mongoose duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const message = `Duplicate value for field: ${field}`;
        error = new ErrorResponse(message, 400);
    }
    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val =>
            val.message);
        error = new ErrorResponse(message.join(', '), 400); 
    }

    res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Server Error'
    });
}


module.exports = errorHandler;