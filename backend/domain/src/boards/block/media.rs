use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{BLOCK_TITLE_MAX_CHARS, BlockSize, clean_text, invalid, read};
use crate::boards::embed::{EmbedProvider, parse_embed_url};
use crate::boards::error::BoardsError;
use crate::boards::web_url::parse_link;

pub const ALT_MAX_CHARS: usize = 300;
pub const CAPTION_MAX_CHARS: usize = 300;

/// A picture kept by LekThik itself. Alternative text is required, not optional.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ImageConfig {
    pub size: BlockSize,
    pub alt: String,
    pub caption: String,
}

/// A video or calendar from one of the known providers, stored as an identifier only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmbedConfig {
    pub size: BlockSize,
    pub provider: EmbedProvider,
    pub id: String,
    /// Names the frame for screen readers.
    pub title: String,
}

/// What an embed is created or changed with: an address to recognise, or what was stored.
#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct EmbedInput {
    size: BlockSize,
    url: Option<String>,
    provider: Option<EmbedProvider>,
    id: Option<String>,
    title: String,
}

/// A plain link card. Nothing is fetched from the address.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct LinkConfig {
    pub size: BlockSize,
    pub url: String,
    pub title: String,
}

pub(super) fn parse_image(value: Value) -> Result<ImageConfig, BoardsError> {
    let mut image: ImageConfig = read(value)?;
    image.alt = image.alt.trim().to_string();
    image.caption = image.caption.trim().to_string();
    if image.alt.is_empty() {
        return Err(invalid("describe the image, for people who cannot see it"));
    }
    clean_text(&image.alt, ALT_MAX_CHARS, false)?;
    clean_text(&image.caption, CAPTION_MAX_CHARS, false)?;
    Ok(image)
}

pub(super) fn parse_embed(value: Value) -> Result<EmbedConfig, BoardsError> {
    let input: EmbedInput = read(value)?;
    let (provider, id) = match (input.url.as_deref(), input.provider, input.id) {
        (Some(url), None, None) => parse_embed_url(url)?,
        (None, Some(provider), Some(id)) if provider.accepts(&id) => (provider, id),
        (None, Some(_), Some(_)) => {
            return Err(invalid("that identifier is not valid"));
        }
        _ => {
            return Err(invalid(
                "give either an address, or a provider with its identifier",
            ));
        }
    };
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return Err(invalid("name the embed, for people who cannot see it"));
    }
    clean_text(&title, BLOCK_TITLE_MAX_CHARS, false)?;
    Ok(EmbedConfig {
        size: input.size,
        provider,
        id,
        title,
    })
}

pub(super) fn parse_link_card(value: Value) -> Result<LinkConfig, BoardsError> {
    let mut link: LinkConfig = read(value)?;
    link.url = parse_link(&link.url)?;
    link.title = link.title.trim().to_string();
    clean_text(&link.title, BLOCK_TITLE_MAX_CHARS, false)?;
    Ok(link)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::{BlockConfig, ListKind};
    use super::*;

    #[test]
    fn an_image_needs_a_description() {
        assert!(BlockConfig::parse(ListKind::Image, json!({})).is_err());
        assert!(BlockConfig::parse(ListKind::Image, json!({ "alt": "   " })).is_err());
        let config = BlockConfig::parse(
            ListKind::Image,
            json!({ "alt": " Floor plan of the hall ", "caption": "Level 1" }),
        )
        .expect("parse");

        assert_eq!(
            config,
            BlockConfig::Image(ImageConfig {
                size: BlockSize::Normal,
                alt: "Floor plan of the hall".to_string(),
                caption: "Level 1".to_string()
            })
        );
    }

    #[test]
    fn image_text_is_capped_and_one_line() {
        let long = "x".repeat(ALT_MAX_CHARS + 1);
        assert!(BlockConfig::parse(ListKind::Image, json!({ "alt": long })).is_err());
        assert!(BlockConfig::parse(ListKind::Image, json!({ "alt": "a\nb" })).is_err());
        let caption = "y".repeat(CAPTION_MAX_CHARS + 1);
        assert!(
            BlockConfig::parse(ListKind::Image, json!({ "alt": "ok", "caption": caption }))
                .is_err()
        );
        assert!(BlockConfig::parse(ListKind::Image, json!({ "alt": "ok", "src": "x" })).is_err());
    }

    #[test]
    fn an_embed_is_made_from_an_address_and_stores_only_the_identifier() {
        let config = BlockConfig::parse(
            ListKind::Embed,
            json!({ "url": "https://youtu.be/dQw4w9WgXcQ", "title": " Launch teaser " }),
        )
        .expect("parse");

        assert_eq!(
            config.to_value(),
            json!({ "size": "normal", "provider": "youtube", "id": "dQw4w9WgXcQ", "title": "Launch teaser" })
        );
    }

    #[test]
    fn an_embed_can_be_saved_again_from_what_was_stored() {
        let stored =
            json!({ "size": "wide", "provider": "vimeo", "id": "76979871", "title": "Demo" });

        let config = BlockConfig::parse(ListKind::Embed, stored.clone()).expect("parse");

        assert_eq!(config.to_value(), stored);
    }

    #[test]
    fn an_embed_refuses_unknown_providers_bad_identifiers_and_missing_titles() {
        for bad in [
            json!({ "url": "https://evil.example/x", "title": "T" }),
            json!({ "url": "https://youtu.be/dQw4w9WgXcQ" }),
            json!({ "url": "https://youtu.be/dQw4w9WgXcQ", "title": "  " }),
            json!({ "provider": "youtube", "id": "bad", "title": "T" }),
            json!({ "provider": "youtube", "title": "T" }),
            json!({ "url": "https://youtu.be/dQw4w9WgXcQ", "provider": "vimeo", "id": "76979871", "title": "T" }),
            json!({ "url": "https://youtu.be/dQw4w9WgXcQ", "title": "T", "autoplay": true }),
            json!({ "title": "T" }),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Embed, bad.clone()).is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn a_link_keeps_a_plain_address_and_refuses_the_rest() {
        let config = BlockConfig::parse(
            ListKind::Link,
            json!({ "url": "HTTPS://Example.com/docs", "title": " Docs " }),
        )
        .expect("parse");
        assert_eq!(
            config.to_value(),
            json!({ "size": "normal", "url": "https://example.com/docs", "title": "Docs" })
        );

        for bad in [
            json!({}),
            json!({ "url": "javascript:alert(1)" }),
            json!({ "url": "https://user:pw@example.com" }),
            json!({ "url": "https://example.com", "title": "a\nb" }),
            json!({ "url": "https://example.com", "preview": true }),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Link, bad.clone()).is_err(),
                "{bad}"
            );
        }
    }
}
