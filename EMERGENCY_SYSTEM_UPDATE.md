# 🚨 Emergency System Update - EmergencyReports Collection

## ✅ Changes Completed

The emergency alert system has been changed from checking dispatch status to using the dedicated **EmergencyReports collection**.

---

## 📝 What Changed

### **Before:**
- Emergency alerts triggered by setting dispatch `status = "emergency"`
- Web app filtered dispatches where `status === "emergency"`
- Messages stored under `dispatches/{dispatchId}/messages`

### **After:**
- Emergency alerts triggered by creating documents in **EmergencyReports** collection
- Web app queries EmergencyReports where `status === "active"`
- Messages stored under `EmergencyReports/{reportId}/messages`

---

## 🔧 Files Modified

### 1. **app/emergency-alerts/page.tsx**
- ✅ Changed from `dispatches` collection to `EmergencyReports`
- ✅ Added query filter: `where("status", "==", "active")`
- ✅ Updated interface from `Dispatch` to `EmergencyReport`
- ✅ Updated UI table to display emergency report fields:
  - Report ID (last 6 chars of document ID)
  - Personnel name (senderName)
  - Type (TIC, etc.)
  - Status (active, pending, resolved)
  - Description
  - Location with coordinates
  - Timestamp
- ✅ Passes `emergencyReportId` to TICEmergencyModal

### 2. **components/EmergencyMonitor.tsx**
- ✅ Changed from `dispatches` collection to `EmergencyReports`
- ✅ Added filter: `where("status", "==", "active")`
- ✅ Updated interface from `Dispatch` to `EmergencyReport`
- ✅ Passes emergency report data (id, senderName, type, location, description, imageUrl) to modal

### 3. **components/TICEmergencyModal.tsx**
- ✅ Changed prop from `dispatchId` to `emergencyReportId`
- ✅ Changed messages path from `dispatches/{dispatchId}/messages` to `EmergencyReports/{reportId}/messages`
- ✅ Added new props: `location`, `description`, `imageUrl`
- ✅ Updated default values (truckCodename → "TIC", personnelName → "Field Personnel")

### 4. **firestore.rules**
- ✅ Added messages subcollection rule under EmergencyReports:
  ```javascript
  match /EmergencyReports/{reportId} {
    match /messages/{messageId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() 
                    && request.resource.data.senderId == request.auth.uid;
    }
  }
  ```
- ✅ Deployed to Firebase successfully ✅

---

## 📊 EmergencyReport Data Structure

```typescript
interface EmergencyReport {
  id: string;                    // Firestore document ID
  senderId: string;              // Firebase Auth UID
  senderName: string;            // Display name or email
  location: {
    lat: number;
    lng: number;
    label?: string;
  };
  description: string;           // Situation description
  imageUrl?: string;             // Optional photo evidence
  timestamp: Timestamp;          // When report was created
  status: string;                // "active", "pending", "resolved"
  type?: string;                 // "TIC", "MEDICAL", etc.
}
```

---

## 🔄 How It Works Now

### **1. Mobile App Creates Emergency Report**
Mobile app creates document in `EmergencyReports`:
```javascript
db.collection("EmergencyReports").add({
  senderId: currentUser.uid,
  senderName: currentUser.displayName,
  location: { lat: 9.7489, lng: 118.7471, label: "Emergency Location" },
  description: "Troops in contact, requesting backup",
  imageUrl: "cloudinary-url-here",
  timestamp: FieldValue.serverTimestamp(),
  status: "active",  // ← This triggers the emergency alert
  type: "TIC"
});
```

### **2. Web App Detects Emergency**
Two systems listen for active emergency reports:

**Global Monitor (EmergencyMonitor.tsx):**
- Runs on every page (except login)
- Queries: `EmergencyReports where status === "active"`
- Shows modal automatically when new report appears

**Emergency Alerts Page:**
- Shows table of all active emergency reports
- Allows admin to click "Respond" button
- Opens chat modal for communication

### **3. Chat Communication**
Messages stored in subcollection: `EmergencyReports/{reportId}/messages`

**Admin sends message:**
```javascript
db.collection("EmergencyReports")
  .doc(reportId)
  .collection("messages")
  .add({
    senderId: adminUid,
    senderName: "Admin",
    text: "Help is on the way!",
    timestamp: Timestamp.now(),
    isAdmin: true
  });
```

**Personnel receives message:**
- Mobile app listens to same subcollection
- Real-time updates via onSnapshot

### **4. Resolving Emergency**
Web admin updates status to close emergency:
```javascript
db.collection("EmergencyReports")
  .doc(reportId)
  .update({ status: "resolved" });
```
- Report disappears from active alerts
- Chat history preserved for records

---

## 📱 Mobile App Changes Required

The mobile app needs to be updated to match this new system:

### ✅ Already Compatible:
- Creating EmergencyReports documents ✅
- Permission rules allow `isAuthenticated()` to create reports ✅
- Image upload to Cloudinary ✅

### ⚠️ Needs Update:
1. **Stop updating dispatch status to "emergency"**
   - Old: `dispatches/{id}.update({ status: "emergency" })`
   - Remove this code

2. **Create EmergencyReport instead**
   - New: `EmergencyReports.add({ ...data, status: "active" })`
   - Already implemented ✅

3. **Update chat message path** (if not already done)
   - Old: `dispatches/{dispatchId}/messages`
   - New: `EmergencyReports/{reportId}/messages`

---

## 🧪 Testing Steps

### 1. **Test Emergency Report Creation (Mobile)**
```
1. Open mobile app T.I.C. screen
2. Fill location, description, upload photo
3. Click "TRANSMIT EMERGENCY SIGNAL"
4. Should create document in EmergencyReports collection
```

### 2. **Test Web Detection**
```
1. Open web app (any page except login)
2. Emergency modal should pop up automatically
3. Shows personnel name, location, description
4. Has chat interface
```

### 3. **Test Emergency Alerts Page**
```
1. Navigate to Emergency Alerts page
2. Should see table row for the emergency report
3. Shows: Report ID, Personnel, Type, Status, Description, Location, Time
4. Click "Respond" button
5. Opens chat modal
```

### 4. **Test Chat Communication**
```
1. Admin types message in web modal
2. Click send
3. Mobile app should receive message instantly
4. Mobile sends reply
5. Web admin receives reply instantly
```

### 5. **Test Multiple Emergencies**
```
1. Create multiple emergency reports from mobile
2. Web should show all in Emergency Alerts page
3. Global modal shows most recent one
4. After dismissing modal, next emergency appears
```

---

## 🔐 Security (Firestore Rules)

### Who Can Create Emergency Reports:
✅ **All authenticated users** (web admins + field personnel)

### Who Can Read Emergency Reports:
✅ **All authenticated users**

### Who Can Update/Delete Emergency Reports:
✅ **Web admins only**

### Who Can Send Messages:
✅ **All authenticated users** (with sender ID validation)

### Who Can Delete Messages:
❌ **No one** (audit protection)

---

## ✅ Advantages of New System

### 1. **Cleaner Data Model**
- Separates emergency reports from dispatch workflow
- EmergencyReports collection dedicated to emergencies only
- No need to filter dispatches by status

### 2. **Better Mobile Integration**
- Mobile app doesn't need to know about dispatches
- Can report emergency without existing dispatch
- Direct EmergencyReports.add() is simpler

### 3. **Preserved History**
- Emergency reports stay in database even after resolved
- Complete audit trail with chat messages
- Can query by date range, status, personnel, etc.

### 4. **Flexibility**
- Can add emergency types: TIC, MEDICAL, EVACUATION, etc.
- Can add priority levels
- Can link to dispatches if needed (optional field)

### 5. **Performance**
- Query only active emergencies (filtered at database level)
- No need to scan all dispatches
- Faster response time

---

## 📊 Database Collections Structure

```
FirebaseFirestore
├── users/                          (Web admins)
├── personnelAccount/               (Field personnel)
├── dispatches/                     (Logistics workflow)
│   └── {dispatchId}/
│       └── messages/               (Old dispatch chat - still works)
├── EmergencyReports/               (NEW - Emergency system)
│   └── {reportId}/
│       ├── senderId
│       ├── senderName
│       ├── location
│       ├── description
│       ├── imageUrl
│       ├── timestamp
│       ├── status                  ("active", "pending", "resolved")
│       ├── type                    ("TIC", "MEDICAL", etc.)
│       └── messages/               (NEW - Emergency chat)
│           └── {messageId}/
├── vehicles/
├── dispatch_history/
└── meta/
```

---

## 🚀 Next Steps

### For Web App: ✅ COMPLETE
- [x] Update emergency-alerts page
- [x] Update EmergencyMonitor component
- [x] Update TICEmergencyModal
- [x] Update Firestore rules
- [x] Deploy rules to Firebase

### For Mobile App: ⚠️ RECOMMENDED
- [ ] Ensure emergency reports use EmergencyReports collection
- [ ] Update chat to use EmergencyReports/{reportId}/messages
- [ ] Remove old dispatch status = "emergency" code (if exists)
- [ ] Test end-to-end emergency workflow
- [ ] Add status update (resolve emergency) functionality

### Optional Enhancements:
- [ ] Add priority field (LOW, MEDIUM, HIGH, CRITICAL)
- [ ] Add emergency type selection (TIC, MEDICAL, EVACUATION, etc.)
- [ ] Add responder assignment (which admin is handling it)
- [ ] Add response time tracking
- [ ] Add notification sounds for new emergencies
- [ ] Add map view of all active emergencies
- [ ] Add export/report functionality

---

## 🔍 Verification

### Check Firebase Console:
1. Go to: https://console.firebase.google.com/project/lsu-tracker/firestore
2. Look for **EmergencyReports** collection
3. Active reports should have `status: "active"`
4. Each report should have `messages` subcollection
5. Messages should have `senderId`, `text`, `timestamp`, `isAdmin`

### Check Firestore Rules:
1. Go to: https://console.firebase.google.com/project/lsu-tracker/firestore/rules
2. Verify EmergencyReports rules exist
3. Verify messages subcollection rules exist
4. Rules should match the deployed firestore.rules file

---

## 📞 Support

If you encounter any issues:

1. **Permission Denied Errors:**
   - Check user is authenticated
   - Verify collection name is exact: `EmergencyReports` (case-sensitive)
   - Verify user has Firebase Auth UID

2. **Messages Not Appearing:**
   - Check messages subcollection path: `EmergencyReports/{reportId}/messages`
   - Verify onSnapshot listener is active
   - Check Firestore rules console for denied requests

3. **Emergency Not Showing:**
   - Verify status field is exactly "active"
   - Check EmergencyMonitor is mounted (not on login page)
   - Verify query filter: `where("status", "==", "active")`

4. **Chat Not Working:**
   - Verify emergencyReportId is passed to modal
   - Check senderId matches auth UID
   - Verify Firestore rules allow message creation

---

## ✅ Status: DEPLOYED & READY

- Web app updated ✅
- Firestore rules updated ✅
- Rules deployed to Firebase ✅
- Documentation complete ✅

**The emergency system now uses EmergencyReports collection!** 🎉
