use sysinfo::System;

/// CPU/RAM are the reliable, low-risk part of sysMonitor — sysinfo covers
/// Windows/macOS/Linux uniformly. Keeping one `System` alive across ticks
/// (rather than recreating it) is what makes `global_cpu_usage()` return a
/// real delta-based reading instead of 0 on every call.
pub struct Collector {
    sys: System,
}

pub struct CpuRamSample {
    pub cpu_percent: f32,
    pub ram_percent: f32,
    pub ram_total_gb: f32,
}

impl Collector {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        Self { sys }
    }

    pub fn sample(&mut self) -> CpuRamSample {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();

        let total = self.sys.total_memory();
        let used = self.sys.used_memory();
        let ram_percent = if total > 0 { (used as f64 / total as f64 * 100.0) as f32 } else { 0.0 };
        let ram_total_gb = total as f32 / (1024.0 * 1024.0 * 1024.0);

        CpuRamSample {
            cpu_percent: self.sys.global_cpu_usage(),
            ram_percent,
            ram_total_gb,
        }
    }
}
