# 📱 RubikVault Native App Guide

> **From PWA to Native: iOS App Store & Google Play Store Deployment**

This guide walks you through converting RubikVault from a Progressive Web App (PWA) to native iOS and Android apps using Capacitor.

---

## 🎯 **Decision: PWA vs Native**

### **PWA (Current Setup)** ✅
- ✅ No build required
- ✅ No app store approval
- ✅ Instant updates (no submission)
- ✅ Lower maintenance
- ✅ Cross-platform automatically
- ⚠️ Limited native features
- ⚠️ No App Store visibility

### **Native App (Optional)** 
- ✅ App Store visibility
- ✅ Full native features (push, camera, etc.)
- ✅ Better performance (cached)
- ⚠️ Requires build/submission
- ⚠️ App Store review (1-7 days)
- ⚠️ Higher maintenance

**Recommendation**: Start with PWA, add native wrapper if needed later!

---

## 🚀 **Phase 1: Install Capacitor (~5 min)**

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site

# Install Capacitor
npm install --save @capacitor/core @capacitor/cli

# Install platform SDKs
npm install --save @capacitor/ios @capacitor/android

# Install common plugins
npm install --save @capacitor/splash-screen @capacitor/status-bar
```

**Capacitor Config**: Already created at `capacitor.config.ts` ✅

---

## 🍎 **Phase 2: iOS Setup (~30 min)**

### **Prerequisites**
- macOS (required)
- Xcode 15+ (free from App Store)
- Apple Developer Account ($99/year for App Store)

### **Steps**

```bash
# Initialize iOS platform
npx cap add ios

# Copy web assets
npx cap copy ios

# Open in Xcode
npx cap open ios
```

### **In Xcode**

1. **Set Bundle Identifier**:
   - Select project → General → Bundle Identifier
   - Change to: `com.rubikvault.app`

2. **Set Team** (if deploying):
   - General → Signing & Capabilities
   - Select your Apple Developer Team

3. **Configure Icons**:
   - Assets.xcassets → AppIcon
   - Drag 1024x1024 icon (already in `public/assets/rv-icon.png`)

4. **Configure Splash Screen**:
   - Already configured via `capacitor.config.ts`
   - Color: `#0b0f19` (dark blue)

5. **Test on Simulator**:
   - Select iPhone simulator
   - Click ▶️ Run
   - App should launch!

### **App Store Submission** (Optional)

```bash
# Archive build
# Xcode → Product → Archive → Distribute App
```

Requirements:
- Apple Developer Account ($99/year)
- App Store Connect setup
- Screenshots (6.5", 6.7", 5.5")
- Privacy Policy (already at `/privacy.html`)
- App Store description

---

## 🤖 **Phase 3: Android Setup (~30 min)**

### **Prerequisites**
- Android Studio (free)
- Java JDK 17+ (install via Android Studio)
- Google Play Console Account ($25 one-time)

### **Steps**

```bash
# Initialize Android platform
npx cap add android

# Copy web assets
npx cap copy android

# Open in Android Studio
npx cap open android
```

### **In Android Studio**

1. **Set Package Name**:
   - `app/build.gradle` → `applicationId`
   - Should be: `com.rubikvault.app`

2. **Configure Icons**:
   - `res/mipmap` folders
   - Use Android Studio → Image Asset tool
   - Source: `public/assets/rv-icon.png`

3. **Configure Splash Screen**:
   - Already configured via `capacitor.config.ts`
   - Color: `#0b0f19` (dark blue)

4. **Test on Emulator**:
   - Tools → AVD Manager → Create Virtual Device
   - Select device (Pixel 7)
   - Click ▶️ Run
   - App should launch!

### **Play Store Submission** (Optional)

```bash
# Generate signed APK/AAB
# Build → Generate Signed Bundle/APK → Android App Bundle (AAB)
```

Requirements:
- Google Play Console Account ($25 one-time)
- App signing key
- Screenshots (phone, 7", 10")
- Privacy Policy (already at `/privacy.html`)
- Play Store description

---

## 🔄 **Phase 4: Development Workflow**

### **Local Development**

```bash
# 1. Make changes to web code (public/)
# 2. Sync to native
npx cap sync

# 3. Run on platform
npx cap run ios
npx cap run android
```

### **Live Reload** (Recommended)

```bash
# 1. Start local dev server
npm run dev

# 2. Update capacitor.config.ts
# Uncomment server.url and set to http://localhost:8788

# 3. Run app
npx cap run ios --livereload
npx cap run android --livereload
```

Now changes auto-refresh in the native app!

### **Production Build**

```bash
# 1. Build web assets (if needed)
npm run build

# 2. Sync to native
npx cap sync

# 3. Open in IDE and archive
npx cap open ios    # Then: Product → Archive
npx cap open android # Then: Build → Generate Signed Bundle
```

---

## 🎨 **Phase 5: Native Features (Optional)**

### **Push Notifications**

```bash
npm install @capacitor/push-notifications

# Add to capacitor.config.ts:
# plugins: {
#   PushNotifications: {
#     presentationOptions: ["badge", "sound", "alert"]
#   }
# }
```

### **Camera**

```bash
npm install @capacitor/camera

# Usage in app:
# const photo = await Camera.getPhoto({
#   quality: 90,
#   allowEditing: false,
#   resultType: CameraResultType.Uri
# });
```

### **Deep Links** (Already Configured!)

iOS: Automatic (uses `capacitor.config.ts` → `server.hostname`)  
Android: Automatic (uses `android:scheme="https"`)

Test:
- iOS: Open Safari → `https://rubikvault-site.pages.dev/analyze/AAPL`
- Taps "Open in App" → Native app opens!

---

## 📦 **Asset Requirements**

### **Icons**

Already optimized for native:
- `public/assets/rv-icon.png` (512x512) → iOS/Android icon
- `public/assets/rv-apple-icon.png` (180x180) → iOS specific

### **Splash Screens**

Configured in `capacitor.config.ts`:
- Background: `#0b0f19` (dark blue)
- Duration: 2 seconds
- Auto-hide: Yes

### **Screenshots** (For Stores)

iOS App Store:
- 6.7" (iPhone 14 Pro Max): 1290×2796 px
- 6.5" (iPhone 11 Pro Max): 1242×2688 px
- 5.5" (iPhone 8 Plus): 1242×2208 px

Android Play Store:
- Phone: 1080×1920 px minimum
- 7" Tablet: 1200×1920 px minimum
- 10" Tablet: 1600×2560 px minimum

---

## 🧪 **Testing Checklist**

### **Functional Tests**
- [ ] App launches
- [ ] Stock Analyzer search works
- [ ] Deep links open correctly (`/analyze/AAPL`)
- [ ] Mission Control accessible
- [ ] API endpoints reachable
- [ ] Offline mode works (Service Worker)
- [ ] PWA install prompt shows (web)

### **Platform-Specific**
- [ ] iOS: Status bar correct color
- [ ] iOS: Safe area insets respected
- [ ] Android: Back button works
- [ ] Android: Status bar correct color
- [ ] Splash screen shows/hides correctly
- [ ] Icons correct on home screen

---

## 🚨 **Common Issues**

### **"Failed to sync" Error**
```bash
# Clean and rebuild
rm -rf ios android node_modules
npm install
npx cap add ios
npx cap add android
```

### **CORS Errors in Native**
Native apps use `capacitor://` scheme, not CORS.  
If seeing errors, check `capacitor.config.ts` → `server.hostname`.

### **Icons Not Updating**
```bash
# iOS
rm -rf ios/App/App/Assets.xcassets/AppIcon.appiconset/*
npx cap sync ios

# Android
rm -rf android/app/src/main/res/mipmap-*
npx cap sync android
```

### **Splash Screen Not Showing**
Check `capacitor.config.ts` → `SplashScreen` plugin config.  
Ensure assets in correct folders:
- iOS: `ios/App/App/Assets.xcassets/Splash.imageset/`
- Android: `android/app/src/main/res/drawable/splash.png`

---

## 💰 **Cost Summary**

### **PWA (Current)** = 0€
- Hosting: Cloudflare Pages (Free)
- Installation: Free (Add to Home Screen)
- Updates: Instant (Free)

### **Native App (Optional)**
- **iOS**: $99/year (Apple Developer)
- **Android**: $25 one-time (Google Play)
- **Total First Year**: $124
- **Recurring**: $99/year (iOS only)

---

## 📊 **Decision Matrix**

```
╔════════════════════════════════════════════════════════╗
║         SHOULD YOU BUILD NATIVE APPS?                  ║
╠════════════════════════════════════════════════════════╣
║ ✅ YES if:                                             ║
║   • Want App Store visibility                          ║
║   • Need native features (push, camera, etc.)          ║
║   • $124 budget available                              ║
║   • Have time for app store submissions                ║
║                                                        ║
║ ❌ NO if (stay PWA):                                   ║
║   • 0€ operation critical                              ║
║   • PWA features sufficient                            ║
║   • Want instant updates                               ║
║   • No time for store approvals                        ║
╚════════════════════════════════════════════════════════╝
```

**Current Recommendation**: **Stay PWA!** ✅

Why?
- RubikVault works perfectly as PWA
- Installable on iOS/Android already
- Offline capable
- Deep links work
- 0€ operation maintained

**Build Native Later** if:
- User demand for "App Store presence"
- Need push notifications
- Want native camera/biometric features

---

## 🎯 **Next Steps**

### **For PWA (Recommended)**
1. ✅ Already done! Site is PWA-ready
2. Test "Add to Home Screen" on iOS/Android
3. Share deep links (`/analyze/AAPL`)
4. Monitor usage via Cloudflare Analytics

### **For Native App (Optional)**
1. Install Capacitor (`npm install @capacitor/core @capacitor/cli`)
2. Add iOS platform (`npx cap add ios`)
3. Test in Xcode simulator
4. Submit to App Store (if desired)

---

**Questions?** Check Mission Control → `/internal/health` for system diagnostics!

**Last Updated**: 2026-01-19  
**Capacitor Version**: 6.x  
**Tested Platforms**: iOS 16+, Android 12+
