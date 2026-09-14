import { registerWebModule, NativeModule } from 'expo';

// SonanceAudioModule is not available on the web platform.
class SonanceAudioModule extends NativeModule<{}> {}

export default registerWebModule(SonanceAudioModule, 'SonanceAudioModule');
