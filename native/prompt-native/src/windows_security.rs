//! Windows file DACLs, generic credentials and std-handle inheritance, replacing Orca's C++ `@orca/windows-security`
//! addon. Native DACL IO avoids icacls.exe's multi-second main-thread stalls (#26027) and its EDR-scored
//! `/reset` + `/inheritance:r` pattern (#25583). The JavaScript side (src/shared/windows-security-addon.ts) owns
//! SID and flag policy; this part only reads and writes structure.
//!
//! Every call answers exactly as the addon did: the same Win32 calls in the same order, the same error text
//! (`<call> failed with Win32 error <code>`), null for a missing file or credential, and a torn file removed.

// The pure helpers are only reached from the Windows calls (and the unit tests) elsewhere.
#![cfg_attr(not(windows), allow(dead_code))]

/// A failed Win32 call: its name and its error code, as the addon reported them.
#[derive(Debug, PartialEq, Eq)]
pub struct Win32Error {
    pub syscall: &'static str,
    pub code: u32,
}

impl Win32Error {
    pub fn message(&self) -> String {
        format!("{} failed with Win32 error {}", self.syscall, self.code)
    }
}

pub type Win32Result<T> = Result<T, Win32Error>;

pub(crate) fn fail<T>(syscall: &'static str, code: u32) -> Win32Result<T> {
    Err(Win32Error { syscall, code })
}

/// One DACL entry as stored. `sid` is set only for plain allow (0) and deny (1) ACEs, so JS can refuse the rest.
#[derive(Debug, PartialEq, Eq)]
pub struct Ace {
    pub kind: u8,
    pub flags: u8,
    pub mask: u32,
    pub sid: Option<Vec<u16>>,
}

/// `protected` is SE_DACL_PROTECTED.
#[derive(Debug, PartialEq, Eq)]
pub struct Dacl {
    pub protected: bool,
    pub aces: Vec<Ace>,
}

/// A file's bytes and its DACL (None for a NULL DACL), read through one handle.
pub struct FileWithDacl {
    pub dacl: Option<Dacl>,
    pub data: Vec<u8>,
}

const ERROR_FILE_NOT_FOUND: u32 = 2;
const ERROR_PATH_NOT_FOUND: u32 = 3;
const ERROR_INVALID_DATA: u32 = 13;
const ERROR_WRITE_FAULT: u32 = 29;
const ERROR_READ_FAULT: u32 = 30;
const ERROR_INVALID_PARAMETER: u32 = 87;
const ERROR_NOT_FOUND: u32 = 1168;
const ERROR_INVALID_SECURITY_DESCR: u32 = 1338;

const SE_DACL_PROTECTED: u16 = 0x1000;
const DACL_SECURITY_INFORMATION: u32 = 0x4;
const PROTECTED_DACL_SECURITY_INFORMATION: u32 = 0x8000_0000;
const UNPROTECTED_DACL_SECURITY_INFORMATION: u32 = 0x2000_0000;
const ACCESS_ALLOWED_ACE_TYPE: u8 = 0;
const ACCESS_DENIED_ACE_TYPE: u8 = 1;
const GRANT_ACCESS: i32 = 1;
const SET_ACCESS: i32 = 2;
const NO_INHERITANCE: u32 = 0;
const SUB_CONTAINERS_AND_OBJECTS_INHERIT: u32 = 3;

/// The credential blob limit the addon enforced (CRED_MAX_CREDENTIAL_BLOB_SIZE, 5 * 512).
pub const CREDENTIAL_BLOB_MAX: usize = 2560;

/// The descriptor's own protection bit decides: a replacement DACL carries the caller's choice, and a grant re-reads
/// the object's, so adding one rule never flips inheritance on or off.
fn dacl_information(control: u16) -> u32 {
    DACL_SECURITY_INFORMATION
        | if control & SE_DACL_PROTECTED != 0 {
            PROTECTED_DACL_SECURITY_INFORMATION
        } else {
            UNPROTECTED_DACL_SECURITY_INFORMATION
        }
}

/// SET_ACCESS drops every explicit rule for the trustee and grants exactly the mask; GRANT_ACCESS adds to it.
fn grant_mode(inheritable: bool, replace: bool) -> (i32, u32) {
    (
        if replace { SET_ACCESS } else { GRANT_ACCESS },
        if inheritable {
            SUB_CONTAINERS_AND_OBJECTS_INHERIT
        } else {
            NO_INHERITANCE
        },
    )
}

/// A created file carries the requested DACL only when it is protected and byte-for-byte the requested ACL.
fn same_protected_acl(protected: bool, actual: &[u8], requested: &[u8]) -> bool {
    protected && actual == requested
}

/// Whether the opened file may be read: a disk file, not a directory or reparse point, no larger than `limit`.
fn readable_file(is_disk: bool, attributes: u32, size: i64, limit: u32) -> bool {
    const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    is_disk
        && attributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT) == 0
        && size >= 0
        && size <= i64::from(limit)
}

/// `text` with the terminating NUL the wide Win32 calls read up to (an embedded NUL ends it earlier, as in C++).
pub(crate) fn wide(text: &[u16]) -> Vec<u16> {
    text.iter().copied().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ffi::c_void;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{
        CloseHandle, GENERIC_READ, GENERIC_WRITE, GetLastError, HANDLE, HANDLE_FLAG_INHERIT,
        INVALID_HANDLE_VALUE, LocalFree, SetHandleInformation,
    };
    use windows_sys::Win32::Security::Authorization::{
        ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
        ConvertStringSidToSidW, EXPLICIT_ACCESS_W, GetNamedSecurityInfoW, GetSecurityInfo,
        NO_MULTIPLE_TRUSTEE, SDDL_REVISION_1, SE_FILE_OBJECT, SetEntriesInAclW,
        SetNamedSecurityInfoW, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
    };
    use windows_sys::Win32::Security::Credentials::{
        CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW, CredFree, CredReadW, CredWriteW,
    };
    use windows_sys::Win32::Security::{
        ACCESS_ALLOWED_ACE, ACE_HEADER, ACL, GetAce, GetSecurityDescriptorControl,
        GetSecurityDescriptorDacl, GetTokenInformation, PSECURITY_DESCRIPTOR, PSID,
        SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER, TokenUser,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, CREATE_NEW, CreateFileW, DeleteFileW, FILE_ATTRIBUTE_NORMAL,
        FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ, FILE_TYPE_DISK, FlushFileBuffers,
        GetFileInformationByHandle, GetFileSizeEx, GetFileType, OPEN_EXISTING, READ_CONTROL,
        ReadFile, WriteFile,
    };
    use windows_sys::Win32::System::Console::{
        GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
    };
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    // The pure helpers above use these values; the compiler checks they still match the SDK.
    const _: () = {
        use windows_sys::Win32::Foundation as F;
        use windows_sys::Win32::Security as S;
        use windows_sys::Win32::Security::Authorization as A;
        assert!(ERROR_FILE_NOT_FOUND == F::ERROR_FILE_NOT_FOUND);
        assert!(ERROR_PATH_NOT_FOUND == F::ERROR_PATH_NOT_FOUND);
        assert!(ERROR_INVALID_DATA == F::ERROR_INVALID_DATA);
        assert!(ERROR_WRITE_FAULT == F::ERROR_WRITE_FAULT);
        assert!(ERROR_READ_FAULT == F::ERROR_READ_FAULT);
        assert!(ERROR_INVALID_PARAMETER == F::ERROR_INVALID_PARAMETER);
        assert!(ERROR_NOT_FOUND == F::ERROR_NOT_FOUND);
        assert!(ERROR_INVALID_SECURITY_DESCR == F::ERROR_INVALID_SECURITY_DESCR);
        assert!(SE_DACL_PROTECTED == S::SE_DACL_PROTECTED);
        assert!(DACL_SECURITY_INFORMATION == S::DACL_SECURITY_INFORMATION);
        assert!(PROTECTED_DACL_SECURITY_INFORMATION == S::PROTECTED_DACL_SECURITY_INFORMATION);
        assert!(UNPROTECTED_DACL_SECURITY_INFORMATION == S::UNPROTECTED_DACL_SECURITY_INFORMATION);
        assert!(GRANT_ACCESS == A::GRANT_ACCESS);
        assert!(SET_ACCESS == A::SET_ACCESS);
        assert!(NO_INHERITANCE == S::NO_INHERITANCE);
        assert!(SUB_CONTAINERS_AND_OBJECTS_INHERIT == S::SUB_CONTAINERS_AND_OBJECTS_INHERIT);
    };

    /// Frees LocalAlloc'd memory (descriptors, SIDs, ACLs, SID strings) on every return path.
    struct Local(*mut c_void);
    impl Drop for Local {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { LocalFree(self.0) };
            }
        }
    }

    fn last_error() -> u32 {
        unsafe { GetLastError() }
    }

    fn parse_sddl(sddl: &[u16]) -> Win32Result<Local> {
        let sddl = wide(sddl);
        let mut raw: PSECURITY_DESCRIPTOR = null_mut();
        if unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                SDDL_REVISION_1,
                &mut raw,
                null_mut(),
            )
        } == 0
        {
            return fail(
                "ConvertStringSecurityDescriptorToSecurityDescriptorW",
                last_error(),
            );
        }
        Ok(Local(raw))
    }

    fn dacl_information_for(descriptor: PSECURITY_DESCRIPTOR) -> Win32Result<u32> {
        let mut control = 0u16;
        let mut revision = 0u32;
        if unsafe { GetSecurityDescriptorControl(descriptor, &mut control, &mut revision) } == 0 {
            return fail("GetSecurityDescriptorControl", last_error());
        }
        Ok(dacl_information(control))
    }

    fn sid_string(sid: PSID) -> Win32Result<Vec<u16>> {
        let mut text = null_mut();
        if unsafe { ConvertSidToStringSidW(sid, &mut text) } == 0 {
            return fail("ConvertSidToStringSidW", last_error());
        }
        let owned = Local(text.cast());
        let mut length = 0;
        while unsafe { *text.add(length) } != 0 {
            length += 1;
        }
        let units = unsafe { std::slice::from_raw_parts(text, length) }.to_vec();
        drop(owned);
        Ok(units)
    }

    pub fn current_user_sid() -> Win32Result<Vec<u16>> {
        let mut token: HANDLE = null_mut();
        if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
            return fail("OpenProcessToken", last_error());
        }
        let mut size = 0u32;
        unsafe { GetTokenInformation(token, TokenUser, null_mut(), 0, &mut size) };
        // u64 storage keeps TOKEN_USER's pointer field aligned.
        let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
        let queried = size > 0
            && unsafe {
                GetTokenInformation(
                    token,
                    TokenUser,
                    buffer.as_mut_ptr().cast(),
                    size,
                    &mut size,
                )
            } != 0;
        let query_error = last_error();
        unsafe { CloseHandle(token) };
        if !queried {
            return fail("GetTokenInformation", query_error);
        }
        let user = buffer.as_ptr().cast::<TOKEN_USER>();
        sid_string(unsafe { (*user).User.Sid })
    }

    /// Structure only; None is a NULL DACL. Only plain allow/deny ACEs expose SIDs; unknown, object, callback and
    /// conditional types keep `sid` None so JS can refuse them.
    fn dacl_value(descriptor: PSECURITY_DESCRIPTOR, dacl: *const ACL) -> Win32Result<Option<Dacl>> {
        if dacl.is_null() {
            return Ok(None);
        }
        let mut control = 0u16;
        let mut revision = 0u32;
        if unsafe { GetSecurityDescriptorControl(descriptor, &mut control, &mut revision) } == 0 {
            return fail("GetSecurityDescriptorControl", last_error());
        }
        let count = unsafe { (*dacl).AceCount };
        let mut aces = Vec::with_capacity(usize::from(count));
        for index in 0..u32::from(count) {
            let mut raw: *mut c_void = null_mut();
            if unsafe { GetAce(dacl, index, &mut raw) } == 0 {
                return fail("GetAce", last_error());
            }
            let header = unsafe { *raw.cast::<ACE_HEADER>() };
            // ACCESS_ALLOWED_ACE and ACCESS_DENIED_ACE share this layout: Mask, then SidStart.
            let (mask, sid) = if header.AceType == ACCESS_ALLOWED_ACE_TYPE
                || header.AceType == ACCESS_DENIED_ACE_TYPE
            {
                let plain = raw.cast::<ACCESS_ALLOWED_ACE>();
                let sid_start = unsafe { std::ptr::addr_of_mut!((*plain).SidStart) };
                (
                    unsafe { (*plain).Mask },
                    Some(sid_string(sid_start.cast())?),
                )
            } else {
                (0, None)
            };
            aces.push(Ace {
                kind: header.AceType,
                flags: header.AceFlags,
                mask,
                sid,
            });
        }
        Ok(Some(Dacl {
            protected: control & SE_DACL_PROTECTED != 0,
            aces,
        }))
    }

    pub fn get_dacl_aces(path: &[u16]) -> Win32Result<Option<Dacl>> {
        let path = wide(path);
        let mut raw: PSECURITY_DESCRIPTOR = null_mut();
        let mut dacl: *mut ACL = null_mut();
        let status = unsafe {
            GetNamedSecurityInfoW(
                path.as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                null_mut(),
                null_mut(),
                &mut dacl,
                null_mut(),
                &mut raw,
            )
        };
        if status != 0 {
            return fail("GetNamedSecurityInfoW", status);
        }
        let _descriptor = Local(raw);
        dacl_value(raw, dacl)
    }

    pub fn set_dacl_sddl(path: &[u16], sddl: &[u16]) -> Win32Result<()> {
        let descriptor = parse_sddl(sddl)?;
        let mut present = 0;
        let mut defaulted = 0;
        let mut dacl: *mut ACL = null_mut();
        if unsafe {
            GetSecurityDescriptorDacl(descriptor.0, &mut present, &mut dacl, &mut defaulted)
        } == 0
        {
            return fail("GetSecurityDescriptorDacl", last_error());
        }
        // A missing DACL means "everyone, full control"; never install that by accident.
        if present == 0 || dacl.is_null() {
            return fail("GetSecurityDescriptorDacl", ERROR_INVALID_SECURITY_DESCR);
        }
        let information = dacl_information_for(descriptor.0)?;
        let path = wide(path);
        let status = unsafe {
            SetNamedSecurityInfoW(
                path.as_ptr(),
                SE_FILE_OBJECT,
                information,
                null_mut(),
                null_mut(),
                dacl,
                null(),
            )
        };
        if status != 0 {
            return fail("SetNamedSecurityInfoW", status);
        }
        Ok(())
    }

    pub fn grant_access(
        path: &[u16],
        sid: &[u16],
        mask: u32,
        inheritable: bool,
        replace: bool,
    ) -> Win32Result<()> {
        let path = wide(path);
        let mut raw: PSECURITY_DESCRIPTOR = null_mut();
        let mut existing: *mut ACL = null_mut();
        let status = unsafe {
            GetNamedSecurityInfoW(
                path.as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                null_mut(),
                null_mut(),
                &mut existing,
                null_mut(),
                &mut raw,
            )
        };
        if status != 0 {
            return fail("GetNamedSecurityInfoW", status);
        }
        let descriptor = Local(raw);
        // A NULL DACL already grants everyone everything; merging into it would build a DACL holding only this
        // rule and lock every other principal out.
        if existing.is_null() {
            return Ok(());
        }
        let sid = wide(sid);
        let mut raw_sid: PSID = null_mut();
        if unsafe { ConvertStringSidToSidW(sid.as_ptr(), &mut raw_sid) } == 0 {
            return fail("ConvertStringSidToSidW", last_error());
        }
        let trustee_sid = Local(raw_sid);
        let (mode, inheritance) = grant_mode(inheritable, replace);
        let access = EXPLICIT_ACCESS_W {
            grfAccessPermissions: mask,
            grfAccessMode: mode,
            grfInheritance: inheritance,
            Trustee: TRUSTEE_W {
                pMultipleTrustee: null_mut(),
                MultipleTrusteeOperation: NO_MULTIPLE_TRUSTEE,
                TrusteeForm: TRUSTEE_IS_SID,
                TrusteeType: TRUSTEE_IS_UNKNOWN,
                ptstrName: trustee_sid.0.cast(),
            },
        };
        let mut merged: *mut ACL = null_mut();
        let status = unsafe { SetEntriesInAclW(1, &access, existing, &mut merged) };
        if status != 0 {
            return fail("SetEntriesInAclW", status);
        }
        let _merged = Local(merged.cast());
        let information = dacl_information_for(descriptor.0)?;
        let status = unsafe {
            SetNamedSecurityInfoW(
                path.as_ptr(),
                SE_FILE_OBJECT,
                information,
                null_mut(),
                null_mut(),
                merged,
                null(),
            )
        };
        if status != 0 {
            return fail("SetNamedSecurityInfoW", status);
        }
        Ok(())
    }

    fn acl_bytes<'a>(acl: *const ACL) -> &'a [u8] {
        unsafe { std::slice::from_raw_parts(acl.cast::<u8>(), usize::from((*acl).AclSize)) }
    }

    fn verify_file_descriptor(file: HANDLE, expected: PSECURITY_DESCRIPTOR) -> Win32Result<()> {
        let mut raw: PSECURITY_DESCRIPTOR = null_mut();
        let mut actual: *mut ACL = null_mut();
        let status = unsafe {
            GetSecurityInfo(
                file,
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                null_mut(),
                null_mut(),
                &mut actual,
                null_mut(),
                &mut raw,
            )
        };
        let _owned = Local(raw);
        if status != 0 {
            return fail("GetSecurityInfo", status);
        }
        let mut present = 0;
        let mut defaulted = 0;
        let mut requested: *mut ACL = null_mut();
        let mut control = 0u16;
        let mut revision = 0u32;
        let matches = unsafe {
            GetSecurityDescriptorDacl(expected, &mut present, &mut requested, &mut defaulted)
        } != 0
            && unsafe { GetSecurityDescriptorControl(raw, &mut control, &mut revision) } != 0
            && present != 0
            && !requested.is_null()
            && !actual.is_null()
            && same_protected_acl(
                control & SE_DACL_PROTECTED != 0,
                acl_bytes(actual),
                acl_bytes(requested),
            );
        if !matches {
            return fail("VerifyFileDescriptor", ERROR_INVALID_SECURITY_DESCR);
        }
        Ok(())
    }

    pub fn create_file_with_dacl(
        path: &[u16],
        sddl: &[u16],
        data: &[u8],
        strict: bool,
    ) -> Win32Result<()> {
        let descriptor = parse_sddl(sddl)?;
        let Ok(length) = u32::try_from(data.len()) else {
            return fail("WriteFile", ERROR_INVALID_PARAMETER);
        };
        let path = wide(path);
        let attributes = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor.0,
            bInheritHandle: 0,
        };
        // CREATE_NEW ensures the descriptor applies (an existing file keeps its DACL); share mode 0 keeps readers out
        // until the file is complete.
        let file = unsafe {
            CreateFileW(
                path.as_ptr(),
                GENERIC_WRITE | if strict { READ_CONTROL } else { 0 },
                0,
                &attributes,
                CREATE_NEW,
                FILE_ATTRIBUTE_NORMAL,
                null_mut(),
            )
        };
        if file == INVALID_HANDLE_VALUE {
            return fail("CreateFileW", last_error());
        }
        let mut result = if strict {
            verify_file_descriptor(file, descriptor.0)
        } else {
            Ok(())
        };
        if result.is_ok() {
            let mut written = 0u32;
            if unsafe { WriteFile(file, data.as_ptr(), length, &mut written, null_mut()) } == 0 {
                result = fail("WriteFile", last_error());
            } else if written != length {
                result = fail("WriteFile", ERROR_WRITE_FAULT);
            }
        }
        if result.is_ok() && strict {
            result = if unsafe { FlushFileBuffers(file) } == 0 {
                fail("FlushFileBuffers", last_error())
            } else {
                verify_file_descriptor(file, descriptor.0)
            };
        }
        // A failed close can mean lost data on a network volume, so it tears the file like a failed write.
        if unsafe { CloseHandle(file) } == 0 && result.is_ok() {
            result = fail("CloseHandle", last_error());
        }
        if result.is_err() {
            // A torn temp file is useless to the caller and must not linger beside the real one.
            unsafe { DeleteFileW(path.as_ptr()) };
        }
        result
    }

    /// Bounded regular-file bytes and their DACL through one handle, excluding writers and replacement.
    /// None when the file or its directory does not exist.
    pub fn read_file_with_dacl(path: &[u16], limit: u32) -> Win32Result<Option<FileWithDacl>> {
        let path = wide(path);
        let file = unsafe {
            CreateFileW(
                path.as_ptr(),
                GENERIC_READ | READ_CONTROL,
                FILE_SHARE_READ,
                null(),
                OPEN_EXISTING,
                FILE_FLAG_OPEN_REPARSE_POINT,
                null_mut(),
            )
        };
        if file == INVALID_HANDLE_VALUE {
            let error = last_error();
            if error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND {
                return Ok(None);
            }
            return fail("CreateFileW", error);
        }
        let mut information: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
        let mut size = 0i64;
        let readable = unsafe { GetFileType(file) } == FILE_TYPE_DISK
            && unsafe { GetFileInformationByHandle(file, &mut information) } != 0
            && unsafe { GetFileSizeEx(file, &mut size) } != 0
            && readable_file(true, information.dwFileAttributes, size, limit);
        let mut raw: PSECURITY_DESCRIPTOR = null_mut();
        let mut dacl: *mut ACL = null_mut();
        let mut result = if readable {
            Ok(())
        } else {
            fail("ReadFileWithDacl", ERROR_INVALID_DATA)
        };
        if result.is_ok() {
            let status = unsafe {
                GetSecurityInfo(
                    file,
                    SE_FILE_OBJECT,
                    DACL_SECURITY_INFORMATION,
                    null_mut(),
                    null_mut(),
                    &mut dacl,
                    null_mut(),
                    &mut raw,
                )
            };
            if status != 0 {
                result = fail("GetSecurityInfo", status);
            }
        }
        let _descriptor = Local(raw);
        let mut output = None;
        if result.is_ok() {
            match dacl_value(raw, dacl) {
                Ok(value) => {
                    // `readable` bounds size by `limit`, a u32.
                    let length = size as u32;
                    let mut data = vec![0u8; length as usize];
                    let mut read = 0u32;
                    if unsafe { ReadFile(file, data.as_mut_ptr(), length, &mut read, null_mut()) }
                        == 0
                        || read != length
                    {
                        result = fail("ReadFile", ERROR_READ_FAULT);
                    }
                    output = Some(FileWithDacl { dacl: value, data });
                }
                Err(error) => result = Err(error),
            }
        }
        if unsafe { CloseHandle(file) } == 0 && result.is_ok() {
            result = fail("CloseHandle", last_error());
        }
        result.map(|()| output)
    }

    /// Frees a credential CredReadW returned.
    struct Credential(*mut CREDENTIALW);
    impl Drop for Credential {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CredFree(self.0.cast()) };
            }
        }
    }

    pub fn read_generic_credential(target: &[u16]) -> Win32Result<Option<Vec<u8>>> {
        let target = wide(target);
        let mut raw: *mut CREDENTIALW = null_mut();
        if unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut raw) } == 0 {
            let error = last_error();
            if error == ERROR_NOT_FOUND {
                return Ok(None);
            }
            return fail("CredReadW", error);
        }
        let owned = Credential(raw);
        let credential = unsafe { &*owned.0 };
        let blob = if credential.CredentialBlob.is_null() || credential.CredentialBlobSize == 0 {
            Vec::new()
        } else {
            unsafe {
                std::slice::from_raw_parts(
                    credential.CredentialBlob,
                    credential.CredentialBlobSize as usize,
                )
            }
            .to_vec()
        };
        Ok(Some(blob))
    }

    pub fn write_generic_credential(target: &[u16], user: &[u16], data: &[u8]) -> Win32Result<()> {
        if data.len() > CREDENTIAL_BLOB_MAX {
            return fail("CredWriteW", ERROR_INVALID_PARAMETER);
        }
        let mut target = wide(target);
        let mut user = wide(user);
        let mut raw: *mut CREDENTIALW = null_mut();
        if unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut raw) } == 0 {
            let error = last_error();
            if error != ERROR_NOT_FOUND {
                return fail("CredReadW", error);
            }
        }
        let existing = Credential(raw);
        // Replacing only the blob keeps every writable field of an existing credential.
        let mut replacement = if existing.0.is_null() {
            let mut created: CREDENTIALW = unsafe { std::mem::zeroed() };
            created.Type = CRED_TYPE_GENERIC;
            created.TargetName = target.as_mut_ptr();
            created.UserName = user.as_mut_ptr();
            created.Persist = CRED_PERSIST_LOCAL_MACHINE;
            created
        } else {
            unsafe { *existing.0 }
        };
        replacement.CredentialBlob = data.as_ptr().cast_mut();
        replacement.CredentialBlobSize = data.len() as u32;
        let written = unsafe { CredWriteW(&replacement, 0) } != 0;
        let error = last_error();
        drop(existing);
        if !written {
            return fail("CredWriteW", error);
        }
        Ok(())
    }

    /// Clears HANDLE_FLAG_INHERIT on the std handles so a spawn with bInheritHandles=TRUE cannot leak them to a
    /// long-lived child; libuv duplicates an inheritable copy for an explicit stdio 'inherit'.
    /// Only failures come back; absent handles are skipped.
    pub fn clear_std_handle_inheritance() -> Vec<(&'static str, u32)> {
        let mut failures = Vec::new();
        for (id, name) in [
            (STD_INPUT_HANDLE, "stdin"),
            (STD_OUTPUT_HANDLE, "stdout"),
            (STD_ERROR_HANDLE, "stderr"),
        ] {
            let handle = unsafe { GetStdHandle(id) };
            if handle.is_null() || handle == INVALID_HANDLE_VALUE {
                continue;
            }
            if unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT, 0) } == 0 {
                failures.push((name, last_error()));
            }
        }
        failures
    }
}

#[cfg(windows)]
pub use imp::*;

/// Windows only: elsewhere every call fails like an unsupported Win32 call (the JS loader never gets here).
#[cfg(not(windows))]
mod unsupported {
    use super::*;

    pub const ERROR_NOT_SUPPORTED: u32 = 50;

    fn unsupported<T>() -> Win32Result<T> {
        fail("WindowsSecurity", ERROR_NOT_SUPPORTED)
    }

    pub fn current_user_sid() -> Win32Result<Vec<u16>> {
        unsupported()
    }
    pub fn get_dacl_aces(_path: &[u16]) -> Win32Result<Option<Dacl>> {
        unsupported()
    }
    pub fn set_dacl_sddl(_path: &[u16], _sddl: &[u16]) -> Win32Result<()> {
        unsupported()
    }
    pub fn grant_access(
        _path: &[u16],
        _sid: &[u16],
        _mask: u32,
        _inheritable: bool,
        _replace: bool,
    ) -> Win32Result<()> {
        unsupported()
    }
    pub fn create_file_with_dacl(
        _path: &[u16],
        _sddl: &[u16],
        _data: &[u8],
        _strict: bool,
    ) -> Win32Result<()> {
        unsupported()
    }
    pub fn read_file_with_dacl(_path: &[u16], _limit: u32) -> Win32Result<Option<FileWithDacl>> {
        unsupported()
    }
    pub fn read_generic_credential(_target: &[u16]) -> Win32Result<Option<Vec<u8>>> {
        unsupported()
    }
    pub fn write_generic_credential(
        _target: &[u16],
        _user: &[u16],
        _data: &[u8],
    ) -> Win32Result<()> {
        unsupported()
    }
    pub fn clear_std_handle_inheritance() -> Vec<(&'static str, u32)> {
        Vec::new()
    }
}

#[cfg(not(windows))]
pub use unsupported::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_read_like_the_addon() {
        let error = Win32Error {
            syscall: "SetNamedSecurityInfoW",
            code: 5,
        };
        assert_eq!(
            error.message(),
            "SetNamedSecurityInfoW failed with Win32 error 5"
        );
    }

    #[test]
    fn the_descriptor_protection_bit_picks_the_information_flag() {
        assert_eq!(dacl_information(0x1000), 0x8000_0004);
        assert_eq!(dacl_information(0x1000 | 0x0004), 0x8000_0004);
        assert_eq!(dacl_information(0), 0x2000_0004);
        assert_eq!(dacl_information(0x0400), 0x2000_0004);
    }

    #[test]
    fn grants_map_to_access_modes_and_inheritance() {
        assert_eq!(grant_mode(false, false), (GRANT_ACCESS, NO_INHERITANCE));
        assert_eq!(
            grant_mode(true, false),
            (GRANT_ACCESS, SUB_CONTAINERS_AND_OBJECTS_INHERIT)
        );
        assert_eq!(grant_mode(false, true), (SET_ACCESS, NO_INHERITANCE));
        assert_eq!(
            grant_mode(true, true),
            (SET_ACCESS, SUB_CONTAINERS_AND_OBJECTS_INHERIT)
        );
    }

    #[test]
    fn a_created_file_must_carry_exactly_the_protected_acl() {
        assert!(same_protected_acl(true, &[2, 0, 8, 0], &[2, 0, 8, 0]));
        assert!(!same_protected_acl(false, &[2, 0, 8, 0], &[2, 0, 8, 0]));
        assert!(!same_protected_acl(true, &[2, 0, 8, 0], &[2, 0, 8, 1]));
        assert!(!same_protected_acl(true, &[2, 0, 8], &[2, 0, 8, 0]));
    }

    #[test]
    fn only_bounded_regular_disk_files_are_read() {
        assert!(readable_file(true, 0x20, 10, 10));
        assert!(readable_file(true, 0x80, 0, 0));
        assert!(!readable_file(true, 0x20, 11, 10));
        assert!(!readable_file(false, 0x20, 1, 10));
        assert!(!readable_file(true, 0x10, 0, 10));
        assert!(!readable_file(true, 0x400, 0, 10));
        assert!(!readable_file(true, 0x20, -1, 10));
    }

    #[test]
    fn wide_strings_end_with_one_nul() {
        assert_eq!(wide(&[b'C' as u16, b':' as u16]), vec![67, 58, 0]);
        assert_eq!(wide(&[]), vec![0]);
    }

    #[cfg(not(windows))]
    #[test]
    fn other_platforms_refuse_every_call() {
        assert_eq!(
            current_user_sid(),
            Err(Win32Error {
                syscall: "WindowsSecurity",
                code: ERROR_NOT_SUPPORTED
            })
        );
        assert!(clear_std_handle_inheritance().is_empty());
    }
}
