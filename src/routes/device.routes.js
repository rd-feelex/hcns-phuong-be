const router = require('express').Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const controller = require('../controllers/device.controller');

router.get('/ping', controller.ping);
router.get('/match', controller.matchTable);
router.put('/match', controller.saveMatches);
router.post('/sync', controller.runSync);
router.get('/daily', controller.daily);
router.get('/lark-status', controller.larkStatus);
router.get('/timesheet-report', controller.timesheetReport);
router.get('/payroll-report', controller.payrollReport);
router.post('/import-timesheet', upload.single('file'), controller.importTimesheet);

module.exports = router;
