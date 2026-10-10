const router = require("express").Router();
const multer = require("multer");
const os = require("node:os");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const service = require("./media.service");
const { AppError } = require("../../utils/errors");
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4", "video/webm"]);
const MB = 1024 * 1024;
const MAX_BATCH_BYTES = 100 * MB;
const upload = multer({ storage: multer.diskStorage({ destination: os.tmpdir(), filename: (_req, _file, cb) => cb(null, `homes-upload-${crypto.randomUUID()}`) }), limits: { fileSize: 50 * MB, files: 10 }, fileFilter: (_req, file, cb) => allowed.has(file.mimetype) ? cb(null, true) : cb(new AppError(400, "INVALID_MEDIA_TYPE", "Unsupported media type")) }).array("files", 10);
function uploadBatch(req, res, next) {
  if (Number(req.get("content-length")) > MAX_BATCH_BYTES + MB) return next(new AppError(413, "BATCH_TOO_LARGE", "Upload batches must not exceed 100 MB"));
  upload(req, res, async error => {
    const files = req.files || [];
    const created = [];
    try {
      if (error) throw error;
      if (!files.length) throw new AppError(400, "FILE_REQUIRED", "At least one file is required");
      if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) throw new AppError(413, "BATCH_TOO_LARGE", "Upload batches must not exceed 100 MB");
      for (const file of files) if (file.mimetype.startsWith("image/") && file.size > 10 * MB) throw new AppError(400, "IMAGE_TOO_LARGE", "Images must not exceed 10 MB");
      for (const file of files) created.push(await service.upload({ ...file, buffer: await fs.readFile(file.path) }, req.admin.id));
      res.status(201).json({ data: created });
    } catch (failure) {
      await Promise.allSettled(created.map(asset => service.remove(asset.id)));
      next(failure);
    } finally { await Promise.allSettled(files.map(file => fs.unlink(file.path))); }
  });
}
const asyncHandler = require("../../utils/async-handler");
router.post("/tickets", asyncHandler(async (req,res) => res.status(201).json({data: await require("./upload-grant").issue(req.admin,req.body.origin)})));
router.post("/", uploadBatch);
router.delete("/:id", require("../../utils/async-handler")(async (req, res) => { await service.remove(req.params.id); res.status(204).end(); }));
router.uploadBatch = uploadBatch;
module.exports = router;
