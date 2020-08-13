FROM node:14.5.0-alpine3.11

RUN npm i -g nodemon

ENV APP_DIR /app/serve1090

WORKDIR $APP_DIR

COPY package.json $APP_DIR
RUN yarn install --prod --frozen-lockfile

COPY index.js $APP_DIR
COPY src $APP_DIR/src

CMD ["yarn", "debug"]