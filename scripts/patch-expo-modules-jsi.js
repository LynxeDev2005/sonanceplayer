const fs = require('fs');
const path = require('path');

// 1. Patch RuntimeScheduler.h
const headerTarget = path.join(__dirname, '..', 'node_modules', 'expo-modules-jsi', 'apple', 'Sources', 'ExpoModulesJSI-Cxx', 'include', 'RuntimeScheduler.h');

if (fs.existsSync(headerTarget)) {
  let content = fs.readFileSync(headerTarget, 'utf8');
  if (content.includes('SWIFT_RETURNS_RETAINED RuntimeScheduler(')) {
    content = content.replace(/SWIFT_RETURNS_RETAINED\s+RuntimeScheduler\(/g, 'RuntimeScheduler(');
    fs.writeFileSync(headerTarget, content, 'utf8');
    console.log('✓ Patched expo-modules-jsi/RuntimeScheduler.h for Swift 6.2+');
  } else {
    console.log('✓ RuntimeScheduler.h already patched or clean.');
  }
}

// 2. Patch build-xcframework.sh to pass SWIFT_STRICT_CONCURRENCY=off to nested xcodebuild
const scriptTarget = path.join(__dirname, '..', 'node_modules', 'expo-modules-jsi', 'apple', 'scripts', 'build-xcframework.sh');

if (fs.existsSync(scriptTarget)) {
  let scriptContent = fs.readFileSync(scriptTarget, 'utf8');
  
  // Replace previous OFF with none if present
  if (scriptContent.includes('SWIFT_ENFORCE_EXCLUSIVE_ACCESS=OFF')) {
    scriptContent = scriptContent.replace(/SWIFT_ENFORCE_EXCLUSIVE_ACCESS=OFF/g, 'SWIFT_ENFORCE_EXCLUSIVE_ACCESS=none');
    fs.writeFileSync(scriptTarget, scriptContent, 'utf8');
    console.log('✓ Updated build-xcframework.sh with SWIFT_ENFORCE_EXCLUSIVE_ACCESS=none');
  } else if (!scriptContent.includes('SWIFT_STRICT_CONCURRENCY=off')) {
    scriptContent = scriptContent.replace(
      'CLANG_COVERAGE_MAPPING=NO \\',
      'CLANG_COVERAGE_MAPPING=NO \\\n    SWIFT_STRICT_CONCURRENCY=off \\\n    SWIFT_ENFORCE_EXCLUSIVE_ACCESS=none \\\n    SWIFT_TREAT_WARNINGS_AS_ERRORS=NO \\\n    GCC_WARN_INHIBIT_ALL_WARNINGS=YES \\'
    );
    fs.writeFileSync(scriptTarget, scriptContent, 'utf8');
    console.log('✓ Patched build-xcframework.sh with SWIFT_STRICT_CONCURRENCY=off and SWIFT_ENFORCE_EXCLUSIVE_ACCESS=none');
  } else {
    console.log('✓ build-xcframework.sh already contains valid concurrency settings');
  }
}
