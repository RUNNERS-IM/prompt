//! Detached child processes that inherit nothing but a NUL handle, replacing the isolated spawn of Orca's C++
//! `@orca/windows-security` addon.
//!
//! Why: libuv spawns with bInheritHandles=TRUE and no handle list, so every inheritable handle in the app reaches a
//! long-lived child. This spawn lists exactly one NUL handle, used for all three stdio. The flags mirror libuv's
//! detached spawn plus CREATE_BREAKAWAY_FROM_JOB: a holder must outlive a kill-on-close job the app was launched
//! into (an OpenSSH session's, a terminal's). A job that forbids breakaway fails that with ERROR_ACCESS_DENIED; the
//! spawn then retries inside it and reports so.

use crate::windows_security::Win32Result;

/// A started child: its pid, whether a job kept it inside, and the process handle its exit watch owns.
pub struct Spawned {
    pub pid: u32,
    pub breakaway_denied: bool,
    #[cfg_attr(not(windows), allow(dead_code))]
    process: usize,
}

/// Receives the exit code on a wait thread, with the cleanup to run once it is back on the JS thread.
pub type ExitNotify = Box<dyn FnOnce(u32, ExitCleanup) + Send>;

/// Unregisters the exit wait and closes the process handle; run it on the thread that registered the wait.
pub struct ExitCleanup(#[cfg_attr(not(windows), allow(dead_code))] usize);

#[cfg(windows)]
mod imp {
    use super::*;
    use crate::windows_security::{fail, wide};
    use std::ffi::c_void;
    use std::ptr::{addr_of_mut, null, null_mut};
    use windows_sys::Win32::Foundation::{
        CloseHandle, ERROR_ACCESS_DENIED, GENERIC_READ, GENERIC_WRITE, GetLastError, HANDLE,
        INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows_sys::Win32::System::Threading::{
        CREATE_BREAKAWAY_FROM_JOB, CREATE_NEW_PROCESS_GROUP, CREATE_UNICODE_ENVIRONMENT,
        CreateProcessW, DETACHED_PROCESS, DeleteProcThreadAttributeList,
        EXTENDED_STARTUPINFO_PRESENT, GetExitCodeProcess, INFINITE,
        InitializeProcThreadAttributeList, LPPROC_THREAD_ATTRIBUTE_LIST,
        PROC_THREAD_ATTRIBUTE_HANDLE_LIST, PROCESS_INFORMATION, RegisterWaitForSingleObject,
        STARTF_USESHOWWINDOW, STARTF_USESTDHANDLES, STARTUPINFOEXW, UnregisterWait,
        UpdateProcThreadAttribute, WT_EXECUTEONLYONCE,
    };

    /// SW_HIDE, kept here so the module needs no UI feature of windows-sys.
    const SW_HIDE: u16 = 0;

    /// `command_line` is the full, already quoted line (argv[0] included); an empty `cwd` keeps ours;
    /// `environment` is `K=V\0…\0\0`.
    pub fn spawn(
        file: &[u16],
        command_line: &[u16],
        cwd: &[u16],
        environment: &[u16],
    ) -> Win32Result<Spawned> {
        let inheritable = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: null_mut(),
            bInheritHandle: 1,
        };
        let nul_name: Vec<u16> = "NUL\0".encode_utf16().collect();
        let nul: HANDLE = unsafe {
            CreateFileW(
                nul_name.as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                &inheritable,
                OPEN_EXISTING,
                0,
                null_mut(),
            )
        };
        if nul == INVALID_HANDLE_VALUE {
            return fail("CreateFileW", unsafe { GetLastError() });
        }
        let mut size = 0usize;
        unsafe { InitializeProcThreadAttributeList(null_mut(), 1, 0, &mut size) };
        // u64 storage keeps the opaque list pointer-aligned.
        let mut storage = vec![0u64; size.div_ceil(8)];
        let attributes: LPPROC_THREAD_ATTRIBUTE_LIST = storage.as_mut_ptr().cast();
        if unsafe { InitializeProcThreadAttributeList(attributes, 1, 0, &mut size) } == 0 {
            let error = unsafe { GetLastError() };
            unsafe { CloseHandle(nul) };
            return fail("InitializeProcThreadAttributeList", error);
        }
        if unsafe {
            UpdateProcThreadAttribute(
                attributes,
                0,
                PROC_THREAD_ATTRIBUTE_HANDLE_LIST as usize,
                (&nul as *const HANDLE).cast::<c_void>(),
                size_of::<HANDLE>(),
                null_mut(),
                null(),
            )
        } == 0
        {
            let error = unsafe { GetLastError() };
            unsafe { DeleteProcThreadAttributeList(attributes) };
            unsafe { CloseHandle(nul) };
            return fail("UpdateProcThreadAttribute", error);
        }
        let mut startup: STARTUPINFOEXW = unsafe { std::mem::zeroed() };
        startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
        startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
        startup.StartupInfo.wShowWindow = SW_HIDE;
        startup.StartupInfo.hStdInput = nul;
        startup.StartupInfo.hStdOutput = nul;
        startup.StartupInfo.hStdError = nul;
        startup.lpAttributeList = attributes;
        let mut created: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
        let flags = CREATE_UNICODE_ENVIRONMENT
            | DETACHED_PROCESS
            | CREATE_NEW_PROCESS_GROUP
            | EXTENDED_STARTUPINFO_PRESENT;
        let file = wide(file);
        let cwd = if cwd.is_empty() {
            None
        } else {
            Some(wide(cwd))
        };
        let environment = wide(environment);
        let mut create = |extra: u32| {
            // CreateProcessW may write to the command line buffer, so each attempt gets a fresh copy.
            let mut line = wide(command_line);
            let ok = unsafe {
                CreateProcessW(
                    file.as_ptr(),
                    line.as_mut_ptr(),
                    null(),
                    null(),
                    1,
                    flags | extra,
                    environment.as_ptr().cast(),
                    cwd.as_ref().map_or(null(), |cwd| cwd.as_ptr()),
                    &startup.StartupInfo,
                    &mut created,
                )
            } != 0;
            if ok {
                Ok(())
            } else {
                Err(unsafe { GetLastError() })
            }
        };
        let mut outcome = create(CREATE_BREAKAWAY_FROM_JOB);
        let breakaway_denied = outcome == Err(ERROR_ACCESS_DENIED);
        if breakaway_denied {
            outcome = create(0);
        }
        unsafe { DeleteProcThreadAttributeList(attributes) };
        unsafe { CloseHandle(nul) };
        if let Err(error) = outcome {
            return fail("CreateProcessW", error);
        }
        unsafe { CloseHandle(created.hThread) };
        Ok(Spawned {
            pid: created.dwProcessId,
            breakaway_denied,
            process: created.hProcess as usize,
        })
    }

    struct Watch {
        process: HANDLE,
        wait: HANDLE,
        notify: Option<ExitNotify>,
    }

    // Runs on a wait thread once the process is signaled; hands the code on, with the cleanup for the JS thread.
    unsafe extern "system" fn on_process_exited(context: *mut c_void, _timed_out: bool) {
        let watch = context.cast::<Watch>();
        let mut code = 0u32;
        if unsafe { GetExitCodeProcess((*watch).process, &mut code) } == 0 {
            code = u32::MAX;
        }
        if let Some(notify) = unsafe { (*addr_of_mut!((*watch).notify)).take() } {
            notify(code, ExitCleanup(watch as usize));
        }
    }

    impl ExitCleanup {
        pub fn finish(self) {
            let watch = unsafe { Box::from_raw(self.0 as *mut Watch) };
            // Non-blocking unregister: the callback already ran once (WT_EXECUTEONLYONCE).
            unsafe { UnregisterWait(watch.wait) };
            unsafe { CloseHandle(watch.process) };
        }
    }

    /// Calls `notify` once the child exits. On failure the child runs on and only its exit goes unobserved:
    /// the Win32 code comes back and the process handle is closed.
    pub fn watch_exit(spawned: &Spawned, notify: ExitNotify) -> Result<(), u32> {
        let process = spawned.process as HANDLE;
        let watch = Box::into_raw(Box::new(Watch {
            process,
            wait: null_mut(),
            notify: Some(notify),
        }));
        let registered = unsafe {
            RegisterWaitForSingleObject(
                addr_of_mut!((*watch).wait),
                process,
                Some(on_process_exited),
                watch.cast_const().cast(),
                INFINITE,
                WT_EXECUTEONLYONCE,
            )
        } != 0;
        if !registered {
            let error = unsafe { GetLastError() };
            let watch = unsafe { Box::from_raw(watch) };
            drop(watch.notify);
            unsafe { CloseHandle(process) };
            return Err(error);
        }
        Ok(())
    }
}

#[cfg(windows)]
pub use imp::*;

#[cfg(not(windows))]
mod unsupported {
    use super::*;

    pub fn spawn(
        _file: &[u16],
        _command_line: &[u16],
        _cwd: &[u16],
        _environment: &[u16],
    ) -> Win32Result<Spawned> {
        crate::windows_security::fail(
            "CreateProcessW",
            crate::windows_security::ERROR_NOT_SUPPORTED,
        )
    }

    impl ExitCleanup {
        pub fn finish(self) {}
    }

    pub fn watch_exit(_spawned: &Spawned, _notify: ExitNotify) -> Result<(), u32> {
        Err(crate::windows_security::ERROR_NOT_SUPPORTED)
    }
}

#[cfg(not(windows))]
pub use unsupported::*;
