use std::io::Cursor;

use async_trait::async_trait;
use domain::boards::{
    BlockImage, BoardsError, IMAGE_MAX_EDGE, IMAGE_MAX_PIXELS, IMAGE_MAX_STORED_BYTES,
    IMAGE_MAX_UPLOAD_BYTES, ImageSanitizer,
};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits};

const JPEG_QUALITY: u8 = 85;
/// How many times a picture that is still too heavy is made smaller before giving up.
const SHRINK_ATTEMPTS: u32 = 4;

/// What a stored picture may be like. The defaults are the limits of the application, tests use
/// smaller ones so they stay fast.
#[derive(Debug, Clone, Copy)]
pub struct ImageLimits {
    pub max_upload_bytes: usize,
    pub max_pixels: u64,
    pub max_edge: u32,
    pub max_stored_bytes: usize,
}

impl Default for ImageLimits {
    fn default() -> Self {
        Self {
            max_upload_bytes: IMAGE_MAX_UPLOAD_BYTES,
            max_pixels: IMAGE_MAX_PIXELS,
            max_edge: IMAGE_MAX_EDGE,
            max_stored_bytes: IMAGE_MAX_STORED_BYTES,
        }
    }
}

/// Decodes an upload and writes a new picture from its pixels, which is how every piece of
/// metadata (GPS position, camera, time, author, thumbnails, trailing data) is left behind.
#[derive(Debug, Clone, Default)]
pub struct ImageCrateSanitizer {
    limits: ImageLimits,
}

impl ImageCrateSanitizer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_limits(limits: ImageLimits) -> Self {
        Self { limits }
    }
}

fn invalid(message: &str) -> BoardsError {
    BoardsError::Invalid(message.to_string())
}

fn encode(image: &DynamicImage) -> Result<(String, Vec<u8>), BoardsError> {
    let mut bytes = Vec::new();
    // A picture with transparency stays a PNG, everything else becomes a JPEG.
    let content_type = if image.color().has_alpha() {
        let rgba = DynamicImage::ImageRgba8(image.to_rgba8());
        rgba.write_with_encoder(PngEncoder::new(&mut bytes))
            .map_err(|_| invalid("this picture could not be processed"))?;
        "image/png"
    } else {
        let rgb = DynamicImage::ImageRgb8(image.to_rgb8());
        rgb.write_with_encoder(JpegEncoder::new_with_quality(&mut bytes, JPEG_QUALITY))
            .map_err(|_| invalid("this picture could not be processed"))?;
        "image/jpeg"
    };
    Ok((content_type.to_string(), bytes))
}

fn process(upload: &[u8], limits: ImageLimits) -> Result<BlockImage, BoardsError> {
    if upload.is_empty() {
        return Err(invalid("choose a picture to upload"));
    }
    if upload.len() > limits.max_upload_bytes {
        return Err(invalid("that picture is larger than 5 MB"));
    }

    // The format comes from the first bytes of the file, never from its name or what the
    // browser said it was.
    let mut reader = ImageReader::new(Cursor::new(upload))
        .with_guessed_format()
        .map_err(|_| invalid("that file is not a picture"))?;
    match reader.format() {
        Some(ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP) => {}
        _ => return Err(invalid("only PNG, JPEG and WebP pictures are accepted")),
    }

    let mut decode_limits = Limits::default();
    decode_limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(decode_limits);

    let mut decoder = reader
        .into_decoder()
        .map_err(|_| invalid("that picture is damaged or not supported"))?;
    let (width, height) = decoder.dimensions();
    if u64::from(width) * u64::from(height) > limits.max_pixels {
        return Err(invalid("that picture has too many pixels"));
    }
    // The way the camera was held is stored beside the pixels, so apply it before it is dropped.
    let orientation = decoder
        .orientation()
        .unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut picture = DynamicImage::from_decoder(decoder)
        .map_err(|_| invalid("that picture is damaged or not supported"))?;
    picture.apply_orientation(orientation);

    if picture.width().max(picture.height()) > limits.max_edge {
        picture = picture.resize(limits.max_edge, limits.max_edge, FilterType::Lanczos3);
    }

    let mut result = encode(&picture)?;
    let mut attempts = 0;
    while result.1.len() > limits.max_stored_bytes {
        attempts += 1;
        if attempts > SHRINK_ATTEMPTS {
            return Err(invalid("that picture is too detailed, try a smaller one"));
        }
        let edge = (picture.width().max(picture.height()) * 3 / 4).max(1);
        picture = picture.resize(edge, edge, FilterType::Lanczos3);
        result = encode(&picture)?;
    }

    Ok(BlockImage {
        content_type: result.0,
        width: picture.width(),
        height: picture.height(),
        bytes: result.1,
    })
}

#[async_trait]
impl ImageSanitizer for ImageCrateSanitizer {
    async fn sanitize(&self, upload: Vec<u8>) -> Result<BlockImage, BoardsError> {
        let limits = self.limits;
        // Decoding is heavy work, so it stays off the threads that serve requests.
        tokio::task::spawn_blocking(move || process(&upload, limits))
            .await
            .map_err(|error| BoardsError::Repository(format!("image task failed: {error}")))?
    }
}

#[cfg(test)]
mod tests {
    use image::{ImageBuffer, Rgb, Rgba};

    use super::*;

    fn jpeg(width: u32, height: u32) -> Vec<u8> {
        let buffer = ImageBuffer::from_fn(width, height, |x, y| {
            Rgb([(x * 7) as u8, (y * 5) as u8, 90])
        });
        let mut bytes = Vec::new();
        DynamicImage::ImageRgb8(buffer)
            .write_with_encoder(JpegEncoder::new_with_quality(&mut bytes, 90))
            .expect("encode");
        bytes
    }

    fn png_with_alpha(width: u32, height: u32) -> Vec<u8> {
        let buffer =
            ImageBuffer::from_fn(width, height, |x, _| Rgba([200, 30, 30, (x * 10) as u8]));
        let mut bytes = Vec::new();
        DynamicImage::ImageRgba8(buffer)
            .write_with_encoder(PngEncoder::new(&mut bytes))
            .expect("encode");
        bytes
    }

    /// A JPEG with an EXIF block that holds a position, a camera and an orientation, written by
    /// hand: the marker, the length, then a small big endian TIFF structure.
    fn jpeg_with_exif(width: u32, height: u32, orientation: u16) -> Vec<u8> {
        let plain = jpeg(width, height);
        let mut tiff: Vec<u8> = Vec::new();
        tiff.extend_from_slice(b"MM\0*\0\0\0\x08");
        tiff.extend_from_slice(&[0, 1]); // one entry
        tiff.extend_from_slice(&[0x01, 0x12, 0, 3, 0, 0, 0, 1]);
        tiff.extend_from_slice(&orientation.to_be_bytes());
        tiff.extend_from_slice(&[0, 0]);
        tiff.extend_from_slice(&[0, 0, 0, 0]); // no next directory
        tiff.extend_from_slice(b"GPSLatitude=48.8566;Make=SecretCam;Artist=Jane Doe");

        let mut segment: Vec<u8> = vec![0xFF, 0xE1];
        let length = (2 + 6 + tiff.len()) as u16;
        segment.extend_from_slice(&length.to_be_bytes());
        segment.extend_from_slice(b"Exif\0\0");
        segment.extend_from_slice(&tiff);

        let mut bytes = plain[..2].to_vec(); // the start of image marker
        bytes.extend_from_slice(&segment);
        bytes.extend_from_slice(&plain[2..]);
        bytes
    }

    fn contains(haystack: &[u8], needle: &[u8]) -> bool {
        haystack
            .windows(needle.len())
            .any(|window| window == needle)
    }

    #[tokio::test]
    async fn a_jpeg_comes_back_as_a_fresh_jpeg() {
        let result = ImageCrateSanitizer::new()
            .sanitize(jpeg(64, 40))
            .await
            .expect("sanitize");

        assert_eq!(result.content_type, "image/jpeg");
        assert_eq!((result.width, result.height), (64, 40));
        assert_eq!(&result.bytes[..2], &[0xFF, 0xD8]);
    }

    #[tokio::test]
    async fn every_piece_of_metadata_is_left_behind() {
        let upload = jpeg_with_exif(64, 40, 1);
        assert!(
            contains(&upload, b"GPSLatitude"),
            "the test file does carry a position"
        );

        let result = ImageCrateSanitizer::new()
            .sanitize(upload)
            .await
            .expect("sanitize");

        for secret in [&b"GPSLatitude"[..], b"SecretCam", b"Jane Doe", b"Exif"] {
            assert!(
                !contains(&result.bytes, secret),
                "{} must not survive",
                String::from_utf8_lossy(secret)
            );
        }
    }

    #[tokio::test]
    async fn the_way_the_camera_was_held_is_applied_before_it_is_dropped() {
        // Orientation 6 means "rotate 90 degrees clockwise to display", so wide becomes tall.
        let result = ImageCrateSanitizer::new()
            .sanitize(jpeg_with_exif(60, 30, 6))
            .await
            .expect("sanitize");

        assert_eq!((result.width, result.height), (30, 60));
    }

    #[tokio::test]
    async fn transparency_keeps_a_picture_a_png() {
        let result = ImageCrateSanitizer::new()
            .sanitize(png_with_alpha(32, 32))
            .await
            .expect("sanitize");

        assert_eq!(result.content_type, "image/png");
        assert_eq!(&result.bytes[..4], &[0x89, b'P', b'N', b'G']);
    }

    #[tokio::test]
    async fn large_pictures_are_made_smaller() {
        let limits = ImageLimits {
            max_edge: 50,
            ..ImageLimits::default()
        };

        let result = ImageCrateSanitizer::with_limits(limits)
            .sanitize(jpeg(200, 100))
            .await
            .expect("sanitize");

        assert_eq!(
            (result.width, result.height),
            (50, 25),
            "the proportions are kept"
        );
    }

    #[tokio::test]
    async fn a_file_is_judged_by_its_bytes_not_by_what_it_claims_to_be() {
        let sanitizer = ImageCrateSanitizer::new();
        let svg =
            b"<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".to_vec();
        let html = b"<html><body onload=alert(1)>".to_vec();
        let text = b"just words".to_vec();
        let mut gif = b"GIF89a".to_vec();
        gif.extend_from_slice(&[1, 0, 1, 0, 0, 0, 0, 0x3B]);
        let mut fake_jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0];
        fake_jpeg.extend_from_slice(b"this is not really a jpeg");

        for (name, bytes) in [
            ("svg", svg),
            ("html", html),
            ("text", text),
            ("gif", gif),
            ("fake jpeg", fake_jpeg),
            ("empty", Vec::new()),
        ] {
            let result = sanitizer.sanitize(bytes).await;
            assert!(
                matches!(result, Err(BoardsError::Invalid(_))),
                "{name} was accepted"
            );
        }
    }

    #[tokio::test]
    async fn a_picture_followed_by_hidden_data_loses_it() {
        let mut upload = jpeg(32, 32);
        upload.extend_from_slice(b"<?php system($_GET['c']); ?>");

        let result = ImageCrateSanitizer::new()
            .sanitize(upload)
            .await
            .expect("sanitize");

        assert!(!contains(&result.bytes, b"<?php"));
    }

    #[tokio::test]
    async fn a_truncated_png_is_refused() {
        let upload = png_with_alpha(64, 64);

        let result = ImageCrateSanitizer::new()
            .sanitize(upload[..upload.len() / 3].to_vec())
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn a_cut_short_jpeg_still_leaves_a_clean_one() {
        // JPEG decoders fill in what is missing. What matters is that what comes out is a fresh,
        // valid picture and not the damaged file.
        let upload = jpeg(64, 64);

        let result = ImageCrateSanitizer::new()
            .sanitize(upload[..upload.len() * 2 / 3].to_vec())
            .await;

        if let Ok(image) = result {
            assert_eq!(&image.bytes[..2], &[0xFF, 0xD8]);
            assert_eq!((image.width, image.height), (64, 64));
        }
    }

    #[tokio::test]
    async fn size_limits_are_enforced_before_and_while_decoding() {
        let big_file = ImageLimits {
            max_upload_bytes: 100,
            ..ImageLimits::default()
        };
        assert!(matches!(
            ImageCrateSanitizer::with_limits(big_file)
                .sanitize(jpeg(64, 64))
                .await,
            Err(BoardsError::Invalid(_))
        ));

        let many_pixels = ImageLimits {
            max_pixels: 1_000,
            ..ImageLimits::default()
        };
        assert!(matches!(
            ImageCrateSanitizer::with_limits(many_pixels)
                .sanitize(jpeg(64, 64))
                .await,
            Err(BoardsError::Invalid(_))
        ));
    }

    #[tokio::test]
    async fn a_picture_that_stays_too_heavy_is_refused_rather_than_stored() {
        let limits = ImageLimits {
            max_stored_bytes: 10,
            ..ImageLimits::default()
        };

        let result = ImageCrateSanitizer::with_limits(limits)
            .sanitize(jpeg(64, 64))
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }
}
