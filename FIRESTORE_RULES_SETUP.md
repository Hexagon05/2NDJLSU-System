# Firestore Security Rules Setup Guide

## Problem
You're getting the error: **"MISSING OR INSUFFICIENT PERMISSIONS"** when trying to create dispatches.

## Cause
Your Firebase Firestore security rules are not configured properly for the two-tier user system.

## User Types

### 1. Web Admins (`users` collection)
- Login via web interface
- Can create, update, and delete dispatches
- Can manage vehicles and personnel
- Can access all administrative features

### 2. Field Personnel (`personnelAccount` collection)  
- Login via mobile app
- Can report emergencies (TIC, location updates, etc.)
- Can update their own location and status
- **Cannot create regular dispatches**
- Can send/receive chat messages

## Solution

### Option 1: Update Rules via Firebase Console (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click on **Firestore Database** in the left sidebar
4. Click on the **Rules** tab
5. Replace the existing rules with the content from `firestore.rules` file in this project
6. Click **Publish** to deploy the new rules

### Option 2: Deploy Rules via Firebase CLI

If you have Firebase CLI installed:

```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project (if not already done)
firebase init firestore

# Deploy the rules
firebase deploy --only firestore:rules
```

## What These Rules Allow

### For Web Admins (`users` collection):
- ✅ Create, read, update, and delete dispatches
- ✅ Manage vehicles and dispatch history
- ✅ Write to metadata collection (for dispatch ID generation)
- ✅ Create and manage personnel accounts
- ✅ Update/delete emergency reports
- ✅ Full administrative access

### For Field Personnel (`personnelAccount` collection):
- ✅ View all dispatches and personnel data
- ✅ Update their own profile and location
- ✅ **Create emergency reports** (TIC alerts, distress signals)
- ✅ Update dispatch status and location (for their assigned dispatches)
- ✅ Send and receive chat messages
- ❌ **Cannot create regular dispatches** (admin-only feature)
- ❌ Cannot manage vehicles or other personnel

### For Both User Types:
- ✅ Read vehicles, dispatches, and personnel data
- ✅ Send chat messages (validated by sender ID)
- ✅ View emergency reports

## Setting Up Web Admin Access

To allow a user to create dispatches via the web interface, they must be in the `users` collection:

1. Go to **Firebase Console** → **Firestore Database**
2. Create/verify the `users` collection
3. Create a document with the user's Firebase Auth UID as the document ID:

```
users/[USER_AUTH_UID]/
{
  "email": "admin@example.com",
  "role": "admin",
  "displayName": "Admin Name",
  "createdAt": [Timestamp]
}
```

**Important**: The document ID must match the Firebase Authentication UID.

## Setting Up Field Personnel Access

Field personnel should be in the `personnelAccount` collection:

1. Go to **Firebase Console** → **Firestore Database**
2. In the `personnelAccount` collection
3. Create a document with the user's Firebase Auth UID as the document ID:

```
personnelAccount/[USER_AUTH_UID]/
{
  "email": "personnel@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "rank": "SGT",
  "position": "Field Operator",
  "contactNo": "+63xxxxxxxxxx",
  ...other personnel fields
}
```

## Collections Managed by These Rules

- **`users`** - Web admin accounts (can create dispatches)
- **`personnelAccount`** - Field personnel accounts (mobile app users)
- **`dispatches`** - Dispatch records with nested messages subcollection
- **`vehicles`** - Vehicle inventory
- **`dispatch_history`** - Historical dispatch records
- **`EmergencyReports`** - Emergency alerts from field personnel
- **`meta`** - System metadata (counters, etc.)

## Testing

After updating the rules:

1. **For Web Admin Login**:
   - Make sure your Firebase Auth user has a matching document in `users` collection
   - Try creating a new dispatch via web interface
   
2. **For Field Personnel (Mobile)**:
   - Make sure the Firebase Auth user has a matching document in `personnelAccount` collection
   - Try creating an emergency report (should work)
   - Try creating a regular dispatch (should fail - admin only)

3. The "MISSING OR INSUFFICIENT PERMISSIONS" error should be resolved for authorized operations

## Security Notes

- ✅ All operations require authentication (Firebase Auth)
- ✅ Web admin check: User document must exist in `users` collection
- ✅ Field personnel check: User document must exist in `personnelAccount` collection
- ✅ Chat messages validate that senderId matches the authenticated user
- ✅ Audit protection: messages cannot be updated or deleted once created
- ✅ Emergency reports can only be created by field personnel
- ✅ Regular dispatches can only be created by web admins
- ✅ Default deny rule for any undefined collections

## Troubleshooting

If you still get permission errors after updating rules:

1. **Check Authentication**: Make sure you're logged in (check Firebase Auth in console)
2. **Verify User Document**: 
   - For web admin: Check that your Firebase Auth UID has a document in `users` collection
   - For mobile: Check that your Firebase Auth UID has a document in `personnelAccount` collection
3. **Document ID Match**: The document ID must exactly match the Firebase Authentication UID
4. **Rules Published**: Verify rules are published (check timestamp in Firebase Console)
5. **Clear Cache**: Clear browser/app cache and reload
6. **Console Errors**: Check browser/app console for detailed error messages

## Common Issues

### "Cannot create dispatch" error:
- User is not in the `users` collection (they're in `personnelAccount`)
- Solution: Web admins must be in `users` collection

### "Cannot create emergency report" error:
- User is not in the `personnelAccount` collection
- Solution: Field personnel must be in `personnelAccount` collection
