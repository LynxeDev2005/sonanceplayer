const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'RuntimeScheduler.h');

if (fs.existsSync(target)) {
  let content = fs.readFileSync(target, 'utf8');
  if (content.includes('SWIFT_RETURNS_RETAINED RuntimeScheduler(')) {
    content = content.replace(/SWIFT_RETURNS_RETAINED\s+RuntimeScheduler\(/g, 'RuntimeScheduler(');
    fs.writeFileSync(target, content, 'utf8');
    console.log('Successfully patched expo-modules-jsi/RuntimeScheduler.h for Swift 6.2+ compatibility.');
  } else {
    console.log('RuntimeScheduler.h already patched or clean.');
  }
} else {
  console.log('expo-modules-jsi/RuntimeScheduler.h not found, skipping patch.');
}
