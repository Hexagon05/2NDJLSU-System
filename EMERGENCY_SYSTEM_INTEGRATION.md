# 🚨 Emergency System Integration Guide

## System Overview

Your emergency system connects the **mobile app** (field personnel) with the **web app** (command center) through Firebase Firestore.

---

## 📊 Data Structure

### Firestore `dispatches` Collection

```typescript
{
  id: string;                    // Firestore document ID
  dispatchId: string;            // Display ID (e.g., "DIS-0001")
  officer: string;               // Officer in charge
  personnels: string;            // Personnel name (e.g., "SGT. Rodriguez")
  truck: string;                 // Truck codename (e.g., "BRAVO-12")
  status: string;                // "Pending" | "Ongoing" | "Delivered" | "emergency" ⚠️
  location: {
    lat: number;                 // Latitude
    lng: number;                 // Longitude
    label: string;               // Location name
  };
  supplies: Array<{
    category: string;
    item: string;
    quantity: number;
  }>;
  createdAt: Timestamp;
}
```

### 🔑 Emergency Trigger

**Status Field = "emergency"** triggers the emergency alert system!

---

## 🔄 Emergency Flow

### 1️⃣ Mobile App (Field Personnel)
```
Field personnel encounters emergency
         ↓
Clicks "EMERGENCY" button
         ↓
Updates dispatch status to "emergency"
         ↓
Firebase: dispatches/{id}.status = "emergency"
```

### 2️⃣ Firebase Realtime Listener
```
Web app listens to dispatches collection
         ↓
Filters: status === "emergency"
         ↓
Shows in Emergency Alerts page
```

### 3️⃣ Web App (Command Center)
```
Emergency Alerts page displays all emergency dispatches
         ↓
Admin clicks on emergency dispatch
         ↓
TICEmergencyModal opens with real-time chat
         ↓
Two-way communication established
```

---

## ✅ Web App Status (COMPLETE)

### Emergency Alerts Page
**Location:** `app/emergency-alerts/page.tsx`

**Features:**
- ✅ Real-time listener on dispatches collection
- ✅ Filters for `status === "emergency"` (case-insensitive)
- ✅ Displays emergency count and active trucks
- ✅ Shows dispatch details: ID, truck, personnel, location, time
- ✅ Opens TICEmergencyModal on click

**Code:**
```typescript
// Real-time listener
const q = query(
  collection(db, "dispatches"),
  orderBy("createdAt", "desc")
);

const unsub = onSnapshot(q, (snap) => {
  const allDispatches = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Dispatch, "id">),
  }));
  
  // ⚠️ FILTER FOR EMERGENCY STATUS
  const emergencyDispatches = allDispatches.filter(
    (d) => d.status.toLowerCase() === "emergency"
  );
  
  setDispatches(emergencyDispatches);
});
```

### TICEmergencyModal
**Location:** `components/TICEmergencyModal.tsx`

**Features:**
- ✅ Emergency header with red gradient
- ✅ Active status indicator
- ✅ Truck codename and personnel name display
- ✅ Real-time chat interface
- ✅ Message history with timestamps
- ✅ Send/receive messages

**Props:**
```typescript
interface TICEmergencyModalProps {
  onClose: () => void;
  truckCodename?: string;        // From dispatch.truck
  personnelName?: string;        // From dispatch.personnels
}
```

---

## ⚠️ Mobile App Status (NEEDS EMERGENCY BUTTON)

### Current Status
Your mobile app `DispatchScreen.kt` has:
- ✅ Active dispatch display
- ✅ Status update functionality
- ✅ Action buttons: "Delivered", "Stop Over", "Report Delay"
- ❌ **MISSING: "Emergency" button**

### What Needs to Be Added

#### 1. Add Emergency Button to Mobile App

**Location:** `ui/screens/DispatchScreen.kt`

**Current buttons:**
```kotlin
Row(
    modifier = Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.spacedBy(8.dp)
) {
    EnhancedActionChip(
        label = "Delivered",
        color = DeliveredGreen,
        bgColor = DeliveredGreenLight,
        onClick = onConfirmDelivery,
        modifier = Modifier.weight(1f)
    )
    EnhancedActionChip(
        label = "Stop Over",
        color = StopOverYellow,
        bgColor = StopOverYellowLight,
        onClick = {},
        modifier = Modifier.weight(1f)
    )
}
Spacer(modifier = Modifier.height(8.dp))
EnhancedActionChip(
    label = "Report Delay",
    color = ReportedOrange,
    bgColor = ReportedOrangeLight,
    onClick = {},
    modifier = Modifier.fillMaxWidth()
)
```

**ADD THIS EMERGENCY BUTTON:**
```kotlin
// Add after "Report Delay" button
Spacer(modifier = Modifier.height(8.dp))
EnhancedActionChip(
    label = "🚨 EMERGENCY - TIC",
    color = Color(0xFFDC2626),        // Red color
    bgColor = Color(0xFFFEE2E2),      // Light red background
    onClick = { 
        authViewModel.updateDispatchStatus("emergency")
    },
    modifier = Modifier.fillMaxWidth()
)
```

**Visual Result:**
```
┌───────────────────────────────────────┐
│  [Delivered]      [Stop Over]         │
│                                       │
│  [Report Delay]                       │
│                                       │
│  [🚨 EMERGENCY - TIC]  ← ADD THIS    │
└───────────────────────────────────────┘
```

#### 2. Verify AuthViewModel Implementation

**Make sure `updateDispatchStatus()` exists:**
```kotlin
class AuthViewModel : ViewModel() {
    fun updateDispatchStatus(newStatus: String) {
        val currentDispatch = _activeDispatch.value ?: return
        
        val db = FirebaseFirestore.getInstance()
        db.collection("dispatches")
            .document(currentDispatch.id)
            .update("status", newStatus)
            .addOnSuccessListener {
                Log.d("AuthViewModel", "Status updated to: $newStatus")
            }
            .addOnFailureListener { e ->
                Log.e("AuthViewModel", "Error updating status", e)
            }
    }
}
```

---

## 🎨 Enhanced Emergency Button Design (Optional)

For a more prominent emergency button with animation:

```kotlin
@Composable
fun EmergencyButton(onClick: () -> Unit) {
    val infiniteTransition = rememberInfiniteTransition()
    val scale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000),
            repeatMode = RepeatMode.Reverse
        )
    )
    
    Surface(
        onClick = onClick,
        color = Color(0xFFDC2626),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .scale(scale),
        shadowElevation = 8.dp
    ) {
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Rounded.Warning,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                "REPORT EMERGENCY - TIC",
                fontSize = 16.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
                letterSpacing = 1.2.sp
            )
        }
    }
}
```

---

## 🔐 Firestore Security Rules

**Already configured!** ✅

```javascript
match /dispatches/{dispatchId} {
  allow read: if isAuthenticated();
  allow create, delete: if isWebAdmin();
  allow update: if isAuthenticated();  // ✅ Field personnel can update status
  
  match /messages/{messageId} {
    allow read: if isAuthenticated();
    allow create: if isAuthenticated() 
                  && request.resource.data.senderId == request.auth.uid;
  }
}
```

Field personnel can update dispatch status to "emergency"! ✅

---

## 🧪 Testing the Emergency System

### Test Flow:

1. **Mobile App:**
   - Login as field personnel
   - Accept a dispatch
   - Click "🚨 EMERGENCY - TIC" button
   - Check Firebase: dispatch status should be "emergency"

2. **Web App:**
   - Login as admin
   - Go to "Emergency Alerts" page
   - Should see the dispatch appear immediately
   - Click on the emergency dispatch
   - TICEmergencyModal should open
   - Verify truck codename and personnel name are correct

3. **Firestore Console:**
   ```
   dispatches/{dispatchId}
   └─ status: "emergency" ✅
   ```

---

## 📱 Mobile App Field Mapping

Ensure your mobile app data model matches Firebase:

```kotlin
data class Dispatch(
    val id: String = "",                  // Firestore doc ID
    val dispatchId: String = "",          // Display ID
    val officer: String = "",             // ✅ ADD if missing
    val personnels: String = "",          // ✅ ADD if missing
    val truck: String = "",
    val status: String = "Pending",
    val location: Location = Location(),
    val supplies: List<Supply> = emptyList(),
    val createdAt: Timestamp? = null      // ✅ ADD if missing
)

data class Location(
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    val label: String = ""
)

data class Supply(
    val category: String = "",
    val item: String = "",
    val quantity: Int = 0
)
```

---

## ✅ Integration Checklist

### Mobile App:
- [ ] Add "🚨 EMERGENCY - TIC" button to DispatchScreen
- [ ] Verify `authViewModel.updateDispatchStatus()` exists
- [ ] Update to `status = "emergency"` on button click
- [ ] Ensure Dispatch model has all required fields (officer, personnels, createdAt)
- [ ] Test status update in Firebase Console

### Web App:
- [✅] Emergency Alerts page listens to dispatches
- [✅] Filters for status === "emergency"
- [✅] TICEmergencyModal displays truck and personnel info
- [✅] Real-time chat interface
- [✅] Firestore rules allow status updates

### Firebase:
- [✅] Security rules deployed
- [✅] Web admin document exists
- [✅] Field personnel can update dispatch status

---

## 🎯 Expected Result

**When field personnel clicks emergency button:**
1. Mobile: Status updates to "emergency" ✅
2. Firebase: Dispatch document status field = "emergency" ✅
3. Web: Emergency appears in Emergency Alerts page instantly ✅
4. Admin: Can click emergency to open chat modal ✅
5. Communication: Two-way real-time chat established ✅

---

## 🆘 Troubleshooting

### Emergency not showing on web app:
1. Check Firebase Console: Is status = "emergency"? (lowercase)
2. Check web app console: Any errors in listener?
3. Hard refresh: Ctrl + F5

### Cannot update status from mobile:
1. Check Firestore rules are deployed: `firebase deploy --only firestore:rules`
2. Check user authentication: Is personnelAccount document present?
3. Check console logs for permission errors

### Chat not working:
1. Verify messages subcollection exists: `dispatches/{id}/messages`
2. Check senderId matches Firebase Auth UID
3. Verify real-time listener is active

---

## 📞 Support

If you encounter issues:
1. Check browser console (F12) for errors
2. Check Firebase Console → Firestore for data
3. Verify authentication status
4. Check security rules are deployed

---

**Current Status:** Web app is READY ✅ | Mobile app needs emergency button ❌
