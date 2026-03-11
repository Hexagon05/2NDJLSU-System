# Troubleshooting Permission Errors

## 🔴 Error: "Failed to add vehicle/personnel" or "Missing or insufficient permissions"

If you're seeing these errors, here are **ALL the possible reasons** and how to fix them:

---

## ✅ Solution Quick Checklist

Run through this checklist in order:

### 1. ✅ **Deploy Firestore Rules** (MOST COMMON)
```bash
firebase deploy --only firestore:rules
```
**Why**: The security rules file exists locally but hasn't been published to Firebase.

---

### 2. ✅ **Create Admin Document** (SECOND MOST COMMON)

Visit: **http://localhost:3000/setup-admin**

Click: **"Create Admin Document"**

**Why**: Your Firebase Auth user needs a corresponding document in the `users` collection to be recognized as a web admin.

**Manual Method**:
1. Go to Firebase Console → Firestore Database
2. Create document: `users/[YOUR_FIREBASE_AUTH_UID]`
3. Add fields:
   ```
   email: "your@email.com"
   role: "admin"
   displayName: "Your Name"
   createdAt: [timestamp]
   uid: "YOUR_FIREBASE_AUTH_UID"
   ```

---

### 3. ✅ **Verify UID Matches**

Your document ID in `users` collection **MUST EXACTLY MATCH** your Firebase Auth UID.

**Check**:
- Firebase Console → **Authentication** → Find your user → Copy **User UID**
- Firebase Console → **Firestore** → `users` collection → Document ID must be the same UID

---

### 4. ✅ **Check User Type**

Are you logged in with the correct account type?

**Two user types**:
- **Web Admins** (`users` collection) → Can create dispatches, vehicles, personnel ✅
- **Field Personnel** (`personnelAccount` collection) → Can only report emergencies ❌

**Verify**: Check which collection your UID exists in

---

### 5. ✅ **Clear Browser Cache**

Sometimes old permissions are cached:
- Press `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
- Clear "Cached images and files"
- Reload the page (`Ctrl + F5`)

---

### 6. ✅ **Check Rules in Firebase Console**

Go to: Firebase Console → Firestore Database → **Rules** tab

**Verify**:
1. The rules include `match /users/{userId}` and `match /vehicles/{vehicleId}` sections
2. Check the **timestamp** - should be recent (within last few minutes after deployment)
3. Click **Publish** if showing unpublished changes

---

### 7. ✅ **Network/Connection Issues**

**Test**:
- Open Browser Developer Tools (F12)
- Go to **Console** tab
- Look for red error messages
- Common issues:
  - Firestore connection timeout
  - Firebase API key issues
  - Network firewall blocking Firebase

**Fix**: Check your internet connection and Firebase project status

---

### 8. ✅ **Cloudinary Image Upload Issues** (Vehicles only)

If vehicles fail specifically during image upload:

**Check**: [lib/cloudinary.ts](lib/cloudinary.ts)

**Verify**:
```typescript
CLOUDINARY_CLOUD_NAME: "your-cloud-name"
CLOUDINARY_UPLOAD_PRESET: "your-preset"
```

**Fix**: 
- Make sure Cloudinary account is active
- Verify upload preset exists and is unsigned
- Check Cloudinary console for error logs

---

### 9. ✅ **Firebase Project Configuration**

**Verify**: [lib/firebase.ts](lib/firebase.ts)

Make sure Firebase config is correct:
```typescript
apiKey: "AIzaSy..."  // Correct API key
authDomain: "lsu-tracker.firebaseapp.com"
projectId: "lsu-tracker"  // Correct project ID
```

---

### 10. ✅ **Check Browser Console for Details**

The error messages now show more details:

1. Press **F12** to open Developer Tools
2. Go to **Console** tab
3. Look for errors like:
   - `FirebaseError: Missing or insufficient permissions`
   - `Error adding vehicle: [detailed message]`
4. This will tell you exactly what's wrong

---

## 🎯 Most Likely Causes (95% of issues)

1. **Firestore rules not deployed** (60%)
   - Solution: `firebase deploy --only firestore:rules`

2. **No admin document in `users` collection** (30%)
   - Solution: Visit `/setup-admin` and create it

3. **Document ID doesn't match Auth UID** (5%)
   - Solution: Recreate the document with correct UID

4. **Wrong user type (personnel instead of admin)** (3%)
   - Solution: Create new account or add to `users` collection

5. **Other (cache, network, config)** (2%)
   - Solution: Try troubleshooting steps above

---

## 🔍 Detailed Error Messages

After the updates, you'll now see specific error messages:

### ⚠️ "Permission denied. You need web admin access."
- **Cause**: You don't have a document in `users` collection
- **Fix**: Visit `/setup-admin` (link appears automatically)

### ⚠️ "Failed to upload some images"
- **Cause**: Cloudinary upload failed
- **Fix**: Check Cloudinary credentials in `lib/cloudinary.ts`

### ⚠️ "PERMISSION_DENIED: Missing or insufficient permissions"
- **Cause**: Firestore rules not deployed or incorrect
- **Fix**: Deploy rules with `firebase deploy --only firestore:rules`

### ⚠️ "Error adding vehicle: [error details]"
- **Cause**: Shows the actual Firebase error
- **Fix**: Read the error message for specific issue

---

## 📞 Still Having Issues?

### Check These Files:
1. `firestore.rules` - Are the rules correctly written?
2. `lib/firebase.ts` - Is Firebase config correct?
3. `lib/cloudinary.ts` - Are Cloudinary credentials valid?

### View Browser Console:
- Press F12 → Console tab
- Look for detailed error messages
- Copy and analyze the full error text

### Verify Firebase Console:
- Authentication tab: User exists and email verified
- Firestore tab: Check if `users` collection exists
- Rules tab: Check rules are published

---

## ✅ After Fixing

Once you fix the issue:
1. **Refresh the browser** (`Ctrl + F5`)
2. **Try the operation again**
3. The error should be gone and operation should succeed

If you see **"Successfully added!"** message, it's working! 🎉

---

## 🛡️ For Development Testing

If you want to temporarily bypass all security for testing:

**⚠️ WARNING: NEVER USE IN PRODUCTION**

```javascript
// Temporarily allow all operations (INSECURE!)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // ⚠️ DANGER: Everyone can read/write!
    }
  }
}
```

**After testing, IMMEDIATELY revert** to the production rules in `firestore.rules`.
