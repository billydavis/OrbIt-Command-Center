mod profiles;
pub mod store;

pub use profiles::{Profile, ProfileError};
pub mod profile_store {
    pub use super::profiles::{delete, get, list, save, update};
}
