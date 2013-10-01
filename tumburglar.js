var Q  = require('q');
var _  = require('lodash');
var fs = require('fs');
var tumblr = require('tumblr.js');


// TODOs: getNotes for single post, multiple tags/types, add request stagger

function Tumburglar(credentials, options) {
	var blog;
	var requestIncrement = 20;

	// We need API key credentials to make any useful requests
	if (credentials) {
		this.credentials = credentials;
		this.client = tumblr.createClient({
			consumer_key: credentials.consumerKey,
			consumer_secret: credentials.consumerSecret
		});
	}

	this.options = {
		verbose: false
	};

	if (options) this.options = _.extend(this.options, options);

	return this;
}

Tumburglar.prototype = {
	// Load consumer key and consumer secret
	loadCredentials : function(credentials) {
		this.credentials = credentials;
	},

	// Loads Tumburglar with a blog. Loose wrapper
	// around tumblr.js' client.blogInfo, but this
	// also sets up internal variables that are used
	// for future post calls.
	loadBlog : function(blog) {
		blog = blog || this.options.blog;

		var me = this;
		var deferred = Q.defer();

		this.getBlogInfo(blog).done(function(data) {
			var data = me._pluck(data, 'blog');

			me.blog = {
				title: data.title,
				name: data.name,
				url: data.url,
				postCount: data.posts,
				updated: data.updated,
				description: data.description,
				askEnabled: data.ask,
				askAnonEnabled: data.ask_anon,
				nsfw: data.is_nsfw,
				sharesLikes: data.share_likes
			};

			if (me.blog.sharesLikes) me.blog.likeCount = data.likes;
			if (me.options.verbose) me._tumburgLog('Blog info for ' + blog + ' loaded.');
			deferred.resolve(me);
		}, function(err) {
			deferred.reject(new Error(err));
		});

		return deferred.promise;
	},

	getBlogInfo : function(blog) {
		if (blog) {
			var deferred = Q.defer();
			Q.nfcall(this.client.blogInfo.bind(this.client), blog).done(function(data) {
				deferred.resolve(data);
			}, function(err) {
				deferred.reject(new Error(err));
			});
			return deferred.promise;
		} else if (this.blog) {
			return this.blog;
		} else {
			return deferred.reject('No blog loaded or specified to get information from');
		}
	},

	// Get total post count of current client
	getPostCount : function(blog) {
		var me = this;
		if (blog) {
			var deferred = Q.defer();
			this.getBlogInfo(blog).done(function(data) {
				deferred.resolve(me._pluck(data, 'blog').posts);
			}, function(err) {
				deferred.reject(new Error(err));
			});
			return deferred.promise;
		} else if (this.blog) {
			return this.blog.postCount;
		} else {
			return deferred.reject('No blog loaded or specified to get post count from');
		}
	},

	// Returns the URL of a blog--this seems redundant until you
	// realize that they could have a custom domain
	getBlogURL : function(blog) {
		var me = this;
		if (blog) {
			var deferred = Q.defer();
			this.getBlogInfo(blog).done(function(data) {
				deferred.resolve(me._pluck(data, 'blog').url);
			}, function(err) {
				deferred.reject(new Error(err));
			});
			return deferred.promise;
		} else if (this.blog) {
			return this.blog.url;
		} else {
			return deferred.reject('No blog loaded or specified to get URL from');
		}
	},

	// Returns the title of a blog
	getBlogTitle : function(blog) {
		var me = this;
		if (blog) {
			var deferred = Q.defer();
			this.getBlogInfo(blog).done(function(data) {
				deferred.resolve(me._pluck(data, 'blog').title);
			}, function(err) {
				deferred.reject(new Error(err));
			});
			if (callback) callback();
			return deferred.promise;
		} else if (this.blog) {
			return this.blog.title;
		} else {
			return deferred.reject('No blog loaded or specified to get title from');
		}
	},

	// Returns the URL to an avatar at a specified size
	// Allowed values: 16, 24, 30, 40, 48, 64, 96, 128, 512
	getAvatar : function(blog, size) {
		var deferred = Q.defer();
		// No blog specified, size passed instead
		if (typeof blog === 'number') {
			size = blog;

			if (this.blog.name) {
				blog = this._blogNameAPIURL(this.blog.name);
			} else {
				return deferred.reject('No blog loaded or specified to get avatar from'); // TODO: fix error handling here to work with promises or callbacks
			}
		} else if (this.blog) {
			blog = this._blogNameAPIURL(blog || this.blog.name);
		} else {
			return deferred.reject('No blog loaded or specified to get avatar from');
		}

		Q.nfcall(this.client.avatar.bind(this.client), blog, size).done(function(data) {
			deferred.resolve(data);
		}, function(err) {
			deferred.reject(new Error(err));
		});
		return deferred.promise;
	},

	getPosts : function(options) {
		var me = this;
		var promises;
		var postOptions = {
			amount: 0,
			types: null,
			tags: null,
			tagBehavior: 'exclusive',
			id: null,
			offset: 0,
			limit: 20,
			chrono: false,
			reblogInfo: false,
			noteInfo: false
		};

		// These are specific options that can be passed straight
		// to _tumblrGetPostSet without any modification
		var multipleTags = false;
		var multipleTypes = false;

		// Merge user options
		postOptions = _.assign(postOptions, options);

		// If no blog loaded or specified in options, fail
		if ((!this.blog || !this.blog.name) && !postOptions.blog) {
			return Q.reject('No blog loaded or specified to get posts from.');
		}

		if (!postOptions.blog)   postOptions.blog = this.blog.name;

		if (postOptions.types instanceof Array) multipleTypes = true;
		if (postOptions.tags instanceof Array) 	multipleTags = true;

		// Do we have a vanilla query? If so, just return what we asked for
		if (typeof postOptions.amount !== 'undefined' &&
			postOptions.amount <= 20     &&
			postOptions.chrono === false &&
			multipleTypes === false      &&
			multipleTags === false         ) {
			return this._tumblrGetPostSet(postOptions);
		}

		// Begin complex queries

		// If we don't need to deal with multiple tags or multiple types, go into standard calls
		if (!(multipleTags || multipleTypes)) {
			// Set up amount variable
			var amount;
			if (postOptions.tags || postOptions.types) {
				// This is currently janked up due to the Tumblr API...
				// can't juxtapose both of these so we have to do them one at at ime.
				// Tags takes priority.
				if (postOptions.tags) {
					amount = this._queryPostCount({
						blog: postOptions.blog,
						tag: postOptions.tags
					});
				} else if (postOptions.types) {
					amount = this._queryPostCount({
						blog: postOptions.blog,
						type: postOptions.types
					});
				}
				// Start by calculating how many posts we actually need to query to reduce
				// redundant calls
				promises = amount.then(function(postCount) {
					postOptions.amount = postCount;
					return me._simplePostRequest(postOptions);
				});
			} else {
				// If no initial blog was loaded then we don't have a total post count,
				// so 
				if (!postOptions.amount) {
					promises = this._queryPostCount({
						blog: postOptions.blog
					}).then(function(postCount) {
						postOptions.amount = postCount;
						return me._simplePostRequest(postOptions);
					});
				} else {
					// Otherwise, just make the request
					console.log(postOptions);
					promises = this._simplePostRequest(postOptions);	
				}
			}
		} else {
			// TODO: this
		}

		// .uniq(myArray, false, function(el) { return Object.keys(el).sort().join(); })

		return Q.allSettled(promises).spread(function() {
			var sets = Array.prototype.slice.call(arguments, 0);
			var setsLen = sets.length;
			var data = [];

			var len = arguments.length;
			for (var i = 0; i < setsLen; i++) {
				sets[i] = sets[i].value;
				if (postOptions.chrono) sets[i] = me._chronoPosts(sets[i]);
				data = data.concat(sets[i]);
			}

			return data;
		});

	},

	// Used to make an initial call to the Tumblr API to get the number of posts according to tag or type.
	// To get general post count, pass no tag or type.
	_queryPostCount : function(queryOptions) {
		var deferred = Q.defer();

		var options = {
			limit: 1
		};
		options = _.assign(options, queryOptions)

		this.client.posts(this._blogNameAPIURL(options.blog), options, function(err, data) {
			var postCount = data['total_posts'];
			deferred.resolve(postCount);
		});

		return deferred.promise;
	},

	// Standard function that iterates and calls _getSets. This deals with non-custom request implementations (like querying
	// by multiple tags, multiple post types, or both) that simply passes options on to _getSets.
	_simplePostRequest : function(postOptions) {
		var me = this;
		var promises    = [];
		var requestSets = this._calculateRequestSets(postOptions.amount, postOptions.limit);

		if (this.options.verbose) this._tumburgLog('Requesting ' + postOptions.amount + ' posts in ' + requestSets + ' sets... (inaccurate if tag or type specified)');

		// We need to subtract by postOptions.limit once so that we start at the limit above
		// the end of our posts--Tumblr doesn't seek in reverse so we need to compensate
		if (postOptions.chrono) {
			postOptions.offset = postOptions.amount - postOptions.offset - postOptions.limit;
		}

		// TODO: set up for amount ot avoid getting too many posts at the end

		for (var i = 0; i < requestSets; i++) {
			// Set offsets according to chrono
			if (postOptions.chrono) {
				// If we're at the end, set offset to 0 and only get as many posts as are left
				if (postOptions.offset - (postOptions.limit) < 0) {
					postOptions.limit = postOptions.offset; // Set limit to last offset amount
					postOptions.offset = 0;
				} else {
					// Decrement offset if we're past initial request
					if (i > 0) postOptions.offset -= postOptions.limit;
				}
			} else {
				// Not chrono? Just increase offset normally then if we're past initial request
				if (i > 0) postOptions.offset += postOptions.limit;
			}

			var promise = this._getSets(postOptions, i);
			promises.push(promise);
		}

		return promises;

	},

	// Function designed to be called from within a loop; deals with lib functions such as chronoloading posts,
	// dealing with offsets, etc.
	// requestNUmber is only for printing informational data.
	_getSets : function(postOptions, requestNumber) {
		var me = this;

		if (me.options.verbose) this._tumburgLog('Requesting set ' + requestNumber + ' with offset ' + postOptions.offset + '.');

		var tumblrGetOptions = {};
		tumblrGetOptions.blog           = postOptions.blog;
		tumblrGetOptions.offset         = postOptions.offset;
		tumblrGetOptions.limit          = postOptions.limit;
		// If tags and/or types are specified, then when this method gets called they will only
		// be singles--this method does not deal with higher-level set call organization
		postOptions.tags ? tumblrGetOptions.tag  = postOptions.tags  : delete tumblrGetOptions.tags;
		postOptions.types ? tumblrGetOptions.tag = postOptions.types : delete tumblrGetOptions.types;
		tumblrGetOptions['notes_info']  = postOptions.noteInfo;
		tumblrGetOptions['reblog_info'] = postOptions.reblogInfo;
		if (postOptions.id) tumblrGetOptions.id = postOptions.id;
		if (typeof postOptions.types === 'string') tumblrGetOptions.type = postOptions.types;

		var promise = this._tumblrGetPostSet(tumblrGetOptions)
		.then(function(data) {
			if (me.options.verbose) me._tumburgLog('Post data set ' + (requestNumber + 1) + ' received.');
			return Q(data);
		});

		return promise;
	},

	// Low-level promise wrapper for tumblr.js's getPosts
	_tumblrGetPostSet : function(options) {
		var me = this;
		var deferred = Q.defer();

		this.client.posts(this._blogNameAPIURL(options.blog), options, function(err, data) {
			var posts = me._pluck(data, 'posts');
			deferred.resolve(posts);
		});

		return deferred.promise;
	},

	// Get number of requests required to get all posts
	_calculateRequestSets : function(amount, limit) {
		return Math.ceil(
			// If 0, default to postCount
			(amount || this.blog.postCount) /
			limit
		);
	},

	// Sorts a multi-set post object into chronological order. Tumblr ALWAYS returns posts
	// in reverse chronological order so we can safely reverse the entire array of posts
	_chronoPosts : function(postArray) {
		return postArray.reverse();
	},

	// Turns a blogname into a hostname
	_blogNameAPIURL : function(string) {
		return string + '.tumblr.com';
	},

	// Just logs a string with [Tumburglar] in front.
	_tumburgLog : function(string) {
		console.log('[Tumburglar] ' + string);
	},

	// Recursively searches an object and returns the first instance of a found property
	_pluck: function(object, property) {
		if (object.hasOwnProperty(property)) {
			return object[property];
		} else {
			for (var i in object) {
				if ((object[i] != null) && (typeof object[i] === 'object')) {
					return this._pluck(object[i], property);
				}
			}
			return false;
		}
	}
};

module.exports = Tumburglar;