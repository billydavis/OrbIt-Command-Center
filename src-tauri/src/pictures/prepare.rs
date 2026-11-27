//! Making the file the board takes from a picture someone picked: exactly
//! 240x240 (orbit-station's docs/pictures.md; the board never scales or
//! crops), at most 1 MB, baseline JPEG, PNG or GIF.
//!
//! - A still becomes a JPEG if it came as a JPEG or WebP (photos), a PNG
//!   otherwise (graphics, where JPEG would smear the edges).
//! - An animated GIF stays a GIF. Each frame after the first stores only the
//!   part of the screen that changed, which makes the file smaller and lets
//!   the board play it faster (it decodes ~20-30 ms per full-screen frame).
//!   If it won't fit in 1 MB, every other frame is left out (the time it
//!   showed goes to the frame before), until it does.
//! - An animated WebP becomes a still of its first frame: the board would
//!   show only that anyway.
//!
//! The middle square is used. The screen is round, so the corners of the
//! file never show.

use std::io::Cursor;

use image::codecs::gif::GifDecoder;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType as PngFilter, PngEncoder};
use image::imageops::FilterType;
use image::metadata::Orientation;
use image::{AnimationDecoder, DynamicImage, ImageDecoder, ImageEncoder, ImageFormat, ImageReader, RgbImage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// The board's screen, and so every picture file: `SIZE` x `SIZE`.
pub const SIZE: u32 = 240;
/// The largest file the board takes (capabilities `pictures.maxBytes`).
pub const MAX_BYTES: usize = 1_048_576;
/// Bigger than any sensible photo or GIF; stops a mistaken drop of a huge
/// file from taking all the memory to decode.
pub const MAX_INPUT_BYTES: usize = 64 * 1024 * 1024;
const MAX_FRAMES: usize = 1000;
const JPEG_QUALITY: u8 = 90;
/// NeuQuant's speed (1-30): 10 is the gif crate's own suggestion.
const GIF_SPEED: i32 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PictureFormat {
    Jpeg,
    Png,
    Gif,
}

impl PictureFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Jpeg => "jpg",
            Self::Png => "png",
            Self::Gif => "gif",
        }
    }
}

/// A finished picture file, ready to store and send.
#[derive(Debug)]
pub struct Prepared {
    pub file: Vec<u8>,
    pub format: PictureFormat,
    /// 1 for a still.
    pub frames: usize,
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum PrepareError {
    #[error("This isn't a picture the app can read. It takes JPEG, PNG, GIF, WebP and BMP.")]
    NotAPicture,
    #[error("Couldn't read the picture: {0}")]
    Unreadable(String),
    #[error("The file is over 64 MB.")]
    InputTooBig,
    #[error("The animation has over 1000 frames.")]
    TooManyFrames,
    #[error("The animation won't fit in 1 MB, even with most of its frames left out.")]
    TooBig,
    #[error("Couldn't make the picture file: {0}")]
    Encode(String),
}

fn unreadable(e: impl std::fmt::Display) -> PrepareError {
    PrepareError::Unreadable(e.to_string())
}

fn encode_err(e: impl std::fmt::Display) -> PrepareError {
    PrepareError::Encode(e.to_string())
}

/// A picture's name on the board: the first 16 hex digits (lower case) of
/// the SHA-256 of its file.
pub fn hash_of(file: &[u8]) -> String {
    Sha256::digest(file)[..8].iter().map(|b| format!("{b:02x}")).collect()
}

/// Whether `hash` is a picture name the board takes (and so safe to use as
/// a file name).
pub fn valid_hash(hash: &str) -> bool {
    hash.len() == 16 && hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// The file the board takes, made from `bytes` (any JPEG, PNG, GIF, WebP or BMP).
pub fn prepare(bytes: &[u8]) -> Result<Prepared, PrepareError> {
    prepare_within(bytes, MAX_BYTES)
}

fn prepare_within(bytes: &[u8], max_bytes: usize) -> Result<Prepared, PrepareError> {
    if bytes.len() > MAX_INPUT_BYTES {
        return Err(PrepareError::InputTooBig);
    }
    let format = image::guess_format(bytes).map_err(|_| PrepareError::NotAPicture)?;
    match format {
        ImageFormat::Gif => {
            let mut frames = gif_frames(bytes)?;
            if frames.len() > 1 {
                return animated(frames, max_bytes);
            }
            let (still, _) = frames.pop().ok_or_else(|| unreadable("the GIF has no frames"))?;
            Ok(Prepared { file: png(&still)?, format: PictureFormat::Png, frames: 1 })
        }
        ImageFormat::Jpeg | ImageFormat::WebP => {
            let still = fit(&decode_upright(bytes)?);
            Ok(Prepared { file: jpeg(&still)?, format: PictureFormat::Jpeg, frames: 1 })
        }
        ImageFormat::Png | ImageFormat::Bmp => {
            let still = fit(&decode_upright(bytes)?);
            Ok(Prepared { file: png(&still)?, format: PictureFormat::Png, frames: 1 })
        }
        _ => Err(PrepareError::NotAPicture),
    }
}

/// Decodes a still, turned the way the camera says it was held.
fn decode_upright(bytes: &[u8]) -> Result<DynamicImage, PrepareError> {
    let mut decoder = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(unreadable)?
        .into_decoder()
        .map_err(unreadable)?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let mut image = DynamicImage::from_decoder(decoder).map_err(unreadable)?;
    image.apply_orientation(orientation);
    Ok(image)
}

/// The middle square of `image` at `SIZE` x `SIZE`, see-through parts on
/// black (the board has nothing behind a picture). A small picture is
/// enlarged pixel for pixel, so pixel art stays sharp.
fn fit(image: &DynamicImage) -> RgbImage {
    let (w, h) = (image.width(), image.height());
    let side = w.min(h);
    let square = image.crop_imm((w - side) / 2, (h - side) / 2, side, side);
    let filter = if side < SIZE { FilterType::Nearest } else { FilterType::Lanczos3 };
    let rgba = square.resize_exact(SIZE, SIZE, filter).to_rgba8();
    let mut rgb = RgbImage::new(SIZE, SIZE);
    for (out, px) in rgb.pixels_mut().zip(rgba.pixels()) {
        let a = px[3] as u16;
        for c in 0..3 {
            out[c] = ((px[c] as u16 * a + 127) / 255) as u8;
        }
    }
    rgb
}

/// Baseline JPEG: `image` writes only SOF0, and the board refuses progressive.
fn jpeg(still: &RgbImage) -> Result<Vec<u8>, PrepareError> {
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY).encode_image(still).map_err(encode_err)?;
    Ok(out)
}

fn png(still: &RgbImage) -> Result<Vec<u8>, PrepareError> {
    let mut out = Vec::new();
    PngEncoder::new_with_quality(&mut out, CompressionType::Best, PngFilter::Adaptive)
        .write_image(still.as_raw(), SIZE, SIZE, image::ExtendedColorType::Rgb8)
        .map_err(encode_err)?;
    Ok(out)
}

/// A GIF's frames as they show (each drawn over the ones before it), fitted
/// to the screen, with how long each shows in milliseconds.
fn gif_frames(bytes: &[u8]) -> Result<Vec<(RgbImage, u32)>, PrepareError> {
    let decoder = GifDecoder::new(Cursor::new(bytes)).map_err(unreadable)?;
    let mut frames = Vec::new();
    for frame in decoder.into_frames() {
        let frame = frame.map_err(unreadable)?;
        if frames.len() == MAX_FRAMES {
            return Err(PrepareError::TooManyFrames);
        }
        let (numer, denom) = frame.delay().numer_denom_ms();
        let ms = numer.checked_div(denom).unwrap_or(0);
        frames.push((fit(&DynamicImage::ImageRgba8(frame.into_buffer())), ms));
    }
    Ok(frames)
}

fn animated(frames: Vec<(RgbImage, u32)>, max_bytes: usize) -> Result<Prepared, PrepareError> {
    let mut frames = merge_repeats(frames);
    loop {
        if frames.len() == 1 {
            // Nothing moves once it's on the screen.
            return Ok(Prepared { file: png(&frames[0].0)?, format: PictureFormat::Png, frames: 1 });
        }
        let file = gif(&frames)?;
        if file.len() <= max_bytes {
            return Ok(Prepared { file, format: PictureFormat::Gif, frames: frames.len() });
        }
        if frames.len() <= 2 {
            return Err(PrepareError::TooBig);
        }
        // Frames cost about the same each, so keep the share that should
        // fit, a little under to save another round.
        let share = max_bytes as f64 / file.len() as f64 * 0.95;
        let keep = ((frames.len() as f64 * share) as usize).clamp(2, frames.len() - 1);
        frames = thin(frames, keep);
    }
}

/// One frame where the same picture shows twice or more in a row, showing
/// for as long as they all did.
fn merge_repeats(frames: Vec<(RgbImage, u32)>) -> Vec<(RgbImage, u32)> {
    let mut out: Vec<(RgbImage, u32)> = Vec::with_capacity(frames.len());
    for (image, ms) in frames {
        match out.last_mut() {
            Some((last, last_ms)) if *last == image => *last_ms += ms,
            _ => out.push((image, ms)),
        }
    }
    out
}

/// `keep` of the frames, evenly spread, each showing for as long as the
/// frames left out after it did too: the animation runs as long as before.
fn thin(frames: Vec<(RgbImage, u32)>, keep: usize) -> Vec<(RgbImage, u32)> {
    let n = frames.len();
    let mut out: Vec<(RgbImage, u32)> = Vec::with_capacity(keep);
    for (i, (image, ms)) in frames.into_iter().enumerate() {
        // Frame i starts a kept frame when it's the first at or after one of
        // the evenly spaced points j * n / keep.
        if out.len() < keep && i * keep >= out.len() * n {
            out.push((image, ms));
        } else if let Some((_, kept)) = out.last_mut() {
            *kept += ms;
        }
    }
    out
}

fn gif(frames: &[(RgbImage, u32)]) -> Result<Vec<u8>, PrepareError> {
    let mut out = Vec::new();
    {
        let mut encoder = gif::Encoder::new(&mut out, SIZE as u16, SIZE as u16, &[]).map_err(encode_err)?;
        encoder.set_repeat(gif::Repeat::Infinite).map_err(encode_err)?;
        let mut previous: Option<&RgbImage> = None;
        for (image, ms) in frames {
            let (x, y, w, h) = previous
                .and_then(|p| changed(p, image))
                .unwrap_or((0, 0, SIZE, SIZE));
            let mut rgba = Vec::with_capacity((w * h * 4) as usize);
            for py in y..y + h {
                for px in x..x + w {
                    let p = image.get_pixel(px, py);
                    rgba.extend_from_slice(&[p[0], p[1], p[2], 0xFF]);
                }
            }
            let mut frame = gif::Frame::from_rgba_speed(w as u16, h as u16, &mut rgba, GIF_SPEED);
            frame.left = x as u16;
            frame.top = y as u16;
            // GIF counts in hundredths of a second.
            frame.delay = ((ms + 5) / 10).min(u16::MAX as u32) as u16;
            frame.dispose = gif::DisposalMethod::Keep;
            encoder.write_frame(&frame).map_err(encode_err)?;
            previous = Some(image);
        }
    }
    Ok(out)
}

/// The smallest rectangle (x, y, width, height) holding every pixel that
/// differs between `a` and `b`, or `None` if none do.
fn changed(a: &RgbImage, b: &RgbImage) -> Option<(u32, u32, u32, u32)> {
    let (mut x0, mut y0, mut x1, mut y1) = (u32::MAX, u32::MAX, 0, 0);
    for (x, y, p) in b.enumerate_pixels() {
        if a.get_pixel(x, y) != p {
            x0 = x0.min(x);
            y0 = y0.min(y);
            x1 = x1.max(x);
            y1 = y1.max(y);
        }
    }
    (x0 != u32::MAX).then(|| (x0, y0, x1 - x0 + 1, y1 - y0 + 1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, Rgba, RgbaImage};

    fn encoded(image: DynamicImage, format: ImageFormat) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        image.write_to(&mut out, format).unwrap();
        out.into_inner()
    }

    /// A GIF of `frames`, each `ms` long, made with the gif crate directly.
    fn source_gif(frames: &[RgbaImage], ms: u16) -> Vec<u8> {
        let (w, h) = (frames[0].width() as u16, frames[0].height() as u16);
        let mut out = Vec::new();
        {
            let mut encoder = gif::Encoder::new(&mut out, w, h, &[]).unwrap();
            for image in frames {
                let mut pixels = image.as_raw().clone();
                let mut frame = gif::Frame::from_rgba_speed(w, h, &mut pixels, 10);
                frame.delay = ms / 10;
                encoder.write_frame(&frame).unwrap();
            }
        }
        out
    }

    fn solid(w: u32, h: u32, color: [u8; 4]) -> RgbaImage {
        RgbaImage::from_pixel(w, h, Rgba(color))
    }

    fn frames_of(file: &[u8]) -> Vec<image::Frame> {
        GifDecoder::new(Cursor::new(file)).unwrap().into_frames().collect_frames().unwrap()
    }

    /// Whether a JPEG has a baseline frame header and no progressive one.
    fn baseline(file: &[u8]) -> bool {
        let marker = |m: u8| file.windows(2).any(|w| w == [0xFF, m]);
        marker(0xC0) && !marker(0xC2)
    }

    #[test]
    fn hash_is_the_first_16_hex_digits_of_the_sha256() {
        // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223...
        assert_eq!(hash_of(b"abc"), "ba7816bf8f01cfea");
        assert!(valid_hash("ba7816bf8f01cfea"));
        assert!(!valid_hash("BA7816BF8F01CFEA"));
        assert!(!valid_hash("../../etc/passwd"));
        assert!(!valid_hash("ba7816bf8f01cfe"));
    }

    #[test]
    fn a_photo_becomes_a_240_square_baseline_jpeg_from_its_middle() {
        // Red on the left and right, green in the middle 480x480.
        let mut photo = RgbaImage::from_pixel(640, 480, Rgba([255, 0, 0, 255]));
        for (x, _, p) in photo.enumerate_pixels_mut() {
            if (80..560).contains(&x) {
                *p = Rgba([0, 255, 0, 255]);
            }
        }
        let made = prepare(&encoded(DynamicImage::ImageRgba8(photo).into_rgb8().into(), ImageFormat::Jpeg)).unwrap();

        assert_eq!(made.format, PictureFormat::Jpeg);
        assert!(baseline(&made.file));
        let back = image::load_from_memory(&made.file).unwrap().into_rgb8();
        assert_eq!(back.dimensions(), (SIZE, SIZE));
        // The red edges were cropped off.
        let corner = back.get_pixel(0, 0);
        assert!(corner[1] > 200 && corner[0] < 60, "corner is {corner:?}");
    }

    #[test]
    fn a_png_stays_a_png_with_see_through_parts_on_black() {
        let made = prepare(&encoded(DynamicImage::ImageRgba8(solid(300, 300, [255, 255, 255, 0])), ImageFormat::Png))
            .unwrap();
        assert_eq!(made.format, PictureFormat::Png);
        let back = image::load_from_memory(&made.file).unwrap().into_rgb8();
        assert_eq!(back.dimensions(), (SIZE, SIZE));
        assert_eq!(*back.get_pixel(120, 120), Rgb([0, 0, 0]));
    }

    #[test]
    fn small_pixel_art_is_enlarged_without_blurring() {
        let mut art = solid(2, 2, [255, 0, 0, 255]);
        art.put_pixel(1, 0, Rgba([0, 0, 255, 255]));
        let made = prepare(&encoded(DynamicImage::ImageRgba8(art), ImageFormat::Png)).unwrap();
        let back = image::load_from_memory(&made.file).unwrap().into_rgb8();
        assert_eq!(*back.get_pixel(119, 0), Rgb([255, 0, 0]));
        assert_eq!(*back.get_pixel(120, 0), Rgb([0, 0, 255]));
    }

    #[test]
    fn a_one_frame_gif_becomes_a_png() {
        let made = prepare(&source_gif(&[solid(100, 100, [0, 0, 255, 255])], 100)).unwrap();
        assert_eq!(made.format, PictureFormat::Png);
        assert_eq!(made.frames, 1);
    }

    #[test]
    fn an_animated_gif_plays_with_repeats_merged_and_only_changes_stored() {
        let a = solid(120, 120, [0, 0, 0, 255]);
        let mut b = a.clone();
        b.put_pixel(10, 10, Rgba([255, 255, 255, 255]));
        let made = prepare(&source_gif(&[a.clone(), a, b], 100)).unwrap();

        assert_eq!(made.format, PictureFormat::Gif);
        assert_eq!(made.frames, 2);
        assert_eq!(image::guess_format(&made.file).unwrap(), ImageFormat::Gif);

        // The raw frames, as the board reads them.
        let mut decoder = gif::DecodeOptions::new().read_info(Cursor::new(&made.file)).unwrap();
        assert_eq!((decoder.width(), decoder.height()), (SIZE as u16, SIZE as u16));
        let first = decoder.read_next_frame().unwrap().unwrap().clone();
        assert_eq!((first.width, first.height, first.delay), (240, 240, 20));
        let second = decoder.read_next_frame().unwrap().unwrap().clone();
        // One source pixel is a 2x2 block at 240/120.
        assert_eq!((second.left, second.top, second.width, second.height), (20, 20, 2, 2));
        assert_eq!(second.delay, 10);

        let shown = frames_of(&made.file);
        assert_eq!(shown.len(), 2);
        assert_eq!(*shown[1].buffer().get_pixel(21, 21), Rgba([255, 255, 255, 255]));
    }

    #[test]
    fn an_animation_too_big_for_the_board_loses_frames_until_it_fits() {
        // Noise doesn't compress, so each full frame is ~50 KB.
        let mut seed = 1u32;
        let frames: Vec<(RgbImage, u32)> = (0..8)
            .map(|_| {
                let image = RgbImage::from_fn(SIZE, SIZE, |_, _| {
                    seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345);
                    let v = (seed >> 16) as u8;
                    Rgb([v, v.wrapping_mul(7), v.wrapping_mul(13)])
                });
                (image, 100)
            })
            .collect();
        let full = gif(&frames).unwrap().len();

        let made = animated(frames.clone(), full / 3).unwrap();
        assert_eq!(made.format, PictureFormat::Gif);
        assert_eq!(made.frames, 2);
        assert!(made.file.len() <= full / 3);
        // The time the left-out frames showed went to the ones kept.
        let total: u32 = frames_of(&made.file).iter().map(|f| f.delay().numer_denom_ms().0).sum();
        assert_eq!(total, 800);

        assert_eq!(animated(frames, 1000).unwrap_err(), PrepareError::TooBig);
    }

    #[test]
    fn thinning_keeps_evenly_spread_frames_and_the_running_time() {
        let frames: Vec<(RgbImage, u32)> = (0..10u8).map(|i| (RgbImage::from_pixel(1, 1, Rgb([i, 0, 0])), 100)).collect();
        let kept = thin(frames, 4);
        let firsts: Vec<u8> = kept.iter().map(|(image, _)| image.get_pixel(0, 0)[0]).collect();
        assert_eq!(firsts, vec![0, 3, 5, 8]);
        assert_eq!(kept.iter().map(|(_, ms)| ms).sum::<u32>(), 1000);
    }

    #[test]
    fn what_isnt_a_picture_is_refused() {
        assert_eq!(prepare(b"not a picture at all").unwrap_err(), PrepareError::NotAPicture);
    }
}
