#!/bin/sh

if [ "$NODE_ENV" = "production" ]; then
  yarn start-pm2
else
  yarn debug
fi

# TODO https://stackoverflow.com/questions/43654656/dockerfile-if-else-condition-with-external-arguments
