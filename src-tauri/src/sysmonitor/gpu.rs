use tokio::process::Command;

/// GPU telemetry has no single cross-platform crate with full coverage, and
/// a native NVML binding is real API-surface risk to get right without
/// being able to check its current docs. `nvidia-smi` ships with every
/// NVIDIA driver install on both Windows and Linux and is trivial to shell
/// out to — so v1 is NVIDIA-only, best-effort: no nvidia-smi on PATH (AMD,
/// Intel, integrated-only machines, or macOS) just means no GPU reading,
/// not an error. See docs/architecture open questions for the tradeoff.
pub struct GpuSample {
    pub gpu_percent: f32,
    pub gpu_temp_c: f32,
}

pub async fn sample() -> Option<GpuSample> {
    let output = Command::new("nvidia-smi")
        .args(["--query-gpu=utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"])
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let first_line = text.lines().next()?;
    let mut parts = first_line.split(',').map(|s| s.trim());
    let gpu_percent: f32 = parts.next()?.parse().ok()?;
    let gpu_temp_c: f32 = parts.next()?.parse().ok()?;

    Some(GpuSample { gpu_percent, gpu_temp_c })
}

pub async fn is_available() -> bool {
    sample().await.is_some()
}
