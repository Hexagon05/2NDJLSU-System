# Personnel Account Creation with Firebase Authentication

This guide explains how the new personnel creation system works and how to set it up.

## Overview

When you create a new personnel account:
1. **Firebase Auth User** is created with the personnel's email and password
2. **User Document** is created in the `users` collection with role set to `"personnel"` (NOT admin)
3. **Personnel Account** is created in the `personnelAccount` collection with all personnel details

## Setup Instructions

### 1. Get Firebase Admin SDK Credentials

You need to provide your Firebase Admin SDK service account credentials.

**Steps:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **lsu-tracker**
3. Go to **Project Settings** (⚙️ icon)
4. Click **Service Accounts** tab
5. Click **Generate New Private Key**
6. A JSON file will download

### 2. Add Credentials to `.env.local`

Open `.env.local` in your project root and update with your credentials:

```env
FIREBASE_PROJECT_ID=lsu-tracker
FIREBASE_CLIENT_EMAIL=your-service-account@lsu-tracker.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Private_Key_With_Escaped_Newlines\n-----END PRIVATE KEY-----\n"
```

**Important:** 
- The `FIREBASE_PRIVATE_KEY` must have `\n` escaped as literal `\n` characters
- Replace newlines in the key with `\n` when copying

### 3. Install Firebase Admin SDK

```bash
npm install firebase-admin
```

## Creating Personnel Accounts

### From the Personnel Page:

1. Click **"Add Personnel"** button
2. Fill in all personnel details:
   - Name (First, Middle Initial, Last)
   - Email (this will be the login email)
   - Password (8+ characters, 1 number, 1 symbol required)
   - Rank, Position, Contact No.
   - Dates and Addresses
   - (Optional) Profile Image

3. Click **"Submit"**

### What Happens Behind the Scenes:

1. **API Endpoint** `/api/personnel` receives the data
2. **Firebase Auth User** is created with the email and password
3. **User document** is stored in Firestore with:
   - `role: "personnel"` (distinguishes from admins)
   - Their email and display name
   - Firebase UID for reference

4. **Personnel Account** is stored with:
   - All personnel information
   - Link to Firebase UID
   - Generated personnel ID (YYYYXXXXX format)
   - Image URL (if uploaded)

## Role Distinction

### Personnel (`role: "personnel"`)
- Can login with email/password
- Can view their own personnel information
- Limited access to specific features

### Admin (`role: "admin"`)
- Full access to all features
- Can create dispatch orders
- Can manage personnel accounts

## Database Structure

### `users` collection (for authentication & role management)
```json
{
  "uid": "firebase-uid",
  "email": "officer@example.com",
  "role": "personnel",
  "displayName": "John Doe",
  "createdAt": "2026-03-26T..."
}
```

### `personnelAccount` collection (for personnel details)
```json
{
  "uid": "firebase-uid",
  "firstName": "John",
  "lastName": "Doe",
  "email": "officer@example.com",
  "rank": "Officer",
  "position": "Patrol",
  "contactNo": "09XX...",
  "dateOfBirth": "1990-01-01",
  "imageUrl": "cloudinary-url",
  "username": "202600001",
  "dateAdded": "2026-03-26",
  "role": "officer",
  "isActive": true
}
```

## Login Flow

Personnel can now login with:
- **Email:** The email entered during creation
- **Password:** The password entered during creation

The login system will:
1. Authenticate with Firebase Auth
2. Check the `users` collection for role
3. Grant access based on `role: "personnel"`

## API Endpoint

### POST `/api/personnel`

**Request Body:**
```json
{
  "email": "officer@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "middleInitial": "M",
  "rank": "Officer",
  "position": "Patrol Officer",
  "contactNo": "09XX...",
  "dateOfBirth": "1990-01-01",
  "currentAddress": "123 Main St",
  "permanentAddress": "456 Oak Ave",
  "imageUrl": "optional-url"
}
```

**Response:**
```json
{
  "success": true,
  "uid": "firebase-uid",
  "message": "Personnel account created successfully"
}
```

## Security Notes

✅ **What's Secure:**
- Firebase Auth handles password hashing
- Service account credentials are server-side only
- No passwords exposed to client
- Private key stored in environment variables

⚠️ **Remember:**
- Never expose `FIREBASE_PRIVATE_KEY` in client-side code
- Keep your `.env.local` file in `.gitignore`
- Use Firebase Security Rules to control access

## Troubleshooting

### Error: "Firebase API Key not found"
- Ensure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are set in `.env.local`
- Restart the dev server after adding env variables

### Error: "Missing or insufficient permissions"
- Check that your Firebase Admin SDK credentials are valid
- Verify the service account has "Editor" role in Firebase Console

### Personnel created but can't login
- Ensure the email was unique (no duplicate in Firebase Auth)
- Check password meets requirements (8+ chars, 1 number, 1 symbol)
- Verify user document was created in `users` collection with `role: "personnel"`

## Next Steps

1. ✅ Setup Firebase Admin SDK credentials in `.env.local`
2. ✅ Install `firebase-admin` package
3. ✅ Test creating a personnel account from the Personnel page
4. ✅ Verify the user can login with their email and password
5. ✅ Check the Firestore `users` and `personnelAccount` collections for the created accounts
