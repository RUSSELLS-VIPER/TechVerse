const Category = require('../models/Category');
const ErrorResponse = require('../utils/errorResponse'); 

class CategoryController {
    
    async getCategories(req, res, next) {
        try {
            const categories = await Category.find().sort('name');
            res.status(200).json({
                success: true,
                count: categories.length,
                data: categories
            });
        } catch (err) {
            console.error("Error fetching categories:", err);
            next(new ErrorResponse('Could not fetch categories', 500));
        }
    }

}

module.exports = new CategoryController();
