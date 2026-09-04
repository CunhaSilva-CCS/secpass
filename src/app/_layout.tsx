import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { initErrorMonitoring, wrapRootComponent } from '@/services/errorMonitoring';

SplashScreen.preventAutoHideAsync();
initErrorMonitoring();

function TabLayout() {
  return (
    <>
      <AnimatedSplashOverlay />
      <Slot />
    </>
  );
}

export default wrapRootComponent(TabLayout);
