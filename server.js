const express = require("express");
const app = express();
app.use(express.json());

// ---------- storage ----------
const users = [];
const posts = [];
const comments = [];
const likes = [];    // { postId, userId }
const follows = [];  // { followerId, followeeId }

let nextUserId = 1;
let nextPostId = 1;
let nextCommentId = 1;

// ---------- helpers ----------
function findUser(id) {
  return users.find(u => u.id === Number(id));
}

function findPost(id) {
  return posts.find(p => p.id === Number(id));
}

function postWithCounts(post) {
  const likeCount = likes.filter(l => l.postId === post.id).length;
  const commentCount = comments.filter(c => c.postId === post.id).length;
  return { ...post, likes: likeCount, comments: commentCount };
}

// log every request
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ---------- root ----------
app.get("/", (req, res) => {
  res.send("Mini-twitter API is running");
});

// ================= USERS =================

// create user
app.post("/users", (req, res) => {
  const { username, name } = req.body;
  if (!username) {
    return res.status(400).json({ error: "username is required" });
  }
  const taken = users.find(u => u.username === username);
  if (taken) {
    return res.status(409).json({ error: "username already taken" });
  }
  const user = {
    id: nextUserId++,
    username: username,
    name: name || username,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  res.status(201).json(user);
});

// list users
app.get("/users", (req, res) => {
  res.json(users);
});

// get one user
app.get("/users/:id", (req, res) => {
  const user = findUser(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }
  res.json(user);
});

// update user
app.put("/users/:id", (req, res) => {
  const user = findUser(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }
  if (req.body.username) {
    const taken = users.find(u => u.username === req.body.username && u.id !== user.id);
    if (taken) {
      return res.status(409).json({ error: "username already taken" });
    }
    user.username = req.body.username;
  }
  if (req.body.name) {
    user.name = req.body.name;
  }
  res.json(user);
});

// delete user (and everything that belongs to them)
app.delete("/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = users.findIndex(u => u.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "user not found" });
  }
  users.splice(index, 1);

  // remove their posts, along with comments and likes on those posts
  for (let i = posts.length - 1; i >= 0; i--) {
    if (posts[i].authorId === id) {
      const postId = posts[i].id;
      for (let j = comments.length - 1; j >= 0; j--) {
        if (comments[j].postId === postId) comments.splice(j, 1);
      }
      for (let j = likes.length - 1; j >= 0; j--) {
        if (likes[j].postId === postId) likes.splice(j, 1);
      }
      posts.splice(i, 1);
    }
  }

  // their own comments, likes and follow relations
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].authorId === id) comments.splice(i, 1);
  }
  for (let i = likes.length - 1; i >= 0; i--) {
    if (likes[i].userId === id) likes.splice(i, 1);
  }
  for (let i = follows.length - 1; i >= 0; i--) {
    if (follows[i].followerId === id || follows[i].followeeId === id) {
      follows.splice(i, 1);
    }
  }

  res.status(204).end();
});

// ================= FOLLOWS =================

// follow a user, body: { followerId }
app.post("/users/:id/follow", (req, res) => {
  const followee = findUser(req.params.id);
  const follower = findUser(req.body.followerId);
  if (!followee || !follower) {
    return res.status(404).json({ error: "user not found" });
  }
  if (followee.id === follower.id) {
    return res.status(400).json({ error: "cannot follow yourself" });
  }
  const already = follows.find(f => f.followerId === follower.id && f.followeeId === followee.id);
  if (already) {
    return res.status(409).json({ error: "already following" });
  }
  follows.push({ followerId: follower.id, followeeId: followee.id });
  res.status(201).json({ followerId: follower.id, followeeId: followee.id });
});

// unfollow, body: { followerId }
app.delete("/users/:id/follow", (req, res) => {
  const followeeId = Number(req.params.id);
  const followerId = Number(req.body.followerId);
  const index = follows.findIndex(f => f.followerId === followerId && f.followeeId === followeeId);
  if (index === -1) {
    return res.status(404).json({ error: "follow relation not found" });
  }
  follows.splice(index, 1);
  res.status(204).end();
});

// followers of a user
app.get("/users/:id/followers", (req, res) => {
  const user = findUser(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }
  const result = follows
    .filter(f => f.followeeId === user.id)
    .map(f => findUser(f.followerId));
  res.json(result);
});

// who a user follows
app.get("/users/:id/following", (req, res) => {
  const user = findUser(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }
  const result = follows
    .filter(f => f.followerId === user.id)
    .map(f => findUser(f.followeeId));
  res.json(result);
});

// feed: posts from people the user follows, newest first
app.get("/users/:id/feed", (req, res) => {
  const user = findUser(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }
  const followeeIds = follows
    .filter(f => f.followerId === user.id)
    .map(f => f.followeeId);
  const feed = posts
    .filter(p => followeeIds.includes(p.authorId))
    .sort((a, b) => b.id - a.id)
    .map(postWithCounts);
  res.json(feed);
});

// ================= POSTS =================

// create post
app.post("/posts", (req, res) => {
  // receive a JSON payload like {"title": "...", "content": "...", "authorId": 1}
  const { title, content, authorId } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: "title and content are required" });
  }
  if (authorId !== undefined && !findUser(authorId)) {
    return res.status(404).json({ error: "author not found" });
  }
  const post = {
    id: nextPostId++,
    title: title,
    content: content,
    authorId: authorId,
    createdAt: new Date().toISOString()
  };
  console.log(`Adding this new post ${JSON.stringify(post)}`);
  posts.push(post);
  console.log(`Posts: ${JSON.stringify(posts)}`);
  res.status(201).json(post);
});

// list posts, optional ?authorId=1 and ?search=word
app.get("/posts", (req, res) => {
  let result = posts;
  if (req.query.authorId) {
    result = result.filter(p => p.authorId === Number(req.query.authorId));
  }
  if (req.query.search) {
    const term = req.query.search.toLowerCase();
    result = result.filter(p =>
      p.title.toLowerCase().includes(term) || p.content.toLowerCase().includes(term)
    );
  }
  res.json(result.map(postWithCounts));
});

// get one post
app.get("/posts/:id", (req, res) => {
  const post = findPost(req.params.id);
  if (!post) {
    return res.status(404).json({ error: "post not found" });
  }
  res.json(postWithCounts(post));
});

// update post
app.put("/posts/:id", (req, res) => {
  const post = findPost(req.params.id);
  if (!post) {
    return res.status(404).json({ error: "post not found" });
  }
  if (req.body.title) {
    post.title = req.body.title;
  }
  if (req.body.content) {
    post.content = req.body.content;
  }
  post.updatedAt = new Date().toISOString();
  res.json(post);
});

// delete post
app.delete("/posts/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = posts.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "post not found" });
  }
  posts.splice(index, 1);

  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i].postId === id) comments.splice(i, 1);
  }
  for (let i = likes.length - 1; i >= 0; i--) {
    if (likes[i].postId === id) likes.splice(i, 1);
  }

  res.status(204).end();
});

// ================= LIKES =================

// like a post, body: { userId }
app.post("/posts/:id/like", (req, res) => {
  const post = findPost(req.params.id);
  if (!post) {
    return res.status(404).json({ error: "post not found" });
  }
  const user = findUser(req.body.userId);
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }
  const already = likes.find(l => l.postId === post.id && l.userId === user.id);
  if (already) {
    return res.status(409).json({ error: "already liked" });
  }
  likes.push({ postId: post.id, userId: user.id });
  res.status(201).json({ postId: post.id, userId: user.id });
});

// unlike a post, body: { userId }
app.delete("/posts/:id/like", (req, res) => {
  const postId = Number(req.params.id);
  const userId = Number(req.body.userId);
  const index = likes.findIndex(l => l.postId === postId && l.userId === userId);
  if (index === -1) {
    return res.status(404).json({ error: "like not found" });
  }
  likes.splice(index, 1);
  res.status(204).end();
});

// who liked a post
app.get("/posts/:id/likes", (req, res) => {
  const post = findPost(req.params.id);
  if (!post) {
    return res.status(404).json({ error: "post not found" });
  }
  const result = likes
    .filter(l => l.postId === post.id)
    .map(l => findUser(l.userId));
  res.json(result);
});

// ================= COMMENTS =================

// add comment, body: { content, authorId }
app.post("/posts/:id/comments", (req, res) => {
  const post = findPost(req.params.id);
  if (!post) {
    return res.status(404).json({ error: "post not found" });
  }
  const { content, authorId } = req.body;
  if (!content) {
    return res.status(400).json({ error: "content is required" });
  }
  if (authorId !== undefined && !findUser(authorId)) {
    return res.status(404).json({ error: "author not found" });
  }
  const comment = {
    id: nextCommentId++,
    postId: post.id,
    content: content,
    authorId: authorId,
    createdAt: new Date().toISOString()
  };
  comments.push(comment);
  res.status(201).json(comment);
});

// list comments of a post
app.get("/posts/:id/comments", (req, res) => {
  const post = findPost(req.params.id);
  if (!post) {
    return res.status(404).json({ error: "post not found" });
  }
  res.json(comments.filter(c => c.postId === post.id));
});

// edit a comment
app.put("/posts/:id/comments/:commentId", (req, res) => {
  const comment = comments.find(c =>
    c.id === Number(req.params.commentId) && c.postId === Number(req.params.id)
  );
  if (!comment) {
    return res.status(404).json({ error: "comment not found" });
  }
  if (!req.body.content) {
    return res.status(400).json({ error: "content is required" });
  }
  comment.content = req.body.content;
  comment.updatedAt = new Date().toISOString();
  res.json(comment);
});

// delete a comment
app.delete("/posts/:id/comments/:commentId", (req, res) => {
  const index = comments.findIndex(c =>
    c.id === Number(req.params.commentId) && c.postId === Number(req.params.id)
  );
  if (index === -1) {
    return res.status(404).json({ error: "comment not found" });
  }
  comments.splice(index, 1);
  res.status(204).end();
});

// ---------- start ----------
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
