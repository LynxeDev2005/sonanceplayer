const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

// 1. Patch RuntimeScheduler.h (C++ constructor annotation)
const headerTarget = path.join(
  rootDir,
  'node_modules',
  'expo-modules-jsi',
  'apple',
  'Sources',
  'ExpoModulesJSI-Cxx',
  'include',
  'RuntimeScheduler.h'
);

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

// 2. Patch JavaScriptRuntime.swift (Wrap raw pointers in NonisolatedUnsafeVar to avoid Swift concurrency data race errors)
const jsRuntimeTarget = path.join(
  rootDir,
  'node_modules',
  'expo-modules-jsi',
  'apple',
  'Sources',
  'ExpoModulesJSI',
  'Runtime',
  'JavaScriptRuntime.swift'
);

if (fs.existsSync(jsRuntimeTarget)) {
  let content = fs.readFileSync(jsRuntimeTarget, 'utf8');
  let patched = false;

  // Patch 1: getter resultPtr
  if (content.includes('nonisolated(unsafe) let resultPtr = resultPtr')) {
    content = content.replace(
      'nonisolated(unsafe) let resultPtr = resultPtr\n\n      return withGuaranteedContext(context) { (context: HostObjectContext, runtime) in\n        return JavaScriptActor.assumeIsolated {\n          return forwardingSwiftErrorsToJS(runtime: runtime) {\n            try context.get(propertyName).writeJSIValue(to: resultPtr)',
      'let safeResultPtr = NonisolatedUnsafeVar(resultPtr)\n\n      return withGuaranteedContext(context) { (context: HostObjectContext, runtime) in\n        return JavaScriptActor.assumeIsolated {\n          return forwardingSwiftErrorsToJS(runtime: runtime) {\n            try context.get(propertyName).writeJSIValue(to: safeResultPtr.value)'
    );
    patched = true;
  }

  // Patch 2 & 3: createFunctionClosure overloads (thisPtr, argumentsPtr, resultPtr)
  const fnTarget1 = `    nonisolated(unsafe) let thisPtr = thisPtr
    nonisolated(unsafe) let argumentsPtr = argumentsPtr
    nonisolated(unsafe) let resultPtr = resultPtr

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: HostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let this = UnsafeMutablePointer(mutating: thisPtr).move()
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptValue(runtime, this)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)`;

  const fnReplacement1 = `    let safeThis = NonisolatedUnsafeVar(thisPtr)
    let safeArgs = NonisolatedUnsafeVar(argumentsPtr)
    let safeRes = NonisolatedUnsafeVar(resultPtr)

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: HostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let this = UnsafeMutablePointer(mutating: safeThis.value).move()
          let arguments = JavaScriptValuesBuffer(runtime, start: safeArgs.value, count: argumentsCount)
          let thisValue = JavaScriptValue(runtime, this)
          try context.call(thisValue, consume arguments).writeJSIValue(to: safeRes.value)`;

  if (content.includes('let this = UnsafeMutablePointer(mutating: thisPtr).move()')) {
    content = content.replace(fnTarget1, fnReplacement1);
    patched = true;
  }

  const fnTarget2 = `    nonisolated(unsafe) let thisPtr = thisPtr
    nonisolated(unsafe) let argumentsPtr = argumentsPtr
    nonisolated(unsafe) let resultPtr = resultPtr

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: UnownedThisHostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptUnownedValue(runtime.pointee, thisPtr)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)`;

  const fnReplacement2 = `    let safeThis = NonisolatedUnsafeVar(thisPtr)
    let safeArgs = NonisolatedUnsafeVar(argumentsPtr)
    let safeRes = NonisolatedUnsafeVar(resultPtr)

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: UnownedThisHostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let arguments = JavaScriptValuesBuffer(runtime, start: safeArgs.value, count: argumentsCount)
          let thisValue = JavaScriptUnownedValue(runtime.pointee, safeThis.value)
          try context.call(thisValue, consume arguments).writeJSIValue(to: safeRes.value)`;

  if (content.includes('let thisValue = JavaScriptUnownedValue(runtime.pointee, thisPtr)')) {
    content = content.replace(fnTarget2, fnReplacement2);
    patched = true;
  }

  if (patched) {
    fs.writeFileSync(jsRuntimeTarget, content, 'utf8');
    console.log('✓ Patched JavaScriptRuntime.swift with NonisolatedUnsafeVar wrapper');
  } else {
    console.log('✓ JavaScriptRuntime.swift already patched or clean.');
  }
}

// 3. Patch build-xcframework.sh to pass SWIFT_STRICT_CONCURRENCY=off to nested xcodebuild
const scriptTarget = path.join(
  rootDir,
  'node_modules',
  'expo-modules-jsi',
  'apple',
  'scripts',
  'build-xcframework.sh'
);

if (fs.existsSync(scriptTarget)) {
  let scriptContent = fs.readFileSync(scriptTarget, 'utf8');

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
