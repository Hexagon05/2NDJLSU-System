/**
 * Cloudinary Upload Utility
 * 
 * This utility handles image uploads to Cloudinary.
 * 
 * Setup Instructions:
 * 1. Sign up for a free Cloudinary account at https://cloudinary.com
 * 2. Get your cloud name from the dashboard
 * 3. Enable unsigned uploads in Settings > Upload > Upload presets
 * 4. Create an unsigned upload preset or use the default 'ml_default'
 * 5. Replace the values below with your actual credentials
 */

// ===== CLOUDINARY CONFIGURATION =====
// Replace these with your actual Cloudinary credentials
const CLOUDINARY_CLOUD_NAME = "dm61xnbqz"; // Your cloud name
const CLOUDINARY_UPLOAD_PRESET = "AFP-Logistics"; // Your upload preset

// Cloudinary API endpoint
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  url: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  created_at: string;
}

/**
 * Upload an image file to Cloudinary
 * @param file - The image file to upload
 * @param folder - Optional folder name in Cloudinary (e.g., "personnel" or "vehicles")
 * @returns Promise with the upload result including the image URL
 */
export async function uploadImageToCloudinary(
  file: File,
  folder?: string
): Promise<CloudinaryUploadResult> {
  // Validate that configuration is set
  if (CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME" || CLOUDINARY_UPLOAD_PRESET === "YOUR_UPLOAD_PRESET") {
    throw new Error(
      "Cloudinary is not configured. Please update CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in lib/cloudinary.ts"
    );
  }

  // Validate file type
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!validTypes.includes(file.type)) {
    throw new Error("Invalid file type. Please upload a valid image (JPEG, JPG, PNG, GIF, or WebP).");
  }

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB in bytes
  if (file.size > maxSize) {
    throw new Error("File size too large. Maximum size is 10MB.");
  }

  // Create form data
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  
  // Add folder if provided
  if (folder) {
    formData.append("folder", folder);
  }

  // Add timestamp for unique uploads
  formData.append("timestamp", Date.now().toString());

  try {
    const response = await fetch(CLOUDINARY_URL, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const data: CloudinaryUploadResult = await response.json();
    return data;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw new Error("Failed to upload image. Please try again.");
  }
}

/**
 * Delete an image from Cloudinary
 * Note: This requires a signed request with your API secret.
 * For production, implement this on your backend/server.
 * 
 * @param _publicId - The public_id of the image to delete
 */
export async function deleteImageFromCloudinary(_publicId: string): Promise<void> {
  // This is a placeholder. In production, you should implement this on your backend
  // because it requires your API secret which should not be exposed on the client side.
  console.warn("Delete operation should be implemented on the backend for security.");
  throw new Error("Delete operation not implemented. Implement this on your backend.");
}

/**
 * Generate a transformation URL for an image
 * @param publicId - The public_id of the image
 * @param transformations - Cloudinary transformation parameters (e.g., "w_200,h_200,c_fill")
 * @returns Transformed image URL
 */
export function getTransformedImageUrl(publicId: string, transformations: string): string {
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transformations}/${publicId}`;
}

/**
 * Generate a thumbnail URL for an image
 * @param imageUrl - The full Cloudinary image URL
 * @param width - Thumbnail width (default: 200)
 * @param height - Thumbnail height (default: 200)
 * @returns Thumbnail URL
 */
export function getThumbnailUrl(imageUrl: string, width: number = 200, height: number = 200): string {
  if (!imageUrl || !imageUrl.includes("cloudinary.com")) {
    return imageUrl;
  }
  
  // Insert transformation parameters into the URL
  return imageUrl.replace("/upload/", `/upload/w_${width},h_${height},c_fill,g_face/`);
}
