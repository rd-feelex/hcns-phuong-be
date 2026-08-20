const router = require('express').Router();
const controller = require('../controllers/payroll.controller');

router.get('/preview', controller.preview);
router.post('/compute', controller.compute);
router.get('/inputs', controller.getInputs);
router.put('/inputs', controller.saveInputs);

module.exports = router;
