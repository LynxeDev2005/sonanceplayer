const fs = require('fs');
const path = require('path');

function findExpoPlists(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findExpoPlists(filePath, fileList);
    } else if (file === 'Expo.plist') {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const iosDir = path.join(__dirname, '..', 'ios');
const plists = findExpoPlists(iosDir);

if (plists.length === 0) {
  console.log('ℹ No Expo.plist found to patch.');
} else {
  for (const plistPath of plists) {
    let content = fs.readFileSync(plistPath, 'utf8');

    // Ensure EXUpdatesRequestHeaders with expo-channel-name master
    if (!content.includes('EXUpdatesRequestHeaders')) {
      const channelBlock = `
    <key>EXUpdatesRequestHeaders</key>
    <dict>
      <key>expo-channel-name</key>
      <string>master</string>
    </dict>
    <key>EXUpdatesReleaseChannel</key>
    <string>master</string>
</dict>
</plist>`;
      content = content.replace('</dict>\n</plist>', channelBlock);
      content = content.replace('</dict>\r\n</plist>', channelBlock);
      fs.writeFileSync(plistPath, content, 'utf8');
      console.log(`✓ Injected EXUpdatesRequestHeaders (channel: master) into ${plistPath}`);
    } else {
      console.log(`✓ Expo.plist already contains EXUpdatesRequestHeaders: ${plistPath}`);
    }
  }
}
