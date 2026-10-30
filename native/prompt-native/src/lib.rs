//! Prompt's native module, loaded by the Electron main process (src/main/prompt-native.ts).
//! Why one module: Prompt reaches OS features through a single Node native module instead of helper programs,
//! so each part inherited from Orca moves here as its own file (one `mod` per part) behind platform cfg gates.
//! Every part compiles on every OS; a part with nothing to do on an OS returns an empty answer there.

mod notification_status;
mod process_footprint;

use napi::bindgen_prelude::*;
use napi::{Env, Task};
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
