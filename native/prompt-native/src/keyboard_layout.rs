//! Current keyboard layout's characters, replacing Orca's Swift `orca-keyboard-layout` helper.
//! Same reads and the same JSON as the helper: input source ids plus the unmodified and Shift characters of each
//! DOM key code, translated with UCKeyTranslate from the layout's 'uchr' data. A layout switch in the middle of a
//! read makes the snapshot inconsistent, so a read is retried once and given up after that.
//!
//! Threading: TextInputSources.h says "If you are a UI application, you must call TextInputSources API on the main
//! thread." Electron's main process is a UI application and its JavaScript runs on that main thread, so the export
//! is synchronous (the whole read is ~100 table lookups) and refuses to run on any other thread.
//!
//! Why raw FFI: Carbon's TIS and UCKeyTranslate are plain C functions that no maintained crate binds (objc2 covers
//! Objective-C frameworks), and the read needs only these few declarations.

/// The snapshot as the helper printed it, or None when the layout kept changing, or off the main thread.
#[cfg(target_os = "macos")]
pub fn read_json() -> Option<String> {
    if unsafe { libc::pthread_main_np() } == 0 {
        return None;
    }
    (0..2).find_map(|_| read_stable_snapshot())
}

#[cfg(not(target_os = "macos"))]
pub fn read_json() -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
const DOM_KEY_CODES: [(&str, u16); 51] = [
    ("KeyA", 0),
    ("KeyS", 1),
    ("KeyD", 2),
    ("KeyF", 3),
    ("KeyH", 4),
    ("KeyG", 5),
    ("KeyZ", 6),
    ("KeyX", 7),
    ("KeyC", 8),
    ("KeyV", 9),
    ("KeyB", 11),
    ("KeyQ", 12),
    ("KeyW", 13),
    ("KeyE", 14),
    ("KeyR", 15),
    ("KeyY", 16),
    ("KeyT", 17),
    ("Digit1", 18),
    ("Digit2", 19),
    ("Digit3", 20),
    ("Digit4", 21),
    ("Digit6", 22),
    ("Digit5", 23),
    ("Equal", 24),
    ("Digit9", 25),
    ("Digit7", 26),
    ("Minus", 27),
    ("Digit8", 28),
    ("Digit0", 29),
    ("BracketRight", 30),
    ("KeyO", 31),
    ("KeyU", 32),
    ("BracketLeft", 33),
    ("KeyI", 34),
    ("KeyP", 35),
    ("KeyL", 37),
    ("KeyJ", 38),
    ("Quote", 39),
    ("KeyK", 40),
    ("Semicolon", 41),
    ("Backslash", 42),
    ("Comma", 43),
    ("Slash", 44),
    ("KeyN", 45),
    ("KeyM", 46),
    ("Period", 47),
    ("Space", 49),
    ("Backquote", 50),
    ("IntlBackslash", 10),
    ("IntlYen", 93),
    ("IntlRo", 94),
];

#[cfg(target_os = "macos")]
mod sys {
    use std::ffi::c_void;

    pub type CFTypeRef = *const c_void;
    pub type CFStringRef = *const c_void;
    pub type CFDataRef = *const c_void;

    #[repr(C)]
    pub struct CFRange {
        pub location: isize,
        pub length: isize,
    }

    pub const K_UC_KEY_ACTION_DOWN: u16 = 0;
    pub const K_UC_KEY_TRANSLATE_NO_DEAD_KEYS_MASK: u32 = 1;
    /// Carbon's `shiftKey` (0x0200) shifted right by 8, as UCKeyTranslate expects.
    pub const SHIFT_MODIFIER: u32 = 0x0200 >> 8;

    #[link(name = "Carbon", kind = "framework")]
    unsafe extern "C" {
        pub static kTISPropertyInputSourceID: CFStringRef;
        pub static kTISPropertyUnicodeKeyLayoutData: CFStringRef;
        pub fn TISCopyCurrentKeyboardInputSource() -> CFTypeRef;
        pub fn TISCopyCurrentKeyboardLayoutInputSource() -> CFTypeRef;
        pub fn TISGetInputSourceProperty(source: CFTypeRef, key: CFStringRef) -> *const c_void;
        pub fn LMGetKbdType() -> u8;
        pub fn UCKeyTranslate(
            layout: *const c_void,
            key_code: u16,
            key_action: u16,
            modifier_key_state: u32,
            keyboard_type: u32,
            options: u32,
            dead_key_state: *mut u32,
            max_length: usize,
            actual_length: *mut usize,
            characters: *mut u16,
        ) -> i32;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        pub fn CFRelease(value: CFTypeRef);
        pub fn CFDataGetBytePtr(data: CFDataRef) -> *const u8;
        pub fn CFStringGetLength(string: CFStringRef) -> isize;
        pub fn CFStringGetCharacters(string: CFStringRef, range: CFRange, buffer: *mut u16);
    }
}

/// An owned (+1) TIS input source, released on drop.
#[cfg(target_os = "macos")]
struct InputSource(sys::CFTypeRef);

#[cfg(target_os = "macos")]
impl InputSource {
    fn current() -> Option<Self> {
        let source = unsafe { sys::TISCopyCurrentKeyboardInputSource() };
        (!source.is_null()).then_some(Self(source))
    }

    fn current_layout() -> Option<Self> {
        let source = unsafe { sys::TISCopyCurrentKeyboardLayoutInputSource() };
        (!source.is_null()).then_some(Self(source))
    }

    fn id(&self) -> Option<String> {
        let raw = unsafe { sys::TISGetInputSourceProperty(self.0, sys::kTISPropertyInputSourceID) };
        (!raw.is_null()).then(|| cf_string(raw))
    }
}

#[cfg(target_os = "macos")]
impl Drop for InputSource {
    fn drop(&mut self) {
        unsafe { sys::CFRelease(self.0) }
    }
}

#[cfg(target_os = "macos")]
fn cf_string(string: sys::CFStringRef) -> String {
    let length = unsafe { sys::CFStringGetLength(string) };
    let mut units = vec![0u16; length.max(0) as usize];
    unsafe {
        sys::CFStringGetCharacters(
            string,
            sys::CFRange {
                location: 0,
                length,
            },
            units.as_mut_ptr(),
        )
    };
    String::from_utf16_lossy(&units)
}

#[cfg(target_os = "macos")]
fn source_id(source: &Option<InputSource>) -> Option<String> {
    source.as_ref().and_then(InputSource::id)
}

#[cfg(target_os = "macos")]
fn translated_character(
    layout: *const std::ffi::c_void,
    key_code: u16,
    modifiers: u32,
) -> Option<String> {
    let mut dead_key_state = 0u32;
    let mut length = 0usize;
    let mut characters = [0u16; 8];
    let status = unsafe {
        sys::UCKeyTranslate(
            layout,
            key_code,
            sys::K_UC_KEY_ACTION_DOWN,
            modifiers,
            u32::from(sys::LMGetKbdType()),
            sys::K_UC_KEY_TRANSLATE_NO_DEAD_KEYS_MASK,
            &mut dead_key_state,
            characters.len(),
            &mut length,
            characters.as_mut_ptr(),
        )
    };
    (status == 0 && length > 0)
        .then(|| String::from_utf16_lossy(&characters[..length.min(characters.len())]))
}

#[cfg(target_os = "macos")]
fn read_stable_snapshot() -> Option<String> {
    use serde_json::{Map, Value};

    let input_source = InputSource::current();
    let layout_source = InputSource::current_layout();
    let input_source_id = source_id(&input_source);
    let layout_source_id = source_id(&layout_source);
    let mut key_characters = Map::new();

    if let Some(layout_source) = &layout_source {
        let data = unsafe {
            sys::TISGetInputSourceProperty(layout_source.0, sys::kTISPropertyUnicodeKeyLayoutData)
        };
        let bytes = if data.is_null() {
            std::ptr::null()
        } else {
            unsafe { sys::CFDataGetBytePtr(data) }
        };
        if !bytes.is_null() {
            let layout = bytes.cast::<std::ffi::c_void>();
            for (code, key_code) in DOM_KEY_CODES {
                let mut characters = Map::new();
                // Like the helper's JSONEncoder: a key with no character leaves the field out.
                if let Some(unmodified) = translated_character(layout, key_code, 0) {
                    characters.insert("unmodified".into(), Value::String(unmodified));
                }
                if let Some(shifted) = translated_character(layout, key_code, sys::SHIFT_MODIFIER) {
                    characters.insert("shifted".into(), Value::String(shifted));
                }
                key_characters.insert(code.into(), Value::Object(characters));
            }
        }
    }

    if input_source_id != source_id(&InputSource::current())
        || layout_source_id != source_id(&InputSource::current_layout())
    {
        return None;
    }
    let mut snapshot = Map::new();
    if let Some(id) = input_source_id {
        snapshot.insert("inputSourceId".into(), Value::String(id));
    }
    if let Some(id) = layout_source_id {
        snapshot.insert("layoutSourceId".into(), Value::String(id));
    }
    snapshot.insert("keyCharacters".into(), Value::Object(key_characters));
    serde_json::to_string(&Value::Object(snapshot)).ok()
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn refuses_off_the_main_thread() {
        assert!(std::thread::spawn(read_json).join().unwrap().is_none());
    }

    #[test]
    fn reads_the_current_layout() {
        // Below the main-thread guard: a test process is not a UI application, and no other test calls TIS.
        let json = (0..2)
            .find_map(|_| read_stable_snapshot())
            .expect("layout kept changing");
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(value["layoutSourceId"].is_string());
        let keys = value["keyCharacters"].as_object().unwrap();
        assert_eq!(keys.len(), DOM_KEY_CODES.len());
        assert!(keys["Space"]["unmodified"] == " ");
    }
}
