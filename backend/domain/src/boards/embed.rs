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
}

fn invalid(message: &str) -> BoardsError {
    BoardsError::Invalid(message.to_string())
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
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Youtube => "youtube",
            Self::Vimeo => "vimeo",
            Self::GoogleCalendar => "google_calendar",
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
            ["watch"] => query_value(parts.query, "v").map(|id| (EmbedProvider::Youtube, id)),
            ["embed" | "shorts" | "live" | "v", id] => Some((EmbedProvider::Youtube, *id)),
            _ => None,
        },
        "youtu.be" => match segments.as_slice() {
            [id] => Some((EmbedProvider::Youtube, *id)),
            _ => None,
        },
        "vimeo.com" | "www.vimeo.com" => segments
            .last()
            .filter(|last| last.chars().all(|c| c.is_ascii_digit()))
            .map(|id| (EmbedProvider::Vimeo, *id)),
        "player.vimeo.com" => match segments.as_slice() {
            ["video", id] => Some((EmbedProvider::Vimeo, *id)),
            _ => None,
        },
        "calendar.google.com" => match segments.as_slice() {
            ["calendar", "embed"] => {
                query_value(parts.query, "src").map(|id| (EmbedProvider::GoogleCalendar, id))
            }
            _ => None,
        },
        _ => None,
    };

    let Some((provider, id)) = found else {
        return Err(invalid(
            "only YouTube, Vimeo and Google Calendar addresses can be embedded",
        ));
    };
    if !provider.accepts(id) {
        return Err(invalid("that address does not hold a valid identifier"));
    }
    Ok((provider, id.to_string()))
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
    fn providers_have_stable_names() {
        assert_eq!(EmbedProvider::Youtube.as_str(), "youtube");
        assert_eq!(EmbedProvider::GoogleCalendar.as_str(), "google_calendar");
    }
}
