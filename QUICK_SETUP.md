# Personnel Firebase Auth Setup - Quick Checklist

## What Was Changed

✅ **API Route Created** (`/app/api/personnel/route.ts`)
- Handles personnel creation with Firebase Authentication
- Creates user in Firebase Auth
- Creates user document with `role: "personnel"` in Firestore
- Creates personnel account in `personnelAccount` collection

✅ **Personnel Page Updated** (`/app/personnels/page.tsx`)
- Modified `handleSubmit()` to call the new API endpoint
- No longer stores hashed passwords locally
- Automatically creates Firebase Auth users

✅ **Firebase Admin SDK Installed**
- `firebase-admin` package added to dependencies

## What You Need To Do

### Step 1: Get Firebase Service Account Credentials

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select project: **lsu-tracker**
3. Click ⚙️ (Settings) → **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save the JSON file

### Step 2: Add Credentials to `.env.local`

Open `.env.local` in your project root and add:

```env
FIREBASE_PROJECT_ID=lsu-tracker
FIREBASE_CLIENT_EMAIL=your-service-account-email@lsu-tracker.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourPrivateKeyHere\n-----END PRIVATE KEY-----\n"
```

**Copy from the JSON file:**
- `project_id` → `FIREBASE_PROJECT_ID`
- `client_email` → `FIREBASE_CLIENT_EMAIL`  
- `private_key` → `FIREBASE_PRIVATE_KEY` (keep the escaped `\n`)

### Step 3: Restart Dev Server

```bash
npm run dev
```

## How It Works Now

### Creating Personnel:

1. Go to **Personnel** page
2. Click **Add Personnel**
3. Fill in details:
   - Email (will be login email)
   - Password (8+ chars, 1 number, 1 symbol)
   - Personnel information
4. Submit

### Automatic Actions:

✅ Firebase Auth user created with email/password
✅ User document created with `role: "personnel"`
✅ Personnel account created with all details
✅ Personnel can now login with email & password

## Result in Firestore

### `users` collection:
```
Document ID: {firebase-uid}
├── email: officer@example.com
├── role: "personnel"  ← MARKED AS PERSONNEL
├── displayName: John Doe
└── createdAt: ...
```

### `personnelAccount` collection:
```
Document ID: {firebase-uid}
├── firstName: John
├── lastName: Doe
├── email: officer@example.com
├── username: 202600001
├── rank: Officer
├── position: Patrol Officer
│── imageUrl: ...
└── ...other details
```

## Testing

1. Create a test personnel account
2. Check Firebase Console → `users` collection (should see `role: "personnel"`)
3. Check `personnelAccount` collection (should see all details)
4. Try logging in with the email/password created

## Document Reference

See `PERSONNEL_SETUP_GUIDE.md` for detailed information:
- Database structure
- API endpoint details
- Troubleshooting
- Security notes

---

**Questions?** Check the troubleshooting section in PERSONNEL_SETUP_GUIDE.md
