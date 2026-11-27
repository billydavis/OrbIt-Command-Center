//! Pictures for Orbit Station's `picture` control: making the files the
//! board takes (`prepare`) and keeping them in the app (`library`).

pub mod library;
pub mod prepare;

pub use library::{Library, Picture, PictureError};
