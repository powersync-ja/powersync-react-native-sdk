/// <reference types="nativewind/types" />
import '@azure/core-asynciterator-polyfill';
import 'react-native-polyfill-globals/auto';
import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Text } from 'react-native';
import 'reflect-metadata';
import 'react-native-get-random-values';
import Logger from 'js-logger';

import { registerBaseTests, runTests } from './tests/index';
const TEST_SERVER_URL = 'http://localhost:4243/results';

export default function App() {
  const [results, setResults] = useState<any>([]);

  useEffect(() => {
    Logger.useDefaults();
    Logger.setLevel(Logger.DEBUG);
    console.log('Running Tests:');
    setResults([]);
    runTests(registerBaseTests).then((results) => {
      // Send results to host server
      fetch(TEST_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results)
      });
      console.log(JSON.stringify(results, null, '\t'));
      setResults(results);
    });
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-neutral-900">
      <ScrollView className="p-4">
        <Text className="font-bold text-blue-500 text-lg text-center">RN Quick SQLite Test Suite</Text>
        {results.map((r: any, i: number) => {
          if (r.type === 'grouping') {
            return (
              <Text key={i} className="mt-3 font-bold text-white">
                {r.description}
              </Text>
            );
          }

          if (r.type === 'incorrect') {
            return (
              <Text key={i} className="mt-1 text-white">
                🔴 {r.description}: {r.errorMsg}
              </Text>
            );
          }

          return (
            <Text key={i} className="mt-1 text-white">
              🟢 {r.description}
            </Text>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
