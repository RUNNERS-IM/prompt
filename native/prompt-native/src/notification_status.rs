//! Notification permission, replacing Orca's Swift `orca-notification-status` helper.
//! Electron has no API for UNUserNotificationCenter's authorization status, and a notification that schedules fine
//! can still be suppressed, so the permission card reads it here.
//!
//! Why in-process now: macOS keys notification settings to the bundle of the calling process. The Swift helper had
//! to sit in Contents/MacOS with the app's CFBundleIdentifier embedded so it would be counted as the app. Electron's
//! main process *is* the app bundle's executable, and Electron itself posts its notifications from this process
//! through the same `[UNUserNotificationCenter currentNotificationCenter]`, so asking from here reads exactly the
//! record Electron's notifications are filed under.

/// `authorization` and `alert` with the helper's spellings ("authorized", "not-determined", "enabled", ...).
pub struct NotificationStatus {
    pub authorization: &'static str,
    pub alert: &'static str,
}

/// How long to wait for the answer; the helper waited the same 3 s.
#[cfg(target_os = "macos")]
const ANSWER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);

/// Starts the read on the calling thread and returns a receiver for the answer.
/// None when this process is not running from an `.app` bundle (plain `node`, a test binary): there
/// `currentNotificationCenter` raises "bundleProxyForCurrentProcess is nil" inside a dispatch_once, which no
/// exception handler can catch and which aborts the process, so the bundle is checked before asking.
#[cfg(target_os = "macos")]
pub fn request() -> Option<std::sync::mpsc::Receiver<NotificationStatus>> {
    use block2::RcBlock;
    use objc2_foundation::NSBundle;
    use objc2_user_notifications::{
        UNAuthorizationStatus, UNNotificationSetting, UNNotificationSettings,
        UNUserNotificationCenter,
    };
    use std::ptr::NonNull;

    if !in_app_bundle(&NSBundle::mainBundle()) {
        return None;
    }
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    let handler = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        let settings = unsafe { settings.as_ref() };
        let authorization = match settings.authorizationStatus() {
            UNAuthorizationStatus::Authorized => "authorized",
            UNAuthorizationStatus::Provisional => "provisional",
            UNAuthorizationStatus::Ephemeral => "ephemeral",
            UNAuthorizationStatus::Denied => "denied",
            UNAuthorizationStatus::NotDetermined => "not-determined",
            _ => "unknown",
        };
        let alert = match settings.alertSetting() {
            UNNotificationSetting::Enabled => "enabled",
            UNNotificationSetting::Disabled => "disabled",
            UNNotificationSetting::NotSupported => "not-supported",
            _ => "unknown",
        };
        // The waiter may have timed out and gone; nothing else to do then.
        let _ = sender.try_send(NotificationStatus {
            authorization,
            alert,
        });
    });
    UNUserNotificationCenter::currentNotificationCenter()
        .getNotificationSettingsWithCompletionHandler(&handler);
    Some(receiver)
}

/// An identifier alone is not enough: a bare executable with an embedded Info.plist still has no bundle proxy.
#[cfg(target_os = "macos")]
fn in_app_bundle(bundle: &objc2_foundation::NSBundle) -> bool {
    bundle.bundleIdentifier().is_some() && bundle.bundlePath().to_string().ends_with(".app")
}

/// Waits for the answer started by [`request`]; None when macOS does not answer in time.
#[cfg(target_os = "macos")]
pub fn wait(receiver: std::sync::mpsc::Receiver<NotificationStatus>) -> Option<NotificationStatus> {
    receiver.recv_timeout(ANSWER_TIMEOUT).ok()
}

#[cfg(not(target_os = "macos"))]
pub fn request() -> Option<std::sync::mpsc::Receiver<NotificationStatus>> {
    None
}

#[cfg(not(target_os = "macos"))]
pub fn wait(
    _receiver: std::sync::mpsc::Receiver<NotificationStatus>,
) -> Option<NotificationStatus> {
    None
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    // A test binary is not an app bundle, so the read must refuse instead of letting the framework raise.
    #[test]
    fn refuses_outside_an_app_bundle() {
        assert!(request().is_none());
    }
}
