# Cloudinary Setup Guide for Image Uploads

This guide will help you configure Cloudinary for image uploads in your Personnel and Vehicle management system.

## 🚀 Quick Setup Steps

### 1. Create a Cloudinary Account

1. Go to [https://cloudinary.com](https://cloudinary.com)
2. Click **Sign Up** for a free account
3. Fill in your details and verify your email
4. Once logged in, you'll see your **Dashboard**

### 2. Get Your Credentials

From your Cloudinary Dashboard, you'll see:
- **Cloud Name** (e.g., `demo`, `my-cloud-name`)
- **API Key**
- **API Secret**

**Note:** You only need the **Cloud Name** for this setup.

### 3. Enable Unsigned Uploads

For security and simplicity, we'll use unsigned uploads:

1. In your Cloudinary Dashboard, click on **Settings** (gear icon)
2. Go to the **Upload** tab
3. Scroll down to **Upload presets**
4. You'll see a preset called **`ml_default`** (this is the default unsigned preset)
   - OR create a new unsigned preset:
     - Click **Add upload preset**
     - Set **Signing Mode** to **Unsigned**
     - Give it a name (e.g., `afp_uploads`)
     - Configure folder settings (optional):
       - Set **Folder** to auto-organize uploads (e.g., `afp-project`)
     - Click **Save**

### 4. Configure Your Application

Open the file: `lib/cloudinary.ts`

Find these lines at the top:
```typescript
const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME";
const CLOUDINARY_UPLOAD_PRESET = "YOUR_UPLOAD_PRESET";
```

Replace them with your actual values:
```typescript
const CLOUDINARY_CLOUD_NAME = "your-actual-cloud-name"; // e.g., "demo" or "my-cloud-name"
const CLOUDINARY_UPLOAD_PRESET = "ml_default"; // or your custom preset name
```

### 5. Save and Test

1. Save the file
2. Restart your development server if it's running
3. Try adding a personnel or vehicle with an image

## 📁 How It Works

### For Personnel:
- Images are uploaded to the folder: `personnel/`
- Example URL: `https://res.cloudinary.com/your-cloud-name/image/upload/personnel/abc123.jpg`

### For Vehicles:
- Images are uploaded to the folder: `vehicles/`
- Example URL: `https://res.cloudinary.com/your-cloud-name/image/upload/vehicles/xyz789.jpg`

## 🎨 Image Features

### Supported Formats:
- JPEG / JPG
- PNG
- GIF
- WebP

### Maximum File Size:
- 10 MB per image

### Automatic Features:
- Image preview before upload
- File type validation
- File size validation
- Automatic thumbnail generation
- CDN delivery for fast loading

## 🔒 Security Notes

### Free Tier Limits:
- 25 GB storage
- 25 GB monthly bandwidth
- 25,000 transformations per month

### Production Recommendations:
1. **Enable signed uploads** in production for better security
2. **Set upload restrictions** in your Cloudinary settings:
   - Limit file types
   - Set maximum file size
   - Enable moderation
3. **Implement backend upload** instead of client-side uploads for sensitive data

### Additional Security:
In your Cloudinary settings, you can:
- Set allowed domains (restrict where uploads can come from)
- Enable moderation to review uploads before making them public
- Set up automatic backups

## 🛠️ Troubleshooting

### Error: "Cloudinary is not configured"
- Make sure you replaced `YOUR_CLOUD_NAME` and `YOUR_UPLOAD_PRESET` with actual values
- Check for typos in the cloud name

### Error: "Upload failed: 401"
- Your upload preset is not configured for unsigned uploads
- Go to Settings > Upload > Upload presets in Cloudinary
- Make sure the preset exists and is set to "Unsigned"

### Error: "Invalid file type"
- Only image files are accepted (JPEG, PNG, GIF, WebP)
- Check the file extension

### Error: "File size too large"
- Maximum file size is 10 MB
- Try compressing the image before uploading

## 📝 Example Configuration

Here's a complete example of properly configured credentials:

```typescript
// lib/cloudinary.ts
const CLOUDINARY_CLOUD_NAME = "afp-logistics"; // This is your cloud name
const CLOUDINARY_UPLOAD_PRESET = "ml_default"; // This is your upload preset
```

## 🎯 Testing Your Setup

1. **Add a Personnel:**
   - Go to Personnels page
   - Click "Add Personnel"
   - Fill in the required fields
   - Click "Choose Image" in the Profile Image section
   - Select an image file
   - You should see a preview
   - Click "Save" to upload

2. **Add a Vehicle:**
   - Go to Vehicle page
   - Click "Add Vehicle"
   - Fill in the required fields
   - Click "Choose Image" in the Vehicle Image section
   - Select an image file
   - You should see a preview
   - Click "Add Vehicle" to upload

3. **Verify in Cloudinary:**
   - Go to your Cloudinary Dashboard
   - Click on **Media Library**
   - You should see folders: `personnel/` and `vehicles/`
   - Your uploaded images will be there

## 💡 Tips

- **Image Optimization:** Cloudinary automatically optimizes images for web delivery
- **Transformations:** You can apply transformations like resizing, cropping, and filters
- **Thumbnails:** The system automatically generates optimized thumbnails for display
- **CDN:** All images are delivered via Cloudinary's global CDN for fast loading

## 🔗 Useful Links

- [Cloudinary Dashboard](https://cloudinary.com/console)
- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Upload Presets Guide](https://cloudinary.com/documentation/upload_presets)
- [Image Transformations](https://cloudinary.com/documentation/image_transformations)

---

**Need Help?**
- Check your Cloudinary console logs for detailed error messages
- Join Cloudinary's community forum: [https://community.cloudinary.com](https://community.cloudinary.com)
- Review the setup guide in `lib/cloudinary.ts` for inline documentation
