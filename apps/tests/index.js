import App from './App';
import { registerRootComponent } from 'expo';
import { Buffer } from '@craftzdog/react-native-buffer';

global.Buffer = Buffer;
global.process.cwd = () => 'sxsx';
global.process.env = { NODE_ENV: 'production' };
global.location = {};

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately

registerRootComponent(App);
