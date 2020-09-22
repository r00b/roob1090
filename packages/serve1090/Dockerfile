FROM node:14.5.0-alpine3.11

ENV APP_DIR /app/serve1090

WORKDIR $APP_DIR

COPY package.json $APP_DIR
RUN yarn install --frozen-lockfile

COPY index.js $APP_DIR
COPY src $APP_DIR/src

COPY ./docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]