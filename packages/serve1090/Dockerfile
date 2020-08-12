FROM node:14.5.0

WORKDIR /app

COPY ./package.json ./

RUN yarn install

COPY ./ ./

CMD ["yarn", "start"]