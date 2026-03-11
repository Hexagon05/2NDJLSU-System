# 📊 Emergency System - Data Field Mapping

## Firestore `dispatches` Collection Structure

```
dispatches/
└── {documentId}/
    ├── id: string                      ← Firestore auto-generated document ID
    ├── dispatchId: string              ← Display ID (e.g., "DIS-0001")
    ├── officer: string                 ← Officer in charge
    ├── personnels: string              ← Personnel assigned (e.g., "SGT. Rodriguez")
    ├── truck: string                   ← Truck codename (e.g., "BRAVO-12")
    ├── status: string                  ← "Pending" | "Ongoing" | "Delivered" | "emergency"
    ├── location: {
    │   ├── lat: number                 ← Latitude
    │   ├── lng: number                 ← Longitude
    │   └── label: string               ← Location name
    │   }
    ├── supplies: [{
    │   ├── category: string
    │   ├── item: string
    │   └── quantity: number
    │   }]
    └── createdAt: Timestamp            ← Creation timestamp
```

---

## Mobile App → Firebase Mapping

### When Creating/Reading Dispatch

```kotlin
// Mobile App Model
data class Dispatch(
    val id: String = "",                    // Maps to: Firestore document ID
    val dispatchId: String = "",            // Maps to: dispatchId field
    val officer: String = "",               // Maps to: officer field
    val personnels: String = "",            // Maps to: personnels field ⚠️
    val truck: String = "",                 // Maps to: truck field
    val status: String = "Pending",         // Maps to: status field ⚠️ EMERGENCY KEY
    val location: Location = Location(),    // Maps to: location object
    val supplies: List<Supply> = emptyList(), // Maps to: supplies array
    val createdAt: Timestamp? = null        // Maps to: createdAt field
)

data class Location(
    val lat: Double = 0.0,                  // Maps to: location.lat
    val lng: Double = 0.0,                  // Maps to: location.lng
    val label: String = ""                  // Maps to: location.label
)

data class Supply(
    val category: String = "",              // Maps to: supplies[].category
    val item: String = "",                  // Maps to: supplies[].item
    val quantity: Int = 0                   // Maps to: supplies[].quantity
)
```

---

## Web App → Firebase Mapping

### When Reading Dispatch

```typescript
// Web App Interface
interface Dispatch {
  id: string;                    // Firestore document ID
  dispatchId: string;            // dispatchId field
  officer: string;               // officer field
  personnels: string;            // personnels field ⚠️
  truck: string;                 // truck field
  status: string;                // status field ⚠️ EMERGENCY KEY
  location: {
    lat: number;                 // location.lat
    lng: number;                 // location.lng
    label: string;               // location.label
  };
  supplies: Array<{
    category: string;            // supplies[].category
    item: string;                // supplies[].item
    quantity: number;            // supplies[].quantity
  }>;
  createdAt: Timestamp | null;   // createdAt field
}
```

---

## 🚨 Emergency Flow - Field Updates

### Step 1: Mobile App Updates Status

```kotlin
// Mobile: User clicks emergency button
authViewModel.updateDispatchStatus("emergency")

// Firebase Update:
db.collection("dispatches")
  .document(currentDispatch.id)
  .update("status", "emergency")  // ⚠️ KEY UPDATE
```

**Firestore Result:**
```json
dispatches/abc123xyz {
  "dispatchId": "DIS-0001",
  "officer": "CPT. Santos",
  "personnels": "SGT. Rodriguez",
  "truck": "BRAVO-12",
  "status": "emergency",          ← CHANGED FROM "Ongoing" to "emergency"
  "location": {
    "lat": 9.8236,
    "lng": 118.7253,
    "label": "Brgy. Tiniguiban, Puerto Princesa"
  },
  "supplies": [...],
  "createdAt": Timestamp(...)
}
```

---

### Step 2: Web App Detects Emergency

```typescript
// Web: Real-time listener detects change
const q = query(
  collection(db, "dispatches"),
  orderBy("createdAt", "desc")
);

onSnapshot(q, (snap) => {
  const allDispatches = snap.docs.map((d) => ({
    id: d.id,
    ...d.data()
  }));
  
  // Filter for emergency status
  const emergencyDispatches = allDispatches.filter(
    (d) => d.status.toLowerCase() === "emergency"  // ⚠️ FILTER
  );
  
  setDispatches(emergencyDispatches);
});
```

---

### Step 3: Web App Displays Emergency

```typescript
// Web: Emergency Alerts page shows dispatch
<div onClick={() => setSelectedDispatch(dispatch)}>
  <p>Dispatch ID: {dispatch.dispatchId}</p>
  <p>Truck: {dispatch.truck}</p>
  <p>Personnel: {dispatch.personnels}</p>
  <p>Location: {dispatch.location.label}</p>
</div>

// When clicked, opens modal:
<TICEmergencyModal
  onClose={() => setSelectedDispatch(null)}
  truckCodename={dispatch.truck}           // "BRAVO-12"
  personnelName={dispatch.personnels}      // "SGT. Rodriguez"
/>
```

---

## ✅ Required Fields for Emergency System

### Minimum Required (Mobile App):
```kotlin
val status: String = ""        // ⚠️ CRITICAL: Must update to "emergency"
val truck: String = ""         // ⚠️ CRITICAL: Displayed in web emergency modal
val personnels: String = ""    // ⚠️ CRITICAL: Displayed in web emergency modal
```

### Recommended (Mobile App):
```kotlin
val dispatchId: String = ""    // Good for tracking
val location: Location         // Helps identify emergency location
```

---

## 🔍 Field Name Verification

### Case Sensitivity Check:
- ✅ Field name: `status` (lowercase)
- ✅ Emergency value: `"emergency"` (lowercase)
- ✅ Web filter: `.toLowerCase() === "emergency"`

### Common Issues:
❌ `status: "Emergency"` → Won't be detected (capital E)
❌ `status: "EMERGENCY"` → Won't be detected unless web filters for it
✅ `status: "emergency"` → Correctly detected

**Solution:** Always use lowercase `"emergency"`

---

## 🎯 Summary

**Mobile App Must:**
1. Update `status` field to `"emergency"` (lowercase)
2. Ensure `truck` field is populated
3. Ensure `personnels` field is populated

**Web App Will:**
1. Listen to all dispatches
2. Filter where `status === "emergency"`
3. Display in Emergency Alerts page
4. Show `truck` and `personnels` in modal

**Firebase Stores:**
```
status: "emergency"  ← Single source of truth
```

**Result:** Instant emergency notification from field to command center! 🚨

---

## 📱 Quick Test Checklist

### Mobile App:
- [ ] Dispatch model has `status` field
- [ ] Dispatch model has `truck` field  
- [ ] Dispatch model has `personnels` field
- [ ] `updateDispatchStatus("emergency")` implemented
- [ ] Emergency button added to UI
- [ ] Button calls `updateDispatchStatus("emergency")`

### Web App:
- [✅] Emergency Alerts page exists
- [✅] Filters for `status === "emergency"`
- [✅] Shows truck name
- [✅] Shows personnel name
- [✅] Opens TICEmergencyModal on click

### Firebase:
- [✅] Firestore rules allow status updates
- [✅] Rules deployed
- [✅] Personnel can authenticate

### Integration Test:
1. [ ] Click emergency button in mobile app
2. [ ] Check Firebase Console: status = "emergency"
3. [ ] Check web app: dispatch appears in Emergency Alerts
4. [ ] Click emergency: modal opens with correct truck/personnel
5. [ ] Success! 🎉
