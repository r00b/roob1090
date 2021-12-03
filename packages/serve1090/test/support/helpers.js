async function delay() {
  await new Promise(resolve => setTimeout(() => resolve(), 500));
}

module.exports = {
  delay,
};
