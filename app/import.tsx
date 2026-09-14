import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, typography, spacing, radii } from '../src/theme';
import { importFromFiles, scanAndSyncLocalLibrary, scanFolderAndImport, ImportResult } from '../src/services/ImportService';
import { triggerSuccess, triggerLightImpact, triggerError } from '../src/utils/haptics';

export default function ImportScreen() {
  const [isImporting, setIsImporting] = useState(false);
  const [progressText, setProgressText] = useState('Preparing import...');

  const handleLocalImport = async () => {
    setIsImporting(true);
    setProgressText('Opening document picker...');
    triggerLightImpact();

    try {
      const result = await importFromFiles((current, total, currentName, isDuplicate) => {
        setProgressText(
          isDuplicate
            ? `Checking ${current}/${total}\n⚠️ ${currentName}`
            : `Importing ${current}/${total}\n🎵 ${currentName}`
        );
      });

      if (result.importedCount > 0) {
        triggerSuccess();
        const dupMsg = result.duplicateCount > 0 
          ? `\n(${result.duplicateCount} duplicate ${result.duplicateCount === 1 ? 'song was' : 'songs were'} skipped)`
          : '';
        Alert.alert(
          'Import Complete',
          `Successfully imported ${result.importedCount} new ${result.importedCount === 1 ? 'song' : 'songs'}!${dupMsg}`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else if (result.duplicateCount > 0) {
        triggerLightImpact();
        Alert.alert(
          'Duplicates Detected',
          `All ${result.duplicateCount} selected ${result.duplicateCount === 1 ? 'song is' : 'songs are'} already in your library.`
        );
      } else if (result.totalSelected > 0) {
        Alert.alert('Notice', 'No new audio tracks could be imported.');
      }
    } catch (error) {
      triggerError();
      Alert.alert('Import Error', 'An error occurred while importing audio files.');
      console.error(error);
    } finally {
      setIsImporting(false);
      setProgressText('');
    }
  };

  const handleFolderScan = async () => {
    setIsImporting(true);
    setProgressText('Opening folder picker...');
    triggerLightImpact();

    try {
      const result = await scanFolderAndImport((current, total, currentName, isDuplicate) => {
        setProgressText(
          isDuplicate
            ? `Scanning ${current}/${total}\n⚠️ ${currentName}`
            : `Importing ${current}/${total}\n🎵 ${currentName}`
        );
      });

      if (result.importedCount > 0) {
        triggerSuccess();
        const dupMsg = result.duplicateCount > 0 
          ? `\n(${result.duplicateCount} duplicate ${result.duplicateCount === 1 ? 'song was' : 'songs were'} skipped)`
          : '';
        Alert.alert(
          'Folder Scan Complete',
          `Found and imported ${result.importedCount} new ${result.importedCount === 1 ? 'song' : 'songs'} from folder!${dupMsg}`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else if (result.duplicateCount > 0) {
        triggerLightImpact();
        Alert.alert(
          'Duplicates Detected',
          `All ${result.duplicateCount} songs found in the folder are already in your library.`
        );
      } else if (result.totalSelected > 0) {
        Alert.alert('Notice', 'No supported audio files were found in the selected folder.');
      }
    } catch (error) {
      triggerError();
      Alert.alert('Scan Error', 'An error occurred while scanning the folder.');
      console.error(error);
    } finally {
      setIsImporting(false);
      setProgressText('');
    }
  };

  const handleAutoScan = async () => {
    setIsImporting(true);
    setProgressText('Scanning device storage for unindexed audio...');
    triggerLightImpact();

    try {
      const result = await scanAndSyncLocalLibrary((current, total, name) => {
        setProgressText(`Scanning ${current}/${total}\n${name}`);
      });

      if (result.importedCount > 0) {
        triggerSuccess();
        Alert.alert(
          'Library Sync Complete',
          `Found and added ${result.importedCount} new ${result.importedCount === 1 ? 'song' : 'songs'} to your library!`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        triggerLightImpact();
        Alert.alert(
          'Library Up to Date',
          'All audio files on device storage are already indexed in your library.'
        );
      }
    } catch (error) {
      triggerError();
      Alert.alert('Scan Error', 'Failed to scan device storage.');
      console.error(error);
    } finally {
      setIsImporting(false);
      setProgressText('');
    }
  };

  const handleDriveImport = () => {
    triggerLightImpact();
    router.push('/drive');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Import Music</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>Choose a source to add music to your offline library.</Text>

        {/* Option 1: Files / iCloud Drive */}
        <TouchableOpacity 
          style={[styles.importCard, { borderColor: 'rgba(59, 130, 246, 0.3)', borderWidth: 1 }]} 
          onPress={handleLocalImport}
          disabled={isImporting}
          activeOpacity={0.8}
        >
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
            <Ionicons name="document-text" size={26} color={colors.tint} />
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardTitle}>Select Audio Files</Text>
            <Text style={styles.cardSubtitle}>Multi-select MP3, FLAC, M4A with duplicate skipping</Text>
          </View>
        </TouchableOpacity>

        {/* Option 2: Auto Scan Selected Folder */}
        <TouchableOpacity 
          style={[styles.importCard, { borderColor: 'rgba(245, 158, 11, 0.3)', borderWidth: 1 }]} 
          onPress={handleFolderScan}
          disabled={isImporting}
          activeOpacity={0.8}
        >
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
            <Ionicons name="folder-open" size={26} color="#F59E0B" />
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardTitle}>Auto Scan Folder</Text>
            <Text style={styles.cardSubtitle}>Pick any folder to deeply scan & import all songs inside</Text>
          </View>
        </TouchableOpacity>

        {/* Option 3: Auto Scan Device Storage */}
        <TouchableOpacity 
          style={styles.importCard} 
          onPress={handleAutoScan} 
          disabled={isImporting}
          activeOpacity={0.8}
        >
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
            <Ionicons name="sync" size={26} color="#10B981" />
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardTitle}>Auto Scan App Storage</Text>
            <Text style={styles.cardSubtitle}>Scan local documents directory for unindexed files</Text>
          </View>
        </TouchableOpacity>

        {/* Option 4: Google Drive */}
        <TouchableOpacity 
          style={[styles.importCard, { borderColor: 'rgba(59, 130, 246, 0.15)', borderWidth: 1 }]} 
          onPress={handleDriveImport} 
          disabled={isImporting}
          activeOpacity={0.8}
        >
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.08)' }]}>
            <Ionicons name="logo-google" size={26} color={colors.tint} />
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardTitle}>Google Drive</Text>
            <Text style={styles.cardSubtitle}>Stream and sync from your personal Google Drive</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        {isImporting && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.tint} />
            <Text style={styles.loadingText}>{progressText}</Text>
            <Text style={styles.loadingSubtext}>⚡ Turbo 6-Worker Concurrency • APFS NVMe Batching</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  closeButton: {
    padding: spacing.xs,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  importCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: radii.xl,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTextContainer: {
    flex: 1,
    marginLeft: spacing.md,
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderRadius: radii.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.sizes.sm,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
  loadingSubtext: {
    marginTop: spacing.xs,
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
  }
});
