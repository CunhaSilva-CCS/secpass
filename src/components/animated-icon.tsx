import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DURATION = 600;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  const image = <SplashMark />;

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}>
      {image}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.splashOverlay}>
      {image}
    </View>
  );
}

function SplashMark() {
  return (
    <View style={styles.markWrap}>
      <View style={styles.shackle} />
      <View style={styles.lockBody}>
        <Text style={styles.initials}>SP</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  markWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shackle: {
    width: 28,
    height: 24,
    borderColor: '#A7F3D0',
    borderWidth: 4,
    borderBottomWidth: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginBottom: -2,
  },
  lockBody: {
    width: 58,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F8FFFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#0B1B34',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0A1730',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
