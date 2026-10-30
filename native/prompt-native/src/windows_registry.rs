//! Read-only registry value enumeration, replacing Orca's C++ `@orca/windows-registry` addon
//! (itself reduced from windows-native-registry@3.2.2, MIT, Eugene Pankov). Only reads exist here: Prompt never
//! writes the registry, so the write surface stays out of the app.
//!
//! Decoding is kept identical to the addon: REG_SZ / REG_EXPAND_SZ stop at the first NUL, REG_MULTI_SZ splits on
//! NULs and drops the closing empty string, REG_DWORD reads little-endian (0 when short), REG_BINARY becomes a byte
//! array, other types carry no value, and a string type with an odd byte count fails the whole read. Strings stay
//! UTF-16 end to end, so names and values with unpaired surrogates survive exactly as before.

// Decoding is only reached from the Windows reader (and the unit tests) elsewhere.
#![cfg_attr(not(windows), allow(dead_code))]

/// One decoded registry value.
#[derive(Debug, PartialEq)]
pub enum Decoded {
    Text(Vec<u16>),
    Dword(u32),
    Binary(Vec<u8>),
    Multi(Vec<Vec<u16>>),
}

/// One value under the key: its name, its REG_* type and the decoded data (None for types the app does not read).
pub struct Entry {
    pub name: Vec<u16>,
    pub kind: u32,
    pub value: Option<Decoded>,
}

const REG_SZ: u32 = 1;
const REG_EXPAND_SZ: u32 = 2;
const REG_BINARY: u32 = 3;
const REG_DWORD: u32 = 4;
const REG_MULTI_SZ: u32 = 7;

fn utf16_units(data: &[u8]) -> Vec<u16> {
    data.as_chunks::<2>()
        .0
        .iter()
        .map(|&pair| u16::from_le_bytes(pair))
        .collect()
}

fn until_nul(units: &[u16]) -> &[u16] {
    units
        .iter()
        .position(|&unit| unit == 0)
        .map_or(units, |end| &units[..end])
}

/// Err when a string type holds a partial UTF-16 unit (the registry does not prevent that).
pub fn decode(kind: u32, data: &[u8]) -> Result<Option<Decoded>, ()> {
    let is_utf16 = matches!(kind, REG_SZ | REG_EXPAND_SZ | REG_MULTI_SZ);
    if is_utf16 && !data.len().is_multiple_of(2) {
        return Err(());
    }
    Ok(match kind {
        REG_SZ | REG_EXPAND_SZ => Some(Decoded::Text(until_nul(&utf16_units(data)).to_vec())),
        REG_DWORD => {
            Some(Decoded::Dword(data.get(..4).map_or(0, |bytes| {
                u32::from_le_bytes(bytes.try_into().unwrap())
            })))
        }
        REG_BINARY => Some(Decoded::Binary(data.to_vec())),
        REG_MULTI_SZ => {
            let units = utf16_units(data);
            let mut parts = Vec::new();
            let mut position = 0;
            // The last unit is the closing empty string's terminator; stop before it.
            while !units.is_empty() && position < units.len() - 1 {
                let part = until_nul(&units[position..]);
                position += part.len() + 1;
                parts.push(part.to_vec());
            }
            Some(Decoded::Multi(parts))
        }
        _ => None,
    })
}

/// Every value under `path` (UTF-16, no terminator) below a predefined root (0x80000000 HKCR ... 0x80000006),
/// or None when the root is unknown or the key cannot be opened or enumerated.
#[cfg(windows)]
pub fn read_key(root: u32, path: &[u16]) -> Option<Vec<Entry>> {
    use windows_sys::Win32::Foundation::{ERROR_NO_MORE_ITEMS, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{
        HKEY, HKEY_CLASSES_ROOT, HKEY_CURRENT_CONFIG, HKEY_CURRENT_USER, HKEY_DYN_DATA,
        HKEY_LOCAL_MACHINE, HKEY_PERFORMANCE_DATA, HKEY_USERS, KEY_READ, RegCloseKey,
        RegEnumValueW, RegOpenKeyExW,
    };

    // Registry value names cap at 32767 wide chars; data at 1 MB, matching the addon's ceiling.
    const NAME_MAX: u32 = 32767;
    const DATA_MAX: u32 = 1024 * 1024;

    let root: HKEY = match root {
        0x8000_0000 => HKEY_CLASSES_ROOT,
        0x8000_0001 => HKEY_CURRENT_USER,
        0x8000_0002 => HKEY_LOCAL_MACHINE,
        0x8000_0003 => HKEY_USERS,
        0x8000_0004 => HKEY_PERFORMANCE_DATA,
        0x8000_0005 => HKEY_CURRENT_CONFIG,
        0x8000_0006 => HKEY_DYN_DATA,
        _ => return None,
    };
    let path: Vec<u16> = path.iter().copied().chain(std::iter::once(0)).collect();

    /// Closes the key on every return path.
    struct Key(HKEY);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe { RegCloseKey(self.0) };
        }
    }

    let mut handle: HKEY = std::ptr::null_mut();
    if unsafe { RegOpenKeyExW(root, path.as_ptr(), 0, KEY_READ, &mut handle) } != ERROR_SUCCESS {
        return None;
    }
    let key = Key(handle);
    // Per-call buffers: concurrent reads must not share them (an upstream defect the addon fixed).
    let mut name = vec![0u16; NAME_MAX as usize];
    let mut data = vec![0u8; DATA_MAX as usize];
    let mut entries = Vec::new();
    for index in 0.. {
        let mut name_length = NAME_MAX - 1;
        let mut data_length = DATA_MAX - 1;
        let mut kind = 0u32;
        let status = unsafe {
            RegEnumValueW(
                key.0,
                index,
                name.as_mut_ptr(),
                &mut name_length,
                std::ptr::null(),
                &mut kind,
                data.as_mut_ptr(),
                &mut data_length,
            )
        };
        if status == ERROR_NO_MORE_ITEMS {
            break;
        }
        if status != ERROR_SUCCESS {
            return None;
        }
        let value = decode(kind, &data[..data_length as usize]).ok()?;
        entries.push(Entry {
            name: name[..name_length as usize].to_vec(),
            kind,
            value,
        });
    }
    Some(entries)
}

/// The registry exists only on Windows.
#[cfg(not(windows))]
pub fn read_key(_root: u32, _path: &[u16]) -> Option<Vec<Entry>> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().collect()
    }

    fn bytes(units: &[u16]) -> Vec<u8> {
        units.iter().flat_map(|unit| unit.to_le_bytes()).collect()
    }

    #[test]
    fn strings_stop_at_the_first_nul_and_tolerate_a_missing_terminator() {
        let stored = bytes(&[b'a' as u16, b'b' as u16, 0, b'c' as u16, 0]);
        assert_eq!(
            decode(REG_EXPAND_SZ, &stored),
            Ok(Some(Decoded::Text(wide("ab"))))
        );
        assert_eq!(
            decode(REG_SZ, &bytes(&wide("no-nul"))),
            Ok(Some(Decoded::Text(wide("no-nul"))))
        );
        assert_eq!(decode(REG_SZ, &[]), Ok(Some(Decoded::Text(Vec::new()))));
    }

    #[test]
    fn odd_string_lengths_fail_the_read() {
        assert_eq!(decode(REG_SZ, &[b'a', 0, b'b']), Err(()));
        assert_eq!(decode(REG_MULTI_SZ, &[0]), Err(()));
        assert!(decode(REG_BINARY, &[1, 2, 3]).is_ok());
    }

    #[test]
    fn multi_strings_split_on_nul_and_drop_the_closing_empty_string() {
        let mut units = wide("one");
        units.push(0);
        units.extend(wide("two"));
        units.extend([0, 0]);
        assert_eq!(
            decode(REG_MULTI_SZ, &bytes(&units)),
            Ok(Some(Decoded::Multi(vec![wide("one"), wide("two")])))
        );
        assert_eq!(
            decode(REG_MULTI_SZ, &bytes(&[0])),
            Ok(Some(Decoded::Multi(Vec::new())))
        );
        assert_eq!(
            decode(REG_MULTI_SZ, &[]),
            Ok(Some(Decoded::Multi(Vec::new())))
        );
    }

    #[test]
    fn dwords_binaries_and_other_types() {
        assert_eq!(
            decode(REG_DWORD, &[1, 2, 0, 0]),
            Ok(Some(Decoded::Dword(0x0201)))
        );
        assert_eq!(decode(REG_DWORD, &[1, 2]), Ok(Some(Decoded::Dword(0))));
        assert_eq!(
            decode(REG_BINARY, &[7, 255]),
            Ok(Some(Decoded::Binary(vec![7, 255])))
        );
        // REG_QWORD and the rest carry no value, as before.
        assert_eq!(decode(11, &[0; 8]), Ok(None));
    }
}
