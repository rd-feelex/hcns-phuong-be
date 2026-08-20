const router = require('express').Router();

router.use('/employees', require('./employee.routes'));
router.use('/salaries', require('./salary.routes'));
router.use('/attendance', require('./attendance.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/payroll', require('./payroll.routes'));

module.exports = router;
