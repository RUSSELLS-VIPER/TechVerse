const marked = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);


// Sanitize markdown content
exports.sanitizeMarkdown = (content) => {
    // Set marked options
    marked.setOptions({
        breaks: true,
        gfm: true,
    });
    // Convert markdown to html
    const html = marked(content);
    // Sanitize html
    const clean = DOMPurify.sanitize(html);
    return clean;
};


// Generate slug from text
exports.slugify = (text) => {
    return text
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '-') // Replace spaces with 
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-') // Replace multiple - with single 
        .replace(/^-+/, '') // Trim - from start of text
        .replace(/-+$/, ''); // Trim - from end of text
};


// Get pagination params
exports.getPagination = (page, size) => {
    const limit = size ? +size : 10;
    const offset = page ? (page - 1) * limit : 0;
    return { limit, offset };
};


// Get pagination data
exports.getPagingData = (data, page, limit) => {
    const { count: totalItems, rows: items } = data;
    const currentPage = page ? +page : 1;
    const totalPages = Math.ceil(totalItems / limit);
    return { totalItems, items, totalPages, currentPage };
};