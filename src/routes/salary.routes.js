const router = require('express').Router();
const controller = require('../controllers/salary.controller');

router.get('/months', controller.months);
router.post('/baseline', controller.saveBaseline);
router.get('/', controller.list);

module.exports = router;
