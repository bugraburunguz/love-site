import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { isNativeApp } from './platform'

/**
 * A short tap of the phone's vibration motor, used sparingly the way iOS apps do: turning a page (light), a finished
 * action (success), something that went away (warning). Does nothing on the website.
 */
export type HapticKind = 'light' | 'success' | 'warning'

export function haptic(kind: HapticKind): void {
  if (!isNativeApp) return
  const done = kind === 'light'
    ? Haptics.impact({ style: ImpactStyle.Light })
    : Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning })
  void done.catch(() => {
    /* no motor or not allowed: nothing to feel */
  })
}
