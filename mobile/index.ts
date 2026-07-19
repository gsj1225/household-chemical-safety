import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

import App from './App';

if (__DEV__) {
  // Expo Go may briefly lose its hot-reload socket while the Android camera is
  // active. This is a development-channel warning, not an application failure,
  // and it must not cover the photo-analysis flow.
  LogBox.ignoreLogs(['Cannot connect to Expo CLI.']);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
