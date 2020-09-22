#!/bin/sh

if [ "$NODE_ENV" = "production" ]; then
  yarn start-pm2
else
  yarn debug
fi
