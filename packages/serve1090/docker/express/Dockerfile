FROM node:16.13.1-alpine3.11

ENV APP_DIR /app/serve1090

WORKDIR $APP_DIR

COPY package.json package-lock.json $APP_DIR/

RUN npm i -g pm2
RUN npm ci

COPY index.js $APP_DIR
COPY src $APP_DIR/src

COPY ./docker/express/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
