#Tumburglar

Tumburglar is a utility library for Node.js built on top of [tumblr.js](https://github.com/tumblr/tumblr.js) with [q](https://github.com/kriskowal/q) promises meant to make getting large or consecutive amounts of data, primarily posts, from the [Tumblr API](http://www.tumblr.com/docs/en/api/v2) relatively painless. The Tumblr API is pretty restrictive in what you can request (20 posts at a time), so I created Tumburglar to get around the tediousness of making larger queries in an unopinionated, low-level way. It's meant to get the data into your program and let you deal with the rest of it.

v0.0.1 is an early quiet release, but it can do a lot already.

#What can it do?

It can get any data that doesn't require OAuth validation. It doesn't have OAuth access currently as I created it primarily for data mining and analysis of public information on the Tumblr platform. (If you want to contribute, feel free!)

Tumburglar is primarily built to get blog information, avatars, posts, and likes (to come). Its post gathering is the main draw, because it can query posts by all of the [Tumblr API's built-in post request options](http://www.tumblr.com/docs/en/api/v2#posts) but also gather multiple data sets while being able to set parameters like how many posts to get or getting them in chronological order.

(Current todos are to enable inclusive and exclusive multiple tag/post type mining, which will come in the next version.)

#How do I use it?

##Get it

Start by installing it:

    npm install tumburglar

Include it in your program:

    var Tumburglar = require('tumburglar');

Then you instantiate a new instance of Tumburglar with the your API credentials, which are your consumer key and consumer secret you've gotten by [registering your app with Tumblr](http://www.tumblr.com/oauth/apps):

    var consumerKey    = 'yourconsumerkeyhere';
    var consumerSecret = 'yourconsumersecrethere';
    var TB = new Tumburglar({
        consumerKey: consumerKey,
        consumerSecret: consumerSecret
    });

Creating the Tumburglar instance with credentials is synchronous, so you don't have to worry about waiting for it to complete.

##Use it

You're ready to make requests! There are two ways to do this, depending on your preference. You can either load the blog initially, which will return the Tumburglar instance, or you can just make requests to whatever blog you want directly by passing it as an option. Let's load the popular blog **nevver** in and put its blog info into the variable `blogInfo`:

    TB.loadBlog('nevver').then(function(TB) {
            var blogInfo = TB.getBlogInfo();
        }, function(error) {
            // Something went wrong
            console.log(error);
        }).done();

Using promises from [q](https://github.com/kriskowal/q), we've made a request to the Tumblr API for **nevver**'s blog info. `loadBlog()` receives that information and then sets it to the `blog` property of Tumburglar. When a blog has been loaded with `loadBlog()`, `getBlogInfo()` merely returns that `blog` property, which is why we can return it above. If you don't want to keep a blog loaded you can just call `getBlogInfo()` with a parameter:

    TB.getBlogInfo('nevver').then(function(data) {
        var blogInfo = data;
    }, function(error) {
        // :(
        console.log(error);
    });

Note that in this case getBlogInfo returns a deferred object which requires you to use **q**'s `.then` and then handle the data after it returns. Regardless of which way you get the blog info, `blogInfo` will now have:

    {
        title: 'this isn\'t happiness.',
        name: 'nevver',
        url: 'http://thisisnthappiness.com/',
        postCount: 51968,
        updated: 1380586429,
        description: 'this isn\'t happiness.',
        askEnabled: false,
        askAnonEnabled: false,
        nsfw: false,
        sharesLikes: false
    }

You've got data! Let's build on our first `loadBlog()` snippet and get **nevver**'s first 500 posts and write them to a JSON file (error handling omitted for clarity):

    TB.loadBlog('nevver').then(function(TB) {
        return TB.getPosts({
            amount: 500,
            chrono: true
        });
    }).then(function(data) {
        writeJSONFile('nevver', data);
    });

This can take a while, especially if you tried to query *all* of **nevver**'s posts (51,968 at the time of this writing), since Tumblr only allows you to request 20 posts at a time--that's approximately 2600 requests! You *can* do it, but it's up to you to decide whether or not you *should*.

There are other methods that Tumburglar has, such as `getPostCount()`, `getBlogURL()`, `getBlogTitle()`, `getAvatar()` and others, covered in the API.

#Options

You can specify options when you first start Tumburglar:

    var consumerKey    = 'yourconsumerkeyhere';
    var consumerSecret = 'yourconsumersecrethere';
    var TB = new Tumburglar({
        consumerKey: consumerKey,
        consumerSecret: consumerSecret
    }, {
        // options
    });
    
Or manually simply by assigning properties to the `options` property of TB:

    TB.options.verbose = true;

Currently, `verbose` is the only option supported and it will print detailed information of Tumburglar's operations.

#API

All asynchronous methods return a deferred promise that gets resolved or rejected on completion.

##loadCredentials(credentials)

Load your API consumer key and consumer secret with an object with the `consumerKey` and `consumerSecret` properties:

    {
        consumerKey: 'key',
        consumerSecret: 'secrethere'
    }

##loadBlog(blog)

Async call to load a blog's info into Tumburglar's `blog` property, allowing you to omit the blog name from future calls with Tumburglar. Returns the Tumburglar instance.

Usage:

    TB.loadBlog('blog').then(function(TB) {
        // Do stuff
    }, function(error) {
        // Something went wrong
        console.log(error);
    }).done();

##getBlogInfo(blog)

Either async or synchronous call to get blog data, depending on whether or not you've loaded a blog into Tumburglar. Pass in a blog name as a string to force an async call returning a deferred object with the data as its value.

##getPostCount(blog)

Gets post count. Asynchronous if you specify a blog, synchronous if you have a blog loaded.

##getBlogURL(blog)

Gets a blog's URL--useful if you're trying to get a blog's custom domain name. Asynchronous if you specify a blog, synchronous if you have a blog loaded.

##getBlogTitle(blog)

Gets a blog's title. Asynchronous if you specify a blog, synchronous if you have a blog loaded.

##getAvatar([blog,] size)

Gets a blog's avatar as a URI to the resource. Always asynchronous, since you have to request an image. If you omit `blog`, Tumburglar will use the blog currently loaded.

Allowed values for `size`: 16, 24, 30, 40, 48, 64, 96, 128, 512

##getPosts(options)

Gets posts from a user's blog. Options listed below with details following:

    {
        amount: Integer,
        types: String
        tags: String
        id: Integer,
        chrono: Boolean,
        offset: Integer,
        limit: Integer,
        reblogInfo: Boolean,
        noteInfo: Boolean
    }

###amount

Specify the number of posts you want to request. If you don't pass this value, then Tumburglar will get all of a user's posts by default.

###types

Despite its name, this currently only supports a single type--pass a string of `'text'`, `'quote'`, `'link'`, `'answer'`, `'video'`, `'audio'`, `'photo'`, or `'chat'`. Multiple types coming soon.

###tags

Same case as `types`, `tags` currently only supports a single tag. Specify a string with a tag to get only posts of a certain tag. NOTE: There seems to be an issue with the Tumblr API combining tags and types. I'm currently looking into solutions.

###id

Get a post by a specific ID, if you happen to know it. Naturally, this will return either 0 or 1 post.

###chrono

Get posts either in ascending or descending chronological order. Setting `chrono` to `true` will return the oldest posts first.

###offset

Get posts from a certain offset. When working with tags or types, this will still reference the offset of all posts--so if you specify that you want to get photos with an offset of 45, you'll get photo posts from post 45 and on, *not* photo posts from photo post 45 and on. Offset either starts from the latest post or the first post of a blog depending on what you set `chrono` to.

###limit

How many posts to ask for per request. By default this is set to 20. I'm not sure why you would want to make this any less than 20, but you can do it.

###reblogInfo

Set this to `true` to return reblog information associated with each post.

###noteInfo

Set this to `true` to return the notes data associated with posts. Note (pun unintended) that the Tumblr API will only give you the last 50 notes on a post.

#Contributing

If you'd like to contribute, feel free to submit a pull request.

#License

"THE BEER-WARE LICENSE" (Revision 42):
Way Spurr-Chen wrote this package. As long as you retain this notice you  can do whatever you want with this stuff. If we meet some day, and you think  this stuff is worth it, you can buy me a beer in return.

[Beerware License at Wikipedia](http://en.wikipedia.org/wiki/Beerware)

#Me

Like it? I'm Way Spurr-Chen. You can follow me on Twitter at [@wayspurrchen](http://twitter.com/wayspurrchen) or e-mail me at [wayspurrchen@gmail.com](mailto:wayspurrchen@gmail.com).