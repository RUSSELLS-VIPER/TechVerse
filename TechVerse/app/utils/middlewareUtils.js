// utils/middlewareUtils.js
class MiddlewareError extends Error {
    constructor(message) {
        super(message);
        this.name = "MiddlewareError";
    }
}

exports.ensureMiddleware = (mw) => {
    if (typeof mw !== 'function') {
        throw new MiddlewareError(
            `Expected middleware to be a function, got ${typeof mw}. ` +
            `Value: ${JSON.stringify(mw, null, 2)}`
        );
    }
    return mw;
};

exports.wrapController = (controller) => {
    if (typeof controller !== 'function') {
        throw new MiddlewareError(
            `Controller must be a function, got ${typeof controller}. ` +
            `Controller: ${controller?.name || 'unnamed'}`
        );
    }
    return async (req, res, next) => {
        try {
            await controller(req, res, next);
        } catch (err) {
            next(err);
        }
    };
};

exports.applyValidations = (validations) => {
    if (!validations) return [];

    const normalized = Array.isArray(validations) ? validations : [validations];

    return normalized.map((v, i) => {
        if (typeof v !== 'function') {
            throw new MiddlewareError(
                `Validation at index ${i} is not a function. ` +
                `Type: ${typeof v}, Value: ${JSON.stringify(v, null, 2)}`
            );
        }
        return v;
    });
};

exports.debugMiddlewareChain = (chain, name = 'unnamed') => {
    // console.log(`\n=== Debugging middleware chain: ${name} ===`);
    chain.forEach((mw, i) => {
        console.log(
            `[${i}] ${mw.name || 'anonymous'}:`,
            `Type: ${typeof mw}`,
            `Function: ${typeof mw === 'function' ? '✅' : '❌'}`
        );
    });
    console.log('=== End of chain ===\n');
  };