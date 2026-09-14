import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import { colors, typography, spacing, radii } from '../src/theme';
import {
  GoogleDriveService,
  DriveFile,
  DriveUser,
  GOOGLE_DRIVE_SCOPES,
} from '../src/services/GoogleDriveService';
import { triggerSuccess, triggerLightImpact, triggerError } from '../src/utils/haptics';

// Google OAuth Discovery endpoints
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export default function GoogleDriveScreen() {
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientId, setClientId] = useState('');
  const [user, setUser] = useState<DriveUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  // Folder navigation state
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string }>({
    id: 'root',
    name: 'My Drive',
  });
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Import Progress state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    text: string;
    isDuplicate?: boolean;
  }>({ current: 0, total: 0, text: '' });

  // OAuth Request Hook
  const redirectUri = GoogleDriveService.getRedirectUri();

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: clientId || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
      scopes: GOOGLE_DRIVE_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Token,
    },
    discovery
  );

  useEffect(() => {
    if (response?.type === 'success') {
      if (response.params.access_token) {
        handleAuthSuccess(response.params.access_token);
      } else if (response.params.code) {
        handleAuthCode(response.params.code, request?.codeVerifier);
      }
    } else if (response?.type === 'error') {
      triggerError();
      Alert.alert('Sign-In Error', response.error?.message || 'Failed to authenticate with Google.');
    }
  }, [response]);

  const handleAuthCode = async (code: string, codeVerifier?: string) => {
    setIsLoading(true);
    try {
      const token = await GoogleDriveService.exchangeCodeForToken(code, redirectUri, codeVerifier);
      await handleAuthSuccess(token);
    } catch (err: any) {
      triggerError();
      Alert.alert('Token Exchange Failed', err.message || 'Could not complete Google authentication.');
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = async (token: string) => {
    setIsLoading(true);
    try {
      const profile = await GoogleDriveService.fetchUserProfile(token);
      GoogleDriveService.setSession(token, profile);
      setUser(profile);
      triggerSuccess();
      loadFolderFiles('root', 'My Drive');
    } catch (err: any) {
      triggerError();
      Alert.alert('Authentication Failed', err.message || 'Could not load Google profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!clientId.trim()) {
      Alert.alert(
        'Client ID Required',
        'Please enter your Google Cloud iOS Client ID below. Follow the setup guide to restrict access exclusively to your email.'
      );
      return;
    }
    triggerLightImpact();
    try {
      await promptAsync();
    } catch (e: any) {
      Alert.alert('OAuth Error', e.message || 'Unable to open Google sign-in.');
    }
  };

  const handleSignOut = () => {
    triggerLightImpact();
    GoogleDriveService.signOut();
    setUser(null);
    setFiles([]);
    setSelectedFileIds(new Set());
    setFolderStack([]);
    setCurrentFolder({ id: 'root', name: 'My Drive' });
  };

  const loadFolderFiles = async (folderId: string, folderName: string) => {
    setIsLoading(true);
    try {
      const list = await GoogleDriveService.listFiles(folderId, searchQuery);
      setFiles(list);
      setCurrentFolder({ id: folderId, name: folderName });
      setSelectedFileIds(new Set());
    } catch (err: any) {
      triggerError();
      Alert.alert('Drive Error', err.message || 'Failed to load files from Google Drive.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenFolder = (folder: DriveFile) => {
    triggerLightImpact();
    setFolderStack((prev) => [...prev, currentFolder]);
    loadFolderFiles(folder.id, folder.name);
  };

  const handleNavigateBack = () => {
    if (folderStack.length === 0) return;
    triggerLightImpact();
    const previous = folderStack[folderStack.length - 1];
    setFolderStack((prev) => prev.slice(0, -1));
    loadFolderFiles(previous.id, previous.name);
  };

  const toggleSelectFile = (fileId: string) => {
    triggerLightImpact();
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleSelectAllAudio = () => {
    triggerLightImpact();
    const audioFiles = files.filter((f) => !f.isFolder);
    if (selectedFileIds.size === audioFiles.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(audioFiles.map((f) => f.id)));
    }
  };

  const handleImportSelected = async () => {
    const selectedFiles = files.filter((f) => selectedFileIds.has(f.id) && !f.isFolder);
    if (selectedFiles.length === 0) {
      Alert.alert('No Tracks Selected', 'Please select at least one audio track to import.');
      return;
    }

    setIsImporting(true);
    triggerLightImpact();

    try {
      const result = await GoogleDriveService.downloadAndImportDriveTracks(
        selectedFiles,
        (progress) => {
          setImportProgress({
            current: progress.current,
            total: progress.total,
            text: progress.isDuplicate
              ? `Duplicate skipped: ${progress.fileName}`
              : `Downloading: ${progress.fileName}`,
            isDuplicate: progress.isDuplicate,
          });
        }
      );

      if (result.importedCount > 0) {
        triggerSuccess();
        const dupMsg =
          result.duplicateCount > 0
            ? `\n(${result.duplicateCount} duplicate ${result.duplicateCount === 1 ? 'track was' : 'tracks were'} skipped)`
            : '';
        Alert.alert(
          'Import Complete',
          `Successfully downloaded and imported ${result.importedCount} ${result.importedCount === 1 ? 'track' : 'tracks'} from Google Drive!${dupMsg}`,
          [
            {
              text: 'Go to Library',
              onPress: () => {
                router.dismissAll();
                router.replace('/(tabs)');
              },
            },
            {
              text: 'Stay in Drive',
              onPress: () => {
                setSelectedFileIds(new Set());
              },
            },
          ]
        );
      } else if (result.duplicateCount > 0) {
        triggerLightImpact();
        Alert.alert(
          'Duplicates Detected',
          `All ${result.duplicateCount} selected ${result.duplicateCount === 1 ? 'track is' : 'tracks are'} already in your offline library.`
        );
      }
    } catch (err: any) {
      triggerError();
      Alert.alert('Import Failed', err.message || 'An error occurred during Drive download.');
    } finally {
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0, text: '' });
    }
  };

  const audioFilesCount = files.filter((f) => !f.isFolder).length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Google Drive</Text>
        {user ? (
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Main Content */}
      {!user ? (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Welcome Card */}
          <View style={styles.authCard}>
            <View style={styles.gdriveIconCircle}>
              <Ionicons name="logo-google" size={36} color={colors.tint} />
            </View>
            <Text style={styles.authCardTitle}>Connect Your Google Drive</Text>
            <Text style={styles.authCardSubtitle}>
              Stream and import your personal music files directly into your offline library with
              multi-threaded downloading and duplicate protection.
            </Text>

            {/* Client ID Configuration Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Google Cloud iOS Client ID</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 123456789-abc.apps.googleusercontent.com"
                placeholderTextColor={colors.textSecondary}
                value={clientIdInput}
                onChangeText={setClientIdInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.saveClientBtn}
                onPress={() => {
                  setClientId(clientIdInput.trim());
                  GoogleDriveService.setCustomClientId(clientIdInput.trim());
                  triggerSuccess();
                  Alert.alert('Client ID Saved', 'Your Google Client ID is now configured.');
                }}
              >
                <Text style={styles.saveClientBtnText}>Save Client ID</Text>
              </TouchableOpacity>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.signInButton, (!clientId && !clientIdInput) && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color={colors.white} style={{ marginRight: 10 }} />
                  <Text style={styles.signInButtonText}>Sign In with Google</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Setup Guide Toggle */}
            <TouchableOpacity
              style={styles.guideToggle}
              onPress={() => setShowSetupGuide(!showSetupGuide)}
            >
              <Ionicons
                name={showSetupGuide ? 'chevron-up-circle' : 'help-circle-outline'}
                size={18}
                color={colors.tint}
              />
              <Text style={styles.guideToggleText}>
                {showSetupGuide ? 'Hide Setup Guide' : 'How to restrict to ONLY your Gmail'}
              </Text>
            </TouchableOpacity>

            {/* Step-by-Step Security Setup Guide */}
            {showSetupGuide && (
              <View style={styles.guideBox}>
                <Text style={styles.guideStepTitle}>🔒 Private Setup in Google Cloud Console:</Text>
                <Text style={styles.guideStep}>
                  1. Visit <Text style={styles.codeText}>console.cloud.google.com</Text> and create a project.
                </Text>
                <Text style={styles.guideStep}>
                  2. Enable the <Text style={styles.codeText}>Google Drive API</Text>.
                </Text>
                <Text style={styles.guideStep}>
                  3. In <Text style={styles.codeText}>OAuth consent screen</Text>, keep publishing status as{' '}
                  <Text style={styles.codeText}>Testing</Text>.
                </Text>
                <Text style={styles.guideStep}>
                  4. Under <Text style={styles.boldText}>Test Users</Text>, click <Text style={styles.boldText}>+ ADD USERS</Text> and enter your exact personal Gmail. Google will strictly reject any other email!
                </Text>
                <Text style={styles.guideStep}>
                  5. In <Text style={styles.codeText}>Credentials</Text>, create an <Text style={styles.codeText}>iOS Client ID</Text> with Bundle ID:{' '}
                  <Text style={styles.codeText}>com.jttacalig.playersonance</Text>.
                </Text>
                <Text style={styles.guideStep}>
                  6. Paste the resulting Client ID above and tap Sign In.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.browserContainer}>
          {/* User Profile Bar */}
          <View style={styles.userBar}>
            <View style={styles.userInfo}>
              {user.picture ? (
                <Image source={{ uri: user.picture }} style={styles.userAvatar} />
              ) : (
                <View style={[styles.userAvatar, styles.userAvatarFallback]}>
                  <Text style={styles.avatarLetter}>{user.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => loadFolderFiles(currentFolder.id, currentFolder.name)}>
              <Ionicons name="refresh" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Breadcrumb Navigation */}
          <View style={styles.breadcrumbBar}>
            {folderStack.length > 0 && (
              <TouchableOpacity onPress={handleNavigateBack} style={styles.backFolderBtn}>
                <Ionicons name="arrow-back" size={16} color={colors.tint} />
                <Text style={styles.backFolderText}>Back</Text>
              </TouchableOpacity>
            )}
            <Ionicons name="folder-open" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
            <Text style={styles.breadcrumbText} numberOfLines={1}>
              {currentFolder.name}
            </Text>
          </View>

          {/* Action Bar (Select All / Audio Count) */}
          {audioFilesCount > 0 && (
            <View style={styles.actionBar}>
              <TouchableOpacity onPress={handleSelectAllAudio} style={styles.selectToggleBtn}>
                <Ionicons
                  name={
                    selectedFileIds.size === audioFilesCount
                      ? 'checkbox'
                      : selectedFileIds.size > 0
                      ? 'remove-circle'
                      : 'square-outline'
                  }
                  size={20}
                  color={colors.tint}
                />
                <Text style={styles.selectToggleText}>
                  {selectedFileIds.size === audioFilesCount
                    ? 'Deselect All'
                    : `Select All Audio (${audioFilesCount})`}
                </Text>
              </TouchableOpacity>
              <Text style={styles.selectedCountText}>
                {selectedFileIds.size} selected
              </Text>
            </View>
          )}

          {/* File & Folder List */}
          {isLoading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={colors.tint} />
              <Text style={styles.loadingText}>Loading Drive files...</Text>
            </View>
          ) : files.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="musical-notes-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>No Audio Files Found</Text>
              <Text style={styles.emptySubtitle}>
                No supported audio tracks (.mp3, .flac, .m4a, .wav) or subfolders in this directory.
              </Text>
            </View>
          ) : (
            <FlatList
              data={files}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                if (item.isFolder) {
                  return (
                    <TouchableOpacity
                      style={styles.folderRow}
                      onPress={() => handleOpenFolder(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.folderIcon}>
                        <Ionicons name="folder" size={24} color="#F59E0B" />
                      </View>
                      <Text style={styles.folderName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  );
                }

                const isSelected = selectedFileIds.has(item.id);
                const sizeMb = item.size
                  ? (parseInt(item.size, 10) / (1024 * 1024)).toFixed(1) + ' MB'
                  : '';

                return (
                  <TouchableOpacity
                    style={[styles.fileRow, isSelected && styles.fileRowSelected]}
                    onPress={() => toggleSelectFile(item.id)}
                    activeOpacity={0.7}
                  >
                    <TouchableOpacity
                      onPress={() => toggleSelectFile(item.id)}
                      style={styles.checkboxTouch}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? colors.tint : colors.textSecondary}
                      />
                    </TouchableOpacity>
                    <View style={styles.fileIcon}>
                      <Ionicons name="musical-note" size={20} color={colors.tint} />
                    </View>
                    <View style={styles.fileDetails}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.fileMeta}>{sizeMb || 'Audio File'}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Floating Import Button */}
          {selectedFileIds.size > 0 && (
            <View style={styles.floatingButtonContainer}>
              <TouchableOpacity
                style={styles.importFloatingButton}
                onPress={handleImportSelected}
                disabled={isImporting}
                activeOpacity={0.8}
              >
                <Ionicons name="cloud-download" size={20} color={colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.importFloatingButtonText}>
                  Download & Import ({selectedFileIds.size})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Download & Import Progress Overlay Modal */}
          {isImporting && (
            <View style={styles.progressOverlay}>
              <View style={styles.progressCard}>
                <ActivityIndicator size="large" color={colors.tint} />
                <Text style={styles.progressTitle}>
                  Importing from Drive ({importProgress.current}/{importProgress.total})
                </Text>
                <Text style={styles.progressSubtext} numberOfLines={2}>
                  {importProgress.text}
                </Text>
                <View style={styles.progressBarBackground}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(
                          100,
                          importProgress.total > 0
                            ? (importProgress.current / importProgress.total) * 100
                            : 0
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressHint}>
                  6 parallel worker streams • Duplicate auto-skipping active
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
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
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  headerBtn: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  signOutBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  signOutText: {
    fontSize: typography.sizes.sm,
    color: '#EF4444',
    fontWeight: typography.weights.semibold,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  authCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  gdriveIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  authCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  authCardSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  inputContainer: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: typography.sizes.sm,
    color: colors.text,
    marginBottom: 8,
  },
  saveClientBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  saveClientBtnText: {
    fontSize: typography.sizes.xs,
    color: colors.tint,
    fontWeight: '600',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
    width: '100%',
    paddingVertical: 14,
    borderRadius: radii.lg,
    shadowColor: colors.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  signInButtonText: {
    color: colors.white,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  guideToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    padding: spacing.xs,
  },
  guideToggleText: {
    fontSize: typography.sizes.xs,
    color: colors.tint,
    fontWeight: typography.weights.medium,
    marginLeft: 6,
  },
  guideBox: {
    width: '100%',
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.tint,
  },
  guideStepTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: 8,
  },
  guideStep: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: 6,
    lineHeight: 18,
  },
  codeText: {
    fontFamily: 'Courier',
    fontWeight: '600',
    color: colors.tint,
  },
  boldText: {
    fontWeight: '700',
    color: colors.text,
  },
  browserContainer: {
    flex: 1,
  },
  userBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  userAvatarFallback: {
    backgroundColor: colors.tint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  userName: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  userEmail: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  breadcrumbBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  backFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: radii.sm,
  },
  backFolderText: {
    fontSize: typography.sizes.xs,
    color: colors.tint,
    fontWeight: '600',
    marginLeft: 2,
  },
  breadcrumbText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    flex: 1,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  selectToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectToggleText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.tint,
    marginLeft: 6,
  },
  selectedCountText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  folderIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  folderName: {
    flex: 1,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.text,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  fileRowSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
  },
  checkboxTouch: {
    padding: 4,
    marginRight: 6,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.text,
    marginBottom: 2,
  },
  fileMeta: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 24,
    left: spacing.lg,
    right: spacing.lg,
  },
  importFloatingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
    paddingVertical: 14,
    borderRadius: radii.xl,
    shadowColor: colors.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  importFloatingButtonText: {
    color: colors.white,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  progressCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  progressTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  progressSubtext: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  progressBarBackground: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.tint,
    borderRadius: 4,
  },
  progressHint: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
