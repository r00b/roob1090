const express = require('express');
const router = express.Router();

router.get('/', function(req, res, next) {
  console.log('GET');
  res.json({
    status: 'success'
  });
});

module.exports = router;
