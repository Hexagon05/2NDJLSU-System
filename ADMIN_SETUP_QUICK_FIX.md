# Admin Setup Guide - Quick Fix for Permission Errors

## Error: "Missing or Insufficient Permissions"

If you see this error when trying to create dispatches, it means your user account needs to be set up as a web admin.

## Quick Fix (2 minutes)

### Option 1: Use the Setup Page (Easiest)

1. **Go to the setup page**: Navigate to [http://localhost:3000/setup-admin](http://localhost:3000/setup-admin)
2. **Click "Create Admin Document"**
3. **Done!** You can now create dispatches

### Option 2: Manual Setup via Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **lsu-tracker**
3. Go to **Firestore Database**
4. Create a new document in the `users` collection:
   - **Collection**: `users`
   - **Document ID**: Your Firebase Auth UID (copy from Authentication section)
   - **Fields**:
     ```
     email: "your-email@example.com"  (string)
     role: "admin"  (string)
     displayName: "Your Name"  (string)
     createdAt: [current timestamp]  (timestamp)
     ```

## How to Find Your Firebase Auth UID

1. Go to Firebase Console → **Authentication**
2. Find your user in the list
3. Click on the user
4. Copy the **User UID** (it looks like: `AbCdEfGh1234567890`)

## Why Is This Needed?

The system has two types of users:

- **Web Admins** (`users` collection): Can create dispatches via web interface
- **Field Personnel** (`personnelAccount` collection): Can report emergencies via mobile app

You need to be in the `users` collection to create dispatches from the web.

## Firestore Rules

Make sure your firestore rules are updated:

```bash
firebase deploy --only firestore:rules
```

Or update them manually in Firebase Console → Firestore Database → Rules tab.

## Still Having Issues?

1. **Clear browser cache** and reload
2. **Check Firestore rules** are published (see timestamp in Firebase Console)
3. **Verify document ID** matches your Firebase Auth UID exactly
4. **Check browser console** for detailed error messages

## For Development

If you want to temporarily bypass permissions for testing:

⚠️ **DO NOT USE IN PRODUCTION** - This makes your database publicly writable!

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // WARNING: Insecure!
    }
  }
}
```

After testing, always revert to the production rules in `firestore.rules`.
