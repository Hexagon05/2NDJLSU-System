# 🔍 What to Check in Your Firebase Console

## Error: "Missing or insufficient permissions"

Follow these steps to check your Firebase database:

---

## 📍 Step 1: Open Firebase Console

1. Go to: https://console.firebase.google.com/
2. Select project: **lsu-tracker**
3. Click **"Firestore Database"** in the left sidebar

---

## 📍 Step 2: Check Your User Type

### Check `users` Collection (Web Admins)

1. In Firestore, look for a collection named **`users`**
2. Click on it
3. **Look for a document with YOUR Firebase Auth UID as the ID**

**Expected**: You should see a document like:
```
users/
  ├─ AbCdEfG123456789 (your UID)
      ├─ email: "your@email.com"
      ├─ role: "admin"
      ├─ displayName: "Your Name"
      └─ createdAt: Timestamp
```

**❌ If this document is MISSING** → This is why you're getting permission errors!

**✅ Fix**: Visit http://localhost:3000/setup-admin to create it automatically

---

### Check `personnelAccount` Collection (Field Personnel)

1. In Firestore, look for **`personnelAccount`** collection
2. Check if YOUR UID exists here

**If found**:
- ⚠️ You're logged in as field personnel, NOT a web admin
- Field personnel can only report emergencies via mobile app
- Field personnel CANNOT create dispatches/vehicles/personnel via web

**Fix**: You need a document in `users` collection instead

---

## 📍 Step 3: Find Your Firebase Auth UID

1. In Firebase Console, go to **"Authentication"** tab
2. Find your user in the list
3. Click on the user
4. Copy the **"User UID"** (looks like: `AbCdEfG123456789xyz`)

**This UID must match the document ID in the `users` collection exactly!**

---

## 📍 Step 4: Check Firestore Rules

1. In Firebase Console → **Firestore Database**
2. Click on **"Rules"** tab
3. Check the timestamp - should be recent (within last hour)

**Expected rules should include**:
```javascript
// Check if user is a web admin
function isWebAdmin() {
  return isAuthenticated() && 
         exists(/databases/$(database)/documents/users/$(request.auth.uid));
}

// Dispatches - only web admins can create
match /dispatches/{dispatchId} {
  allow create, delete: if isWebAdmin();
  // ...
}

// Vehicles - only web admins can write
match /vehicles/{vehicleId} {
  allow write: if isWebAdmin();
}
```

**If rules are old or different**:
```bash
firebase deploy --only firestore:rules
```

---

## 📍 Step 5: Run Automatic Diagnostics

Visit: **http://localhost:3000/diagnostic**

This page will automatically:
- ✅ Check if you have a `users` document
- ✅ Check if you're in `personnelAccount` instead
- ✅ Verify your permissions
- ✅ Show you exactly what's wrong
- ✅ Provide direct links to fix issues

---

## 🎯 Most Common Issue (90% of cases)

**Problem**: Your Firebase Auth user doesn't have a document in the `users` collection

**What you'll see in Firestore Console**:
```
users/
  └─ (empty) or (other users but not your UID)
```

**Solution**:
1. Visit: http://localhost:3000/setup-admin
2. Click "Create Admin Document"
3. Done! ✅

**Alternative manual fix**:
1. In Firestore Console, click "+ Start collection"
2. Collection ID: `users`
3. Document ID: `YOUR_FIREBASE_AUTH_UID` (copy from Authentication tab)
4. Add fields:
   - `email` (string): your email
   - `role` (string): "admin"
   - `displayName` (string): your name
   - `createdAt` (timestamp): now
   - `uid` (string): your Firebase Auth UID

---

## 📊 Database Structure You Should See

```
Firestore Database
├─ users/                          ← Web admins (you should be here)
│   ├─ [admin-uid-1]/
│   │   ├─ email: "admin@example.com"
│   │   ├─ role: "admin"
│   │   └─ ...
│   └─ [YOUR-UID]/                 ← YOU NEED THIS!
│       ├─ email: "your@email.com"
│       ├─ role: "admin"
│       └─ ...
│
├─ personnelAccount/               ← Field personnel (mobile app users)
│   ├─ [personnel-uid-1]/
│   └─ [personnel-uid-2]/
│
├─ dispatches/                     ← Created by web admins
├─ vehicles/                       ← Created by web admins
├─ EmergencyReports/              ← Created by field personnel
└─ meta/                          ← System metadata
    └─ dispatchCounter/
```

---

## ✅ After Checking

Once you verify/fix the issue:

1. **Clear browser cache**: `Ctrl + Shift + Delete`
2. **Hard reload**: `Ctrl + F5`
3. **Try the operation again**

If you now see your document in `users/[YOUR-UID]`, the permission error should be fixed! 🎉

---

## 🆘 Quick Diagnostic Links

- **Auto Diagnostic**: http://localhost:3000/diagnostic
- **Setup Admin**: http://localhost:3000/setup-admin
- **Firebase Console**: https://console.firebase.google.com/project/lsu-tracker/firestore

---

## 📸 Screenshot What to Look For

When you open Firebase Console → Firestore Database:

1. **Check if `users` collection exists**
2. **Check if YOUR UID exists as a document in `users`**
3. **The document ID must EXACTLY match your Firebase Auth UID**

If you don't see this, that's the problem! ❌
