use serde::{Deserialize, Serialize};

use super::error::BoardsError;
use super::web_url::{query_value, split};

/// The only outside services a board can embed. Each one has a fixed way of building its
/// address from an identifier, so what is stored can never point somewhere else.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EmbedProvider {
    Youtube,
    Vimeo,
    GoogleCalendar,
    Excalidraw,
    Figma,
    Notion,
}

fn invalid(message: &str) -> BoardsError {
    BoardsError::Invalid(message.to_string())
}

fn is_token(part: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&part.len())
        && part
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
}

fn excalidraw_id(id: &str) -> bool {
    let Some((kind, rest)) = id.split_once('=') else {
        return false;
    };
    let Some((first, key)) = rest.split_once(',') else {
        return false;
    };
    matches!(kind, "json" | "room") && is_token(first, 6, 64) && is_token(key, 6, 64)
}

fn figma_id(id: &str) -> bool {
    let Some((kind, key)) = id.split_once('/') else {
        return false;
    };
    matches!(kind, "file" | "design" | "proto" | "board")
        && (10..=40).contains(&key.len())
        && key.chars().all(|c| c.is_ascii_alphanumeric())
}

fn notion_subdomain(label: &str) -> bool {
    (1..=63).contains(&label.len())
        && !label.starts_with('-')
        && !label.ends_with('-')
        && label
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn notion_id(id: &str) -> bool {
    let Some((subdomain, page)) = id.split_once('/') else {
        return false;
    };
    notion_subdomain(subdomain)
        && page.len() == 32
        && page
            .chars()
            .all(|c| c.is_ascii_digit() || matches!(c, 'a'..='f'))
}

fn notion_page(slug: &str) -> Option<String> {
    let slug = slug.to_ascii_lowercase();
    let start = slug.len().checked_sub(32)?;
    let tail = slug.get(start..)?;
    let separated = start == 0 || slug.get(start - 1..start) == Some("-");
    (separated
        && tail
            .chars()
            .all(|c| c.is_ascii_digit() || matches!(c, 'a'..='f')))
    .then(|| tail.to_string())
}

impl EmbedProvider {
    /// Whether `id` is shaped like an identifier of this provider. Nothing else is accepted,
    /// which keeps every character that could change the address out of it.
    pub fn accepts(self, id: &str) -> bool {
        match self {
            Self::Youtube => {
                id.len() == 11
                    && id
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
            }
            Self::Vimeo => (6..=12).contains(&id.len()) && id.chars().all(|c| c.is_ascii_digit()),
            Self::GoogleCalendar => {
                (3..=250).contains(&id.len())
                    && id.chars().all(|c| {
                        c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '%' | '@' | '+' | '-')
                    })
            }
            Self::Excalidraw => excalidraw_id(id),
            Self::Figma => figma_id(id),
            Self::Notion => notion_id(id),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Youtube => "youtube",
            Self::Vimeo => "vimeo",
            Self::GoogleCalendar => "google_calendar",
            Self::Excalidraw => "excalidraw",
            Self::Figma => "figma",
            Self::Notion => "notion",
        }
    }
}

/// Recognises a video or calendar address and returns the provider and its identifier.
pub fn parse_embed_url(url: &str) -> Result<(EmbedProvider, String), BoardsError> {
    let parts = split(url.trim())?;
    if parts.scheme != "https" {
        return Err(invalid("embeds need an https address"));
    }
    let host = parts.host.to_ascii_lowercase();
    let segments: Vec<&str> = parts
        .path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();

    let found = match host.as_str() {
        "youtube.com"
        | "www.youtube.com"
        | "m.youtube.com"
        | "www.youtube-nocookie.com"
        | "youtube-nocookie.com" => match segments.as_slice() {
            ["watch"] => {
                query_value(parts.query, "v").map(|id| (EmbedProvider::Youtube, id.to_string()))
            }
            ["embed" | "shorts" | "live" | "v", id] => {
                Some((EmbedProvider::Youtube, (*id).to_string()))
            }
            _ => None,
        },
        "youtu.be" => match segments.as_slice() {
            [id] => Some((EmbedProvider::Youtube, (*id).to_string())),
            _ => None,
        },
        "vimeo.com" | "www.vimeo.com" => segments
            .last()
            .filter(|last| last.chars().all(|c| c.is_ascii_digit()))
            .map(|id| (EmbedProvider::Vimeo, (*id).to_string())),
        "player.vimeo.com" => match segments.as_slice() {
            ["video", id] => Some((EmbedProvider::Vimeo, (*id).to_string())),
            _ => None,
        },
        "calendar.google.com" => match segments.as_slice() {
            ["calendar", "embed"] => query_value(parts.query, "src")
                .map(|id| (EmbedProvider::GoogleCalendar, id.to_string())),
            _ => None,
        },
        "excalidraw.com" | "www.excalidraw.com" if segments.is_empty() => {
            Some((EmbedProvider::Excalidraw, parts.fragment.to_string()))
        }
        "figma.com" | "www.figma.com" => match segments.as_slice() {
            [kind @ ("file" | "design" | "proto" | "board"), key, ..] => {
                Some((EmbedProvider::Figma, format!("{kind}/{key}")))
            }
            _ => None,
        },
        other => notion_address(other, &segments).map(|id| (EmbedProvider::Notion, id)),
    };

    let Some((provider, id)) = found else {
        return Err(invalid(
            "only YouTube, Vimeo, Google Calendar, Excalidraw, Figma and public Notion addresses can be embedded",
        ));
    };
    if !provider.accepts(&id) {
        return Err(invalid("that address does not hold a valid identifier"));
    }
    Ok((provider, id))
}

fn notion_address(host: &str, segments: &[&str]) -> Option<String> {
    let subdomain = host.strip_suffix(".notion.site")?;
    if subdomain.contains('.') {
        return None;
    }
    let slug = match segments {
        ["ebd", slug] | [slug] => slug,
        _ => return None,
    };
    Some(format!("{subdomain}/{}", notion_page(slug)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn found(url: &str) -> Option<(EmbedProvider, String)> {
        parse_embed_url(url).ok()
    }

    #[test]
    fn recognises_every_way_to_write_a_youtube_address() {
        let want = Some((EmbedProvider::Youtube, "dQw4w9WgXcQ".to_string()));
        for url in [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com/watch?v=dQw4w9WgXcQ&t=10",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ?si=abc",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        ] {
            assert_eq!(found(url), want, "{url}");
        }
    }

    #[test]
    fn recognises_vimeo() {
        let want = Some((EmbedProvider::Vimeo, "76979871".to_string()));
        for url in [
            "https://vimeo.com/76979871",
            "https://www.vimeo.com/76979871",
            "https://player.vimeo.com/video/76979871",
            "https://vimeo.com/channels/staffpicks/76979871",
        ] {
            assert_eq!(found(url), want, "{url}");
        }
    }

    #[test]
    fn recognises_a_google_calendar_embed() {
        let got = found(
            "https://calendar.google.com/calendar/embed?src=team%40example.com&ctz=Europe%2FParis",
        );

        assert_eq!(
            got,
            Some((
                EmbedProvider::GoogleCalendar,
                "team%40example.com".to_string()
            ))
        );
    }

    #[test]
    fn refuses_other_sites_and_other_pages_of_the_known_ones() {
        for url in [
            "https://evil.example/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/",
            "https://www.youtube.com/watch",
            "https://www.youtube.com/channel/UC123",
            "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
            "https://vimeo.com/channels/staffpicks",
            "https://calendar.google.com/calendar/u/0/r",
            "https://calendar.google.com/calendar/embed",
            "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "javascript:alert(1)",
            "",
        ] {
            assert_eq!(found(url), None, "{url}");
        }
    }

    #[test]
    fn refuses_identifiers_that_could_change_the_address() {
        for url in [
            "https://www.youtube.com/watch?v=short",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ%22onload%3D",
            "https://www.youtube.com/embed/dQw4w9WgXc%2F",
            "https://vimeo.com/12345",
            "https://calendar.google.com/calendar/embed?src=a",
            "https://calendar.google.com/calendar/embed?src=a&b%3D%3Cscript%3E",
        ] {
            assert_eq!(found(url), None, "{url}");
        }
    }

    #[test]
    fn identifiers_are_checked_per_provider() {
        assert!(EmbedProvider::Youtube.accepts("dQw4w9WgXcQ"));
        assert!(!EmbedProvider::Youtube.accepts("dQw4w9WgXc"));
        assert!(!EmbedProvider::Youtube.accepts("dQw4w9WgXc!"));
        assert!(EmbedProvider::Vimeo.accepts("76979871"));
        assert!(!EmbedProvider::Vimeo.accepts("7697987a"));
        assert!(EmbedProvider::GoogleCalendar.accepts("team%40example.com"));
        assert!(!EmbedProvider::GoogleCalendar.accepts("a&b=c"));
        assert!(!EmbedProvider::GoogleCalendar.accepts(&"a".repeat(251)));
    }

    #[test]
    fn recognises_excalidraw_share_links_and_rooms() {
        assert_eq!(
            found("https://excalidraw.com/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk"),
            Some((
                EmbedProvider::Excalidraw,
                "json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk".to_string()
            ))
        );
        assert_eq!(
            found("https://www.excalidraw.com/#room=0123456789abcdef0123,AbCdEfGhIjKlMnOpQrStUv"),
            Some((
                EmbedProvider::Excalidraw,
                "room=0123456789abcdef0123,AbCdEfGhIjKlMnOpQrStUv".to_string()
            ))
        );
    }

    #[test]
    fn refuses_excalidraw_addresses_that_are_not_a_shared_drawing() {
        for url in [
            "https://excalidraw.com/",
            "https://excalidraw.com/#",
            "https://excalidraw.com/draw#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk",
            "https://excalidraw.com/#other=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk",
            "https://excalidraw.com/#json=abc,def",
            "https://excalidraw.com/#json=AbCdEf12345",
            "https://excalidraw.com/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk&x=1",
            "https://excalidraw.com/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk%22onload=1",
            "https://excalidraw.com.evil.example/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk",
            "http://excalidraw.com/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk",
        ] {
            assert_eq!(found(url), None, "{url}");
        }
    }

    #[test]
    fn recognises_figma_files_designs_prototypes_and_boards() {
        for (url, want) in [
            (
                "https://www.figma.com/file/AbCdEf1234567890xyz/My-design?node-id=0%3A1",
                "file/AbCdEf1234567890xyz",
            ),
            (
                "https://www.figma.com/design/AbCdEf1234567890xyz/Name",
                "design/AbCdEf1234567890xyz",
            ),
            (
                "https://figma.com/proto/AbCdEf1234567890xyz",
                "proto/AbCdEf1234567890xyz",
            ),
            (
                "https://www.figma.com/board/AbCdEf1234567890xyz/Brainstorm",
                "board/AbCdEf1234567890xyz",
            ),
        ] {
            assert_eq!(
                found(url),
                Some((EmbedProvider::Figma, want.to_string())),
                "{url}"
            );
        }
    }

    #[test]
    fn refuses_figma_pages_that_are_not_a_file_and_odd_keys() {
        for url in [
            "https://www.figma.com/",
            "https://www.figma.com/community/file/1234567890123",
            "https://www.figma.com/file/short",
            "https://www.figma.com/file/AbCdEf12345678%22onload/Name",
            "https://www.figma.com/file/AbCdEf1234567890xyz-/Name",
            "https://figma.com.evil.example/file/AbCdEf1234567890xyz/Name",
            "http://www.figma.com/file/AbCdEf1234567890xyz/Name",
        ] {
            assert_eq!(found(url), None, "{url}");
        }
    }

    #[test]
    fn recognises_public_notion_pages_and_their_embed_form() {
        let want = Some((
            EmbedProvider::Notion,
            "acme/0123456789abcdef0123456789abcdef".to_string(),
        ));
        for url in [
            "https://acme.notion.site/Roadmap-0123456789abcdef0123456789abcdef",
            "https://acme.notion.site/0123456789abcdef0123456789abcdef?pvs=4",
            "https://acme.notion.site/ebd/0123456789abcdef0123456789abcdef",
            "https://ACME.notion.site/Roadmap-0123456789ABCDEF0123456789ABCDEF",
        ] {
            assert_eq!(found(url), want, "{url}");
        }
    }

    #[test]
    fn refuses_notion_addresses_that_cannot_be_framed_or_are_not_a_page() {
        for url in [
            "https://www.notion.so/Roadmap-0123456789abcdef0123456789abcdef",
            "https://notion.site/Roadmap-0123456789abcdef0123456789abcdef",
            "https://a.b.notion.site/Roadmap-0123456789abcdef0123456789abcdef",
            "https://acme.notion.site/",
            "https://acme.notion.site/Roadmap-0123456789abcdef0123456789abcde",
            "https://acme.notion.site/Roadmap0123456789abcdef0123456789abcdef",
            "https://acme.notion.site/Roadmap-0123456789abcdef0123456789abcdeg",
            "https://acme.notion.site/a/b-0123456789abcdef0123456789abcdef",
            "https://-bad.notion.site/Roadmap-0123456789abcdef0123456789abcdef",
            "https://acme.notion.site.evil.example/Roadmap-0123456789abcdef0123456789abcdef",
            "http://acme.notion.site/Roadmap-0123456789abcdef0123456789abcdef",
        ] {
            assert_eq!(found(url), None, "{url}");
        }
    }

    #[test]
    fn identifiers_of_the_new_providers_are_checked_when_they_come_back_from_storage() {
        assert!(EmbedProvider::Excalidraw.accepts("json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk"));
        assert!(!EmbedProvider::Excalidraw.accepts("json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk/.."));
        assert!(!EmbedProvider::Excalidraw.accepts("file=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk"));
        assert!(EmbedProvider::Figma.accepts("file/AbCdEf1234567890xyz"));
        assert!(!EmbedProvider::Figma.accepts("file/AbCdEf1234567890xyz?x=1"));
        assert!(!EmbedProvider::Figma.accepts("community/AbCdEf1234567890xyz"));
        assert!(EmbedProvider::Notion.accepts("acme/0123456789abcdef0123456789abcdef"));
        assert!(!EmbedProvider::Notion.accepts("ac.me/0123456789abcdef0123456789abcdef"));
        assert!(!EmbedProvider::Notion.accepts("acme/0123456789ABCDEF0123456789ABCDEF"));
        assert!(!EmbedProvider::Notion.accepts("acme/0123"));
    }

    #[test]
    fn providers_have_stable_names() {
        assert_eq!(EmbedProvider::Excalidraw.as_str(), "excalidraw");
        assert_eq!(EmbedProvider::Figma.as_str(), "figma");
        assert_eq!(EmbedProvider::Notion.as_str(), "notion");
        assert_eq!(EmbedProvider::Youtube.as_str(), "youtube");
        assert_eq!(EmbedProvider::GoogleCalendar.as_str(), "google_calendar");
    }
}
