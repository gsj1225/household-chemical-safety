/**
 * App 入口 + 导航配置 — v2.0
 *
 * V1 排雷挑战流程已退出，仅保留 V2 化学品库管理路由。
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import InventoryScreen from './src/screens/InventoryScreen';
import IntakeFlowScreen from './src/screens/IntakeFlowScreen';
import ProductDetailScreen from './src/screens/ProductDetailScreen';
import ProductEditScreen from './src/screens/ProductEditScreen';
import CompatibilityScreen from './src/screens/CompatibilityScreen';
import RelationDetailScreen from './src/screens/RelationDetailScreen';
import { semanticColors } from './src/theme/tokens';
import type { RootStackParamList } from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Stack.Navigator
          initialRouteName="Inventory"
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
            name="Inventory"
            component={InventoryScreen}
            options={{ title: '我的化学品库', headerShown: false }}
          />
          <Stack.Screen
            name="IntakeFlow"
            component={IntakeFlowScreen}
            options={{ title: '添加产品', headerShown: false }}
          />
          <Stack.Screen
            name="ProductDetail"
            component={ProductDetailScreen}
            options={{ title: '产品详情', headerShown: false }}
          />
          <Stack.Screen
            name="ProductEdit"
            component={ProductEditScreen}
            options={{ title: '编辑产品', headerShown: false }}
          />
          <Stack.Screen
            name="Compatibility"
            component={CompatibilityScreen}
            options={{ title: '相容性', headerShown: false }}
          />
          <Stack.Screen
            name="RelationDetail"
            component={RelationDetailScreen}
            options={{ title: '关系详情', headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
