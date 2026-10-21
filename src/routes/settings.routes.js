const router = require('express').Router();
const ctrl = require('../controllers/settings.controller');

router.get('/attendance', ctrl.getAttendance);
router.put('/attendance', ctrl.saveAttendance);

module.exports = router;
