const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();
const uploadRoot = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadRoot);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-|-$/g, "");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 12,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image and video uploads are supported"));
  },
});

router.post("/", upload.array("files", 12), (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const files = req.files.map((file) => ({
    url: `${baseUrl}/uploads/${file.filename}`,
    name: file.originalname,
    type: file.mimetype.startsWith("video/") ? "video" : "image",
    size: file.size,
  }));

  res.status(201).json({ files });
});

module.exports = router;
