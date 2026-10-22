const router = require('express').Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const controller = require('../controllers/hr.controller');

router.get('/changes', controller.changes);
router.get('/arrears', controller.arrears);
router.get('/ebitda', controller.ebitda);
router.get('/grades', controller.grades);
router.get('/kpi-details', controller.kpiDetails);
router.get('/contractor-salaries', controller.contractorSalaries);
router.get('/leave', controller.leaveList);
router.put('/leave', controller.leaveSave);
router.post('/leave/import', upload.single('file'), controller.leaveImport);
router.get('/approvals', controller.approvals);

module.exports = router;
