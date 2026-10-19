const router = require('express').Router();
const multer = require('multer');
const controller = require('../controllers/file.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.get('/employees/:code/files', controller.list);
router.post('/employees/:code/files', upload.single('file'), controller.upload);
router.get('/files/:id/download', controller.download);
router.delete('/files/:id', controller.remove);

module.exports = router;
