// Vercel serverless entry point.
// This file exports the Express app without calling app.listen().
const app = require('../server');
module.exports = app;
