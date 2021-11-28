#!/bin/sh

if [ "$NODE_ENV" = "production" ]; then
  npm run pm2
else
  npm run debug
fi
