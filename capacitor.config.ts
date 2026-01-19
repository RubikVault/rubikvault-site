import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rubikvault.app',
  appName: 'RubikVault',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    hostname: 'rubikvault-site.pages.dev',
    // For local development, uncomment:
    // url: 'http://localhost:8788',
    // cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0b0f19",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#3b82f6",
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0b0f19'
    }
  },
  ios: {
    contentInset: 'always'
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;
