#!/bin/sh

if [ "$NODE_ENV" = "production" ]; then
  pm2-runtime index.js
else
  npm run debug
fi
