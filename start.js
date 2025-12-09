// start.js
// Load environment variables from .env before booting the built bundle.
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed — continue; environment variables may already be set.
}

// Require the bundled entrypoint after loading env vars
require('./dist/index.cjs');
