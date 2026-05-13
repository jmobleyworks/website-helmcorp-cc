/**
 * Pure Functor Utilities for Hydra Edge System
 * Implements functional programming patterns for composition and testability
 */

/**
 * Identity functor: Returns input unchanged
 * @param {*} x - Any value
 * @returns {*} Same value
 */
export const identity = (x) => x;

/**
 * Compose functors right-to-left
 * compose(f, g, h)(x) = f(g(h(x)))
 * @param {...Function} fns - Functor functions
 * @returns {Function} Composed functor
 */
export const compose = (...fns) => (x) =>
	fns.reduceRight((acc, fn) => fn(acc), x);

/**
 * Pipe functors left-to-right
 * pipe(f, g, h)(x) = h(g(f(x)))
 * @param {...Function} fns - Functor functions
 * @returns {Function} Piped functor
 */
export const pipe = (...fns) => (x) =>
	fns.reduce((acc, fn) => fn(acc), x);

/**
 * Map functor: Apply function to value inside context
 * @param {Function} fn - Transformation function
 * @param {*} value - Value to transform
 * @returns {*} Transformed value
 */
export const map = (fn) => (value) => fn(value);

/**
 * FlatMap (bind) functor: Flatten nested results
 * @param {Function} fn - Function returning wrapped value
 * @param {*} value - Input value
 * @returns {*} Flattened result
 */
export const flatMap = (fn) => (value) => {
	const result = fn(value);
	return Array.isArray(result) ? result.flat() : result;
};

/**
 * Filter functor: Keep values matching predicate
 * @param {Function} predicate - Test function
 * @param {Array} items - Items to filter
 * @returns {Array} Filtered items
 */
export const filter = (predicate) => (items) =>
	items.filter(predicate);

/**
 * Reduce functor: Fold items into single result
 * @param {Function} reducer - (acc, item) => newAcc
 * @param {*} initial - Initial accumulator
 * @param {Array} items - Items to reduce
 * @returns {*} Reduced result
 */
export const reduce = (reducer, initial) => (items) =>
	items.reduce(reducer, initial);

/**
 * Either monad: Right for success, Left for error
 */
export const Either = {
	Right: (value) => ({
		isRight: true,
		value,
		map: (fn) => Either.Right(fn(value)),
		flatMap: (fn) => fn(value),
		fold: (leftFn, rightFn) => rightFn(value),
		getOrElse: () => value,
	}),

	Left: (error) => ({
		isRight: false,
		error,
		map: () => Either.Left(error),
		flatMap: () => Either.Left(error),
		fold: (leftFn, rightFn) => leftFn(error),
		getOrElse: (defaultValue) => defaultValue,
	}),

	tryCatch: (fn) => {
		try {
			return Either.Right(fn());
		} catch (e) {
			return Either.Left(e);
		}
	},
};

/**
 * Option monad: Some for value, None for missing
 */
export const Option = {
	Some: (value) => ({
		isSome: true,
		value,
		map: (fn) => Option.Some(fn(value)),
		flatMap: (fn) => fn(value),
		fold: (noneFn, someFn) => someFn(value),
		getOrElse: () => value,
	}),

	None: {
		isSome: false,
		value: null,
		map: () => Option.None,
		flatMap: () => Option.None,
		fold: (noneFn, someFn) => noneFn(),
		getOrElse: (defaultValue) => defaultValue,
	},

	fromValue: (value) =>
		value == null ? Option.None : Option.Some(value),

	sequence: (options) =>
		options.reduce(
			(acc, opt) => acc.flatMap((list) =>
				opt.map((val) => [...list, val])
			),
			Option.Some([])
		),
};

/**
 * Curry functor: Convert function to curried form
 * @param {Function} fn - Function to curry
 * @returns {Function} Curried version
 */
export const curry = (fn) => {
	const arity = fn.length;
	return function curried(...args) {
		if (args.length >= arity) {
			return fn(...args);
		}
		return (...nextArgs) => curried(...args, ...nextArgs);
	};
};

/**
 * Partial application: Pre-fill arguments
 * @param {Function} fn - Function to partially apply
 * @param {...*} args - Arguments to pre-fill
 * @returns {Function} Partially applied function
 */
export const partial = (fn, ...args) => (...nextArgs) =>
	fn(...args, ...nextArgs);

/**
 * Memoization: Cache function results by argument
 * @param {Function} fn - Function to memoize
 * @returns {Function} Memoized version
 */
export const memoize = (fn) => {
	const cache = new Map();
	return (...args) => {
		const key = JSON.stringify(args);
		if (cache.has(key)) {
			return cache.get(key);
		}
		const result = fn(...args);
		cache.set(key, result);
		return result;
	};
};

/**
 * Async composition: Handle Promise chains
 * @param {...Function} fns - Async/sync functions
 * @returns {Function} Async composed function
 */
export const asyncPipe = (...fns) => async (x) => {
	let result = x;
	for (const fn of fns) {
		result = await fn(result);
	}
	return result;
};

/**
 * Async map: Transform async value
 * @param {Function} fn - Transformation
 * @param {Promise} promise - Async value
 * @returns {Promise} Transformed promise
 */
export const asyncMap = (fn) => (promise) =>
	promise.then(fn);

/**
 * Retry functor: Retry failed operations
 * @param {number} maxRetries - Max retry count
 * @param {number} delayMs - Delay between retries
 * @param {Function} fn - Function to retry
 * @returns {Promise} Result or final error
 */
export const retry = async (maxRetries, delayMs, fn) => {
	let lastError;
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await fn();
		} catch (e) {
			lastError = e;
			if (i < maxRetries - 1) {
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}
	}
	throw lastError;
};

/**
 * Parse JSON safely
 * @param {string} json - JSON string
 * @returns {Either} Right(parsed) or Left(error)
 */
export const parseJSON = (json) =>
	Either.tryCatch(() => JSON.parse(json));

/**
 * Stringify safely
 * @param {*} value - Value to stringify
 * @returns {Either} Right(string) or Left(error)
 */
export const stringifyJSON = (value) =>
	Either.tryCatch(() => JSON.stringify(value));

/**
 * Deep freeze object (immutability)
 * @param {Object} obj - Object to freeze
 * @returns {Object} Frozen object
 */
export const deepFreeze = (obj) => {
	Object.freeze(obj);
	Object.values(obj).forEach((val) => {
		if (typeof val === 'object' && val !== null) {
			deepFreeze(val);
		}
	});
	return obj;
};

/**
 * Validator functor: Compose validation rules
 */
export const Validator = {
	isString: (value) =>
		typeof value === 'string'
			? Either.Right(value)
			: Either.Left('Expected string'),

	isNotEmpty: (value) =>
		value && value.length > 0
			? Either.Right(value)
			: Either.Left('Expected non-empty value'),

	isJSON: (value) =>
		Either.tryCatch(() => JSON.parse(value)),

	matches: (regex) => (value) =>
		regex.test(value)
			? Either.Right(value)
			: Either.Left(`Value does not match pattern: ${regex}`),

	minLength: (min) => (value) =>
		value.length >= min
			? Either.Right(value)
			: Either.Left(`Expected minimum length of ${min}`),

	maxLength: (max) => (value) =>
		value.length <= max
			? Either.Right(value)
			: Either.Left(`Expected maximum length of ${max}`),

	compose: (...validators) => (value) => {
		let result = Either.Right(value);
		for (const validator of validators) {
			result = result.flatMap(validator);
			if (!result.isRight) break;
		}
		return result;
	},
};

/**
 * Builder pattern functor
 */
export const Builder = {
	create: (initial = {}) => {
		const state = { ...initial };
		return {
			set: (key, value) => {
				state[key] = value;
				return Builder.create(state);
			},
			setAll: (obj) => Builder.create({ ...state, ...obj }),
			get: (key) => state[key],
			build: () => ({ ...state }),
			clone: () => Builder.create(state),
		};
	},
};

/**
 * Lens functor: Functional getter/setter
 */
export const Lens = {
	create: (getter, setter) => ({
		get: getter,
		set: setter,
		map: (fn, obj) => setter(obj, fn(getter(obj))),
		compose: (otherLens) => ({
			get: (obj) => otherLens.get(getter(obj)),
			set: (obj, value) =>
				setter(obj, otherLens.set(getter(obj), value)),
		}),
	}),

	prop: (key) =>
		Lens.create(
			(obj) => obj[key],
			(obj, value) => ({ ...obj, [key]: value })
		),
};

/**
 * Tap functor: Inspect value without modification (debugging)
 * @param {Function} fn - Side effect function
 * @returns {Function} Pass-through function
 */
export const tap = (fn) => (value) => {
	fn(value);
	return value;
};

/**
 * Once functor: Execute function only once
 * @param {Function} fn - Function to execute once
 * @returns {Function} One-time executor
 */
export const once = (fn) => {
	let called = false;
	let result;
	return (...args) => {
		if (!called) {
			called = true;
			result = fn(...args);
		}
		return result;
	};
};

/**
 * Debounce functor: Delay execution
 * @param {number} delayMs - Delay in milliseconds
 * @param {Function} fn - Function to debounce
 * @returns {Function} Debounced function
 */
export const debounce = (delayMs, fn) => {
	let timeout;
	return (...args) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(...args), delayMs);
	};
};

/**
 * Throttle functor: Limit execution frequency
 * @param {number} intervalMs - Throttle interval
 * @param {Function} fn - Function to throttle
 * @returns {Function} Throttled function
 */
export const throttle = (intervalMs, fn) => {
	let lastCall = 0;
	return (...args) => {
		const now = Date.now();
		if (now - lastCall >= intervalMs) {
			lastCall = now;
			fn(...args);
		}
	};
};

export default {
	identity,
	compose,
	pipe,
	map,
	flatMap,
	filter,
	reduce,
	Either,
	Option,
	curry,
	partial,
	memoize,
	asyncPipe,
	asyncMap,
	retry,
	parseJSON,
	stringifyJSON,
	deepFreeze,
	Validator,
	Builder,
	Lens,
	tap,
	once,
	debounce,
	throttle,
};
