import multer from "multer";

const storage = multer.memoryStorage();

export const upload = multer({
  storage,

  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },

  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      // Images
      "image/jpeg",
      "image/png",
      "image/webp",

      // Documents
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

      // Excel
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

      // Text & CSV
      "text/plain",
      "text/csv",
      "application/csv",
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});