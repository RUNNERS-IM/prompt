//! macOS installer scheduling, replacing Orca's Objective-C `orca_shipit_scheduling.node` addon.
//!
//! What it changes: Electron's Squirrel updater asks launchd to run ShipIt (the program that swaps the app bundle)
//! with a job dictionary that has no `ProcessType`. launchd then treats ShipIt as a `Standard` background service
//! and applies daemon CPU and I/O limits, so preparing thousands of bundle files after quit can take minutes. If the
//! user reopens the app during that time, ShipIt cancels the update. This module adds `ProcessType: Interactive` to
//! that dictionary and nothing else: Squirrel still submits the job, checks signatures, replaces the bundle, retries
//! and relaunches. Measured once on arm64: an unmodified update took 75 s, one with this key 6-8 s (local runs with
//! different caches, not a benchmark).
//!
//! How: `+[SQRLShipItLauncher shipItJobDictionary]` is private to Squirrel and returns a ReactiveObjC signal of
//! dictionaries. Its implementation is replaced in this process with one that calls the original and maps each
//! dictionary through a block adding the key. It must run in the Electron main process, because that is where
//! Squirrel builds the job; changing a running ShipIt with `taskpolicy` did not give the same speed-up.
//!
//! Why it is careful: Electron may change Squirrel at any time. A missing class, a different method shape, a value
//! that is not a signal or not a dictionary, or an exception thrown while mapping all leave Squirrel's own answer
//! untouched. `config/scripts/macos-shipit-scheduling.test.mjs` checks the real framework from the pinned Electron.
//!
//! The first update into a build containing this still runs on the previous app's launcher.

/// Replaces Squirrel's job dictionary method once. False when Squirrel is not loaded or its method changed shape.
#[cfg(target_os = "macos")]
pub fn configure() -> bool {
    mac::install(c"SQRLShipItLauncher")
}

#[cfg(not(target_os = "macos"))]
pub fn configure() -> bool {
    false
}

#[cfg(target_os = "macos")]
mod mac {
    use block2::RcBlock;
    use objc2::exception;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::{msg_send, sel};
    use objc2_foundation::NSString;
    use std::ffi::CStr;
    use std::panic::AssertUnwindSafe;
    use std::sync::OnceLock;

    /// `+shipItJobDictionary`: no arguments besides receiver and selector, returns an object (+0).
    type JobDictionary = unsafe extern "C-unwind" fn(*mut AnyObject, Sel) -> *mut AnyObject;

    /// Squirrel's own implementation, kept so the replacement can call it. Set once, before the swap.
    static ORIGINAL: OnceLock<JobDictionary> = OnceLock::new();

    /// The class is a parameter so tests can show that a missing class or another method shape is refused.
    pub(super) fn install(class_name: &CStr) -> bool {
        if ORIGINAL.get().is_some() {
            return true;
        }
        let Some(class) = AnyClass::get(class_name) else {
            return false;
        };
        let Some(method) = class.class_method(sel!(shipItJobDictionary)) else {
            return false;
        };
        // The replacement assumes `id (id, SEL)`; anything else means Squirrel changed and is left alone.
        if method.arguments_count() != 2 || method.return_type().to_bytes() != b"@" {
            return false;
        }
        // SAFETY: the checks above show the method has the `JobDictionary` signature.
        let original: JobDictionary =
            unsafe { std::mem::transmute::<Imp, JobDictionary>(method.implementation()) };
        if ORIGINAL.set(original).is_err() {
            return true;
        }
        // SAFETY: same signature as the method it replaces, and it falls back to the original answer on every
        // shape it does not recognise, so callers see nothing they could not have seen before.
        unsafe {
            method.set_implementation(std::mem::transmute::<JobDictionary, Imp>(
                interactive_job_dictionary,
            ));
        }
        true
    }

    unsafe extern "C-unwind" fn interactive_job_dictionary(
        receiver: *mut AnyObject,
        selector: Sel,
    ) -> *mut AnyObject {
        let Some(original) = ORIGINAL.get() else {
            return std::ptr::null_mut();
        };
        // SAFETY: Squirrel's own implementation, called exactly as the runtime called this one.
        let signal = unsafe { original(receiver, selector) };
        if signal.is_null() {
            return signal;
        }
        // An exception from a changed `map:` must not cross Rust frames; the original signal is returned instead.
        match exception::catch(AssertUnwindSafe(|| unsafe { map_to_interactive(signal) })) {
            Ok(Some(mapped)) if !mapped.is_null() => mapped,
            _ => signal,
        }
    }

    /// `[signal map:^(job) { job + ProcessType }]`, or None when `signal` has no `map:`.
    ///
    /// SAFETY: `signal` is a live object (Squirrel's autoreleased return value).
    unsafe fn map_to_interactive(signal: *mut AnyObject) -> Option<*mut AnyObject> {
        let signal = unsafe { &*signal };
        let responds: bool = unsafe { msg_send![signal, respondsToSelector: sel!(map:)] };
        if !responds {
            return None;
        }
        let transform = RcBlock::new(|job: *mut AnyObject| -> *mut AnyObject {
            match exception::catch(AssertUnwindSafe(|| unsafe { interactive_job(job) })) {
                Ok(Some(interactive)) => interactive,
                _ => job,
            }
        });
        // `map:` returns +0, which is what this method's callers expect back.
        Some(unsafe { msg_send![signal, map: &*transform] })
    }

    /// A mutable copy of a dictionary with `ProcessType: Interactive` added; None for any other value.
    ///
    /// SAFETY: `job` is null or a live object.
    unsafe fn interactive_job(job: *mut AnyObject) -> Option<*mut AnyObject> {
        let job = unsafe { job.as_ref() }?;
        let dictionary = AnyClass::get(c"NSDictionary")?;
        let is_dictionary: bool = unsafe { msg_send![job, isKindOfClass: dictionary] };
        if !is_dictionary {
            return None;
        }
        let interactive: Option<Retained<AnyObject>> = unsafe { msg_send![job, mutableCopy] };
        let interactive = interactive?;
        // A user-requested install must not inherit launchd's daemon I/O throttling.
        let key = NSString::from_str("ProcessType");
        let value = NSString::from_str("Interactive");
        let _: () = unsafe { msg_send![&*interactive, setObject: &*value, forKey: &*key] };
        Some(Retained::autorelease_ptr(interactive))
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    //! Stand-ins for Squirrel's launcher and ReactiveObjC's signal, so every fallback runs without Electron.
    //! One test function: the hook is process-wide, so the cases run in order on one thread.

    use super::mac;
    use objc2::rc::{Retained, autoreleasepool};
    use objc2::runtime::{AnyClass, AnyObject, ClassBuilder, NSObject, Sel};
    use objc2::{ClassType, msg_send, sel};
    use objc2_foundation::NSString;
    use std::cell::Cell;
    use std::ffi::CStr;

    /// What the fake `+shipItJobDictionary` returns next, and how the fake signal's `map:` behaves.
    #[derive(Clone, Copy, PartialEq)]
    enum Map {
        Transform,
        RaiseException,
        ThrowString,
    }

    thread_local! {
        static RESULT: Cell<*mut AnyObject> = const { Cell::new(std::ptr::null_mut()) };
        static MAP: Cell<Map> = const { Cell::new(Map::Transform) };
        static PAYLOAD: Cell<*mut AnyObject> = const { Cell::new(std::ptr::null_mut()) };
    }

    extern "C-unwind" fn job_dictionary(_: &AnyClass, _: Sel) -> *mut AnyObject {
        RESULT.with(Cell::get)
    }

    extern "C-unwind" fn int_job_dictionary(_: &AnyClass, _: Sel) -> i32 {
        0
    }

    unsafe extern "C-unwind" fn map(
        _: &NSObject,
        _: Sel,
        transform: &block2::Block<dyn Fn(*mut AnyObject) -> *mut AnyObject>,
    ) -> *mut AnyObject {
        match MAP.with(Cell::get) {
            Map::Transform => transform.call((PAYLOAD.with(Cell::get),)),
            Map::RaiseException => {
                let class = AnyClass::get(c"NSException").unwrap();
                let name = NSString::from_str("NSInvalidArgumentException");
                let reason = NSString::from_str("Unsupported map contract");
                let exception: Retained<objc2::exception::Exception> = unsafe {
                    msg_send![class, exceptionWithName: &*name, reason: &*reason, userInfo: std::ptr::null_mut::<AnyObject>()]
                };
                objc2::exception::throw(exception)
            }
            Map::ThrowString => {
                let thrown = NSString::from_str("Unsupported map contract");
                objc2::exception::throw(unsafe { Retained::cast_unchecked(thrown) })
            }
        }
    }

    fn launcher(name: &CStr, returns_int: bool) -> &'static AnyClass {
        let mut builder = ClassBuilder::new(name, NSObject::class()).unwrap();
        unsafe {
            if returns_int {
                builder.add_class_method(
                    sel!(shipItJobDictionary),
                    int_job_dictionary as extern "C-unwind" fn(_, _) -> _,
                );
            } else {
                builder.add_class_method(
                    sel!(shipItJobDictionary),
                    job_dictionary as extern "C-unwind" fn(_, _) -> _,
                );
            }
        }
        builder.register()
    }

    fn signal_class() -> &'static AnyClass {
        let mut builder = ClassBuilder::new(c"PromptShipItProbeSignal", NSObject::class()).unwrap();
        unsafe {
            builder.add_method(sel!(map:), map as unsafe extern "C-unwind" fn(_, _, _) -> _);
        }
        builder.register()
    }

    fn new(class: &AnyClass) -> Retained<AnyObject> {
        unsafe { msg_send![class, new] }
    }

    fn label(value: &str) -> Retained<AnyObject> {
        let dictionary = AnyClass::get(c"NSMutableDictionary").unwrap();
        let job: Retained<AnyObject> = unsafe { msg_send![dictionary, new] };
        let (key, value) = (NSString::from_str("Label"), NSString::from_str(value));
        let _: () = unsafe { msg_send![&*job, setObject: &*value, forKey: &*key] };
        job
    }

    fn equal(left: *mut AnyObject, right: &AnyObject) -> bool {
        unsafe { msg_send![&*left, isEqual: right] }
    }

    #[test]
    fn adds_only_process_type_and_keeps_every_unknown_shape() {
        // Not loaded (plain test process, no Electron) or a different return type: nothing is replaced.
        assert!(!super::configure());
        launcher(c"PromptShipItIntLauncher", true);
        assert!(!mac::install(c"PromptShipItIntLauncher"));

        let class = launcher(c"PromptShipItLauncher", false);
        assert!(mac::install(c"PromptShipItLauncher"));
        assert!(
            mac::install(c"PromptShipItLauncher"),
            "a second call keeps the first hook"
        );
        let call = || -> *mut AnyObject { unsafe { msg_send![class, shipItJobDictionary] } };
        let signal_class = signal_class();

        autoreleasepool(|_| {
            // A plain object has no `map:` and comes back as it was.
            let plain = label("unchanged");
            RESULT.with(|r| r.set(Retained::as_ptr(&plain).cast_mut()));
            assert_eq!(call(), Retained::as_ptr(&plain).cast_mut());

            // A signal of a dictionary gains exactly ProcessType.
            let signal = new(signal_class);
            let job = label("unchanged");
            RESULT.with(|r| r.set(Retained::as_ptr(&signal).cast_mut()));
            PAYLOAD.with(|p| p.set(Retained::as_ptr(&job).cast_mut()));
            MAP.with(|m| m.set(Map::Transform));
            let expected = label("unchanged");
            let (key, value) = (
                NSString::from_str("ProcessType"),
                NSString::from_str("Interactive"),
            );
            let _: () = unsafe { msg_send![&*expected, setObject: &*value, forKey: &*key] };
            assert!(equal(call(), &expected));
            assert!(
                equal(Retained::as_ptr(&job).cast_mut(), &label("unchanged")),
                "the original is not mutated"
            );

            // A payload that is not a dictionary passes through unchanged.
            let payload = NSString::from_str("unsupported");
            PAYLOAD.with(|p| p.set(Retained::as_ptr(&payload).cast::<AnyObject>().cast_mut()));
            assert_eq!(
                call(),
                Retained::as_ptr(&payload).cast::<AnyObject>().cast_mut()
            );

            // An NSException or any other thrown object leaves Squirrel's own signal in place.
            for mode in [Map::RaiseException, Map::ThrowString] {
                MAP.with(|m| m.set(mode));
                assert_eq!(call(), Retained::as_ptr(&signal).cast_mut());
            }

            // A nil answer stays nil.
            RESULT.with(|r| r.set(std::ptr::null_mut()));
            assert!(call().is_null());
        });
    }
}
