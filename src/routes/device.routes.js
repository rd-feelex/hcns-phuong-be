const router = require('express').Router();
const controller = require('../controllers/device.controller');

router.get('/ping', controller.ping);
router.get('/match', controller.matchTable);
router.put('/match', controller.saveMatches);
router.post('/sync', controller.runSync);
router.get('/daily', controller.daily);
router.get('/lark-status', controller.larkStatus);
router.get('/timesheet-report', controller.timesheetReport);

module.exports = router;
