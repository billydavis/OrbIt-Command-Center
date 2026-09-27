use std::collections::BTreeMap;
use std::net::Ipv4Addr;
use std::time::Duration;

use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::Serialize;

use crate::device::OrbitError;

/// The firmware advertises its web server as plain `_http._tcp` (info-orbs
/// `WebService::startMdns`), so we browse that and filter by TXT record.
const SERVICE_TYPE: &str = "_http._tcp.local.";

/// TXT key OrbItWidget adds only when the OrbIt widget is enabled — its
/// presence is what tells an OrbIt-capable orb apart from printers, routers,
/// and orbs running stock firmware.
const ORBIT_TXT_KEY: &str = "orbit";

/// An ESP32 answers a browse query within a few hundred ms; 3s leaves
/// headroom for a busy WiFi network without making the connect screen feel
/// stuck.
const SCAN_DURATION: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredDevice {
    /// mDNS instance name, e.g. `info-orbs-ab`.
    pub name: String,
    /// e.g. `info-orbs-ab.local` — stable across DHCP lease changes, so it's
    /// what the UI matches on to recognise a previously used device.
    pub hostname: String,
    pub ip: String,
    pub port: u16,
    /// What to pass to `connect_device`: the IP (plus `:port` if not 80).
    /// The IP rather than the hostname, because Windows' own `.local`
    /// resolution can be slow enough to eat into the client's connect
    /// timeout.
    pub address: String,
}

/// Browses the LAN for `SCAN_DURATION` and returns every OrbIt device that
/// answered, sorted by name.
pub async fn scan() -> Result<Vec<DiscoveredDevice>, OrbitError> {
    let daemon = ServiceDaemon::new()
        .map_err(|e| OrbitError::Other(format!("could not start mDNS discovery: {e}")))?;
    let receiver = daemon
        .browse(SERVICE_TYPE)
        .map_err(|e| OrbitError::Other(format!("could not start mDNS discovery: {e}")))?;

    // Keyed by instance fullname: the same service can resolve more than once
    // (e.g. once per network interface), and the latest answer wins.
    let mut found: BTreeMap<String, DiscoveredDevice> = BTreeMap::new();
    let deadline = tokio::time::Instant::now() + SCAN_DURATION;
    while let Ok(Ok(event)) = tokio::time::timeout_at(deadline, receiver.recv_async()).await {
        match event {
            ServiceEvent::ServiceResolved(info) => {
                let has_orbit = info.get_property(ORBIT_TXT_KEY).is_some();
                let ipv4s = info.get_addresses_v4();
                if let Some(device) = to_device(
                    &info.fullname,
                    &info.ty_domain,
                    &info.host,
                    info.port,
                    ipv4s.into_iter(),
                    has_orbit,
                ) {
                    found.insert(info.fullname.clone(), device);
                }
            }
            ServiceEvent::ServiceRemoved(_, fullname) => {
                found.remove(&fullname);
            }
            _ => {}
        }
    }

    // Best-effort: the daemon thread exits on its own once dropped anyway.
    let _ = daemon.shutdown();

    let mut devices: Vec<DiscoveredDevice> = found.into_values().collect();
    devices.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.ip.cmp(&b.ip)));
    Ok(devices)
}

/// Pure mapping from a resolved mDNS service to a device, split out from
/// `scan` so the filtering rules are unit-testable without a network.
/// Returns `None` for anything that isn't an OrbIt device or has no usable
/// IPv4 address (the firmware only serves over IPv4).
fn to_device(
    fullname: &str,
    ty_domain: &str,
    host: &str,
    port: u16,
    ipv4s: impl Iterator<Item = Ipv4Addr>,
    has_orbit: bool,
) -> Option<DiscoveredDevice> {
    if !has_orbit {
        return None;
    }

    // Lowest non-link-local address, so repeated scans pick the same one.
    let ip = ipv4s.filter(|ip| !ip.is_link_local() && !ip.is_unspecified()).min()?;

    let hostname = host.trim_end_matches('.').to_string();
    let name = fullname
        .strip_suffix(ty_domain)
        .map(|n| n.trim_end_matches('.'))
        .filter(|n| !n.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| hostname.trim_end_matches(".local").to_string());

    let address = if port == 80 { ip.to_string() } else { format!("{ip}:{port}") };

    Some(DiscoveredDevice { name, hostname, ip: ip.to_string(), port, address })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> Ipv4Addr {
        s.parse().unwrap()
    }

    #[test]
    fn maps_an_orbit_service() {
        let device = to_device(
            "info-orbs-ab._http._tcp.local.",
            SERVICE_TYPE,
            "info-orbs-ab.local.",
            80,
            [ip("192.168.1.42")].into_iter(),
            true,
        )
        .unwrap();

        assert_eq!(
            device,
            DiscoveredDevice {
                name: "info-orbs-ab".into(),
                hostname: "info-orbs-ab.local".into(),
                ip: "192.168.1.42".into(),
                port: 80,
                address: "192.168.1.42".into(),
            }
        );
    }

    #[test]
    fn ignores_services_without_the_orbit_txt_key() {
        let device = to_device(
            "Office Printer._http._tcp.local.",
            SERVICE_TYPE,
            "printer.local.",
            80,
            [ip("192.168.1.10")].into_iter(),
            false,
        );
        assert_eq!(device, None);
    }

    #[test]
    fn ignores_services_with_no_usable_ipv4() {
        let device = to_device(
            "info-orbs-ab._http._tcp.local.",
            SERVICE_TYPE,
            "info-orbs-ab.local.",
            80,
            [ip("169.254.3.4")].into_iter(),
            true,
        );
        assert_eq!(device, None);
    }

    #[test]
    fn picks_the_lowest_routable_address_deterministically() {
        let device = to_device(
            "info-orbs-ab._http._tcp.local.",
            SERVICE_TYPE,
            "info-orbs-ab.local.",
            80,
            [ip("192.168.1.50"), ip("169.254.0.1"), ip("10.0.0.7")].into_iter(),
            true,
        )
        .unwrap();
        assert_eq!(device.ip, "10.0.0.7");
    }

    #[test]
    fn includes_a_non_default_port_in_the_address() {
        let device = to_device(
            "info-orbs-ab._http._tcp.local.",
            SERVICE_TYPE,
            "info-orbs-ab.local.",
            8080,
            [ip("192.168.1.42")].into_iter(),
            true,
        )
        .unwrap();
        assert_eq!(device.address, "192.168.1.42:8080");
    }

    #[test]
    fn falls_back_to_the_hostname_when_the_instance_name_is_unusable() {
        let device = to_device(
            "_http._tcp.local.",
            SERVICE_TYPE,
            "info-orbs-ab.local.",
            80,
            [ip("192.168.1.42")].into_iter(),
            true,
        )
        .unwrap();
        assert_eq!(device.name, "info-orbs-ab");
    }
}
