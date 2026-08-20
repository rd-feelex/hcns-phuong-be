const router = require('express').Router();
const controller = require('../controllers/employee.controller');

router.get('/meta', controller.meta);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:code', controller.detail);
router.put('/:code', controller.update);
router.delete('/:code', controller.remove);

module.exports = router;
