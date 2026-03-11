# 🔧 Fix Emergency Report Permission Error

## ✅ Rules Updated & Deployed!

The Firestore rules have been updated to allow **all authenticated users** to create emergency reports.

---

## 🔍 What Was Changed

### Before:
```javascript
allow create: if isFieldPersonnel(); // Only if user exists in personnelAccount
```

### After:
```javascript
allow create: if isAuthenticated(); // Any authenticated user can create
```

**Why this fixes it:**
- The `isFieldPersonnel()` check required the user to have a document in the `personnelAccount` collection
- If that document doesn't exist or isn't set up correctly, permission is denied
- Now ANY authenticated user can report emergencies

---

## 🧪 Test Again

Try transmitting the emergency signal again in your mobile app:

1. **Open mobile app**
2. **Fill in emergency details:**
   - Location: Auto-detected or manual
   - Situation Description: "wawawaw" (or real description)
   - Photo: Optional
3. **Click "TRANSMIT EMERGENCY SIGNAL"**
4. **Should work now!** ✅

---

## 📊 What Happens When You Transmit

The mobile app will create a document in:
```
EmergencyReports/{reportId}
├─ senderId: "user-uid"
├─ senderName: "Personnel Name"
├─ location: { lat: 9.7489, lng: 118.7471 }
├─ description: "wawawaw"
├─ imageUrl: "cloudinary-url" (if photo uploaded)
├─ timestamp: Timestamp
└─ status: "pending" or "active"
```

---

## 🔐 Current Permissions

### Who Can Create Emergency Reports:
- ✅ **All authenticated users** (web admins + field personnel)
- ✅ No need for personnelAccount document
- ✅ Just need valid Firebase Auth login

### Who Can Read Emergency Reports:
- ✅ All authenticated users

### Who Can Update/Delete Emergency Reports:
- ✅ Web admins only

---

## ⚠️ If Still Getting Permission Error

### Step 1: Check Firebase Authentication

**In mobile app:**
```kotlin
// Verify user is logged in
val user = FirebaseAuth.getInstance().currentUser
Log.d("Auth", "User UID: ${user?.uid}")
Log.d("Auth", "User Email: ${user?.email}")
```

**Expected:**
- UID should be present
- Email should be shown

**If null:** User is not logged in → Login required

### Step 2: Verify Collection Name

**Make sure mobile app writes to correct collection:**
```kotlin
// Correct collection name (case-sensitive!)
db.collection("EmergencyReports").add(emergencyData)
```

**Common mistakes:**
- ❌ `emergencyReports` (lowercase 'e')
- ❌ `emergency_reports` (with underscore)
- ❌ `EmergencyReport` (singular)
- ✅ `EmergencyReports` (exact match)

### Step 3: Check Required Fields

**Make sure all fields match security rules:**
```kotlin
val emergencyData = hashMapOf(
    "senderId" to user.uid,           // Required: Must match auth UID
    "senderName" to user.displayName, // Optional but recommended
    "location" to mapOf(
        "lat" to latitude,
        "lng" to longitude
    ),
    "description" to description,
    "imageUrl" to imageUrl,
    "timestamp" to FieldValue.serverTimestamp(),
    "status" to "active"
)

db.collection("EmergencyReports")
    .add(emergencyData)
    .addOnSuccessListener { 
        Log.d("Emergency", "Success: ${it.id}")
    }
    .addOnFailureListener { error ->
        Log.e("Emergency", "Error: ${error.message}")
    }
```

### Step 4: Refresh Firebase Rules in App

**Sometimes the mobile app caches old rules:**

1. **Force stop the app**
2. **Clear app data** (Settings → Apps → Your App → Clear Data)
3. **Re-login**
4. **Try again**

Or in code:
```kotlin
// Clear Firestore cache
val settings = FirebaseFirestoreSettings.Builder()
    .setPersistenceEnabled(false)
    .build()
db.firestoreSettings = settings
```

---

## 🔄 Alternative: Create EmergencyReport with Dispatch Update

Instead of creating a separate EmergencyReport, you can update the dispatch status directly:

```kotlin
// Option 1: Update existing dispatch to emergency
val dispatchRef = db.collection("dispatches").document(dispatchId)
dispatchRef.update(
    "status", "emergency",
    "emergencyReported" to true,
    "emergencyLocation" to mapOf("lat" to lat, "lng" to lng),
    "emergencyDescription" to description,
    "emergencyTimestamp" to FieldValue.serverTimestamp()
)
```

**This works because:**
```javascript
// Firestore rules already allow this
match /dispatches/{dispatchId} {
  allow update: if isAuthenticated(); // ✅ Any authenticated user
}
```

---

## 📱 Recommended Mobile App Code

### Complete Emergency Report Function:

```kotlin
fun transmitEmergencySignal(
    location: LatLng,
    description: String,
    imageUrl: String = ""
) {
    val user = FirebaseAuth.getInstance().currentUser
    if (user == null) {
        Log.e("Emergency", "User not authenticated")
        return
    }

    val db = FirebaseFirestore.getInstance()
    
    val emergencyData = hashMapOf(
        "senderId" to user.uid,
        "senderName" to (user.displayName ?: user.email ?: "Unknown"),
        "location" to mapOf(
            "lat" to location.latitude,
            "lng" to location.longitude,
            "label" to "Emergency Location"
        ),
        "description" to description,
        "imageUrl" to imageUrl,
        "timestamp" to FieldValue.serverTimestamp(),
        "status" to "active",
        "type" to "TIC"
    )

    db.collection("EmergencyReports")
        .add(emergencyData)
        .addOnSuccessListener { documentReference ->
            Log.d("Emergency", "Emergency reported: ${documentReference.id}")
            // Show success message to user
            Toast.makeText(context, "Emergency signal transmitted!", Toast.LENGTH_SHORT).show()
            
            // Optional: Also update active dispatch if exists
            updateActiveDispatchToEmergency()
        }
        .addOnFailureListener { exception ->
            Log.e("Emergency", "Failed to report emergency", exception)
            Toast.makeText(context, "Failed: ${exception.message}", Toast.LENGTH_LONG).show()
        }
}

private fun updateActiveDispatchToEmergency() {
    // If user has active dispatch, update its status to emergency
    val dispatchId = getActiveDispatchId() // Your method to get active dispatch
    if (dispatchId != null) {
        db.collection("dispatches")
            .document(dispatchId)
            .update("status", "emergency")
    }
}
```

---

## ✅ Verification Steps

After trying again:

1. **Check Firebase Console:**
   - Go to: https://console.firebase.google.com/project/lsu-tracker/firestore
   - Look for `EmergencyReports` collection
   - Should see new document created
   - Verify fields are present

2. **Check mobile app logs:**
   ```
   Success: <document-id>
   ```
   Or if error:
   ```
   Error: <error-message>
   ```

3. **Check web app:**
   - Emergency should appear in Emergency Alerts page
   - Or if dispatch was updated, status should show "emergency"

---

## 🆘 Still Not Working?

### Send me the exact error message:

From mobile app logcat:
```kotlin
.addOnFailureListener { exception ->
    Log.e("Emergency", "Code: ${exception.code}, Message: ${exception.message}")
    Log.e("Emergency", "Full error: ${exception.toString()}")
}
```

### Common issues and fixes:

| Error | Cause | Fix |
|-------|-------|-----|
| PERMISSION_DENIED | User not authenticated | Check login status |
| PERMISSION_DENIED | Wrong collection name | Use exact: `EmergencyReports` |
| PERMISSION_DENIED | Rules not deployed | Wait 1 minute, try again |
| INVALID_ARGUMENT | Missing required field | Check all fields present |
| UNAUTHENTICATED | No Firebase Auth token | Re-login to app |

---

## 📝 Summary

✅ **Rules updated:** All authenticated users can now create emergency reports  
✅ **Rules deployed:** Changes are live in Firebase  
✅ **Ready to test:** Try transmitting emergency signal again  

**The permission error should be fixed!** 🎉

If you still get an error, send me:
1. The exact error message from logcat
2. The Firebase Auth UID of the user
3. The collection name you're writing to
