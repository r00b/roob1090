async function wait () {
  await new Promise(resolve => setTimeout(() => resolve(), 500));
}

module.exports = {
  wait
};
