/**
 * @file middlewareDebugger.js
 * @description Provides a utility function to debug Express middleware chains.
 * This can be helpful to visualize the order and presence of middleware functions.
 */

/**
 * @function debugMiddlewareChain
 * @description Logs the name and order of middleware functions in a given chain.
 * @param {Array<Function>} chain - An array of Express middleware functions.
 * @param {string} chainName - A descriptive name for the middleware chain (e.g., 'CREATE BLOG CHAIN').
 */
const debugMiddlewareChain = (chain, chainName) => {
    // console.log(`\n--- Debugging Middleware Chain: ${chainName} ---`);
    if (!Array.isArray(chain)) {
        // console.error(`Error: Expected 'chain' to be an array, but received ${typeof chain}`);
        // console.log('--- End Debugging ---');
        return;
    }

    if (chain.length === 0) {
        // console.log('Chain is empty.');
        // console.log('--- End Debugging ---');
        return;
    }

    chain.forEach((middleware, index) => {
        // Get the name of the function. For anonymous functions, it might be empty.
        // For arrow functions, it might be empty or inferred.
        // For named functions, it will be the function's name.
        const handlerName = middleware.name || `anonymous_handler_${index}`;
        // console.log(`  ${index + 1}. ${handlerName} (Type: ${typeof middleware})`);
        // Optionally, check if it's a function. This should ideally be caught earlier in buildChain.
        if (typeof middleware !== 'function') {
            console.error(`    WARNING: Item ${index + 1} in chain is NOT a function!`);
        }
    });
    // console.log(`--- End Debugging Chain: ${chainName} ---\n`);
};

module.exports = {
    debugMiddlewareChain
};
