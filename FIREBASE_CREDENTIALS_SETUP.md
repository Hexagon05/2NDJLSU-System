# Get Firebase Service Account Credentials

## Step-by-Step Instructions

### 1. Open Firebase Console
Go to: https://console.firebase.google.com/

### 2. Select Your Project
Click on **lsu-tracker** project

### 3. Get Service Account Credentials
- Click the ⚙️ **Settings** icon (top left, next to "Project Overview")
- Select **Project Settings**
- Click the **Service Accounts** tab
- Under "Firebase Admin SDK", click **Generate New Private Key**
- A JSON file will download

### 4. Extract Values from JSON
Open the downloaded JSON file and find:
- `"type": "service_account"` (line 1)
- `"project_id": "lsu-tracker"` → Copy this value
- `"private_key_id": "..."` 
- `"private_key": "-----BEGIN PRIVATE KEY-----\n..."` → Copy this value
- `"client_email": "..."` → Copy this value
- `"client_id": "..."`

### 5. Update `.env.local`
Replace the placeholder values:

```env
FIREBASE_PROJECT_ID=lsu-tracker
FIREBASE_CLIENT_EMAIL=<copy-from-json-client_email>
FIREBASE_PRIVATE_KEY="<copy-from-json-private_key>"
```

**Example (with real values):**
```env
FIREBASE_PROJECT_ID=lsu-tracker
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xyz@lsu-tracker.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQE...\n-----END PRIVATE KEY-----\n"
```

### 6. Important Notes
⚠️ The private key may have real newlines. In the JSON file it appears as `\n`. When pasting:
- Keep the quotes: `"..."`
- Keep the `\n` characters as-is (don't replace with actual newlines)
- The entire key should be on one line within the quotes

### 7. Restart Dev Server
After updating `.env.local`:
```bash
npm run dev
```

### 8. Test
Try creating a personnel account again. Check browser console for errors.

---

## Still Having Issues?

If you see "Firebase Admin SDK not initialized", check:
1. ✅ All three environment variables are filled (no placeholder values)
2. ✅ You restarted the dev server after updating .env.local
3. ✅ The private key includes the `-----BEGIN` and `-----END` lines
4. ✅ The JSON file is from the correct Firebase project (lsu-tracker)

## Security Note
🔒 Never share your `.env.local` file or private key
✅ Add `.env.local` to `.gitignore` (should already be there)
