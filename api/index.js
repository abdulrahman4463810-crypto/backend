// backend/api/index.js

/*
  Vercel serverless entry point.
  Is file me app.listen() use nahi karna.
  Express app server.js se import hoti hai aur Vercel isko serverless function ki tarah run karta hai.
*/

const app = require("../server");

module.exports = app;
