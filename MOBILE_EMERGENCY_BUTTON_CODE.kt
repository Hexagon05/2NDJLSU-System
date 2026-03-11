// 🚨 EMERGENCY BUTTON CODE FOR MOBILE APP
// Add this to: ui/screens/DispatchScreen.kt

// ============================================
// OPTION 1: Simple Addition (Recommended)
// ============================================
// Add this code AFTER the "Report Delay" button in ActiveDispatchContent

Spacer(modifier = Modifier.height(8.dp))

// Emergency Button
EnhancedActionChip(
    label = "🚨 EMERGENCY - TIC",
    color = Color(0xFFDC2626),        // Red-600
    bgColor = Color(0xFFFEE2E2),      // Red-50
    onClick = { 
        authViewModel.updateDispatchStatus("emergency")
    },
    modifier = Modifier.fillMaxWidth()
)

// ============================================
// OPTION 2: Full Replacement of Button Section
// ============================================
// Replace the entire button section (lines ~240-268) with this:

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
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                EnhancedActionChip(
                    label = "Report Delay",
                    color = ReportedOrange,
                    bgColor = ReportedOrangeLight,
                    onClick = {},
                    modifier = Modifier.weight(1f)
                )
                
                // 🚨 NEW: Emergency Button
                EnhancedActionChip(
                    label = "🚨 EMERGENCY",
                    color = Color(0xFFDC2626),
                    bgColor = Color(0xFFFEE2E2),
                    onClick = { 
                        authViewModel.updateDispatchStatus("emergency")
                    },
                    modifier = Modifier.weight(1f)
                )
            }

// ============================================
// OPTION 3: Prominent Emergency Button (Most Visible)
// ============================================
// Add this AFTER all other buttons for maximum visibility

            Spacer(modifier = Modifier.height(12.dp))
            
            // Big Red Emergency Button
            Surface(
                onClick = { authViewModel.updateDispatchStatus("emergency") },
                color = Color(0xFFDC2626),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(60.dp),
                shadowElevation = 4.dp
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
                        modifier = Modifier.size(28.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        "REPORT EMERGENCY - TIC",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                        letterSpacing = 1.sp
                    )
                }
            }

// ============================================
// IMPORTS NEEDED (Add to top of file if missing)
// ============================================

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.ui.graphics.Color

// ============================================
// COLOR DEFINITIONS (Add to ui/theme/Color.kt if not exists)
// ============================================

val EmergencyRed = Color(0xFFDC2626)         // Red-600
val EmergencyRedLight = Color(0xFFFEE2E2)    // Red-50

// ============================================
// VERIFY AuthViewModel (In viewmodel/AuthViewModel.kt)
// ============================================

fun updateDispatchStatus(newStatus: String) {
    val currentDispatch = _activeDispatch.value ?: return
    val db = FirebaseFirestore.getInstance()
    
    db.collection("dispatches")
        .document(currentDispatch.id)
        .update("status", newStatus)
        .addOnSuccessListener {
            Log.d("AuthViewModel", "✅ Status updated to: $newStatus")
            // Optionally show a toast/snackbar to user
        }
        .addOnFailureListener { e ->
            Log.e("AuthViewModel", "❌ Error updating status", e)
            // Optionally show error message to user
        }
}

// ============================================
// COMPLETE ActiveDispatchContent WITH EMERGENCY
// ============================================

@Composable
fun ColumnScope.ActiveDispatchContent(
    dispatch: Dispatch,
    onConfirmDelivery: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        modifier = Modifier.size(32.dp),
                        shape = CircleShape,
                        color = OngoingBlueLight
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Rounded.LocalShipping,
                                contentDescription = null,
                                tint = OngoingBlue,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        "Current Dispatch",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = TextPrimary
                    )
                }
                Surface(
                    color = if (dispatch.status == "Ongoing") OngoingBlue else ReportedOrange,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        dispatch.status.uppercase(),
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("Dispatch ID", color = TextSecondary, fontSize = 12.sp)
                    Text(dispatch.dispatchId, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = TextPrimary)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Truck Unit", color = TextSecondary, fontSize = 12.sp)
                    Text(dispatch.truck, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = TextPrimary)
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Action Buttons Row 1
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
            
            // Action Buttons Row 2
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                EnhancedActionChip(
                    label = "Report Delay",
                    color = ReportedOrange,
                    bgColor = ReportedOrangeLight,
                    onClick = {},
                    modifier = Modifier.weight(1f)
                )
                
                // 🚨 EMERGENCY BUTTON
                EnhancedActionChip(
                    label = "🚨 EMERGENCY",
                    color = Color(0xFFDC2626),
                    bgColor = Color(0xFFFEE2E2),
                    onClick = { 
                        authViewModel.updateDispatchStatus("emergency")
                    },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }

    Spacer(modifier = Modifier.height(16.dp))

    Row(
        modifier = Modifier.padding(bottom = 8.dp, start = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Rounded.Navigation,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = TextSecondary
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text("TARGET: ${dispatch.location.label.uppercase()}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextSecondary)
    }

    MapPlaceholder(
        modifier = Modifier.weight(1f),
        text = "${dispatch.location.lat}, ${dispatch.location.lng}"
    )
}

// ============================================
// UPDATE: DispatchScreen Parameters
// ============================================
// Make sure authViewModel is passed to ActiveDispatchContent

@Composable
fun DispatchScreen(
    authViewModel: AuthViewModel,
    onConfirmDelivery: () -> Unit,
    onContactSupport: () -> Unit
) {
    val user by authViewModel.user.collectAsState()
    val personnel by authViewModel.personnel.collectAsState()
    val activeDispatch by authViewModel.activeDispatch.collectAsState()
    
    // ... existing code ...
    
    if (activeDispatch != null && activeDispatch?.status != "Pending") {
        ActiveDispatchContent(
            dispatch = activeDispatch!!,
            onConfirmDelivery = onConfirmDelivery,
            authViewModel = authViewModel  // ⚠️ ADD THIS PARAMETER
        )
    }
}

// Update ActiveDispatchContent signature:
@Composable
fun ColumnScope.ActiveDispatchContent(
    dispatch: Dispatch,
    onConfirmDelivery: () -> Unit,
    authViewModel: AuthViewModel  // ⚠️ ADD THIS PARAMETER
) {
    // ... existing code with emergency button ...
}

// ============================================
// TESTING
// ============================================

// 1. Build and run the mobile app
// 2. Accept a dispatch
// 3. Click the "🚨 EMERGENCY" button
// 4. Check Firebase Console: dispatches/{id}/status should be "emergency"
// 5. Check web app Emergency Alerts page: dispatch should appear
// 6. Click the emergency in web app: modal should open

// ============================================
// EXPECTED FIREBASE UPDATE
// ============================================

/*
Before:
dispatches/abc123 {
  dispatchId: "DIS-0001",
  status: "Ongoing",  ← Current status
  truck: "BRAVO-12",
  ...
}

After clicking emergency button:
dispatches/abc123 {
  dispatchId: "DIS-0001",
  status: "emergency",  ← Updated to emergency
  truck: "BRAVO-12",
  ...
}

Web app will immediately see this change and show it in Emergency Alerts page!
*/
