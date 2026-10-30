//! Prompt's native module, loaded by the Electron main process (src/main/prompt-native.ts).
//! Why one module: Prompt reaches OS features through a single Node native module instead of helper programs,
//! so each part inherited from Orca moves here as its own file (one `mod` per part) behind platform cfg gates.
//! Every part compiles on every OS; a part with nothing to do on an OS returns an empty answer there.

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
