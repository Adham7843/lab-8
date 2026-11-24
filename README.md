# CSE343 — Lab 8: Mini-twitter REST API

Implementation of the mini-twitter REST API using **Node.js** and **Express**, with plain
JavaScript arrays/objects as the storage layer (no database).

Data lives in memory, so it resets whenever the server restarts.

## Requirements

- Node.js (tested on v26)
- npm

## Run

```bash
npm install
npm start
```

The server listens on <http://localhost:3000>. Set `PORT` to override:

```bash
PORT=4000 npm start
```

## Storage model

| Array | Shape |
|---|---|
| `users` | `{ id, username, name, createdAt }` |
| `posts` | `{ id, title, content, authorId, createdAt }` |
| `comments` | `{ id, postId, content, authorId, createdAt }` |
| `likes` | `{ postId, userId }` |
| `follows` | `{ followerId, followeeId }` |

Post responses include computed `likes` and `comments` counts via `postWithCounts()`.

## Endpoints

### Users

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/users` | `{ username, name? }` | Create a user. `400` if no username, `409` if taken. |
| `GET` | `/users` | — | List all users. |
| `GET` | `/users/:id` | — | Get one user (`404` if missing). |
| `PUT` | `/users/:id` | `{ username?, name? }` | Update a user (`404`/`409`). |
| `DELETE` | `/users/:id` | — | Delete user and all their posts, comments, likes and follows (`204`). |

### Follows

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/users/:id/follow` | `{ followerId }` | `:id` follows the caller. `400` self-follow, `409` already following. |
| `DELETE` | `/users/:id/follow` | `{ followerId }` | Unfollow (`204`). |
| `GET` | `/users/:id/followers` | — | Users following `:id`. |
| `GET` | `/users/:id/following` | — | Users that `:id` follows. |
| `GET` | `/users/:id/feed` | — | Posts from followed users, newest first, with counts. |

### Posts

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/posts` | `{ title, content, authorId? }` | Create a post. `400` missing fields, `404` bad author. |
| `GET` | `/posts?authorId=&search=` | — | List posts; filter by author and/or search title/content. |
| `GET` | `/posts/:id` | — | Get one post with counts (`404`). |
| `PUT` | `/posts/:id` | `{ title?, content? }` | Update a post (`404`). |
| `DELETE` | `/posts/:id` | — | Delete post with its comments and likes (`204`). |

### Likes

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/posts/:id/like` | `{ userId }` | Like a post. `409` if already liked. |
| `DELETE` | `/posts/:id/like` | `{ userId }` | Unlike (`204`). |
| `GET` | `/posts/:id/likes` | — | Users who liked the post. |

### Comments

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/posts/:id/comments` | `{ content, authorId? }` | Add a comment (`400`/`404`). |
| `GET` | `/posts/:id/comments` | — | List a post's comments. |
| `PUT` | `/posts/:id/comments/:commentId` | `{ content }` | Edit a comment (`404`). |
| `DELETE` | `/posts/:id/comments/:commentId` | — | Delete a comment (`204`). |

## Quick end-to-end example

```bash
# two users
curl -X POST localhost:3000/users -H "Content-Type: application/json" -d '{"username":"alice","name":"Alice"}'
curl -X POST localhost:3000/users -H "Content-Type: application/json" -d '{"username":"bob","name":"Bob"}'

# alice follows bob
curl -X POST localhost:3000/users/2/follow -H "Content-Type: application/json" -d '{"followerId":1}'

# bob posts
curl -X POST localhost:3000/posts -H "Content-Type: application/json" -d '{"title":"Hello","content":"first post","authorId":2}'

# alice likes + comments
curl -X POST localhost:3000/posts/1/like -H "Content-Type: application/json" -d '{"userId":1}'
curl -X POST localhost:3000/posts/1/comments -H "Content-Type: application/json" -d '{"content":"nice!","authorId":1}'

# alice's feed
curl localhost:3000/users/1/feed
```

## Notes

- All IDs are integers assigned by the server.
- Deleting a user cascades to their posts (and those posts' comments/likes), their own comments,
  likes, and every follow relation they are part of.
- `express.json()` is registered so request bodies are parsed automatically.
