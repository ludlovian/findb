#!/usr/bin/env node
import http, { STATUS_CODES } from 'http';
import * as qs from 'querystring';
import { format } from 'util';
import { homedir } from 'os';
import { basename, resolve, join as join$1 } from 'path';
import { symlink, readFile, open as open$3, rename, appendFile } from 'fs/promises';
import { unlinkSync } from 'fs';
import { createHash } from 'crypto';

function toArr(any) {
	return any == null ? [] : Array.isArray(any) ? any : [any];
}

function toVal(out, key, val, opts) {
	var x, old=out[key], nxt=(
		!!~opts.string.indexOf(key) ? (val == null || val === true ? '' : String(val))
		: typeof val === 'boolean' ? val
		: !!~opts.boolean.indexOf(key) ? (val === 'false' ? false : val === 'true' || (out._.push((x = +val,x * 0 === 0) ? x : val),!!val))
		: (x = +val,x * 0 === 0) ? x : val
	);
	out[key] = old == null ? nxt : (Array.isArray(old) ? old.concat(nxt) : [old, nxt]);
}

function mri (args, opts) {
	args = args || [];
	opts = opts || {};

	var k, arr, arg, name, val, out={ _:[] };
	var i=0, j=0, idx=0, len=args.length;

	const alibi = opts.alias !== void 0;
	const strict = opts.unknown !== void 0;
	const defaults = opts.default !== void 0;

	opts.alias = opts.alias || {};
	opts.string = toArr(opts.string);
	opts.boolean = toArr(opts.boolean);

	if (alibi) {
		for (k in opts.alias) {
			arr = opts.alias[k] = toArr(opts.alias[k]);
			for (i=0; i < arr.length; i++) {
				(opts.alias[arr[i]] = arr.concat(k)).splice(i, 1);
			}
		}
	}

	for (i=opts.boolean.length; i-- > 0;) {
		arr = opts.alias[opts.boolean[i]] || [];
		for (j=arr.length; j-- > 0;) opts.boolean.push(arr[j]);
	}

	for (i=opts.string.length; i-- > 0;) {
		arr = opts.alias[opts.string[i]] || [];
		for (j=arr.length; j-- > 0;) opts.string.push(arr[j]);
	}

	if (defaults) {
		for (k in opts.default) {
			name = typeof opts.default[k];
			arr = opts.alias[k] = opts.alias[k] || [];
			if (opts[name] !== void 0) {
				opts[name].push(k);
				for (i=0; i < arr.length; i++) {
					opts[name].push(arr[i]);
				}
			}
		}
	}

	const keys = strict ? Object.keys(opts.alias) : [];

	for (i=0; i < len; i++) {
		arg = args[i];

		if (arg === '--') {
			out._ = out._.concat(args.slice(++i));
			break;
		}

		for (j=0; j < arg.length; j++) {
			if (arg.charCodeAt(j) !== 45) break; // "-"
		}

		if (j === 0) {
			out._.push(arg);
		} else if (arg.substring(j, j + 3) === 'no-') {
			name = arg.substring(j + 3);
			if (strict && !~keys.indexOf(name)) {
				return opts.unknown(arg);
			}
			out[name] = false;
		} else {
			for (idx=j+1; idx < arg.length; idx++) {
				if (arg.charCodeAt(idx) === 61) break; // "="
			}

			name = arg.substring(j, idx);
			val = arg.substring(++idx) || (i+1 === len || (''+args[i+1]).charCodeAt(0) === 45 || args[++i]);
			arr = (j === 2 ? [name] : name);

			for (idx=0; idx < arr.length; idx++) {
				name = arr[idx];
				if (strict && !~keys.indexOf(name)) return opts.unknown('-'.repeat(j) + name);
				toVal(out, name, (idx + 1 < arr.length) || val, opts);
			}
		}
	}

	if (defaults) {
		for (k in opts.default) {
			if (out[k] === void 0) {
				out[k] = opts.default[k];
			}
		}
	}

	if (alibi) {
		for (k in out) {
			arr = opts.alias[k] || [];
			while (arr.length > 0) {
				out[arr.shift()] = out[k];
			}
		}
	}

	return out;
}

var RGX = /^(-?(?:\d+)?\.?\d+) *(m(?:illiseconds?|s(?:ecs?)?))?(s(?:ec(?:onds?|s)?)?)?(m(?:in(?:utes?|s)?)?)?(h(?:ours?|rs?)?)?(d(?:ays?)?)?(w(?:eeks?|ks?)?)?(y(?:ears?|rs?)?)?$/,
	SEC = 1e3,
	MIN = SEC * 60,
	HOUR = MIN * 60,
	DAY = HOUR * 24,
	YEAR = DAY * 365.25;

function parse$4(val) {
	var num, arr = val.toLowerCase().match(RGX);
	if (arr != null && (num = parseFloat(arr[1]))) {
		if (arr[3] != null) return num * SEC;
		if (arr[4] != null) return num * MIN;
		if (arr[5] != null) return num * HOUR;
		if (arr[6] != null) return num * DAY;
		if (arr[7] != null) return num * DAY * 7;
		if (arr[8] != null) return num * YEAR;
		return num;
	}
}

function parse$3 (str, loose) {
	if (str instanceof RegExp) return { keys:false, pattern:str };
	var c, o, tmp, ext, keys=[], pattern='', arr = str.split('/');
	arr[0] || arr.shift();

	while (tmp = arr.shift()) {
		c = tmp[0];
		if (c === '*') {
			keys.push('wild');
			pattern += '/(.*)';
		} else if (c === ':') {
			o = tmp.indexOf('?', 1);
			ext = tmp.indexOf('.', 1);
			keys.push( tmp.substring(1, !!~o ? o : !!~ext ? ext : tmp.length) );
			pattern += !!~o && !~ext ? '(?:/([^/]+?))?' : '/([^/]+?)';
			if (!!~ext) pattern += (!!~o ? '?' : '') + '\\' + tmp.substring(ext);
		} else {
			pattern += '/' + tmp;
		}
	}

	return {
		keys: keys,
		pattern: new RegExp('^' + pattern + (loose ? '(?=$|\/)' : '\/?$'), 'i')
	};
}

class Trouter {
	constructor() {
		this.routes = [];

		this.all = this.add.bind(this, '');
		this.get = this.add.bind(this, 'GET');
		this.head = this.add.bind(this, 'HEAD');
		this.patch = this.add.bind(this, 'PATCH');
		this.options = this.add.bind(this, 'OPTIONS');
		this.connect = this.add.bind(this, 'CONNECT');
		this.delete = this.add.bind(this, 'DELETE');
		this.trace = this.add.bind(this, 'TRACE');
		this.post = this.add.bind(this, 'POST');
		this.put = this.add.bind(this, 'PUT');
	}

	use(route, ...fns) {
		let handlers = [].concat.apply([], fns);
		let { keys, pattern } = parse$3(route, true);
		this.routes.push({ keys, pattern, method:'', handlers });
		return this;
	}

	add(method, route, ...fns) {
		let { keys, pattern } = parse$3(route);
		let handlers = [].concat.apply([], fns);
		this.routes.push({ keys, pattern, method, handlers });
		return this;
	}

	find(method, url) {
		let isHEAD=(method === 'HEAD');
		let i=0, j=0, k, tmp, arr=this.routes;
		let matches=[], params={}, handlers=[];
		for (; i < arr.length; i++) {
			tmp = arr[i];
			if (tmp.method.length === 0 || tmp.method === method || isHEAD && tmp.method === 'GET') {
				if (tmp.keys === false) {
					matches = tmp.pattern.exec(url);
					if (matches === null) continue;
					if (matches.groups !== void 0) for (k in matches.groups) params[k]=matches.groups[k];
					tmp.handlers.length > 1 ? (handlers=handlers.concat(tmp.handlers)) : handlers.push(tmp.handlers[0]);
				} else if (tmp.keys.length > 0) {
					matches = tmp.pattern.exec(url);
					if (matches === null) continue;
					for (j=0; j < tmp.keys.length;) params[tmp.keys[j]]=matches[++j];
					tmp.handlers.length > 1 ? (handlers=handlers.concat(tmp.handlers)) : handlers.push(tmp.handlers[0]);
				} else if (tmp.pattern.test(url)) {
					tmp.handlers.length > 1 ? (handlers=handlers.concat(tmp.handlers)) : handlers.push(tmp.handlers[0]);
				}
			} // else not a match
		}

		return { params, handlers };
	}
}

/**
 * @typedef ParsedURL
 * @type {import('.').ParsedURL}
 */

/**
 * @typedef Request
 * @property {string} url
 * @property {boolean} _decoded
 * @property {ParsedURL} _parsedUrl
 */

/**
 * @param {Request} req
 * @param {boolean} [toDecode]
 * @returns {ParsedURL|void}
 */
function parse$2(req, toDecode) {
	let raw = req.url;
	if (raw == null) return;

	let prev = req._parsedUrl;
	if (prev && prev.raw === raw) return prev;

	let pathname=raw, search='', query;

	if (raw.length > 1) {
		let idx = raw.indexOf('?', 1);

		if (idx !== -1) {
			search = raw.substring(idx);
			pathname = raw.substring(0, idx);
			if (search.length > 1) {
				query = qs.parse(search.substring(1));
			}
		}

		if (!!toDecode && !req._decoded) {
			req._decoded = true;
			if (pathname.indexOf('%') !== -1) {
				try { pathname = decodeURIComponent(pathname); }
				catch (e) { /* URI malformed */ }
			}
		}
	}

	return req._parsedUrl = { pathname, search, query, raw };
}

function onError(err, req, res) {
	let code = (res.statusCode = err.code || err.status || 500);
	if (typeof err === 'string' || Buffer.isBuffer(err)) res.end(err);
	else res.end(err.message || http.STATUS_CODES[code]);
}

const mount = fn => fn instanceof Polka ? fn.attach : fn;

class Polka extends Trouter {
	constructor(opts={}) {
		super();
		this.parse = parse$2;
		this.server = opts.server;
		this.handler = this.handler.bind(this);
		this.onError = opts.onError || onError; // catch-all handler
		this.onNoMatch = opts.onNoMatch || this.onError.bind(null, { code:404 });
		this.attach = (req, res) => setImmediate(this.handler, req, res);
	}

	use(base, ...fns) {
		if (base === '/') {
			super.use(base, fns.map(mount));
		} else if (typeof base === 'function' || base instanceof Polka) {
			super.use('/', [base, ...fns].map(mount));
		} else {
			super.use(base,
				(req, _, next) => {
					if (typeof base === 'string') {
						let len = base.length;
						base.startsWith('/') || len++;
						req.url = req.url.substring(len) || '/';
						req.path = req.path.substring(len) || '/';
					} else {
						req.url = req.url.replace(base, '') || '/';
						req.path = req.path.replace(base, '') || '/';
					}
					if (req.url.charAt(0) !== '/') {
						req.url = '/' + req.url;
					}
					next();
				},
				fns.map(mount),
				(req, _, next) => {
					req.path = req._parsedUrl.pathname;
					req.url = req.path + req._parsedUrl.search;
					next();
				}
			);
		}
		return this; // chainable
	}

	listen() {
		(this.server = this.server || http.createServer()).on('request', this.attach);
		this.server.listen.apply(this.server, arguments);
		return this;
	}

	handler(req, res, next) {
		let info = this.parse(req, true);
		let obj = this.find(req.method, req.path=info.pathname);

		req.params = obj.params;
		req.originalUrl = req.originalUrl || req.url;
		req.url = info.pathname + info.search;
		req.query = info.query || {};
		req.search = info.search;

		let i=0, arr=obj.handlers.concat(this.onNoMatch), len=arr.length;
		let loop = async () => res.finished || (i < len) && arr[i++](req, res, next);
		(next = next || (err => err ? this.onError(err, req, res, next) : loop().catch(next)))(); // init
	}
}

function polka (opts) {
	return new Polka(opts);
}

const allColours = (
  '20,21,26,27,32,33,38,39,40,41,42,43,44,45,56,57,62,63,68,69,74,75,76,' +
  '77,78,79,80,81,92,93,98,99,112,113,128,129,134,135,148,149,160,161,' +
  '162,163,164,165,166,167,168,169,170,171,172,173,178,179,184,185,196,' +
  '197,198,199,200,201,202,203,204,205,206,207,208,209,214,215,220,221'
)
  .split(',')
  .map(x => parseInt(x, 10));

const painters = [];

function makePainter (n) {
  const CSI = '\x1b[';
  const set = CSI + (n < 8 ? n + 30 + ';22' : '38;5;' + n + ';1') + 'm';
  const reset = CSI + '39;22m';
  return s => {
    if (!s.includes(CSI)) return set + s + reset
    return removeExcess(set + s.replaceAll(reset, reset + set) + reset)
  }
}

function painter (n) {
  if (painters[n]) return painters[n]
  painters[n] = makePainter(n);
  return painters[n]
}

// eslint-disable-next-line no-control-regex
const rgxDecolour = /(^|[^\x1b]*)((?:\x1b\[[0-9;]+m)|$)/g;
function truncate (string, max) {
  max -= 2; // leave two chars at end
  if (string.length <= max) return string
  const parts = [];
  let w = 0;
  for (const [, txt, clr] of string.matchAll(rgxDecolour)) {
    parts.push(txt.slice(0, max - w), clr);
    w = Math.min(w + txt.length, max);
  }
  return removeExcess(parts.join(''))
}

// eslint-disable-next-line no-control-regex
const rgxSerialColours = /(?:\x1b\[[0-9;]+m)+(\x1b\[[0-9;]+m)/g;
function removeExcess (string) {
  return string.replaceAll(rgxSerialColours, '$1')
}

function randomColour () {
  const n = Math.floor(Math.random() * allColours.length);
  return allColours[n]
}

const colours = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7
};

const CLEAR_LINE = '\r\x1b[0K';

const state = {
  dirty: false,
  width: process.stdout && process.stdout.columns,
  /* c8 ignore next */
  level: process.env.LOGLEVEL ? parseInt(process.env.LOGLEVEL, 10) : undefined,
  write: process.stdout.write.bind(process.stdout)
};

process.stdout &&
  process.stdout.on('resize', () => (state.width = process.stdout.columns));

function _log (
  args,
  { newline = true, limitWidth, prefix = '', level, colour }
) {
  if (level && (!state.level || state.level < level)) return
  const msg = format(...args);
  let string = prefix + msg;
  if (colour != null) string = painter(colour)(string);
  if (limitWidth) string = truncate(string, state.width);
  if (newline) string = string + '\n';
  if (state.dirty) string = CLEAR_LINE + string;
  state.dirty = !newline && !!msg;
  state.write(string);
}

function makeLogger (base, changes = {}) {
  const baseOptions = base ? base._preset : {};
  const options = {
    ...baseOptions,
    ...changes,
    prefix: (baseOptions.prefix || '') + (changes.prefix || '')
  };
  const configurable = true;
  const fn = (...args) => _log(args, options);
  const addLevel = level => makeLogger(fn, { level });
  const addColour = c =>
    makeLogger(fn, { colour: c in colours ? colours[c] : randomColour() });
  const addPrefix = prefix => makeLogger(fn, { prefix });
  const status = () => makeLogger(fn, { newline: false, limitWidth: true });

  const colourFuncs = Object.fromEntries(
    Object.entries(colours).map(([name, n]) => [
      name,
      { value: painter(n), configurable }
    ])
  );

  return Object.defineProperties(fn, {
    _preset: { value: options, configurable },
    _state: { value: state, configurable },
    name: { value: 'log', configurable },
    level: { value: addLevel, configurable },
    colour: { value: addColour, configurable },
    prefix: { value: addPrefix, configurable },
    status: { get: status, configurable },
    ...colourFuncs
  })
}

const log = makeLogger();

function sortBy (name, desc) {
  const fn = typeof name === 'function' ? name : x => x[name];
  const parent = typeof this === 'function' ? this : null;
  const direction = desc ? -1 : 1;
  sortFunc.thenBy = sortBy;
  return sortFunc

  function sortFunc (a, b) {
    return (parent && parent(a, b)) || direction * compare(a, b, fn)
  }

  function compare (a, b, fn) {
    const va = fn(a);
    const vb = fn(b);
    return va < vb ? -1 : va > vb ? 1 : 0
  }
}

class Table$2 {
  constructor ({ onsave, main, factory } = {}) {
    this._data = new Set();
    this._changed = new Set();
    this._deleted = new Set();
    this._ix = {};
    if (onsave) this.onsave = onsave;
    if (factory) this.factory = factory;
    if (main) this.addUniqueIndex('main', main);
  }

  load (source) {
    this._data.clear();
    this._changed.clear();
    this._deleted.clear();
    for (const k in this._ix) this._ix[k].clear();
    for (const row of source) {
      this._data.add(row);
      for (const k in this._ix) this._ix[k].add(row);
    }
  }

  addIndex (k, fn) {
    const ix = (this._ix[k] = new Index$1(fn));
    for (const row of this._data) ix.add(row);
  }

  addUniqueIndex (k, fn) {
    const ix = (this._ix[k] = new UniqueIndex$1(fn));
    for (const row of this._data) ix.add(row);
  }

  get (data, k = 'main') {
    const ix = this._ix[k];
    if (!ix) throw new Error('No such index: ' + k)
    return ix.get(data)
  }

  upsert (data) {
    if (data[Symbol.iterator]) {
      return [...data].map(d => this.upsert(d))
    }

    let row = this._ix.main && this._ix.main.get(data);

    if (row) {
      for (const k in this._ix) this._ix[k].delete(row);
    } else {
      const Factory = this.factory || Object;
      row = new Factory();
      this._data.add(row);
    }
    Object.assign(row, data);
    for (const k in this._ix) this._ix[k].add(row);
    this._changed.add(row);
    return row
  }

  delete (data) {
    if (data[Symbol.iterator]) {
      return [...data].map(d => this.delete(d))
    }

    if (this._ix.main) {
      const row = this._ix.main.get(data);
      if (row) {
        for (const k in this._ix) this._ix[k].delete(row);
        this._data.delete(row);
        this._changed.delete(row);
        this._deleted.add(row);
        return row
      }
    }
  }

  save () {
    const changed = new Set(this._changed);
    const deleted = new Set(this._deleted);
    this._changed.clear();
    this._deleted.clear();
    if (this.onsave) return this.onsave(changed, deleted)
  }

  all () {
    return this._data.values()
  }
}

class Index$1 {
  constructor (fn) {
    this.fn = fn;
    this.map = new Map();
  }

  clear () {
    this.map.clear();
  }

  add (row) {
    const key = this.fn(row);
    const entry = this.map.get(key);
    if (entry) entry.add(row);
    else this.map.set(key, new Set([row]));
  }

  delete (row) {
    const key = this.fn(row);
    const entry = this.map.get(key);
    entry.delete(row);
    if (!entry.size) this.map.delete(key);
  }

  get (data) {
    const key = this.fn(data);
    return this.map.get(key) || new Set()
  }
}

class UniqueIndex$1 extends Index$1 {
  add (row) {
    const key = this.fn(row);
    if (this.map.has(key)) throw new KeyViolation$1(row)
    this.map.set(key, row);
  }

  delete (row) {
    const key = this.fn(row);
    this.map.delete(key);
  }

  get (data) {
    const key = this.fn(data);
    return this.map.get(key)
  }
}

class KeyViolation$1 extends Error {
  constructor (row) {
    super('Key violation');
    this.row = row;
    this.name = this.constructor.name;
  }
}

Table$2.KeyViolation = KeyViolation$1;

function once (fn) {
  function f (...args) {
    if (f.called) return f.value
    f.value = fn(...args);
    f.called = true;
    return f.value
  }

  if (fn.name) {
    Object.defineProperty(f, 'name', { value: fn.name, configurable: true });
  }

  return f
}

function arrify (x) {
  return Array.isArray(x) ? x : [x]
}

function clone (o) {
  if (!o || typeof o !== 'object') return o
  if (o instanceof Date) return new Date(o)
  if (Array.isArray(o)) return o.map(clone)
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clone(v)]))
}

const has = Object.prototype.hasOwnProperty;

function equal (a, b) {
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a.constructor !== b.constructor
  ) {
    return a === b
  }
  if (a instanceof Date) return +a === +b
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!equal(a[i], b[i])) return false
    }
    return true
  }
  for (const k of Object.keys(a)) {
    if (!has.call(b, k) || !equal(a[k], b[k])) return false
  }
  return Object.keys(a).length === Object.keys(b).length
}

const kNext$1 = Symbol('next');
const kChain$1 = Symbol('chain');

class Chain {
  constructor (hooks = {}) {
    this.tail = new Link(this, {});
    Object.assign(this, hooks);
  }

  add (data, end) {
    const newLink = new Link(this, data);
    if (end) newLink[kNext$1] = newLink;
    this.tail[kNext$1] = newLink;
    return (this.tail = newLink)
  }

  atEnd () {}
}

class Link {
  constructor (chain, data) {
    Object.defineProperties(this, {
      [kChain$1]: { value: chain, configurable: true },
      [kNext$1]: { configurable: true, writable: true }
    });
    return Object.assign(this, data)
  }

  next () {
    return this[kNext$1] ? this[kNext$1] : (this[kNext$1] = this[kChain$1].atEnd())
  }
}

function Pipe () {
  const chain = new Chain({
    atEnd: () => new Promise(resolve => (chain.tail.resolve = resolve))
  });
  let curr = chain.tail;
  return [
    { [Symbol.asyncIterator]: () => ({ next }) },
    {
      write: value => write({ value }),
      close: _ => write({ done: true }),
      throw: error => write({ error })
    }
  ]

  function write (item) {
    const prev = chain.tail;
    if (prev.done) return
    item = chain.add(item, item.done);
    if (prev.resolve) prev.resolve(item);
  }

  async function next () {
    const { value, done, error } = (curr = await curr.next());
    if (error) {
      curr = chain.add({ done: true }, true);
      throw error
    }
    return { value, done }
  }
}

const AITER = Symbol.asyncIterator;
const SITER = Symbol.iterator;
/* c8 ignore next */
const EMPTY = () => {};
const kIter = Symbol('iterator');
const kChain = Symbol('chain');
const kRead = Symbol('read');
const kNext = Symbol('next');

class Teme {
  static fromIterable (iterable) {
    return Teme.fromIterator(iterable[AITER]())
  }

  static fromIterator (iter) {
    const t = new Teme();
    return Object.defineProperties(t, {
      [kNext]: { value: () => iter.next(), configurable: true },
      [AITER]: { value: () => t[kIter](), configurable: true }
    })
  }

  constructor () {
    const chain = new Chain({ atEnd: () => this[kRead]() });
    Object.defineProperty(this, kChain, { value: chain, configurable: true });
  }

  [kIter] () {
    let curr = this[kChain].tail;
    return { next: async () => (curr = await curr.next()) }
  }

  async [kRead] () {
    const chain = this[kChain];
    try {
      const item = await this[kNext]();
      return chain.add(item, !!item.done)
    } catch (error) {
      chain.add({ done: true }, true);
      throw error
    }
  }

  get current () {
    const { value, done } = this[kChain].tail;
    return { value, done }
  }

  get isSync () {
    return false
  }

  get isAsync () {
    return !this.isSync
  }

  toAsync () {
    return this
  }

  copy () {
    return Teme.fromIterator(this[AITER]())
  }

  map (fn, ctx) {
    const it = this[AITER]();
    return Teme.fromIterator({
      async next () {
        const { value, done } = await it.next();
        if (done) return { done }
        return { value: await fn(value, ctx) }
      }
    })
  }

  filter (fn) {
    const it = this[AITER]();
    return Teme.fromIterator({
      async next () {
        while (true) {
          const { value, done } = await it.next();
          if (done) return { done }
          if (await fn(value)) return { value }
        }
      }
    })
  }

  async collect () {
    const arr = [];
    for await (const v of this) arr.push(v);
    return arr
  }

  sort (fn) {
    let it;
    const c = this.copy();
    return Teme.fromIterator({
      async next () {
        if (!it) {
          const arr = await c.collect();
          it = arr.sort(fn)[SITER]();
        }
        return it.next()
      }
    })
  }

  each (fn, ctx) {
    return this.map(async v => {
      await fn(v, ctx);
      return v
    })
  }

  scan (fn, accum) {
    return this.map(async v => {
      accum = await fn(accum, v);
      return accum
    })
  }

  group (fn) {
    const it = this[AITER]();
    let tgt = EMPTY;
    let key = EMPTY;
    let item = {};

    return Teme.fromIterator({ next })

    async function next () {
      if (item.done) return item
      while (equal(key, tgt)) {
        item = await it.next();
        if (item.done) return item
        key = fn(item.value);
      }
      tgt = key;
      const grouper = Teme.fromIterator({ next: gnext });
      const value = [key, grouper];
      return { value }
    }

    async function gnext () {
      if (!equal(key, tgt)) return { done: true }
      const _item = item;
      item = await it.next();
      key = item.done ? EMPTY : fn(item.value);
      return _item
    }
  }

  batch (size) {
    let n = 0;
    const addCtx = value => ({ value, seq: Math.floor(n++ / size) });
    const remCtx = ({ value }) => value;
    const seqKey = ({ seq }) => seq;
    const pullGroup = ([, group]) => group.map(remCtx);
    return this.map(addCtx)
      .group(seqKey)
      .map(pullGroup)
  }

  dedupe (fn = equal) {
    let prev = EMPTY;
    return this.filter(v => {
      if (fn(prev, v)) return false
      prev = v;
      return true
    })
  }

  consume () {
    return this.on(() => undefined)
  }

  async on (fn, ctx) {
    for await (const v of this) {
      await fn(v, ctx);
    }
  }
}

class TemeSync extends Teme {
  static fromIterable (iterable) {
    return TemeSync.fromIterator(iterable[SITER]())
  }

  static fromIterator (iter) {
    const t = new TemeSync();
    return Object.defineProperties(t, {
      [kNext]: { value: () => iter.next(), configurable: true },
      [SITER]: { value: () => t[kIter](), configurable: true }
    })
  }

  [kIter] () {
    let curr = this[kChain].tail;
    return { next: () => (curr = curr.next()) }
  }

  [kRead] () {
    const chain = this[kChain];
    try {
      const item = this[kNext]();
      return chain.add(item, !!item.done)
    } catch (error) {
      chain.add({ done: true }, true);
      throw error
    }
  }

  get isSync () {
    return true
  }

  toAsync () {
    const it = this[SITER]();
    return Teme.fromIterator({
      next: () => Promise.resolve(it.next())
    })
  }

  copy () {
    return TemeSync.fromIterator(this[SITER]())
  }

  map (fn, ctx) {
    const it = this[SITER]();
    return TemeSync.fromIterator({
      next () {
        const { value, done } = it.next();
        if (done) return { done }
        return { value: fn(value, ctx) }
      }
    })
  }

  filter (fn) {
    const it = this[SITER]();
    return TemeSync.fromIterator({
      next () {
        while (true) {
          const { value, done } = it.next();
          if (done) return { done }
          if (fn(value)) return { value }
        }
      }
    })
  }

  collect () {
    return [...this]
  }

  sort (fn) {
    let it;
    const c = this.copy();
    return TemeSync.fromIterator({
      next () {
        if (!it) {
          const arr = c.collect();
          it = arr.sort(fn)[SITER]();
        }
        return it.next()
      }
    })
  }

  each (fn, ctx) {
    return this.map(v => {
      fn(v, ctx);
      return v
    })
  }

  scan (fn, accum) {
    return this.map(v => {
      accum = fn(accum, v);
      return accum
    })
  }

  group (fn) {
    const it = this[SITER]();
    let tgt = EMPTY;
    let key = EMPTY;
    let item = {};

    return TemeSync.fromIterator({ next })

    function next () {
      if (item.done) return item
      while (equal(key, tgt)) {
        item = it.next();
        if (item.done) return item
        key = fn(item.value);
      }
      tgt = key;
      const grouper = TemeSync.fromIterator({ next: gnext });
      const value = [key, grouper];
      return { value }
    }

    function gnext () {
      if (!equal(key, tgt)) return { done: true }
      const _item = item;
      item = it.next();
      key = item.done ? EMPTY : fn(item.value);
      return _item
    }
  }

  on (fn, ctx) {
    for (const v of this) {
      fn(v, ctx);
    }
  }
}

function join (...sources) {
  const iters = sources.map(makeIter);
  const nexts = iters.map(makeNext);

  return Teme.fromIterator({ next })

  async function next () {
    while (true) {
      if (!nexts.some(Boolean)) return { done: true }
      const [item, ix] = await Promise.race(nexts.filter(Boolean));
      const { done, value } = item;
      if (done) {
        nexts[ix] = null;
      } else {
        nexts[ix] = makeNext(iters[ix], ix);
        return { value: [value, ix] }
      }
    }
  }

  function makeIter (src) {
    if (src[AITER]) return src[AITER]()
    const it = src[SITER]();
    return { next: async () => it.next() }
  }

  function makeNext (iter, index) {
    return Promise.resolve(iter.next())
      .then(item => [item, index])
      .catch(err => {
        nexts.splice(0);
        throw Object.assign(err, { index })
      })
  }
}

function teme (s) {
  if (s instanceof Teme) return s
  if (typeof s[SITER] === 'function') return TemeSync.fromIterable(s)
  if (typeof s[AITER] === 'function') return Teme.fromIterable(s)
  throw new Error('Not iterable')
}

teme.join = join;

teme.pipe = function pipe () {
  const [reader, writer] = new Pipe();
  return Object.assign(Teme.fromIterable(reader), writer)
};

teme.isTeme = function isTeme (t) {
  return t instanceof Teme
};

function clean (obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  )
}

const debug = log
  .prefix('googlejs:datastore:')
  .colour()
  .level(5);

const PREV = Symbol('prev');
const KEY = Symbol('key');

class Table$1 {
  constructor (kind) {
    this.kind = kind;
  }

  async * fetch ({ where, order, factory, ...rest } = {}) {
    const datastore = await getDatastoreAPI(rest);
    let query = datastore.createQuery(this.kind);
    if (where && typeof where === 'object') {
      if (!Array.isArray(where)) where = Object.entries(where);
      for (const args of where) {
        query = query.filter(...args);
      }
    }
    if (Array.isArray(order)) {
      for (const args of order) {
        query = query.order(...arrify(args));
      }
    }
    for await (const entity of query.runStream()) {
      yield createRowfromEntity(entity, datastore, factory);
    }
  }

  async select (options) {
    const entities = await teme(this.fetch(options)).collect();
    debug('%d records loaded from %s', entities.length, this.kind);
    return entities
  }

  async upsert (rows) {
    const datastore = await getDatastoreAPI();
    const { kind } = this;
    for (const entities of getEntities(rows, { kind, datastore })) {
      await datastore.upsert(entities);
      debug('%d records upserted to %s', entities.length, this.kind);
    }
  }

  async delete (rows) {
    const datastore = await getDatastoreAPI();
    for (const keys of getKeys(rows)) {
      await datastore.delete(keys);
      debug('%d records deleted from %s', keys.length, this.kind);
    }
  }
}

Table$1.getKey = o => o[KEY];
Table$1.getPrev = o => o[PREV];

function createRowfromEntity (entity, datastore, factory) {
  const Factory = factory || Object;
  const row = new Factory();
  setPrivate(row, { key: entity[datastore.KEY], prev: clone(entity) });
  if (row.deserialize) row.deserialize(clone(entity));
  else Object.assign(row, clone(entity));
  return row
}

function * getEntities (arr, { kind, datastore, size = 400 }) {
  const batch = [];
  for (const row of arrify(arr)) {
    const data = row.serialize ? row.serialize() : clean(row);
    if (row[PREV] && equal(row[PREV], data)) continue
    if (!row[KEY]) setPrivate(row, { key: datastore.key([kind]) });
    const entity = { key: row[KEY], data };
    setPrivate(row, { prev: clone(data) });
    if (batch.push(entity) >= size) yield batch.splice(0);
  }
  if (batch.length) yield batch;
}

function * getKeys (arr, { size = 400 } = {}) {
  const batch = [];
  for (const row of arrify(arr)) {
    if (!row[KEY]) continue
    if (batch.push(row[KEY]) >= size) yield batch.splice(0);
    setPrivate(row, { key: undefined, prev: undefined });
  }
  if (batch.length) yield batch;
}

function setPrivate (row, data) {
  const defs = {};
  if ('prev' in data) {
    defs[PREV] = { value: data.prev, configurable: true };
  }
  if ('key' in data) {
    defs[KEY] = { value: data.key, configurable: true };
  }
  return Object.defineProperties(row, defs)
}

const getDatastoreAPI = once(async function getDatastoreAPI ({
  credentials = 'credentials.json'
} = {}) {
  const { Datastore } = await import('@google-cloud/datastore');
  if (credentials) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentials;
  }

  const datastore = new Datastore();
  return datastore
});

/* c8 ignore start */
function open$2 (name) {
  const table = new Table$1(name);

  return {
    get: () => table.select(),
    upsert: rows => table.upsert(rows),
    delete: rows => table.delete(rows)
  }
}
/* c8 ignore end */

const data = {};

function open$1 (name) {
  const table = data[name] || (data[name] = new Set());
  return {
    get: async () => [...table],
    upsert: async rows => {
      rows.forEach(row => table.add(row));
    },
    delete: async rows => {
      rows.forEach(row => table.delete(row));
    }
  }
}
/* c8 ignore end */

class DatastoreError extends Error {
  constructor (name, message) {
    super(message);
    this.name = name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class DatabaseLocked extends DatastoreError {
  constructor (filename) {
    super('DatabaseLocked', 'Database is locked');
    this.filename = filename;
  }
}

class KeyViolation extends DatastoreError {
  constructor (doc, name) {
    super('KeyViolation', 'Key violation error');
    this.name = name;
    this.record = doc;
  }
}

class NotExists extends DatastoreError {
  constructor (doc) {
    super('NotExists', 'Record does not exist');
    this.record = doc;
  }
}

class NoIndex extends DatastoreError {
  constructor (name) {
    super('NoIndex', 'No such index');
    this.name = name;
  }
}

function Serial () {
  let gate = Promise.resolve();
  return {
    exec (fn) {
      const result = gate.then(() => fn());
      gate = result.then(NOOP, NOOP);
      return result
    }
  }
}

function NOOP () {}

function getId (row, existing) {
  // generate a repeatable for this row, avoiding conflicts with the other rows
  const start = hashString(stringify(row));
  for (let n = 0; n < 1e8; n++) {
    const id = ((start + n) & 0x7fffffff).toString(36);
    if (!existing.has(id)) return id
  }
  /* c8 ignore next */
  throw new Error('Could not generate unique id')
}

function hashString (string) {
  return [...string].reduce(
    (h, ch) => ((h << 5) - h + ch.charCodeAt(0)) & 0xffffffff,
    0
  )
}

function cleanObject (obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  )
}

const SEP = String.fromCharCode(31);

const DATE = '$date';

function stringify (obj) {
  return JSON.stringify(obj, function (k, v) {
    return this[k] instanceof Date ? { [DATE]: this[k].toISOString() } : v
  })
}

function parse$1 (s) {
  return JSON.parse(s, function (k, v) {
    if (k === DATE) return new Date(v)
    if (v && typeof v === 'object' && DATE in v) return v[DATE]
    return v
  })
}

class Index {
  static create (options) {
    if (options.name === 'primary') options.unique = true;
    const Factory = options.unique ? UniqueIndex : Index;
    return new Factory(options)
  }

  constructor (options) {
    const { name, fields, unique } = options;
    Object.assign(this, { name, fields, unique });
    this.function = row => fields.map(k => row[k]).join(SEP);
    this.data = new Map();
  }

  get options () {
    return { name: this.name, fields: this.fields, unique: !!this.unique }
  }

  locate (data) {
    if (typeof data !== 'object' && this.fields.length === 1) {
      return this.data.get(String(data))
    } else {
      return this.data.get(this.function(data))
    }
  }

  find (data) {
    const docs = this.locate(data);
    return docs ? Array.from(docs) : []
  }

  findOne (data) {
    const docs = this.locate(data);
    return docs ? docs.values().next().value : undefined
  }

  addDoc (doc) {
    const key = this.function(doc);
    const docs = this.data.get(key);
    if (docs) docs.add(doc);
    else this.data.set(key, new Set([doc]));
  }

  removeDoc (doc) {
    const key = this.function(doc);
    const docs = this.data.get(key);
    /* c8 ignore next */
    if (!docs) return
    docs.delete(doc);
    if (!docs.size) this.data.delete(key);
  }
}

class UniqueIndex extends Index {
  findOne (data) {
    return this.locate(data)
  }

  find (data) {
    return this.findOne(data)
  }

  addDoc (doc) {
    const key = this.function(doc);
    if (this.data.has(key)) throw new KeyViolation(doc, this.name)
    this.data.set(key, doc);
  }

  removeDoc (doc) {
    const key = this.function(doc);
    if (this.data.get(key) === doc) this.data.delete(key);
  }
}

const lockfiles = new Set();

async function lockFile (filename) {
  const lockfile = filename + '.lock~';
  const target = basename(filename);
  try {
    await symlink(target, lockfile);
    lockfiles.add(lockfile);
  } catch (err) {
    /* c8 ignore next */
    if (err.code !== 'EEXIST') throw err
    throw new DatabaseLocked(filename)
  }
}

function cleanup () {
  lockfiles.forEach(file => {
    try {
      unlinkSync(file);
    } catch {
      // pass
    }
  });
}

/* c8 ignore next 4 */
function cleanAndGo () {
  cleanup();
  setImmediate(() => process.exit(2));
}

process.on('exit', cleanup).on('SIGINT', cleanAndGo);

const ADD_INDEX = '$$addIndex';
const DELETE_INDEX = '$$deleteIndex';
const DELETED = '$$deleted';

class Datastore {
  constructor (filename) {
    this.filename = filename;
    const serial = new Serial();
    this._exec = serial.exec.bind(serial);
    this.loaded = false;
    this.empty();
  }

  // API from Database class - mostly async

  exec (fn) {
    if (this.loaded) return this._exec(fn)
    this.loaded = true;
    return this._exec(async () => {
      await lockFile(this.filename);
      await this.hydrate();
      await this.rewrite();
      return await fn()
    })
  }

  async ensureIndex (options) {
    if (options.field) {
      const { field, ...rest } = options;
      options = { ...rest, fields: [field] };
    }
    const { name, fields } = options;
    const existing = this.indexes[name];
    if (existing && existing.fields.join(SEP) === fields.join(SEP)) return
    const ix = this.addIndex(options);
    await this.append({ [ADD_INDEX]: ix.options });
  }

  async deleteIndex (name) {
    if (name === 'primary') return
    if (!this.indexes[name]) throw new NoIndex(name)
    this.removeIndex(name);
    await this.append([{ [DELETE_INDEX]: name }]);
  }

  find (name, data) {
    if (name === '_id' && !this.indexes._id) name = 'primary';
    if (!this.indexes[name]) throw new NoIndex(name)
    return this.indexes[name].find(data)
  }

  findOne (name, data) {
    if (name === '_id' && !this.indexes._id) name = 'primary';
    if (!this.indexes[name]) throw new NoIndex(name)
    return this.indexes[name].findOne(data)
  }

  allDocs () {
    return [...this.indexes.primary.data.values()]
  }

  async upsert (doc, options) {
    doc = this.addDoc(doc, options);
    await this.append(doc);
    return doc
  }

  async delete (doc) {
    doc = this.removeDoc(doc);
    await this.append(arrify(doc).map(doc => ({ [DELETED]: doc })));
    return doc
  }

  async hydrate () {
    const data = await readFile(this.filename, { encoding: 'utf8', flag: 'a+' });

    this.empty();
    for (const line of data.split(/\n/).filter(Boolean)) {
      const doc = parse$1(line);
      if (ADD_INDEX in doc) {
        this.addIndex(doc[ADD_INDEX]);
      } else if (DELETE_INDEX in doc) {
        this.deleteIndex(doc[DELETE_INDEX]);
      } else if (DELETED in doc) {
        this.removeDoc(doc[DELETED]);
      } else {
        this.addDoc(doc);
      }
    }
  }

  async rewrite ({ sortBy } = {}) {
    const temp = this.filename + '~';
    const docs = this.allDocs();
    if (sortBy && typeof sortBy === 'function') docs.sort(sortBy);
    const lines = Object.values(this.indexes)
      .map(ix => ({ [ADD_INDEX]: ix.options }))
      .concat(docs)
      .map(doc => stringify(doc) + '\n');
    const fh = await open$3(temp, 'w');
    await fh.writeFile(lines.join(''), 'utf8');
    await fh.sync();
    await fh.close();
    await rename(temp, this.filename);
  }

  async append (docs) {
    docs = arrify(docs);
    const lines = docs.map(doc => stringify(doc) + '\n').join('');
    await appendFile(this.filename, lines, 'utf8');
  }

  // Internal methods - mostly sync

  empty () {
    this.indexes = {
      primary: Index.create({ name: 'primary', fields: ['_id'] })
    };
  }

  addIndex (options) {
    if (options.fieldName) {
      options.name = options.fieldName;
      options.fields = [options.fieldName];
    }
    const { name } = options;
    const ix = Index.create(options);
    this.allDocs().forEach(doc => ix.addDoc(doc));
    this.indexes[name] = ix;
    return ix
  }

  removeIndex (name) {
    this.indexes[name] = undefined;
  }

  addDoc (doc, options = {}) {
    if (Array.isArray(doc)) return doc.map(d => this.addDoc(d, options))
    const { mustExist = false, mustNotExist = false } = options;
    const olddoc = this.indexes.primary.findOne(doc);
    if (!olddoc && mustExist) throw new NotExists(doc)
    if (olddoc && mustNotExist) throw new KeyViolation(doc, 'primary')

    if (this.indexes.primary.fields.length === 1) {
      const idField = this.indexes.primary.fields[0];
      if (idField in doc && doc[idField] == null) {
        doc[idField] = getId(doc, this.indexes.primary.data);
      }
    }

    doc = Object.freeze(cleanObject(doc));

    const ixs = Object.values(this.indexes);
    try {
      ixs.forEach(ix => {
        if (olddoc) ix.removeDoc(olddoc);
        ix.addDoc(doc);
      });
      return doc
    } catch (err) {
      // to rollback, we remove the new doc from each index. If there is
      // an old one, then we remove that (just in case) and re-add
      ixs.forEach(ix => {
        ix.removeDoc(doc);
        if (olddoc) {
          ix.removeDoc(olddoc);
          ix.addDoc(olddoc);
        }
      });
      throw err
    }
  }

  removeDoc (doc) {
    if (Array.isArray(doc)) return doc.map(d => this.removeDoc(d))
    const olddoc = this.indexes.primary.findOne(doc);
    if (!olddoc) throw new NotExists(doc)
    const ixs = Object.values(this.indexes);
    ixs.forEach(ix => ix.removeDoc(olddoc));
    return olddoc
  }
}

// Database
//
// The public API of a jsdb database
//
class Database {
  constructor (filename) {
    if (!filename || typeof filename !== 'string') {
      throw new TypeError('Bad filename')
    }
    filename = resolve(join$1(homedir(), '.databases'), filename);
    const ds = new Datastore(filename);
    Object.defineProperties(this, {
      _ds: { value: ds, configurable: true },
      _autoCompaction: { configurable: true, writable: true }
    });
  }

  load () {
    return this.reload()
  }

  reload () {
    return this._ds.exec(() => this._ds.hydrate())
  }

  compact (opts) {
    return this._ds.exec(() => this._ds.rewrite(opts))
  }

  ensureIndex (options) {
    return this._ds.exec(() => this._ds.ensureIndex(options))
  }

  deleteIndex (fieldName) {
    return this._ds.exec(() => this._ds.deleteIndex(fieldName))
  }

  insert (docOrDocs) {
    return this._ds.exec(() =>
      this._ds.upsert(docOrDocs, { mustNotExist: true })
    )
  }

  update (docOrDocs) {
    return this._ds.exec(() => this._ds.upsert(docOrDocs, { mustExist: true }))
  }

  upsert (docOrDocs) {
    return this._ds.exec(() => this._ds.upsert(docOrDocs))
  }

  delete (docOrDocs) {
    return this._ds.exec(() => this._ds.delete(docOrDocs))
  }

  getAll () {
    return this._ds.exec(async () => this._ds.allDocs())
  }

  find (fieldName, value) {
    return this._ds.exec(async () => this._ds.find(fieldName, value))
  }

  findOne (fieldName, value) {
    return this._ds.exec(async () => this._ds.findOne(fieldName, value))
  }

  setAutoCompaction (interval, opts) {
    this.stopAutoCompaction();
    this._autoCompaction = setInterval(() => this.compact(opts), interval);
  }

  stopAutoCompaction () {
    if (!this._autoCompaction) return
    clearInterval(this._autoCompaction);
    this._autoCompaction = undefined;
  }
}

Object.assign(Database, { KeyViolation, NotExists, NoIndex, DatabaseLocked });

let tables;

/* c8 ignore start */
function open (name) {
  if (!tables) makeTables();
  const db = tables[name];
  return {
    get: async () => (await db.getAll()).map(rec => ({ ...rec })),
    upsert: async docs => db.upsert(docs),
    delete: async docs => db.delete(docs),
    onsave: async () => db.compact()
  }
}

function makeTables () {
  const Position = new Database('position.db');
  Position.ensureIndex({
    name: 'primary',
    fields: ['who', 'account', 'ticker']
  });

  const Stock = new Database('stock.db');
  Stock.ensureIndex({ name: 'primary', fields: ['ticker'] });

  const Trade = new Database('trade.db');
  Trade.ensureIndex({
    name: 'primary',
    fields: ['who', 'account', 'ticker', 'seq']
  });

  tables = { Position, Stock, Trade };
}
/* c8 ignore end */

const info$2 = log.prefix('findb:db:').level(2);

function connect (backend) {
  /* c8 ignore next 2 */
  if (backend === 'google') backend = open$2;
  else if (backend === 'jsdb') backend = open;
  else backend = open$1;

  const stocks = new Stocks(backend);
  const positions = new Positions(backend);
  const trades = new Trades(backend);
  const allTables = [stocks, positions, trades];
  const save = () => Promise.all(allTables.map(t => t.save()));
  const load = () => Promise.all(allTables.map(t => t.load()));
  return { stocks, positions, trades, save, load }
}

class Table extends Table$2 {
  constructor (name, store, main) {
    super({ main });
    this.name = name;
    this.store = store(name);
  }

  async load () {
    const rows = await this.store.get();
    if (this.order) rows.sort(this.order);
    info$2('Loaded %d rows from %s', rows.length, this.name);
    super.load(rows);
  }

  async onsave (updated, deleted) {
    updated = [...updated];
    if (updated.length) {
      await this.store.upsert(updated);
      info$2('Upserted %d rows to %s', updated.length, this.name);
    }
    deleted = [...deleted];
    if (deleted.length) {
      await this.store.delete(deleted);
      info$2('Deleted %d rows from %s', deleted.length, this.name);
    }

    /* c8 ignore next */
    if (this.store.onsave) this.store.onsave();
  }
}

class Stocks extends Table {
  constructor (store) {
    super('Stock', store, s => s.ticker);
    this.order = sortBy('ticker');
  }
}

class Positions extends Table {
  constructor (store) {
    super('Position', store, p => `${p.who}_${p.account}_${p.ticker}`);
    this.order = sortBy('who')
      .thenBy('account')
      .thenBy('ticker');
  }
}

class Trades extends Table {
  constructor (store) {
    const main = t => `${t.who}_${t.account}_${t.ticker}_${t.seq}`;
    const pos = t => `${t.who}_${t.account}_${t.ticker}`;
    super('Trade', store, main);
    this.order = sortBy('who')
      .thenBy('account')
      .thenBy('ticker')
      .thenBy('seq');
    this.addIndex('pos', pos);
  }
}

const TYPE = 'Content-Type';
const LENGTH = 'Content-Length';
const OSTREAM = 'application/octet-stream';

function send (res, code=200, data='', headers={}) {
	let k, obj={};
	for (k in headers) {
		obj[k.toLowerCase()] = headers[k];
	}

	let type = obj[TYPE.toLowerCase()] || res.getHeader(TYPE);

	if (!!data && typeof data.pipe === 'function') {
		res.setHeader(TYPE, type || OSTREAM);
		return data.pipe(res);
	}

	if (data instanceof Buffer) {
		type = type || OSTREAM;
	} else if (typeof data === 'object') {
		data = JSON.stringify(data);
		type = type || 'application/json; charset=utf-8';
	} else {
		data = data || STATUS_CODES[code] || String(code);
	}

	obj[TYPE] = type || 'text/plain';
	obj[LENGTH] = Buffer.byteLength(data);
	delete obj[LENGTH.toLowerCase()];
	delete obj[TYPE.toLowerCase()];

	if (obj.etag) {
		let hash = createHash('sha1').update(data).digest('base64').substring(0, 27);
		res.setHeader('ETag', `W/"${obj[LENGTH].toString(16)}-${hash}"`);
		delete obj.etag;
	}

	if (code === 204 || code === 304) {
		res.removeHeader(TYPE);
		res.removeHeader(LENGTH);
		delete obj[LENGTH];
		delete obj[TYPE];
		data = '';
	} else if (res.socket.parser && res.socket.parser.incoming.method === 'HEAD') {
		data = '';
	}

	res.writeHead(code, obj);
	res.end(data);
}

const noop = x => x;

function parse(opts={}) {
	const { type, encoding='utf-8', parser=noop } = opts;
	const limit = opts.limit || 100 * 1024; // 100kb

	return function (req, res, next) {
		if (req._body) return next();
		req.body = req.body || {};

		const head = req.headers;
		const ctype = head['content-type'];
		const clength = parseInt(head['content-length'], 10);

		if (isNaN(clength) && head['transfer-encoding'] == null) return next(); // no body
		if (ctype && !ctype.includes(type)) return next(); // not valid type
		if (clength === 0) return next(); // is empty

		if (encoding) {
			req.setEncoding(encoding);
		}

		let bits = '';
		let length = 0;
		req.on('data', x => {
			length += Buffer.byteLength(x);
			if (length <= limit) {
				bits += x;
			} else {
				let err = new Error('Exceeded "Content-Length" limit');
				err.code = 413;
				next(err);
			}
		}).on('end', () => {
			try {
				req.body = parser(bits);
				req._body = true;
				next();
			} catch (err) {
				err.code = 422;
				err.details = err.message;
				err.message = 'Invalid content';
				next(err);
			}
		}).on('error', next);
	};
}

function json(opts={}) {
	const { limit, parser=JSON.parse } = opts;
	const type = opts.type || 'application/json';
	return parse({ type, parser, limit });
}

const info$1 = log.prefix('findb:app:').level(2);

function makeApp (app) {
  const db = app.db;

  app.use(json({ limit: 1e7 }));
  app.use(logRequest);

  app.get('/stock', getData('stocks'));
  app.get('/stock/active', getActiveStocks);
  app.put('/stock', updateData('stocks'));
  app.delete('/stock', deleteData('stocks'));

  app.get('/position', getData('positions'));
  app.put('/position', updateData('positions'));
  app.delete('/position', deleteData('positions'));

  app.get('/trade', getData('trades'));
  app.put('/trade', updateData('trades'));
  app.delete('/trade', deleteData('trades'));

  function getData (table) {
    return (req, res) => {
      const data = [...db[table].all()];
      res.emit('report', data);
      send(res, 200, data);
    }
  }

  function updateData (table) {
    return (req, res) => {
      const data = req.body;
      db[table].upsert(data);
      app.save();
      send(res, 200);
    }
  }

  function deleteData (table) {
    return (req, res) => {
      const data = req.body;
      db[table].delete(data);
      app.save();
      send(res, 200);
    }
  }

  function getActiveStocks (req, res) {
    const tickers = new Set();
    for (const stock of db.stocks.all()) {
      if (stock.dividend) tickers.add(stock.ticker);
    }
    for (const pos of db.positions.all()) {
      tickers.add(pos.ticker);
    }
    const data = [...db.stocks.all()].filter(s => tickers.has(s.ticker));
    send(res, 200, data);
  }
}

function logRequest (req, res, next) {
  res.once('report', data => {
    let items = '';
    if (data) {
      const n = arrify(data).length;
      items = pluralise(` (${n} items?)`, n);
    }
    info$1('%s %s%s', req.method, req.url, items);
  });

  if (req.method !== 'GET') res.emit('report', req.body);
  next();
}

function pluralise (s, n) {
  return n > 1 ? s.replaceAll('s?', 's') : s.replaceAll('s?', '')
}

const info = log.prefix('findb:main:').level(1);

function main (opts) {
  const { port, backend, saveDelay } = opts;
  const version = '0.2.0';
  info('version %s', version);
  info('started');

  const app = polka();
  const db = connect(backend);
  app.db = db;

  makeApp(app);

  app.start = () =>
    db
      .load()
      .then(() => listen(app, port))
      .then(() => info('listening on port %d', port))
      .catch(bail);
  app.close = () => app.server.close();
  app.save = makeSaver(app.db, saveDelay);

  return app
}

function listen (app, port) {
  return new Promise((resolve, reject) => {
    app.listen(port);
    app.server.on('error', reject).on('listening', resolve);
  })
}

function makeSaver (db, delay) {
  let tm;
  delay = parse$4(delay);

  function save () {
    tm = null;
    info.level(2)('Storing updates');
    db.save().catch(bail);
  }

  function cancel () {
    if (!tm) return
    clearTimeout(tm);
    tm = null;
  }

  function request () {
    cancel();
    tm = setTimeout(save, delay);
  }

  request.cancel = cancel;

  return request
}

/* c8 ignore next 4 */
function bail (err) {
  console.error(err);
  process.exit(2);
}

const version = '0.2.0';
const opts = mri(process.argv.slice(2), {
  alias: {
    saveDelay: 'save-delay',
    port: 'p',
    help: 'h',
    version: 'v'
  },
  default: {
    saveDelay: '1m',
    port: 39705,
    backend: 'google'
  }
});
if (opts.version) {
  console.log('findb %s', version);
} else if (opts.help) {
  console.log(
    '\n  Usage\n\n' +
      '    findb [options]\n\n' +
      '  Options\n' +
      '    -v, --version     Display current version\n' +
      '    -h, --help        Displays this message\n' +
      '    -p, --port        Sets the port (default: 39705)\n' +
      '    --save-delay      Sets the save delay (default: 1m)\n' +
      '    --backend         Sets the backend to use (default google)\n'
  );
} else {
  main(opts).start();
}
