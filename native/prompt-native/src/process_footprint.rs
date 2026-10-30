//! Per-process physical footprint, replacing Orca's Swift `orca-process-footprint` helper.
//! Same reads as the helper: list every pid with proc_listallpids, then RUSAGE_INFO_V0's ri_phys_footprint per pid,
//! skipping processes this user may not inspect.

/// `(pid, phys_footprint bytes)` for every process this user may inspect.
#[cfg(target_os = "macos")]
pub fn read_all() -> Vec<(u32, u64)> {
    use std::mem::size_of;

    // Processes can start between the size query and the read, so leave some headroom.
    let needed = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) };
    let capacity = (needed.max(0) as usize + 64).max(64);
    let mut pids: Vec<libc::pid_t> = vec![0; capacity];
    let count = unsafe {
        libc::proc_listallpids(
            pids.as_mut_ptr().cast(),
            (capacity * size_of::<libc::pid_t>()) as libc::c_int,
        )
    };
    pids.truncate(count.max(0) as usize);
    pids.into_iter()
        .filter(|&pid| pid > 0)
        .filter_map(|pid| footprint(pid).map(|bytes| (pid as u32, bytes)))
        .collect()
}

#[cfg(target_os = "macos")]
fn footprint(pid: libc::pid_t) -> Option<u64> {
    let mut info = std::mem::MaybeUninit::<libc::rusage_info_v0>::zeroed();
    let rc = unsafe {
        libc::proc_pid_rusage(
            pid,
            libc::RUSAGE_INFO_V0,
            info.as_mut_ptr().cast::<libc::rusage_info_t>(),
        )
    };
    // Other users' and protected processes fail with EPERM; they are simply left out.
    (rc == 0).then(|| unsafe { info.assume_init() }.ri_phys_footprint)
}

/// Windows and Linux measure memory elsewhere (the collector's own process table).
#[cfg(not(target_os = "macos"))]
pub fn read_all() -> Vec<(u32, u64)> {
    Vec::new()
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn reads_this_process() {
        let own = std::process::id();
        let footprints = read_all();
        let bytes = footprints
            .iter()
            .find(|(pid, _)| *pid == own)
            .map(|(_, bytes)| *bytes);
        assert!(
            bytes.is_some_and(|bytes| bytes > 0),
            "own pid {own} missing from {} entries",
            footprints.len()
        );
    }

    #[test]
    fn lists_more_than_one_process() {
        assert!(read_all().len() > 1);
    }
}
