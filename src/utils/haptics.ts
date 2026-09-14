import * as Haptics from 'expo-haptics';

let isHapticsEnabled = true;

export function setHapticsEnabled(enabled: boolean) {
  isHapticsEnabled = enabled;
}

export function getHapticsEnabled(): boolean {
  return isHapticsEnabled;
}

export async function triggerSelection() {
  if (!isHapticsEnabled) return;
  try {
    await Haptics.selectionAsync();
  } catch (e) {}
}

export async function triggerLightImpact() {
  if (!isHapticsEnabled) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (e) {}
}

export async function triggerMediumImpact() {
  if (!isHapticsEnabled) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch (e) {}
}

export async function triggerHeavyImpact() {
  if (!isHapticsEnabled) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch (e) {}
}

export async function triggerSuccess() {
  if (!isHapticsEnabled) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {}
}

export async function triggerError() {
  if (!isHapticsEnabled) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch (e) {}
}
