import cloudinary from "../config/cloudinary.js";

interface UploadFileParams {
  buffer: Buffer;
  originalName: string;
  mimetype: string;
  folder: string;
}

interface CloudinaryUploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  resourceType: "image";
  format: string | undefined;
  bytes: number;
}

export const uploadFileToCloudinary = async ({
  buffer,
  originalName,
  mimetype,
  folder,
}: UploadFileParams): Promise<CloudinaryUploadResult> => {
  const resourceType: "image" = "image";

  const publicId = originalName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-");

  cloudinary.config();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        asset_folder: folder,
        resource_type: resourceType,
        public_id: publicId,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result) {
          reject(new Error("Cloudinary upload failed"));
          return;
        }

        resolve({
          url: result.url,
          secureUrl: result.secure_url,
          publicId: result.public_id,
          resourceType,
          format: result.format,
          bytes: result.bytes,
        });
      },
    );

    uploadStream.end(buffer);
  });
};

export const deleteFileFromCloudinary = async (
  fileUrl: string,
  resourceType: string = "image",
) => {
  try {
    const url = new URL(fileUrl);

    const pathParts = url.pathname.split("/");

    const uploadIndex = pathParts.indexOf("upload");

    if (uploadIndex === -1) {
      throw new Error("Invalid Cloudinary URL");
    }

    let publicIdParts = pathParts.slice(uploadIndex + 1);

    // Remove transformations if present
    if (
      publicIdParts[0] &&
      (publicIdParts[0].includes("_") || publicIdParts[0].includes(","))
    ) {
      publicIdParts = publicIdParts.slice(1);
    }

    // Remove version
    if (publicIdParts[0] && /^v\d+$/.test(publicIdParts[0])) {
      publicIdParts = publicIdParts.slice(1);
    }

    if (publicIdParts.length === 0) {
      throw new Error("Cloudinary public ID not found");
    }

    let publicId = publicIdParts.join("/");

    // Remove extension
    publicId = publicId.replace(/\.[^/.]+$/, "");

    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });

    console.log(`Cloudinary file deleted: ${publicId}`);
  } catch (error) {
    console.error("Cloudinary delete error:", error);

    throw error;
  }
};

export const deleteCloudinaryDocumentFile = async (
  publicId: string,
  resourceType: "image" = "image",
) => {
  try {
    if (!publicId) {
      throw new Error("Cloudinary public ID is required");
    }

    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });

    console.log(`Cloudinary file deleted: ${publicId}`);
  } catch (error) {
    console.error("Cloudinary file deletion error:", error);

    throw error;
  }
};
