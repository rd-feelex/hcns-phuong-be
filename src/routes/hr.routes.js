const router = require('express').Router();
const controller = require('../controllers/hr.controller');

router.get('/changes', controller.changes);
router.get('/arrears', controller.arrears);
router.get('/ebitda', controller.ebitda);
router.get('/grades', controller.grades);
router.get('/kpi-details', controller.kpiDetails);
router.get('/contractor-salaries', controller.contractorSalaries);

module.exports = router;
