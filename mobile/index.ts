import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

if (__DEV__) {
  // Expo Go may briefly lose its hot-reload socket while the Android camera is
  // active. This is a development-channel warning, not an application failure,
  // and it must not cover the photo-analysis flow.
  LogBox.ignoreLogs(['Cannot connect to Expo CLI.']);
}

// QA 夹具入口：仅在开发模式下通过 URL 参数 ?qa=1 激活
// 不进入正式导航，不影响生产构建
const isQA =
  __DEV__ &&
  typeof window !== 'undefined' &&
  typeof window.location !== 'undefined' &&
  new URLSearchParams(window.location.search).has('qa');

const RootComponent = isQA
  ? require('./QAApp').default
  : require('./App').default;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(RootComponent);
