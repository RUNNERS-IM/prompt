//! Prompt's native module, loaded by the Electron main process (src/main/prompt-native.ts).
//! Why one module: Prompt reaches OS features through a single Node native module instead of helper programs,
//! so each part inherited from Orca moves here as its own file (one `mod` per part) behind platform cfg gates.
//! Every part compiles on every OS; a part with nothing to do on an OS returns an empty answer there.

mod keyboard_layout;
mod notification_status;
mod process_footprint;
mod shipit_scheduling;
mod windows_isolated_spawn;
mod windows_registry;
mod windows_security;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::ThreadsafeFunctionCallMode;
use napi::{Env, JsValue, Task, sys};
use napi_derive::napi;

/// One process's physical footprint (`phys_footprint`, the number Activity Monitor shows).
#[napi(object)]
pub struct ProcessFootprint {
    pub pid: u32,
    /// Bytes; a JS number is exact far beyond any real footprint.
    pub bytes: f64,
}

pub struct ProcessFootprintsTask;

impl Task for ProcessFootprintsTask {
    type Output = Vec<(u32, u64)>;
    type JsValue = Vec<ProcessFootprint>;

    fn compute(&mut self) -> Result<Self::Output> {
        Ok(process_footprint::read_all())
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output
            .into_iter()
            .map(|(pid, bytes)| ProcessFootprint {
                pid,
                bytes: bytes as f64,
            })
            .collect())
    }
}

/// Every process this user may inspect, read off the main thread. Empty on platforms other than macOS.
#[napi(ts_return_type = "Promise<ProcessFootprint[]>")]
pub fn process_footprints() -> AsyncTask<ProcessFootprintsTask> {
    AsyncTask::new(ProcessFootprintsTask)
}

/// macOS notification permission for this app, as the Swift helper printed it.
#[napi(object)]
pub struct NotificationStatus {
    pub authorization: String,
    pub alert: String,
}

pub struct NotificationStatusTask(
    Option<std::sync::mpsc::Receiver<notification_status::NotificationStatus>>,
);

impl Task for NotificationStatusTask {
    type Output = Option<notification_status::NotificationStatus>;
    type JsValue = Option<NotificationStatus>;

    fn compute(&mut self) -> Result<Self::Output> {
        Ok(self.0.take().and_then(notification_status::wait))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output.map(|status| NotificationStatus {
            authorization: status.authorization.to_string(),
            alert: status.alert.to_string(),
        }))
    }
}

/// Resolves to null outside an app bundle, on other platforms, or when macOS does not answer within 3 s.
/// The question is asked on the calling (main) thread; only the wait runs on the thread pool.
#[napi(ts_return_type = "Promise<NotificationStatus | null>")]
pub fn notification_status() -> AsyncTask<NotificationStatusTask> {
    AsyncTask::new(NotificationStatusTask(notification_status::request()))
}

/// The current keyboard layout as the Swift helper's JSON, or null when it kept changing or on other platforms.
/// Synchronous on purpose: Carbon's TIS API must run on a UI app's main thread, which is where this is called.
#[napi]
pub fn keyboard_layout_snapshot() -> Option<String> {
    keyboard_layout::read_json()
}

/// One registry value: `type` is the REG_* number; `value` is absent for types the app does not read.
#[napi(object)]
pub struct RegistryValue {
    pub name: Utf16String,
    #[napi(js_name = "type")]
    pub kind: u32,
    pub value: Option<Either4<Utf16String, u32, Vec<u32>, Vec<Utf16String>>>,
}

/// Every value under `path` below a predefined root (HKCU 0x80000001, HKLM 0x80000002, ...), in registry order.
/// Null when the key cannot be opened or read, and always null outside Windows.
#[napi]
pub fn windows_registry_key(root: u32, path: Utf16String) -> Option<Vec<RegistryValue>> {
    use windows_registry::Decoded;
    let entries = windows_registry::read_key(root, &path)?;
    Some(
        entries
            .into_iter()
            .map(|entry| RegistryValue {
                name: entry.name.into(),
                kind: entry.kind,
                value: entry.value.map(|value| match value {
                    Decoded::Text(text) => Either4::A(text.into()),
                    Decoded::Dword(dword) => Either4::B(dword),
                    Decoded::Binary(bytes) => {
                        Either4::C(bytes.into_iter().map(u32::from).collect())
                    }
                    Decoded::Multi(parts) => {
                        Either4::D(parts.into_iter().map(Into::into).collect())
                    }
                }),
            })
            .collect(),
    )
}

/// Adds `ProcessType: Interactive` to the launchd job Squirrel submits for ShipIt, so the bundle swap after quit is
/// not throttled like a background daemon. True once the hook is in place (or already was); false outside macOS,
/// when Squirrel is not loaded in this process, or when its private method changed shape.
/// Synchronous: it only swaps one Objective-C method implementation.
#[napi(js_name = "configureShipItScheduling")]
pub fn configure_ship_it_scheduling() -> bool {
    shipit_scheduling::configure()
}

/// The same hook for a plain C caller. Only `config/scripts/macos-shipit-scheduling.test.mjs` uses it: its probe app
/// loads Electron's real Squirrel frameworks without starting Node, so it cannot call the N-API export above.
#[unsafe(no_mangle)]
pub extern "C" fn prompt_native_configure_shipit_scheduling() -> bool {
    shipit_scheduling::configure()
}

// Windows security: file DACLs, generic credentials, std-handle inheritance and the isolated spawn, as Orca's
// `@orca/windows-security` addon exposed them (src/shared/windows-security-addon.ts wraps these exports).

/// A plain `Error` carrying only the addon's message: no `code`, so callers matching Node's errno codes never mistake
/// it for one. `credential` adds the `syscall` and `win32Code` fields readGenericCredential failures carried.
fn win32_error(env: &Env, error: &windows_security::Win32Error, credential: bool) -> Error {
    let build = || -> Result<Error> {
        let message = env.create_string(error.message())?;
        let mut raw = std::ptr::null_mut();
        check_status!(unsafe {
            sys::napi_create_error(env.raw(), std::ptr::null_mut(), message.raw(), &mut raw)
        })?;
        let mut object = Object::from_raw(env.raw(), raw);
        if credential {
            object.set_named_property("syscall", error.syscall)?;
            object.set_named_property("win32Code", error.code)?;
        }
        Ok(Error::from(object.to_unknown()))
    };
    build().unwrap_or_else(|failure| failure)
}

/// One DACL entry as stored; `sid` is set only for plain allow (0) and deny (1) ACEs.
#[napi(object)]
pub struct WindowsAce {
    #[napi(js_name = "type")]
    pub kind: u32,
    pub flags: u32,
    pub mask: u32,
    pub sid: Either<Utf16String, Null>,
}

/// `protected` is SE_DACL_PROTECTED.
#[napi(object)]
pub struct WindowsDacl {
    pub protected: bool,
    pub aces: Vec<WindowsAce>,
}

fn dacl_object(dacl: Option<windows_security::Dacl>) -> Either<WindowsDacl, Null> {
    match dacl {
        None => Either::B(Null),
        Some(dacl) => Either::A(WindowsDacl {
            protected: dacl.protected,
            aces: dacl
                .aces
                .into_iter()
                .map(|ace| WindowsAce {
                    kind: u32::from(ace.kind),
                    flags: u32::from(ace.flags),
                    mask: ace.mask,
                    sid: ace.sid.map_or(Either::B(Null), |sid| Either::A(sid.into())),
                })
                .collect(),
        }),
    }
}

/// The process token's user SID, e.g. `S-1-5-21-…-1001`.
#[napi]
pub fn current_user_sid(env: Env) -> Result<Utf16String> {
    windows_security::current_user_sid()
        .map(Into::into)
        .map_err(|error| win32_error(&env, &error, false))
}

/// The path's DACL as structure, or null for a NULL DACL (which grants everyone everything).
#[napi(ts_return_type = "WindowsDacl | null")]
pub fn get_dacl_aces(env: Env, path: Utf16String) -> Result<Either<WindowsDacl, Null>> {
    windows_security::get_dacl_aces(&path)
        .map(dacl_object)
        .map_err(|error| win32_error(&env, &error, false))
}

/// Installs exactly the DACL in `sddl`; its `P` flag picks protected or inheriting. A directory propagates to every
/// existing descendant, which is seconds on a large tree.
#[napi]
pub fn set_dacl_sddl(env: Env, path: Utf16String, sddl: Utf16String) -> Result<()> {
    windows_security::set_dacl_sddl(&path, &sddl).map_err(|error| win32_error(&env, &error, false))
}

/// A DACL change that may walk a large tree, run on the thread pool so the main thread keeps going.
pub enum DaclWork {
    Set {
        path: Vec<u16>,
        sddl: Vec<u16>,
    },
    Grant {
        path: Vec<u16>,
        sid: Vec<u16>,
        mask: u32,
        options: GrantAccessOptions,
    },
}

pub struct DaclTask(DaclWork);

impl Task for DaclTask {
    type Output = windows_security::Win32Result<()>;
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        Ok(match &self.0 {
            DaclWork::Set { path, sddl } => windows_security::set_dacl_sddl(path, sddl),
            DaclWork::Grant {
                path,
                sid,
                mask,
                options,
            } => windows_security::grant_access(
                path,
                sid,
                *mask,
                options.inheritable,
                options.replace,
            ),
        })
    }

    fn resolve(&mut self, env: Env, output: Self::Output) -> Result<Self::JsValue> {
        output.map_err(|error| win32_error(&env, &error, false))
    }
}

#[napi(ts_return_type = "Promise<void>")]
pub fn set_dacl_sddl_async(path: Utf16String, sddl: Utf16String) -> AsyncTask<DaclTask> {
    AsyncTask::new(DaclTask(DaclWork::Set {
        path: path.to_vec(),
        sddl: sddl.to_vec(),
    }))
}

/// Creates a NEW file already carrying the DACL in `sddl`, then writes `data` into it. `strict` also checks the
/// handle's DACL before and after writing and flushes the file; any failure deletes the file.
#[napi]
pub fn create_file_with_dacl(
    env: Env,
    path: Utf16String,
    sddl: Utf16String,
    data: Uint8Array,
    strict: Option<bool>,
) -> Result<()> {
    windows_security::create_file_with_dacl(&path, &sddl, &data, strict.unwrap_or(false))
        .map_err(|error| win32_error(&env, &error, false))
}

#[napi(object)]
pub struct FileWithDacl {
    pub dacl: Either<WindowsDacl, Null>,
    pub data: Buffer,
}

/// Bounded regular-file bytes and their DACL through one handle; null when the file does not exist.
#[napi(ts_return_type = "FileWithDacl | null")]
pub fn read_file_with_dacl(
    env: Env,
    path: Utf16String,
    max_bytes: u32,
) -> Result<Either<FileWithDacl, Null>> {
    match windows_security::read_file_with_dacl(&path, max_bytes) {
        Ok(None) => Ok(Either::B(Null)),
        Ok(Some(file)) => Ok(Either::A(FileWithDacl {
            dacl: dacl_object(file.dacl),
            data: file.data.into(),
        })),
        Err(error) => Err(win32_error(&env, &error, false)),
    }
}

/// A generic credential's blob, or null when there is none; failures carry `syscall` and `win32Code`.
#[napi(ts_return_type = "Buffer | null")]
pub fn read_generic_credential(env: Env, target: Utf16String) -> Result<Either<Buffer, Null>> {
    match windows_security::read_generic_credential(&target) {
        Ok(None) => Ok(Either::B(Null)),
        Ok(Some(blob)) => Ok(Either::A(blob.into())),
        Err(error) => Err(win32_error(&env, &error, true)),
    }
}

/// Stores `data` as the blob; an existing credential keeps every other field, a new one is a local-machine one.
#[napi]
pub fn write_generic_credential(
    env: Env,
    target: Utf16String,
    user: Utf16String,
    data: Uint8Array,
) -> Result<()> {
    windows_security::write_generic_credential(&target, &user, &data)
        .map_err(|error| win32_error(&env, &error, false))
}

#[napi(object)]
pub struct GrantAccessOptions {
    /// Children inherit the grant (OI|CI). Only meaningful on a directory.
    pub inheritable: bool,
    /// SET_ACCESS instead of GRANT_ACCESS: drop every explicit rule for the trustee, then grant exactly the mask.
    pub replace: bool,
}

/// Adds an allow rule for `sid` to the existing DACL, keeping its protection state; a NULL DACL is left untouched.
#[napi]
pub fn grant_access(
    env: Env,
    path: Utf16String,
    sid: Utf16String,
    access_mask: u32,
    options: GrantAccessOptions,
) -> Result<()> {
    windows_security::grant_access(
        &path,
        &sid,
        access_mask,
        options.inheritable,
        options.replace,
    )
    .map_err(|error| win32_error(&env, &error, false))
}

#[napi(ts_return_type = "Promise<void>")]
pub fn grant_access_async(
    path: Utf16String,
    sid: Utf16String,
    access_mask: u32,
    options: GrantAccessOptions,
) -> AsyncTask<DaclTask> {
    AsyncTask::new(DaclTask(DaclWork::Grant {
        path: path.to_vec(),
        sid: sid.to_vec(),
        mask: access_mask,
        options,
    }))
}

#[napi(object)]
pub struct StdHandleInheritanceFailure {
    pub stream: String,
    pub code: u32,
}

/// Makes the std handles non-inheritable, skipping absent ones. Never throws; returns the handles
/// SetHandleInformation rejected (e.g. a legacy console pseudo-handle) with their Win32 code. Empty off Windows.
#[napi]
pub fn clear_std_handle_inheritance() -> Vec<StdHandleInheritanceFailure> {
    windows_security::clear_std_handle_inheritance()
        .into_iter()
        .map(|(stream, code)| StdHandleInheritanceFailure {
            stream: stream.to_string(),
            code,
        })
        .collect()
}

#[napi(object)]
pub struct IsolatedSpawnResult {
    pub pid: u32,
    /// A job this process is in forbids breakaway, so the child stays in it.
    pub breakaway_denied: bool,
    /// The Win32 code when the exit cannot be observed; the child still runs.
    pub exit_watch_error: Either<u32, Null>,
}

/// Starts `file` detached, hidden and outside this process's jobs where they allow it, inheriting only a NUL handle
/// for its stdio. `onExit` gets the exit code and never keeps the event loop alive.
#[napi]
pub fn spawn_detached_isolated(
    env: Env,
    file: Utf16String,
    command_line: Utf16String,
    cwd: Utf16String,
    environment_block: Utf16String,
    on_exit: Function<u32, ()>,
) -> Result<IsolatedSpawnResult> {
    let spawned = windows_isolated_spawn::spawn(&file, &command_line, &cwd, &environment_block)
        .map_err(|error| win32_error(&env, &error, false))?;
    // Weak: a running child must not keep the app's event loop alive.
    let on_exit = on_exit
        .build_threadsafe_function::<(u32, windows_isolated_spawn::ExitCleanup)>()
        .weak::<true>()
        .build_callback(|context| {
            let (code, cleanup) = context.value;
            cleanup.finish();
            Ok(code)
        })?;
    let exit_watch_error = windows_isolated_spawn::watch_exit(
        &spawned,
        Box::new(move |code, cleanup| {
            on_exit.call((code, cleanup), ThreadsafeFunctionCallMode::NonBlocking);
        }),
    )
    .err();
    Ok(IsolatedSpawnResult {
        pid: spawned.pid,
        breakaway_denied: spawned.breakaway_denied,
        exit_watch_error: exit_watch_error.map_or(Either::B(Null), Either::A),
    })
}

/// True on builds whose isolated spawn requests job breakaway; the loader's capability probe reads it.
#[napi]
pub fn isolated_spawn_breaks_away_from_job() -> bool {
    true
}
