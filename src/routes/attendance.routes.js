const router = require('express').Router();
const controller = require('../controllers/attendance.controller');

router.get('/', controller.list);
router.get('/matrix', controller.matrix);
router.post('/init', controller.init);
router.put('/bulk', controller.bulkSave);
router.get('/:code', controller.detail);

module.exports = router;
