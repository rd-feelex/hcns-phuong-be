const service = require('../services/file.service');
const { asyncHandler } = require('../middlewares/errorHandler');

const list = asyncHandler(async (req, res) => {
  res.json(await service.listByEmployee(req.params.code));
});

const upload = asyncHandler(async (req, res) => {
  const saved = await service.save(req.params.code, req.file, req.user?.email);
  res.status(201).json(saved);
});

const download = asyncHandler(async (req, res) => {
  const f = await service.getFile(req.params.id);
  if (!f) return res.status(404).json({ error: 'Không tìm thấy file' });
  res.download(f.full_path, f.file_name);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.status(204).end();
});

module.exports = { list, upload, download, remove };
