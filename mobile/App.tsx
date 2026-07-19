/**
 * App 入口 + 导航配置
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from './src/screens/HomeScreen';
import ScanScreen from './src/screens/ScanScreen';
import ResultScreen from './src/screens/ResultScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import { semanticColors } from './src/theme/tokens';
import type { RootStackParamList } from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: semanticColors.surface.page },
            headerTitleStyle: {
              fontWeight: 'bold',
              color: semanticColors.text.primary,
            },
            headerTintColor: semanticColors.text.primary,
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: '排雷挑战', headerShown: false }}
          />
          <Stack.Screen
            name="History"
            component={HistoryScreen}
            options={{ title: '历史报告' }}
          />
          <Stack.Screen
            name="Scan"
            component={ScanScreen}
            options={{ title: '本场景检查' }}
          />
          <Stack.Screen
            name="Result"
            component={ResultScreen}
            options={{ title: '本场景报告' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
