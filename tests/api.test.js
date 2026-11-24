const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../server");

function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0);
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

test("mini-twitter API end-to-end", async (t) => {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  }

  try {
    await t.test("root responds", async () => {
      const r = await api("GET", "/");
      assert.equal(r.status, 200);
      assert.match(r.data, /running/i);
    });

    await t.test("create users and validate input", async () => {
      let r = await api("POST", "/users", { username: "alice", name: "Alice" });
      assert.equal(r.status, 201);
      assert.equal(r.data.id, 1);
      assert.equal(r.data.name, "Alice");

      r = await api("POST", "/users", { username: "bob" });
      assert.equal(r.status, 201);
      assert.equal(r.data.id, 2);
      assert.equal(r.data.name, "bob");

      r = await api("POST", "/users", { username: "alice" });
      assert.equal(r.status, 409);

      r = await api("POST", "/users", {});
      assert.equal(r.status, 400);
    });

    await t.test("list, read and update users", async () => {
      let r = await api("GET", "/users");
      assert.equal(r.status, 200);
      assert.equal(r.data.length, 2);

      r = await api("GET", "/users/1");
      assert.equal(r.status, 200);
      assert.equal(r.data.username, "alice");

      r = await api("GET", "/users/999");
      assert.equal(r.status, 404);

      r = await api("PUT", "/users/1", { name: "Alice A." });
      assert.equal(r.status, 200);
      assert.equal(r.data.name, "Alice A.");

      r = await api("PUT", "/users/1", { username: "bob" });
      assert.equal(r.status, 409);
    });

    await t.test("follow graph", async () => {
      let r = await api("POST", "/users/2/follow", { followerId: 1 });
      assert.equal(r.status, 201);
      assert.deepEqual(r.data, { followerId: 1, followeeId: 2 });

      r = await api("POST", "/users/1/follow", { followerId: 1 });
      assert.equal(r.status, 400);

      r = await api("POST", "/users/2/follow", { followerId: 1 });
      assert.equal(r.status, 409);

      r = await api("GET", "/users/2/followers");
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.map(u => u.id), [1]);

      r = await api("GET", "/users/1/following");
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.map(u => u.id), [2]);
    });

    await t.test("create posts and validate input", async () => {
      let r = await api("POST", "/posts", { title: "Hello", content: "first post", authorId: 2 });
      assert.equal(r.status, 201);
      assert.equal(r.data.id, 1);

      r = await api("POST", "/posts", { title: "Only title" });
      assert.equal(r.status, 400);

      r = await api("POST", "/posts", { title: "x", content: "y", authorId: 999 });
      assert.equal(r.status, 404);
    });

    await t.test("list, filter, read and update posts", async () => {
      let r = await api("GET", "/posts");
      assert.equal(r.status, 200);
      assert.equal(r.data.length, 1);
      assert.equal(r.data[0].likes, 0);
      assert.equal(r.data[0].comments, 0);

      r = await api("GET", "/posts?authorId=2");
      assert.equal(r.data.length, 1);

      r = await api("GET", "/posts?authorId=1");
      assert.equal(r.data.length, 0);

      r = await api("GET", "/posts?search=first");
      assert.equal(r.data.length, 1);

      r = await api("GET", "/posts/1");
      assert.equal(r.status, 200);
      assert.equal(r.data.title, "Hello");

      r = await api("PUT", "/posts/1", { title: "Hello world" });
      assert.equal(r.status, 200);
      assert.equal(r.data.title, "Hello world");
      assert.ok(r.data.updatedAt);
    });

    await t.test("likes lifecycle", async () => {
      let r = await api("POST", "/posts/1/like", { userId: 1 });
      assert.equal(r.status, 201);

      r = await api("POST", "/posts/1/like", { userId: 1 });
      assert.equal(r.status, 409);

      r = await api("GET", "/posts/1/likes");
      assert.deepEqual(r.data.map(u => u.id), [1]);

      r = await api("GET", "/posts/1");
      assert.equal(r.data.likes, 1);

      r = await api("DELETE", "/posts/1/like", { userId: 1 });
      assert.equal(r.status, 204);

      r = await api("DELETE", "/posts/1/like", { userId: 1 });
      assert.equal(r.status, 404);
    });

    await t.test("comments lifecycle", async () => {
      let r = await api("POST", "/posts/1/comments", { content: "nice!", authorId: 1 });
      assert.equal(r.status, 201);
      assert.equal(r.data.id, 1);

      r = await api("POST", "/posts/1/comments", { authorId: 1 });
      assert.equal(r.status, 400);

      r = await api("POST", "/posts/1/comments", { content: "x", authorId: 999 });
      assert.equal(r.status, 404);

      r = await api("GET", "/posts/1/comments");
      assert.equal(r.data.length, 1);

      r = await api("PUT", "/posts/1/comments/1", { content: "very nice!" });
      assert.equal(r.status, 200);
      assert.equal(r.data.content, "very nice!");

      r = await api("PUT", "/posts/1/comments/99", { content: "x" });
      assert.equal(r.status, 404);

      r = await api("GET", "/posts/1");
      assert.equal(r.data.comments, 1);
    });

    await t.test("feed is newest-first with counts", async () => {
      let r = await api("POST", "/posts", { title: "Second", content: "newer", authorId: 2 });
      assert.equal(r.status, 201);
      assert.equal(r.data.id, 2);

      r = await api("GET", "/users/1/feed");
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.map(p => p.id), [2, 1]);
      assert.equal(r.data[1].comments, 1);
    });

    await t.test("delete comment and post", async () => {
      let r = await api("DELETE", "/posts/1/comments/1");
      assert.equal(r.status, 204);

      r = await api("GET", "/posts/1/comments");
      assert.equal(r.data.length, 0);

      r = await api("DELETE", "/posts/1");
      assert.equal(r.status, 204);

      r = await api("GET", "/posts/1");
      assert.equal(r.status, 404);
    });

    await t.test("deleting a user cascades", async () => {
      let r = await api("DELETE", "/users/2");
      assert.equal(r.status, 204);

      r = await api("GET", "/users/2");
      assert.equal(r.status, 404);

      r = await api("GET", "/posts?authorId=2");
      assert.equal(r.data.length, 0);

      r = await api("GET", "/users/1/following");
      assert.deepEqual(r.data, []);

      r = await api("DELETE", "/users/999");
      assert.equal(r.status, 404);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
